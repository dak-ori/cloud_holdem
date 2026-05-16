import { getTurnDeadline, getGameState, setGameState, setTurnDeadline } from '../redis/game-state.js';
import { processAction, advancePhase, resolveShowdown } from '../game/game-engine.js';
import { publish } from '../redis/pubsub.js';

const POLL_INTERVAL_MS = 1000;
const AUTO_FOLD_LIMIT = 3;

let timerHandle;

export function startTurnTimerPoller() {
  timerHandle = setInterval(pollAllGames, POLL_INTERVAL_MS);
}

export function stopTurnTimerPoller() {
  clearInterval(timerHandle);
}

const activeGames = new Set();
export function trackGame(gameId) { activeGames.add(gameId); }
export function untrackGame(gameId) { activeGames.delete(gameId); }

async function pollAllGames() {
  for (const gameId of activeGames) {
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

  const state = await getGameState(gameId);
  if (!state || !state.current_turn) return;

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
