import { evaluateHand, compareHands } from '../../src/game/hand-evaluator.js';

test('로열 플러시 감지', () => {
  const { rank } = evaluateHand(['Ah','Kh'], ['Qh','Jh','Th','2c','3d']);
  expect(rank).toBe(1);
});

test('스트레이트 플러시 감지', () => {
  const { rank } = evaluateHand(['9h','8h'], ['7h','6h','5h','2c','3d']);
  expect(rank).toBe(2);
});

test('포카드 감지', () => {
  const { rank } = evaluateHand(['Ah','Ad'], ['As','Ac','2h','3c','4d']);
  expect(rank).toBe(3);
});

test('풀하우스 감지', () => {
  const { rank } = evaluateHand(['Ah','Ad'], ['As','Kh','Kd','3c','4d']);
  expect(rank).toBe(4);
});

test('플러시 감지', () => {
  const { rank } = evaluateHand(['Ah','2h'], ['5h','7h','9h','Kc','Qd']);
  expect(rank).toBe(5);
});

test('스트레이트 감지', () => {
  const { rank } = evaluateHand(['Ah','2d'], ['3c','4h','5s','Kc','Qd']);
  expect(rank).toBe(6);
});

test('쓰리오브어카인드 감지', () => {
  const { rank } = evaluateHand(['Ah','Ad'], ['As','2h','3c','5d','7c']);
  expect(rank).toBe(7);
});

test('투페어 감지', () => {
  const { rank } = evaluateHand(['Ah','Ad'], ['Kh','Kd','2c','3d','5s']);
  expect(rank).toBe(8);
});

test('원페어 감지', () => {
  const { rank } = evaluateHand(['Ah','Ad'], ['2h','3c','5d','7s','9c']);
  expect(rank).toBe(9);
});

test('하이카드', () => {
  const { rank } = evaluateHand(['Ah','Kd'], ['2h','4c','6s','8d','Jc']);
  expect(rank).toBe(10);
});

test('compareHands: 낮은 rank가 이김', () => {
  expect(compareHands({ rank: 1, tiebreak: [] }, { rank: 2, tiebreak: [] })).toBe(-1);
  expect(compareHands({ rank: 5, tiebreak: [] }, { rank: 3, tiebreak: [] })).toBe(1);
  expect(compareHands({ rank: 4, tiebreak: [1, 2] }, { rank: 4, tiebreak: [1, 2] })).toBe(0);
});

test('compareHands: 페어 랭크가 키커보다 우선한다 (3 페어 > 2 페어 + A 키커)', () => {
  const board = ['2c', 'Qd', '9s', '7h', '4d'];
  const twosWithAce = evaluateHand(['Ah', '2d'], board); // 2 페어 + A 키커
  const threes = evaluateHand(['3h', '3d'], board);      // 3 페어
  expect(compareHands(threes, twosWithAce)).toBe(-1);
});

test('7장 중 최선 5장: 같은 족보라면 키커가 가장 좋은 조합을 선택한다', () => {
  // 보드 페어(9,9) 공유 — 홀카드 A 키커가 K 키커를 이겨야 한다
  const board = ['9c', '9d', '5s', '3h', '2c'];
  const aceKicker = evaluateHand(['Ah', 'Qd'], board);
  const kingKicker = evaluateHand(['Kh', 'Qc'], board);
  expect(compareHands(aceKicker, kingKicker)).toBe(-1);
});

test('휠(A-2-3-4-5)은 5-high 스트레이트: 6-high 스트레이트에게 진다', () => {
  const board = ['3c', '4d', '5s', 'Kh', 'Qc'];
  const wheel = evaluateHand(['Ah', '2d'], board);   // A-2-3-4-5
  const sixHigh = evaluateHand(['6h', '2c'], board); // 2-3-4-5-6
  expect(compareHands(sixHigh, wheel)).toBe(-1);
});

test('compareHands: 같은 원페어면 높은 페어가 이김', () => {
  const board = ['2c', '5d', '9s', 'Jh', '3c'];
  const aces = evaluateHand(['Ah', 'Ad'], board);
  const kings = evaluateHand(['Kh', 'Kd'], board);
  expect(compareHands(aces, kings)).toBe(-1);
  expect(compareHands(kings, aces)).toBe(1);
});
