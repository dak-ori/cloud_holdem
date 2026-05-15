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
  expect(compareHands({ rank: 1 }, { rank: 2 })).toBe(-1);
  expect(compareHands({ rank: 5 }, { rank: 3 })).toBe(1);
  expect(compareHands({ rank: 4 }, { rank: 4 })).toBe(0);
});
