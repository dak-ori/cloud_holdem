import { createDeck, shuffle, dealCards } from '../../src/game/deck.js';

test('createDeck: 52장 생성', () => {
  const deck = createDeck();
  expect(deck).toHaveLength(52);
  expect(deck[0]).toBe('2c');
  expect(deck[51]).toBe('As');
});

test('shuffle: 순서가 바뀜 (같은 덱 아님)', () => {
  const deck = createDeck();
  const shuffled = shuffle([...deck]);
  expect(shuffled).toHaveLength(52);
  expect(shuffled).not.toEqual(deck);
});

test('dealCards: n장 뽑으면 덱에서 제거됨', () => {
  const deck = createDeck();
  const { cards, remaining } = dealCards(deck, 2);
  expect(cards).toHaveLength(2);
  expect(remaining).toHaveLength(50);
  expect(remaining).not.toContain(cards[0]);
});
