import { v4 as uuidv4 } from 'uuid';
import { createRoom, listRooms, joinRoom, getRoom, removeRoom, updateRoom } from '../lobby/room-manager.js';
import { getGameState, setGameState, atomicUpdateGameState, setTurnDeadline, deleteGameState } from '../redis/game-state.js';
import { publish, subscribe, unsubscribe } from '../redis/pubsub.js';
import { register, unregister, broadcastToGame } from './broadcaster.js';
import { initHand, processAction, advancePhase, resolveShowdown } from '../game/game-engine.js';
import { trackGame, untrackGame } from '../timer/turn-timer.js';
import { saveGameHistory } from '../history/game-history.js';

// gameId → countdown timer handle
const countdowns = new Map();

// 이미 Redis 채널 구독된 gameId들
const subscribedGames = new Set();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function handleConnection(ws, req) {
  // 재접속 시 클라이언트가 기존 player_id를 보내면 신원을 유지한다
  const query = new URLSearchParams((req?.url || '').split('?')[1] || '');
  const requestedPid = query.get('pid');
  let playerId = UUID_RE.test(requestedPid || '') ? requestedPid : uuidv4();
  let currentGameId = null;

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    try {
      await route(msg, ws, playerId, currentGameId, (gid) => { currentGameId = gid; });
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: e.message }));
    }
  });

  ws.on('close', async () => {
    if (!currentGameId) return;
    try {
      // 게임 진행 중이면 자리를 유지한다 — 같은 pid로 재접속해 복귀 가능,
      // 방치하면 턴 타이머가 auto_fold로 처리. 대기 방이면 즉시 정리.
      const inProgress = await getGameState(currentGameId);
      if (inProgress) {
        unregister(currentGameId, playerId);
      } else {
        await handlePlayerLeave(currentGameId, playerId);
      }
    } catch (e) {
      console.error('[WS] close cleanup failed:', e.message);
    }
  });

  ws.send(JSON.stringify({ type: 'connected', player_id: playerId }));

  // 재접속이면 진행 중이던 게임에 재합류
  rejoinIfInGame(ws, playerId, (gid) => { currentGameId = gid; }).catch(e =>
    console.error('[WS] rejoin failed:', e.message));
}

async function rejoinIfInGame(ws, playerId, setGameId) {
  const rooms = await listRooms();
  const room = rooms.find(r => r.players.some(p => p.player_id === playerId));
  if (!room) return;

  setGameId(room.game_id);
  register(room.game_id, playerId, ws);
  if (!subscribedGames.has(room.game_id)) {
    await subscribe(room.game_id, (event) => broadcastToGame(room.game_id, event));
    subscribedGames.add(room.game_id);
  }
  const state = await getGameState(room.game_id);
  ws.send(JSON.stringify({ type: 'rejoined', room, state }));
}

// 명시적 leave_room과 연결 끊김(close) 양쪽에서 공유하는 방 정리 로직
async function handlePlayerLeave(gameId, playerId) {
  const handle = countdowns.get(gameId);
  if (handle) {
    clearInterval(handle);
    countdowns.delete(gameId);
    broadcastToGame(gameId, { type: 'countdown_cancelled', message: '플레이어가 떠났습니다' });
  }
  const room = await getRoom(gameId);
  if (room) {
    room.players = room.players.filter(p => p.player_id !== playerId);
    if (room.players.length === 0) {
      await removeRoom(gameId);
      // 마지막 플레이어 → Redis 채널 구독 해제
      await unsubscribe(gameId);
      subscribedGames.delete(gameId);
    } else {
      await updateRoom(gameId, room);
      broadcastToGame(gameId, { type: 'player_left', room });
    }
  }
  unregister(gameId, playerId);
}

async function route(msg, ws, playerId, currentGameId, setGameId) {
  switch (msg.type) {
    case 'list_rooms': {
      const rooms = await listRooms();
      ws.send(JSON.stringify({ type: 'rooms', rooms }));
      break;
    }
    case 'create_room': {
      const room = await createRoom(playerId, msg.nickname);
      setGameId(room.game_id);
      register(room.game_id, playerId, ws);
      if (!subscribedGames.has(room.game_id)) {
        await subscribe(room.game_id, (event) => broadcastToGame(room.game_id, event));
        subscribedGames.add(room.game_id);
      }
      ws.send(JSON.stringify({ type: 'room_created', room }));
      break;
    }
    case 'join_room': {
      const room = await joinRoom(msg.game_id, playerId, msg.nickname);
      setGameId(msg.game_id);
      register(msg.game_id, playerId, ws);
      if (!subscribedGames.has(msg.game_id)) {
        await subscribe(msg.game_id, (event) => broadcastToGame(msg.game_id, event));
        subscribedGames.add(msg.game_id);
      }
      broadcastToGame(msg.game_id, { type: 'player_joined', room });

      if (room.players.length === 4) {
        startCountdown(msg.game_id, room.players);
      }
      break;
    }
    case 'leave_room': {
      if (!currentGameId) break;
      await handlePlayerLeave(currentGameId, playerId);
      setGameId(null);
      break;
    }
    case 'action': {
      if (!currentGameId) throw new Error('not in a game');
      const state = await getGameState(currentGameId);
      const newState = processAction(state, playerId, msg.action, msg.amount);

      if (newState._round_done) {
        const resolved = handleRoundEnd(newState);
        await setGameState(currentGameId, resolved);
        await publish(currentGameId, { type: 'state_update', state: resolved });
        if (resolved.phase === 'showdown') {
          await startNextHand(currentGameId, resolved);
        }
      } else {
        await atomicUpdateGameState(currentGameId, state.current_turn, newState);
        await setTurnDeadline(currentGameId, Date.now() + 20_000);
        await publish(currentGameId, { type: 'state_update', state: newState });
      }
      break;
    }
  }
}

function handleRoundEnd(state) {
  const active = state.players.filter(p => p.status === 'active');
  if (active.length <= 1 || state.phase === 'river') return resolveShowdown(state);
  return advancePhase(state);
}

// 턴 타이머(다른 모듈)도 쇼다운 후 이 함수로 다음 핸드를 이어간다
export async function startNextHand(gameId, state) {
  // consecutive_auto_folds는 유지 — "3회 연속 방치 → 탈락"이 핸드를 넘어 누적되어야
  // 전원이 방치한 게임도 타이머만으로 종료된다 (수동 액션 시 0으로 리셋됨)
  const surviving = state.players
    .filter(p => p.chips > 0 && p.status !== 'eliminated')
    .map(p => ({ ...p, status: 'active', hand: [] }));

  if (surviving.length < 2) {
    await publish(gameId, { type: 'game_over', winner: surviving[0] });
    // 히스토리 저장 실패가 게임 종료 흐름을 막으면 안 된다
    saveGameHistory(state, surviving[0]?.player_id).catch(e =>
      console.error(`[History] Save failed for ${gameId}:`, e.message));
    await deleteGameState(gameId);
    await removeRoom(gameId); // 끝난 게임의 방이 로비에 남지 않도록
    await untrackGame(gameId);
    // 게임 종료 → 구독 해제
    await unsubscribe(gameId);
    subscribedGames.delete(gameId);
    return;
  }

  const nextDealerIdx = (state.dealer_index + 1) % surviving.length;
  const newState = initHand(gameId, surviving, nextDealerIdx);
  await setGameState(gameId, newState);
  await setTurnDeadline(gameId, Date.now() + 20_000);
  await publish(gameId, { type: 'state_update', state: newState });
}

function startCountdown(gameId, players) {
  broadcastToGame(gameId, { type: 'countdown', seconds: 5, message: '게임이 시작합니다' });
  let count = 5;
  const handle = setInterval(async () => {
    count--;
    if (count > 0) {
      broadcastToGame(gameId, { type: 'countdown', seconds: count });
    } else {
      clearInterval(handle);
      countdowns.delete(gameId);
      const state = initHand(gameId, players.map(p => ({
        ...p, chips: 1000, status: 'active', consecutive_auto_folds: 0
      })), 0);
      await setGameState(gameId, state);
      await setTurnDeadline(gameId, Date.now() + 20_000);
      await trackGame(gameId);
      await publish(gameId, { type: 'game_started', state });
    }
  }, 1000);
  countdowns.set(gameId, handle);
}
