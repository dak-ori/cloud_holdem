const { createDeck, shuffle, dealCard } = require('../deck');

test('덱은 52장이다', () => {
  expect(createDeck()).toHaveLength(52);
});

test('덱에 중복 카드가 없다', () => {
  const deck = createDeck();
  expect(new Set(deck).size).toBe(52);
});

test('카드 형식이 올바르다 (예: Ah, 2c, Td, Ks)', () => {
  const deck = createDeck();
  deck.forEach(card => {
    expect(card).toMatch(/^[2-9TJQKA][shdc]$/);
  });
});

test('셔플 후 순서가 바뀐다', () => {
  const deck = createDeck();
  const shuffled = shuffle([...deck]);
  expect(shuffled).not.toEqual(deck);
  expect(shuffled).toHaveLength(52);
});

test('dealCard는 덱 맨 앞에서 카드를 꺼낸다', () => {
  const deck = ['Ah', 'Kd', '2c'];
  const { card, remaining } = dealCard(deck);
  expect(card).toBe('Ah');
  expect(remaining).toEqual(['Kd', '2c']);
});
