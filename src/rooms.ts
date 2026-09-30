// Browser-only room lobby; game simulation remains local until server-side shots are implemented.
interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
}
interface RoomState {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  hostId: string;
  players: RoomPlayer[];
  currentPlayerId: string | null;
  hole: number;
  holes: number;
}
interface Identity { id: string; token: string }
interface SavedRoom { url: string; code: string; name: string; token: string }
const STORAGE_KEY = 'byg_room';
const $ = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing room element: ${id}`);
  return element;
};
const field = (id: string): HTMLInputElement => {
  const element = $(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Expected room input: ${id}`);
  return element;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const validRoom = (value: unknown): value is RoomState =>
  isRecord(value) && typeof value.code === 'string' &&
  (value.status === 'lobby' || value.status === 'playing' || value.status === 'finished') &&
  typeof value.hostId === 'string' && Array.isArray(value.players) &&
  value.players.every((player: unknown) => isRecord(player) && typeof player.id === 'string' &&
    typeof player.name === 'string' && typeof player.connected === 'boolean') &&
  (value.currentPlayerId === null || typeof value.currentPlayerId === 'string') &&
  typeof value.hole === 'number' && typeof value.holes === 'number';
const validIdentity = (value: unknown): value is Identity =>
  isRecord(value) && typeof value.id === 'string' && typeof value.token === 'string';

let socket: WebSocket | null = null;
let room: RoomState | null = null;
let identity: Identity | null = null;
function status(text: string) { $('roomStatus').textContent = text; }
function savedRoom(): SavedRoom | null {
  let raw: string | null;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch (error) {
    if (!(error instanceof DOMException)) throw error;
    status('Room reconnect storage is unavailable in this browser.');
    return null;
  }
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (isRecord(value) && ['url', 'code', 'name', 'token'].every(key => typeof value[key] === 'string'))
      return { url: String(value.url), code: String(value.code), name: String(value.name), token: String(value.token) };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  try { localStorage.removeItem(STORAGE_KEY); }
  catch (error) { if (!(error instanceof DOMException)) throw error; }
  return null;
}
function render() {
  $('roomEntry').classList.toggle('hidden', !!room);
  $('roomLobby').classList.toggle('hidden', !room);
  $('roomReconnect').classList.toggle('hidden', !savedRoom());
  if (!room) return;
  $('roomShare').textContent = room.code;
  const players = $('roomPlayers');
  players.replaceChildren(...room.players.map(player => {
    const item = document.createElement('li');
    item.textContent = `${player.name}${player.id === room?.hostId ? ' (host)' : ''}${player.connected ? '' : ' (offline)'}`;
    return item;
  }));
  const current = room.players.find(player => player.id === room?.currentPlayerId);
  $('roomTurn').textContent = room.status === 'lobby'
    ? 'Waiting for the host to start the room.'
    : room.status === 'finished'
      ? 'Room finished (demo). Leave to start another room.'
      : `Hole ${room.hole} of ${room.holes} · ${current?.name ?? 'Waiting'}'s turn (demo only)`;
  const host = identity?.id === room.hostId;
  $('roomStart').classList.toggle('hidden', room.status !== 'lobby' || !host);
  $('roomNext').classList.toggle('hidden', room.status !== 'playing' || !host);
}
function endpoint(raw: string): string {
  const url = new URL(raw);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new Error('Use an HTTPS or WSS room server URL.');
  if (location.protocol === 'https:' && url.protocol !== 'wss:') throw new Error('HTTPS games require a secure WSS server.');
  if (url.username || url.password) throw new Error('Do not put credentials in the room server URL.');
  return url.href;
}
function connect(action: 'create' | 'join', holes: number, previous?: SavedRoom) {
  const name = (previous?.name ?? field('roomName').value).trim();
  const code = (previous?.code ?? field('roomCode').value).trim().toUpperCase();
  if (!name || name.length > 12) { status('Enter a name (up to 12 characters).'); return; }
  if (action === 'join' && !/^[A-Z0-9]{6}$/.test(code)) { status('Enter a six-character room code.'); return; }
  let url: string;
  try { url = endpoint(previous?.url ?? field('roomUrl').value.trim()); }
  catch (error) { status(error instanceof Error ? error.message : 'Invalid room server URL.'); return; }
  if (socket) socket.close();
  room = null; identity = null;
  render();
  status('Connecting to room server...');
  let ws: WebSocket;
  try { ws = new WebSocket(url); }
  catch (error) {
    if (!(error instanceof DOMException) && !(error instanceof TypeError)) throw error;
    status(`Cannot connect to the room server: ${error.message}`);
    return;
  }
  socket = ws;
  ws.addEventListener('open', () => {
    if (socket !== ws) return;
    ws.send(JSON.stringify(action === 'create' ? { type: 'create', name, config: { holes } }
      : { type: 'join', code, name, ...(previous ? { token: previous.token } : {}) }));
  });
  ws.addEventListener('message', event => {
    if (socket !== ws) return;
    let message: unknown;
    try { message = JSON.parse(String(event.data)); }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; status('Room server sent invalid JSON.'); return; }
    if (!isRecord(message)) { status('Room server sent an invalid message.'); return; }
    if (message.type === 'error' && typeof message.message === 'string') { status(message.message); return; }
    if (message.type !== 'room' || !validRoom(message.room) || !validIdentity(message.you)) {
      status('Room server sent an invalid room update.'); return;
    }
    room = message.room; identity = message.you;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, code: room.code, name, token: identity.token })); }
    catch (error) {
      if (!(error instanceof DOMException)) throw error;
      status(`Connected to ${room.code}, but reconnect storage is unavailable.`);
      render();
      return;
    }
    status(`Connected to room ${room.code}.`);
    render();
  });
  ws.addEventListener('error', () => { if (socket === ws) status('Cannot reach the room server. Check its URL and try again.'); });
  ws.addEventListener('close', () => {
    if (socket !== ws) return;
    socket = null;
    room = null; identity = null;
    status('Disconnected. Reconnect to your saved room to continue.');
    render();
  });
}
function send(type: 'start' | 'next' | 'leave') {
  if (socket?.readyState !== WebSocket.OPEN || !identity) { status('Not connected. Reconnect to the room.'); return; }
  socket.send(JSON.stringify({ type, token: identity.token }));
}
export function initRooms(getHoles: () => number) {
  const configured = import.meta.env.VITE_ROOM_URL;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  $('roomOpen').classList.toggle('hidden', !configured && !local && !new URLSearchParams(location.search).has('rooms'));
  field('roomUrl').value = configured || (local
    ? `ws://${location.hostname}:3000` : '');
  const saved = savedRoom();
  if (saved) { field('roomUrl').value = saved.url; field('roomCode').value = saved.code; field('roomName').value = saved.name; }
  $('roomOpen').onclick = () => { $('roomModal').classList.remove('hidden'); render(); };
  $('roomClose').onclick = () => $('roomModal').classList.add('hidden');
  $('roomCreate').onclick = () => connect('create', getHoles());
  $('roomJoin').onclick = () => connect('join', getHoles());
  $('roomReconnect').onclick = () => {
    const previous = savedRoom();
    if (!previous) { status('No saved room to reconnect to.'); return; }
    connect('join', getHoles(), previous);
  };
  $('roomStart').onclick = () => send('start');
  $('roomNext').onclick = () => send('next');
  $('roomLeave').onclick = () => {
    send('leave');
    socket?.close();
    socket = null; room = null; identity = null;
    try { localStorage.removeItem(STORAGE_KEY); }
    catch (error) {
      if (!(error instanceof DOMException)) throw error;
      status('Left the room, but saved reconnect data could not be cleared.');
      render();
      return;
    }
    status('Left the room.');
    render();
  };
}
