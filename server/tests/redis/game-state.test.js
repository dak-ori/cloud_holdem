import { jest } from '@jest/globals';
import {
  setTurnDeadline,
  getTurnDeadline,
  deleteGameState,
} from '../../src/redis/game-state.js';
import { getRedis } from '../../src/redis/client.js';

const GAME_ID = 'test-deadline-game';

afterEach(async () => {
  await deleteGameState(GAME_ID);
});

afterAll(async () => {
  await getRedis().quit();
});

describe('turn deadline', () => {
  test('deadline 시각이 지난 후에도 폴러가 deadline을 읽을 수 있다 (auto_fold 발동 조건)', async () => {
    const deadline = Date.now() + 1000; // 1초 뒤 만료
    await setTurnDeadline(GAME_ID, deadline);

    // deadline이 지난 시점 — 타이머 폴러가 이 값을 읽고 auto_fold를 실행해야 함
    await new Promise((r) => setTimeout(r, 1600));

    const read = await getTurnDeadline(GAME_ID);
    expect(read).toBe(deadline);
  }, 10_000);
});
