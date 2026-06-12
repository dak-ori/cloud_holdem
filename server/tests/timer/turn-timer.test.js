import { jest } from '@jest/globals';
import { trackGame, untrackGame, pollActiveGames } from '../../src/timer/turn-timer.js';
import { setGameState, getGameState, setTurnDeadline, deleteGameState } from '../../src/redis/game-state.js';
import { getRedis } from '../../src/redis/client.js';
import { getSubscriber } from '../../src/redis/pubsub.js';
import { initHand } from '../../src/game/game-engine.js';

const GAME_ID = 'timer-test-game';

const makePlayers = () =>
  Array.from({ length: 4 }, (_, i) => ({
    player_id: `p${i + 1}`,
    nickname: `P${i + 1}`,
    chips: 1000,
    status: 'active',
    consecutive_auto_folds: 0,
  }));

afterEach(async () => {
  await untrackGame(GAME_ID);
  await deleteGameState(GAME_ID);
});

afterAll(async () => {
  await getSubscriber().quit();
  await getRedis().quit();
});

test('추적된 게임의 만료된 턴은 폴링 한 번에 auto_fold 처리된다', async () => {
  const state = initHand(GAME_ID, makePlayers(), 0);
  const turnPlayer = state.current_turn;
  await setGameState(GAME_ID, state);
  await setTurnDeadline(GAME_ID, Date.now() - 1000); // 이미 만료
  await trackGame(GAME_ID);

  await pollActiveGames();

  const after = await getGameState(GAME_ID);
  const folded = after.players.find(p => p.player_id === turnPlayer);
  expect(folded.status).toBe('folded');
  expect(folded.consecutive_auto_folds).toBe(1);
  expect(after.current_turn).not.toBe(turnPlayer);
});

test('게임 추적이 Redis에 보존된다 — 다른 인스턴스(새 프로세스)도 같은 목록을 본다', async () => {
  await trackGame(GAME_ID);
  // 프로세스 메모리가 아닌 Redis가 단일 진실 공급원인지 확인
  const members = await getRedis().smembers('active_games');
  expect(members).toContain(GAME_ID);

  await untrackGame(GAME_ID);
  expect(await getRedis().smembers('active_games')).not.toContain(GAME_ID);
});
