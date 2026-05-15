const { createDeck, shuffle, dealCard } = require('./deck');
const { Hand } = require('pokersolver');

const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const STARTING_CHIPS = 1000;

function createGame(gameId) {
  return {
    gameId,
    phase: 'waiting',
    players: [],
    communityCards: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    currentTurnIndex: 0,
    dealerIndex: 0,
    updatedAt: new Date().toISOString(),
  };
}

function addPlayer(game, nickname) {
  if (game.players.length >= 4) throw new Error('ROOM_FULL');
  return {
    ...game,
    players: [
      ...game.players,
      { nickname, chips: STARTING_CHIPS, hand: [], status: 'active', betThisRound: 0 },
    ],
  };
}

function startGame(game) {
  let deck = shuffle(createDeck());
  let players = game.players.map(p => ({ ...p, hand: [], betThisRound: 0, status: 'active' }));

  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < players.length; j++) {
      const { card, remaining } = dealCard(deck);
      players[j] = { ...players[j], hand: [...players[j].hand, card] };
      deck = remaining;
    }
  }

  const sbIdx = (game.dealerIndex + 1) % players.length;
  const bbIdx = (game.dealerIndex + 2) % players.length;
  players[sbIdx] = { ...players[sbIdx], chips: players[sbIdx].chips - SMALL_BLIND, betThisRound: SMALL_BLIND };
  players[bbIdx] = { ...players[bbIdx], chips: players[bbIdx].chips - BIG_BLIND, betThisRound: BIG_BLIND };

  const firstActIdx = (game.dealerIndex + 3) % players.length;

  return {
    ...game,
    phase: 'preflop',
    players,
    deck,
    communityCards: [],
    pot: SMALL_BLIND + BIG_BLIND,
    currentBet: BIG_BLIND,
    currentTurnIndex: firstActIdx,
    updatedAt: new Date().toISOString(),
  };
}

function getActivePlayers(game) {
  return game.players.filter(p => p.status === 'active' || p.status === 'all-in');
}

function nextTurnIndex(game, currentIdx) {
  let next = (currentIdx + 1) % game.players.length;
  let attempts = 0;
  while (game.players[next].status === 'folded' && attempts < game.players.length) {
    next = (next + 1) % game.players.length;
    attempts++;
  }
  return next;
}

function isBettingRoundOver(game) {
  const active = game.players.filter(p => p.status === 'active');
  return active.every(p => p.betThisRound === game.currentBet);
}

function advancePhase(game) {
  const phaseOrder = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const currentIdx = phaseOrder.indexOf(game.phase);
  const nextPhase = phaseOrder[currentIdx + 1];

  let deck = [...game.deck];
  let communityCards = [...game.communityCards];
  let players = game.players.map(p => ({ ...p, betThisRound: 0 }));

  if (nextPhase === 'flop') {
    for (let i = 0; i < 3; i++) {
      const { card, remaining } = dealCard(deck);
      communityCards.push(card);
      deck = remaining;
    }
  } else if (nextPhase === 'turn' || nextPhase === 'river') {
    const { card, remaining } = dealCard(deck);
    communityCards.push(card);
    deck = remaining;
  }

  if (nextPhase === 'showdown') {
    return resolveShowdown({ ...game, players, communityCards, deck, phase: 'showdown' });
  }

  const firstActIdx = (game.dealerIndex + 1) % players.length;
  let offset = 0;
  while (players[(firstActIdx + offset) % players.length].status !== 'active' && offset < players.length) {
    offset++;
  }

  return {
    ...game,
    phase: nextPhase,
    players,
    communityCards,
    deck,
    currentBet: 0,
    currentTurnIndex: (firstActIdx + offset) % players.length,
    updatedAt: new Date().toISOString(),
  };
}

function resolveShowdown(game) {
  const activePlayers = getActivePlayers(game);
  const hands = activePlayers.map(p => ({
    nickname: p.nickname,
    hand: Hand.solve([...p.hand, ...game.communityCards]),
  }));
  const winnerHands = Hand.winners(hands.map(h => h.hand));
  const winners = hands.filter(h => winnerHands.includes(h.hand)).map(h => h.nickname);

  const split = Math.floor(game.pot / winners.length);
  const players = game.players.map(p => ({
    ...p,
    chips: winners.includes(p.nickname) ? p.chips + split : p.chips,
  }));

  return {
    ...game,
    phase: 'finished',
    players,
    winners,
    updatedAt: new Date().toISOString(),
  };
}

function applyAction(game, nickname, action, amount) {
  if (game.players[game.currentTurnIndex].nickname !== nickname) {
    throw new Error('NOT_YOUR_TURN');
  }

  let players = game.players.map(p => ({ ...p }));
  const idx = game.currentTurnIndex;
  let { pot, currentBet } = game;

  if (action === 'fold') {
    players[idx].status = 'folded';
  } else if (action === 'check') {
    if (players[idx].betThisRound < currentBet) throw new Error('CANNOT_CHECK');
  } else if (action === 'call') {
    const toCall = currentBet - players[idx].betThisRound;
    const actual = Math.min(toCall, players[idx].chips);
    players[idx].chips -= actual;
    players[idx].betThisRound += actual;
    pot += actual;
  } else if (action === 'raise') {
    const toCall = currentBet - players[idx].betThisRound;
    const total = toCall + amount;
    if (total > players[idx].chips) throw new Error('NOT_ENOUGH_CHIPS');
    players[idx].chips -= total;
    players[idx].betThisRound += total;
    pot += total;
    currentBet = players[idx].betThisRound;
  }

  const remaining = players.filter(p => p.status === 'active' || p.status === 'all-in');
  if (remaining.length === 1) {
    const winner = remaining[0].nickname;
    players = players.map(p => ({
      ...p,
      chips: p.nickname === winner ? p.chips + pot : p.chips,
    }));
    return {
      ...game, players, pot: 0, currentBet, phase: 'finished',
      winners: [winner], updatedAt: new Date().toISOString(),
    };
  }

  let updated = { ...game, players, pot, currentBet, updatedAt: new Date().toISOString() };

  if (isBettingRoundOver(updated)) {
    return advancePhase(updated);
  }

  return { ...updated, currentTurnIndex: nextTurnIndex(updated, idx) };
}

module.exports = { createGame, addPlayer, startGame, applyAction, getActivePlayers };
