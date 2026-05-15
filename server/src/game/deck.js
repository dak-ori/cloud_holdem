const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = ['s','h','d','c'];

function createDeck() {
  return RANKS.flatMap(rank => SUITS.map(suit => `${rank}${suit}`));
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealCard(deck) {
  return { card: deck[0], remaining: deck.slice(1) };
}

module.exports = { createDeck, shuffle, dealCard };
