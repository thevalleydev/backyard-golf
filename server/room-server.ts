import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type Server } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';

type Target = {
  id: string;
  sub: number | null;
  rule: number;
  modifier: string | null;
  lead: { id: string; sub: number | null } | null;
};
type Shot = { power: number; dir: number; curve: number; loft: number };
type Result = { ball: [number, number, number]; strokes: number; won: boolean; done: boolean };
type Player = {
  id: string;
  name: string;
  token: string;
  socket: WebSocket | null;
  strokes: number;
  holeStrokes: number;
  done: boolean;
  won: boolean;
  ball?: [number, number, number];
};
type Room = {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  hostId: string;
  players: Player[];
  currentPlayerId: string | null;
  callerId: string | null;
  hole: number;
  holes: number;
  target: Target | null;
  phase: 'call' | 'shot' | 'result';
  lastActive: number;
};
export type ServerOptions = {
  port?: number;
  host?: string;
  clientOrigin?: string;
  roomTtlMs?: number;
  cleanupIntervalMs?: number;
};
const MAX_MESSAGE_BYTES = 4096;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
const sub = (v: unknown): v is number | null =>
  v === null || (Number.isSafeInteger(v) && (v as number) >= 0);
const validTarget = (v: unknown): v is Target =>
  record(v) && id(v.id) && sub(v.sub) && Number.isSafeInteger(v.rule) &&
  (v.modifier === null || (typeof v.modifier === 'string' && v.modifier.length <= 64)) &&
  (v.lead === null || (record(v.lead) && id(v.lead.id) && sub(v.lead.sub)));
const validShot = (v: unknown): v is Shot =>
  record(v) && finite(v.power) && finite(v.dir) && finite(v.curve) && finite(v.loft);
const validResult = (v: unknown): v is Result =>
  record(v) && Array.isArray(v.ball) && v.ball.length === 3 && v.ball.every(finite) &&
  Number.isSafeInteger(v.strokes) && (v.strokes as number) >= 0 &&
  typeof v.won === 'boolean' && typeof v.done === 'boolean' && (!v.won || v.done);

function code(): string {
  let result = '';
  // Rejection sampling avoids favoring some room codes over others.
  while (result.length < 6) {
    for (const byte of randomBytes(8)) {
      if (byte < 224 && result.length < 6) result += CODE_CHARS[byte % CODE_CHARS.length];
    }
  }
  return result;
}
function token(): string { return randomBytes(32).toString('base64url'); }
function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function send(socket: WebSocket, message: object): void {
  if (socket.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify(message)); } catch { /* Socket closed during send. */ }
  }
}
function error(socket: WebSocket, message: string): void { send(socket, { type: 'error', message }); }
function publicRoom(room: Room) {
  return {
    code: room.code, status: room.status, hostId: room.hostId,
    players: room.players.map(({ id, name, socket, strokes, done, won, ball }) => ({
      id, name, connected: socket?.readyState === WebSocket.OPEN, strokes, done, won,
      ...(ball ? { ball } : {}),
    })),
    currentPlayerId: room.currentPlayerId, callerId: room.callerId,
    hole: room.hole, holes: room.holes, target: room.target,
  };
}
function announce(room: Room): void {
  const state = publicRoom(room);
  for (const player of room.players) {
    if (player.socket) send(player.socket, {
      type: 'room', room: state, you: { id: player.id, token: player.token },
    });
  }
}
function relay(room: Room, message: object): void {
  for (const player of room.players) if (player.socket) send(player.socket, message);
}
function nextPlayer(room: Room, after: string | null): string | null {
  const start = Math.max(0, room.players.findIndex(p => p.id === after) + 1);
  for (let offset = 0; offset < room.players.length; offset++) {
    const p = room.players[(start + offset) % room.players.length];
    if (!p.done && p.socket?.readyState === WebSocket.OPEN) return p.id;
  }
  return null;
}
function localOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.origin === origin;
  } catch { return false; }
}
function allowedOrigin(origin: string | undefined, configured: string | undefined): boolean {
  if (!origin) return !configured; // Non-browser clients are permitted only in local mode.
  return origin === configured || localOrigin(origin);
}

export async function createServer(options: ServerOptions = {}): Promise<{
  server: Server; port: number; close: () => Promise<void>;
}> {
  const rooms = new Map<string, Room>();
  const configuredOrigin = options.clientOrigin ?? process.env.CLIENT_ORIGIN;
  const ttl = options.roomTtlMs ?? 2 * 60 * 60 * 1000;
  const interval = options.cleanupIntervalMs ?? 60 * 1000;
  if (ttl <= 0 || interval <= 0) throw new Error('Room TTL and cleanup interval must be positive');
  const server = createHttpServer((request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/' || !allowedOrigin(request.headers.origin, configuredOrigin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', socket => {
    let active: { room: Room; player: Player } | null = null;
    socket.on('message', (data: RawData, binary: boolean) => {
      if (binary || Buffer.byteLength(data.toString()) > MAX_MESSAGE_BYTES) {
        error(socket, 'Expected a small JSON text message.');
        return;
      }
      let command: unknown;
      try { command = JSON.parse(data.toString()); } catch {
        error(socket, 'Invalid JSON.');
        return;
      }
      if (!record(command) || typeof command.type !== 'string') {
        error(socket, 'Invalid command.');
        return;
      }
      const fail = (message: string) => error(socket, message);
      if (command.type === 'create') {
        if (active) return fail('Already in a room.');
        if (typeof command.name !== 'string' || !command.name.trim() ||
          command.name.trim().length > 12 || !record(command.config) ||
          !Number.isInteger(command.config.holes) || (command.config.holes as number) < 1 ||
          (command.config.holes as number) > 18) return fail('Invalid name or hole count (1–18).');
        let roomCode: string;
        do { roomCode = code(); } while (rooms.has(roomCode));
        const player: Player = {
          id: randomUUID(), name: command.name.trim(), token: token(), socket,
          strokes: 0, holeStrokes: 0, done: false, won: false,
        };
        const room: Room = {
          code: roomCode, status: 'lobby', hostId: player.id, players: [player],
          currentPlayerId: null, callerId: null, hole: 1, holes: command.config.holes as number,
          target: null, phase: 'call', lastActive: Date.now(),
        };
        rooms.set(roomCode, room);
        active = { room, player };
        announce(room);
        return;
      }
      if (command.type === 'join') {
        if (active) return fail('Already in a room.');
        if (typeof command.code !== 'string' || !/^[A-Z0-9]{6}$/.test(command.code) ||
          typeof command.name !== 'string' || !command.name.trim() ||
          command.name.trim().length > 12 ||
          (command.token !== undefined && (typeof command.token !== 'string' || command.token.length > 128)))
          return fail('Invalid room code, name, or token.');
        const room = rooms.get(command.code);
        if (!room) return fail('Room not found.');
        const name = (command.name as string).trim();
        let player: Player | undefined;
        if (command.token) {
          player = room.players.find(p => sameToken(p.token, command.token as string));
          if (!player) return fail('Invalid reconnect token.');
          if (player.name !== name) return fail('Reconnect with your original name.');
          if (player.socket && player.socket !== socket) player.socket.close(4000, 'Reconnected elsewhere');
        } else {
          if (room.status !== 'lobby') return fail('Game already started.');
          if (room.players.length >= 4) return fail('Room is full.');
          if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
            return fail('Name already in use.');
          player = {
            id: randomUUID(), name, token: token(), socket,
            strokes: 0, holeStrokes: 0, done: false, won: false,
          };
          room.players.push(player);
        }
        player.socket = socket;
        active = { room, player };
        room.lastActive = Date.now();
        if (room.status === 'playing' && room.currentPlayerId === null)
          room.currentPlayerId = nextPlayer(room, null);
        announce(room);
        return;
      }
      if (!active || typeof command.token !== 'string' ||
        !sameToken(command.token, active.player.token) ||
        active.player.socket !== socket || rooms.get(active.room.code) !== active.room)
        return fail('Join a room with a valid token first.');
      const { room, player } = active;
      room.lastActive = Date.now();
      if (command.type === 'leave') {
        const index = room.players.indexOf(player);
        room.players.splice(index, 1);
        active = null;
        if (!room.players.length) {
          rooms.delete(room.code);
        } else {
          if (room.hostId === player.id) room.hostId = room.players[0].id;
          if (room.currentPlayerId === player.id) {
            room.currentPlayerId = nextPlayer(room, null);
            room.callerId = null;
            room.target = null;
            room.phase = 'call';
          }
          announce(room);
        }
        socket.close(1000, 'Left room');
      } else if (command.type === 'start') {
        if (player.id !== room.hostId || room.status !== 'lobby') return fail('Only the host can start the lobby.');
        room.status = 'playing';
        room.currentPlayerId = nextPlayer(room, null);
        announce(room);
      } else if (command.type === 'call') {
        if (room.status !== 'playing' || room.currentPlayerId !== player.id || room.phase !== 'call')
          return fail('Not your turn to call.');
        if (!validTarget(command.target)) return fail('Invalid target.');
        room.target = command.target;
        room.callerId = player.id;
        room.phase = 'shot';
        announce(room);
      } else if (command.type === 'shot') {
        if (room.status !== 'playing' || room.currentPlayerId !== player.id || room.phase !== 'shot')
          return fail('Call a target on your turn before shooting.');
        if (!validShot(command.shot)) return fail('Invalid shot.');
        room.phase = 'result';
        relay(room, { type: 'shot', playerId: player.id, shot: command.shot });
        announce(room);
      } else if (command.type === 'result') {
        if (room.status !== 'playing' || room.currentPlayerId !== player.id || room.phase !== 'result')
          return fail('No pending shot for this player.');
        if (!validResult(command.result) || command.result.strokes < player.holeStrokes)
          return fail('Invalid result or decreasing stroke count.');
        const result = command.result;
        player.strokes += result.strokes - player.holeStrokes;
        player.holeStrokes = result.strokes;
        player.ball = result.ball;
        player.done = result.done;
        player.won = result.won;
        relay(room, { type: 'result', playerId: player.id, result });
        room.currentPlayerId = nextPlayer(room, player.id);
        room.callerId = null;
        room.target = null;
        room.phase = 'call';
        announce(room);
      } else if (command.type === 'next') {
        if (player.id !== room.hostId || room.status !== 'playing')
          return fail('Only the host can advance a playing room.');
        if (room.players.every(p => p.done)) {
          if (room.hole === room.holes) {
            room.status = 'finished';
            room.currentPlayerId = null;
          } else {
            room.hole++;
            for (const p of room.players) {
              p.holeStrokes = 0; p.done = false; p.won = false; p.ball = undefined;
            }
            room.currentPlayerId = nextPlayer(room, null);
          }
        } else {
          room.currentPlayerId = nextPlayer(room, room.currentPlayerId);
        }
        room.callerId = null;
        room.target = null;
        room.phase = 'call';
        announce(room);
      } else {
        fail('Unknown command.');
      }
    });
    socket.on('close', () => {
      if (!active) return;
      const { room, player } = active;
      if (player.socket !== socket || rooms.get(room.code) !== room) return;
      player.socket = null;
      room.lastActive = Date.now();
      if (room.currentPlayerId === player.id) {
        room.currentPlayerId = nextPlayer(room, player.id);
        room.callerId = null;
        room.target = null;
        room.phase = 'call';
      }
      announce(room);
    });
    socket.on('error', () => { /* A broken client connection must not terminate the server. */ });
  });
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [roomCode, room] of rooms) {
      if (now - room.lastActive < ttl) continue;
      rooms.delete(roomCode);
      for (const player of room.players) player.socket?.close(4001, 'Room expired');
    }
  }, interval);
  cleanup.unref();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? Number(process.env.PORT || 3000), options.host, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (cause) {
    clearInterval(cleanup);
    wss.close();
    throw cause;
  }
  const address = server.address();
  const port = address && typeof address !== 'string' ? address.port : 0;
  return {
    server, port,
    close: async () => {
      clearInterval(cleanup);
      for (const client of wss.clients) client.terminate();
      rooms.clear();
      await new Promise<void>((resolve, reject) => {
        wss.close();
        server.close(err => err ? reject(err) : resolve());
      });
    },
  };
}
