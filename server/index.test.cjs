const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const Module = require('node:module');
const path = require('node:path');
const { build } = require('esbuild');
const WebSocket = require('ws');

async function loadServer() {
  const bundled = await build({
    entryPoints: [path.join(__dirname, 'room-server.ts')],
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    logLevel: 'silent',
  });
  const mod = new Module(path.join(__dirname, '.test-backend.cjs'), module);
  mod.filename = path.join(__dirname, '.test-backend.cjs');
  mod.paths = Module._nodeModulePaths(__dirname);
  mod._compile(bundled.outputFiles[0].text, mod.filename);
  return mod.exports.createServer;
}

function connect(port, origin = 'http://localhost:5173') {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
    const queue = [];
    const waiters = [];
    socket.on('message', data => {
      const message = JSON.parse(data.toString());
      if (waiters.length) waiters.shift()(message);
      else queue.push(message);
    });
    socket.once('error', reject);
    socket.once('open', () => {
      socket.off('error', reject);
      resolve({
        socket,
        send: command => socket.send(JSON.stringify(command)),
        receive: () => queue.length ? Promise.resolve(queue.shift()) :
          new Promise((done, fail) => {
            const timer = setTimeout(() => fail(new Error('Timed out waiting for room message')), 1000);
            waiters.push(message => { clearTimeout(timer); done(message); });
          }),
        close: () => socket.terminate(),
      });
    });
  });
}

test('room lifecycle relays shots/results and advances turns without simulating physics', async t => {
  const startServer = await loadServer();
  const backend = await startServer({ port: 0, clientOrigin: 'https://golf.example' });
  t.after(() => backend.close());
  const clients = [];
  t.after(() => clients.forEach(client => client.close()));
  const host = await connect(backend.port); clients.push(host);
  host.send({ type: 'create', name: 'Host', config: { holes: 2 } });
  const created = await host.receive();
  assert.equal(created.type, 'room');
  assert.match(created.room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(created.room.status, 'lobby');
  assert.equal(created.room.players.length, 1);
  assert.equal(created.room.players[0].strokes, 0);
  const guest = await connect(backend.port); clients.push(guest);
  guest.send({ type: 'join', code: created.room.code, name: 'Guest' });
  const joined = await guest.receive();
  assert.equal(joined.room.players.length, 2);
  await host.receive();
  guest.send({ type: 'start', token: joined.you.token });
  assert.equal((await guest.receive()).type, 'error');
  host.send({ type: 'start', token: created.you.token });
  assert.equal((await host.receive()).room.currentPlayerId, created.you.id);
  assert.equal((await guest.receive()).room.status, 'playing');

  const shot = { power: 50, dir: 1, curve: 0, loft: 10 };
  const target = { id: 'shed', sub: null, rule: 1, modifier: null, lead: null };
  guest.send({ type: 'next', token: joined.you.token });
  assert.equal((await guest.receive()).type, 'error');
  host.send({ type: 'next', token: created.you.token });
  assert.equal((await host.receive()).room.currentPlayerId, joined.you.id);
  assert.equal((await guest.receive()).room.currentPlayerId, joined.you.id);
  host.send({ type: 'call', token: created.you.token, target });
  assert.equal((await host.receive()).type, 'error');
  host.send({ type: 'next', token: created.you.token });
  assert.equal((await host.receive()).room.currentPlayerId, created.you.id);
  await guest.receive();
  guest.send({ type: 'call', token: joined.you.token, target });
  assert.equal((await guest.receive()).type, 'error');
  guest.send({ type: 'shot', token: joined.you.token, shot });
  assert.equal((await guest.receive()).type, 'error');
  host.send({ type: 'shot', token: created.you.token, shot });
  assert.equal((await host.receive()).type, 'error');
  host.send({ type: 'call', token: created.you.token, target });
  assert.deepEqual((await host.receive()).room.target, target);
  assert.equal((await guest.receive()).room.callerId, created.you.id);
  host.send({ type: 'shot', token: created.you.token, shot });
  assert.deepEqual(await host.receive(), { type: 'shot', playerId: created.you.id, shot });
  assert.equal((await guest.receive()).type, 'shot');
  assert.equal((await host.receive()).type, 'room');
  assert.equal((await guest.receive()).type, 'room');
  const result = { ball: [1, 2, 3], strokes: 1, won: true, done: true };
  host.send({ type: 'result', token: created.you.token, result });
  assert.deepEqual(await host.receive(), { type: 'result', playerId: created.you.id, result });
  const room = (await host.receive()).room;
  assert.equal(room.currentPlayerId, joined.you.id);
  assert.equal(room.target, null);
  assert.equal(room.players[0].strokes, 1);
  assert.deepEqual(room.players[0].ball, [1, 2, 3]);
  await guest.receive(); await guest.receive();
  host.send({ type: 'next', token: created.you.token });
  assert.equal((await host.receive()).room.currentPlayerId, joined.you.id);
  await guest.receive();
  guest.send({ type: 'call', token: joined.you.token, target });
  await host.receive(); await guest.receive();
  guest.send({ type: 'shot', token: joined.you.token, shot });
  await host.receive(); await guest.receive();
  await host.receive(); await guest.receive();
  guest.send({ type: 'result', token: joined.you.token, result });
  await host.receive(); await host.receive(); await guest.receive(); await guest.receive();
  host.send({ type: 'next', token: created.you.token });
  const secondHole = (await host.receive()).room;
  assert.equal(secondHole.hole, 2);
  assert.equal(secondHole.players[0].strokes, 1);
  assert.equal(secondHole.players[0].done, false);
  await guest.receive();
});

test('reconnect keeps identity; rejects invalid tokens, oversized rooms and malformed messages', async t => {
  const startServer = await loadServer();
  const backend = await startServer({ port: 0 });
  t.after(() => backend.close());
  const clients = [];
  t.after(() => clients.forEach(client => client.close()));
  const host = await connect(backend.port); clients.push(host);
  host.send({ type: 'create', name: 'A', config: { holes: 1 } });
  const created = await host.receive();
  host.close();
  const newcomer = await connect(backend.port); clients.push(newcomer);
  newcomer.send({ type: 'join', code: created.room.code, name: 'A', token: 'invalid' });
  assert.equal((await newcomer.receive()).type, 'error');
  newcomer.send({ type: 'join', code: created.room.code, name: 'A', token: created.you.token });
  const restored = await newcomer.receive();
  assert.deepEqual(restored.you, created.you);
  assert.equal(restored.room.players.length, 1);
  const other = [];
  for (const name of ['B', 'C', 'D']) {
    const client = await connect(backend.port); clients.push(client);
    client.send({ type: 'join', code: created.room.code, name });
    other.push(client);
    assert.equal((await client.receive()).type, 'room');
    await newcomer.receive();
    for (const previous of other.slice(0, -1)) await previous.receive();
  }
  const fifth = await connect(backend.port); clients.push(fifth);
  fifth.send({ type: 'join', code: created.room.code, name: 'E' });
  assert.match((await fifth.receive()).message, /full/);
  fifth.socket.send('{not json');
  assert.equal((await fifth.receive()).type, 'error');
  newcomer.send({ type: 'call', token: created.you.token, target: {} });
  assert.equal((await newcomer.receive()).type, 'error');
  newcomer.send({ type: 'leave', token: created.you.token });
  const afterLeave = (await other[0].receive()).room;
  assert.equal(afterLeave.players.length, 3);
  assert.equal(afterLeave.hostId, afterLeave.players[0].id);
});

test('HTTP health and origin enforcement', async t => {
  const startServer = await loadServer();
  const backend = await startServer({ port: 0, clientOrigin: 'https://golf.example' });
  t.after(() => backend.close());
  const response = await new Promise((resolve, reject) =>
    http.get(`http://127.0.0.1:${backend.port}/healthz`, res => {
      let body = '';
      res.on('data', data => { body += data; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject));
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true });
  await assert.rejects(connect(backend.port, 'https://evil.example'), /403/);
  const local = await connect(backend.port);
  local.close();
});

test('last hole finishes; idle rooms expire and cannot be rejoined', async t => {
  const startServer = await loadServer();
  const backend = await startServer({ port: 0, roomTtlMs: 100, cleanupIntervalMs: 10 });
  t.after(() => backend.close());
  const host = await connect(backend.port);
  t.after(() => host.close());
  host.send({ type: 'create', name: 'Solo', config: { holes: 1 } });
  const created = await host.receive();
  host.send({ type: 'start', token: created.you.token });
  await host.receive();
  host.send({ type: 'call', token: created.you.token,
    target: { id: 'flag', sub: null, rule: 1, modifier: null, lead: null } });
  await host.receive();
  host.send({ type: 'shot', token: created.you.token,
    shot: { power: 1, dir: 0, curve: 0, loft: 0 } });
  await host.receive();
  await host.receive();
  host.send({ type: 'result', token: created.you.token,
    result: { ball: [0, 0, 0], strokes: -1, won: true, done: true } });
  assert.equal((await host.receive()).type, 'error');
  host.send({ type: 'result', token: created.you.token,
    result: { ball: [0, 0, 0], strokes: 1, won: true, done: true } });
  await host.receive();
  assert.equal((await host.receive()).room.currentPlayerId, null);
  host.send({ type: 'next', token: created.you.token });
  assert.equal((await host.receive()).room.status, 'finished');
  await new Promise(resolve => host.socket.once('close', resolve));
  const retry = await connect(backend.port);
  t.after(() => retry.close());
  retry.send({ type: 'join', code: created.room.code, name: 'Solo', token: created.you.token });
  assert.equal((await retry.receive()).message, 'Room not found.');
});
