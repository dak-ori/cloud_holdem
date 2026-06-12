import { jest } from '@jest/globals';
import { saveGameHistory, setS3Client } from '../../src/history/game-history.js';

const finishedState = {
  game_id: 'hist-game-1',
  phase: 'showdown',
  pot: 0,
  players: [
    { player_id: 'p1', nickname: 'kim', chips: 4000, status: 'active' },
    { player_id: 'p2', nickname: 'lee', chips: 0, status: 'eliminated' },
  ],
};

afterEach(() => {
  delete process.env.HISTORY_BUCKET;
  setS3Client(null);
});

test('게임 종료 시 승자·최종 칩이 히스토리 버킷에 JSON으로 저장된다', async () => {
  process.env.HISTORY_BUCKET = 'test-history-bucket';
  const sent = [];
  setS3Client({ send: async (cmd) => { sent.push(cmd.input); } });

  await saveGameHistory(finishedState, 'p1');

  expect(sent).toHaveLength(1);
  expect(sent[0].Bucket).toBe('test-history-bucket');
  expect(sent[0].Key).toBe('games/hist-game-1.json');
  const record = JSON.parse(sent[0].Body);
  expect(record.winner).toBe('p1');
  expect(record.players).toEqual([
    { player_id: 'p1', nickname: 'kim', chips: 4000 },
    { player_id: 'p2', nickname: 'lee', chips: 0 },
  ]);
  expect(record.finished_at).toBeTruthy();
});

test('HISTORY_BUCKET 미설정(로컬 개발)이면 조용히 건너뛴다', async () => {
  const sent = [];
  setS3Client({ send: async (cmd) => { sent.push(cmd.input); } });

  await expect(saveGameHistory(finishedState, 'p1')).resolves.toBeUndefined();
  expect(sent).toHaveLength(0);
});
