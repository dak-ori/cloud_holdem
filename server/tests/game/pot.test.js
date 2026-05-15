import { splitPot } from '../../src/game/pot.js';

test('단독 승자: 팟 전부 수령', () => {
  const result = splitPot(100, ['p1'], 0);
  expect(result).toEqual([{ playerId: 'p1', amount: 100 }]);
});

test('2명 무승부: 균등 분배', () => {
  const result = splitPot(200, ['p1', 'p2'], 0);
  expect(result).toEqual([
    { playerId: 'p1', amount: 100 },
    { playerId: 'p2', amount: 100 },
  ]);
});

test('2명 무승부 홀수 팟: 딜러 왼쪽(인덱스 기준 첫 번째)이 1칩 더', () => {
  const result = splitPot(101, ['p1', 'p2'], 0);
  expect(result).toEqual([
    { playerId: 'p1', amount: 51 },
    { playerId: 'p2', amount: 50 },
  ]);
});

test('3명 무승부 홀수: 딜러 왼쪽이 나머지 칩 수령', () => {
  const result = splitPot(100, ['p1', 'p2', 'p3'], 1);
  const total = result.reduce((s, r) => s + r.amount, 0);
  expect(total).toBe(100);
  const p2 = result.find(r => r.playerId === 'p2');
  expect(p2.amount).toBeGreaterThan(33);
});
