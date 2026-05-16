import { v4 as uuidv4 } from 'uuid';
import { createRoom, listRooms, joinRoom, getRoom, removeRoom, updateRoom } from '../lobby/room-manager.js';
import { getGameState, setGameState, atomicUpdateGameState, setTurnDeadline, deleteGameState } from '../redis/game-state.js';
import { publish, subscribe, unsubscribe } from '../redis/pubsub.js';
import { register, unregister, broadcastToGame } from './broadcaster.js';
import { initHand, processAction, advancePhase, resolveShowdown } from '../game/game-engine.js';
import { trackGame, untrackGame } from '../timer/turn-timer.js';

// gameId → countdown timer handle
const countdowns = new Map();

// 이미 Redis 채널 구독된 gameId들
const subscribedGames = new Set();

export function handleConnection(ws) {
  let playerId = uuidv4();
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
    if (currentGameId) {
      unregister(currentGameId, playerId);
    }
  });

  ws.send(JSON.stringify({ type: 'connected', player_id: playerId }));
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
      const handle = countdowns.get(currentGameId);
      if (handle) {
        clearInterval(handle);
        countdowns.delete(currentGameId);
        broadcastToGame(currentGameId, { type: 'countdown_cancelled', message: '플레이어가 떠났습니다' });
      }
      const room = await getRoom(currentGameId);
      if (room) {
        room.players = room.players.filter(p => p.player_id !== playerId);
        if (room.players.length === 0) {
          await removeRoom(currentGameId);
          // 마지막 플레이어 → Redis 채널 구독 해제
          await unsubscribe(currentGameId);
          subscribedGames.delete(currentGameId);
        } else {
          await updateRoom(currentGameId, room);
          broadcastToGame(currentGameId, { type: 'player_left', room });
        }
      }
      unregister(currentGameId, playerId);
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

async function startNextHand(gameId, state) {
  const surviving = state.players
    .filter(p => p.chips > 0)
    .map(p => ({ ...p, status: 'active', hand: [], consecutive_auto_folds: 0 }));

  if (surviving.length < 2) {
    await publish(gameId, { type: 'game_over', winner: surviving[0] });
    await deleteGameState(gameId);
    untrackGame(gameId);
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
      trackGame(gameId);
      await publish(gameId, { type: 'game_started', state });
    }
  }, 1000);
  countdowns.set(gameId, handle);
}
