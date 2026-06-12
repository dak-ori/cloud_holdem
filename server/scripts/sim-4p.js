// 4인 풀게임 WebSocket 시뮬레이션 — preflop→showdown 완주 확인
// 사용법: node scripts/sim-4p.js [ws://주소]  (기본 ws://localhost:3001)
const WebSocket = require('ws');

const URL = process.argv[2] || process.env.WS_URL || 'ws://localhost:3001';
const NICKS = ['kim', 'lee', 'park', 'choi'];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const players = [];
let gameId = null;
const phasesSeen = new Set();
const acted = new Set();
let done = false;

function finish(ok, msg) {
  if (done) return;
  done = true;
  log(ok ? 'PASS:' : 'FAIL:', msg);
  log('phases seen:', [...phasesSeen].join(', '));
  players.forEach(p => p.ws.close());
  process.exit(ok ? 0 : 1);
}

setTimeout(() => finish(false, 'timeout after 60s'), 60_000);

function onState(p, state) {
  phasesSeen.add(state.phase);
  if (state.phase === 'showdown') {
    const chips = state.players.map(x => `${x.nickname}:${x.chips}`).join(' ');
    log(`showdown! chips → ${chips}`);
    finish(true, 'full hand completed (preflop→…→showdown)');
    return;
  }
  if (state.current_turn !== p.playerId) return;
  const key = `${state.phase}:${state.current_turn}:${state.pot}:${state.current_bet}`;
  if (acted.has(key)) return;
  acted.add(key);
  const me = state.players.find(x => x.player_id === p.playerId);
  const action = state.current_bet > (me.current_bet || 0) ? 'call' : 'check';
  log(`[${p.nick}] phase=${state.phase} pot=${state.pot} bet=${state.current_bet} → ${action}`);
  setTimeout(() => p.ws.send(JSON.stringify({ type: 'action', action })), 50);
}

function connect(nick, i) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const p = { nick, ws, playerId: null };
    players.push(p);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case 'connected': p.playerId = msg.player_id; resolve(p); break;
        case 'room_created': gameId = msg.room.game_id; log(`room created: ${gameId}`); break;
        case 'countdown': if (i === 0) log(`countdown: ${msg.seconds}`); break;
        case 'game_started': if (i === 0) log('game started!'); onState(p, msg.state); break;
        case 'state_update': onState(p, msg.state); break;
        case 'error': log(`[${nick}] ERROR: ${msg.message}`); break;
      }
    });
    ws.on('error', (e) => finish(false, `[${nick}] ws error: ${e.message}`));
  });
}

(async () => {
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(await connect(NICKS[i], i));
  log('4 clients connected to', URL);
  ps[0].ws.send(JSON.stringify({ type: 'create_room', nickname: ps[0].nick }));
  await new Promise(r => { const t = setInterval(() => { if (gameId) { clearInterval(t); r(); } }, 50); });
  for (let i = 1; i < 4; i++) {
    ps[i].ws.send(JSON.stringify({ type: 'join_room', game_id: gameId, nickname: ps[i].nick }));
    await new Promise(r => setTimeout(r, 200));
  }
  log('all 4 joined — waiting for game start');
})();
