import { getTurnDeadline, claimTurnDeadline, getGameState, setGameState, setTurnDeadline } from '../redis/game-state.js';
import { processAction, advancePhase, resolveShowdown } from '../game/game-engine.js';
import { publish } from '../redis/pubsub.js';
import { getRedis } from '../redis/client.js';

const POLL_INTERVAL_MS = 1000;
const AUTO_FOLD_LIMIT = 3;

// 활성 게임 목록은 Redis에 둔다 — 어느 인스턴스든 모든 게임의 타이머를
// 처리할 수 있고, 게임을 시작시킨 태스크가 교체돼도 타이머가 끊기지 않는다.
const ACTIVE_GAMES_KEY = 'active_games';

let timerHandle;

export function startTurnTimerPoller() {
  timerHandle = setInterval(pollActiveGames, POLL_INTERVAL_MS);
}

export function stopTurnTimerPoller() {
  clearInterval(timerHandle);
}

export async function trackGame(gameId) {
  await getRedis().sadd(ACTIVE_GAMES_KEY, gameId);
}

export async function untrackGame(gameId) {
  await getRedis().srem(ACTIVE_GAMES_KEY, gameId);
}

export async function pollActiveGames() {
  let gameIds;
  try {
    gameIds = await getRedis().smembers(ACTIVE_GAMES_KEY);
  } catch (e) {
    console.error('[Timer] Failed to read active games:', e.message);
    return;
  }
  for (const gameId of gameIds) {
    try {
      await checkTurnDeadline(gameId);
    } catch (e) {
      console.error(`[Timer] Error for ${gameId}:`, e.message);
    }
  }
}

async function checkTurnDeadline(gameId) {
  const deadline = await getTurnDeadline(gameId);
  if (!deadline || Date.now() < deadline) return;

  // 여러 인스턴스가 동시에 폴링하므로 GETDEL로 처리권을 선점 —
  // 키를 가져간 인스턴스만 auto_fold를 실행한다
  const claimed = await claimTurnDeadline(gameId);
  if (!claimed || Date.now() < claimed) return;

  const state = await getGameState(gameId);
  if (!state) {
    // 게임은 사라졌는데 추적만 남은 경우 정리
    await untrackGame(gameId);
    return;
  }
  if (!state.current_turn) return;

  let newState = processAction(state, state.current_turn, 'auto_fold');

  const timedOutPlayer = newState.players.find(p => p.player_id === state.current_turn);
  if (timedOutPlayer?.consecutive_auto_folds >= AUTO_FOLD_LIMIT) {
    timedOutPlayer.status = 'eliminated';
    await publish(gameId, { type: 'player_eliminated', player_id: timedOutPlayer.player_id });
  }

  if (newState._round_done) {
    newState = handleRoundEnd(newState);
  }

  await setGameState(gameId, newState);

  if (newState.current_turn) {
    await setTurnDeadline(gameId, Date.now() + 20_000);
  }

  await publish(gameId, { type: 'state_update', state: newState });
}

function handleRoundEnd(state) {
  const active = state.players.filter(p => p.status === 'active');
  if (active.length <= 1 || state.phase === 'river') return resolveShowdown(state);
  return advancePhase(state);
}
