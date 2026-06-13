const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const MAX_BACKOFF_MS = 30_000;

let ws = null;
let listeners = {};
let backoffMs = 500;
let intentionalClose = false;

export function getSocket() {
  return ws;
}

export function connect() {
  intentionalClose = false;
  // 저장된 player_id가 있으면 보내서 재접속 시 신원을 유지한다.
  // sessionStorage(탭별 저장)를 써야 한 브라우저의 탭 4개가 서로 다른
  // 플레이어가 된다 — localStorage는 탭 간 공유라 전원이 같은 사람이 됨
  const pid = sessionStorage.getItem('holdem_player_id');
  ws = new WebSocket(pid ? `${WS_URL}/?pid=${pid}` : WS_URL);

  ws.onopen = () => {
    backoffMs = 500;
    emit('_connected');
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    emit(msg.type, msg);
    emit('*', msg);
  };

  ws.onclose = () => {
    if (!intentionalClose) {
      setTimeout(connect, backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  };

  ws.onerror = (err) => {
    console.error('[WS] Error:', err);
  };
}

export function disconnect() {
  intentionalClose = true;
  ws?.close();
}

export function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function on(type, fn) {
  if (!listeners[type]) listeners[type] = new Set();
  listeners[type].add(fn);
  return () => listeners[type].delete(fn);
}

function emit(type, data) {
  listeners[type]?.forEach(fn => fn(data));
}
