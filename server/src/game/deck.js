const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = ['c','d','h','s'];

export function createDeck() {
  return RANKS.flatMap(r => SUITS.map(s => `${r}${s}`));
}

export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function dealCards(deck, n) {
  return { cards: deck.slice(0, n), remaining: deck.slice(n) };
}
