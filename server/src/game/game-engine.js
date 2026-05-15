import { createDeck, shuffle, dealCards } from './deck.js';
import { getBlinds } from './blinds.js';
import { evaluateHand, compareHands } from './hand-evaluator.js';
import { splitPot } from './pot.js';

export function initHand(gameId, players, dealerIndex) {
  const activePlayers = players.filter(p => p.status === 'active');
  const { sb, bb } = getBlinds(activePlayers.length);

  let deck = shuffle(createDeck());
  const dealtPlayers = activePlayers.map(p => {
    const { cards, remaining } = dealCards(deck, 2);
    deck = remaining;
    return { ...p, hand: cards, current_bet: 0 };
  });

  const sbIdx = (dealerIndex + 1) % dealtPlayers.length;
  const bbIdx = (dealerIndex + 2) % dealtPlayers.length;

  dealtPlayers[sbIdx].chips -= sb;
  dealtPlayers[sbIdx].current_bet = sb;
  dealtPlayers[bbIdx].chips -= bb;
  dealtPlayers[bbIdx].current_bet = bb;

  const pot = sb + bb;
  const firstToAct = (bbIdx + 1) % dealtPlayers.length;

  return {
    game_id: gameId,
    phase: 'preflop',
    players: dealtPlayers,
    community_cards: [],
    deck,
    pot,
    current_turn: dealtPlayers[firstToAct].player_id,
    dealer_index: dealerIndex,
    small_blind: sb,
    big_blind: bb,
    current_bet: bb,
    updated_at: new Date().toISOString(),
  };
}

export function processAction(state, playerId, action, amount = 0) {
  if (state.current_turn !== playerId) {
    throw new Error('not your turn');
  }
  const players = state.players.map(p => ({ ...p }));
  const playerIdx = players.findIndex(p => p.player_id === playerId);
  const player = players[playerIdx];
  let { pot, current_bet } = state;

  switch (action) {
    case 'fold':
      player.status = 'folded';
      player.consecutive_auto_folds = 0;
      break;
    case 'auto_fold':
      player.status = 'folded';
      player.consecutive_auto_folds += 1;
      break;
    case 'check':
      if (current_bet > player.current_bet) throw new Error('cannot check, must call or fold');
      player.consecutive_auto_folds = 0;
      break;
    case 'call': {
      const toCall = Math.min(current_bet - player.current_bet, player.chips);
      player.chips -= toCall;
      player.current_bet += toCall;
      pot += toCall;
      player.consecutive_auto_folds = 0;
      break;
    }
    case 'raise': {
      if (amount <= current_bet) throw new Error('raise must exceed current bet');
      const toAdd = Math.min(amount - player.current_bet, player.chips);
      player.chips -= toAdd;
      player.current_bet += toAdd;
      pot += toAdd;
      current_bet = player.current_bet;
      player.consecutive_auto_folds = 0;
      break;
    }
    case 'allin': {
      const allInAmount = player.chips;
      player.current_bet += allInAmount;
      pot += allInAmount;
      player.chips = 0;
      player.status = 'allin';
      if (player.current_bet > current_bet) current_bet = player.current_bet;
      player.consecutive_auto_folds = 0;
      break;
    }
    default:
      throw new Error(`unknown action: ${action}`);
  }

  const nextTurn = getNextTurn(players, playerIdx);
  const roundDone = nextTurn === null;

  return {
    ...state,
    players,
    pot,
    current_bet,
    current_turn: roundDone ? null : players[nextTurn].player_id,
    updated_at: new Date().toISOString(),
    _round_done: roundDone,
  };
}

function getNextTurn(players, currentIdx) {
  const activeCount = players.filter(p => p.status === 'active').length;
  if (activeCount <= 1) return null;
  for (let i = 1; i <= players.length; i++) {
    const idx = (currentIdx + i) % players.length;
    if (players[idx].status === 'active') return idx;
  }
  return null;
}

export function advancePhase(state) {
  const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const next = phases[phases.indexOf(state.phase) + 1];
  let { deck, community_cards } = state;

  if (next === 'flop') {
    const { cards, remaining } = dealCards(deck, 3);
    community_cards = cards;
    deck = remaining;
  } else if (next === 'turn' || next === 'river') {
    const { cards, remaining } = dealCards(deck, 1);
    community_cards = [...community_cards, ...cards];
    deck = remaining;
  }

  const activePlayers = state.players.map(p =>
    p.status === 'active' ? { ...p, current_bet: 0 } : p
  );
  const sbIdx = (state.dealer_index + 1) % activePlayers.length;
  const firstActive = next !== 'showdown'
    ? findNextActive(activePlayers, sbIdx - 1)
    : null;

  return {
    ...state,
    phase: next,
    community_cards,
    deck,
    players: activePlayers,
    current_bet: 0,
    current_turn: firstActive !== null ? activePlayers[firstActive].player_id : null,
    updated_at: new Date().toISOString(),
  };
}

function findNextActive(players, fromIdx) {
  for (let i = 1; i <= players.length; i++) {
    const idx = (fromIdx + i) % players.length;
    if (players[idx].status === 'active') return idx;
  }
  return null;
}

export function resolveShowdown(state) {
  const contenders = state.players.filter(
    p => p.status === 'active' || p.status === 'allin'
  );
  if (contenders.length === 0) return state;

  const evaluated = contenders.map(p => ({
    ...p,
    eval: evaluateHand(p.hand, state.community_cards),
  }));
  evaluated.sort((a, b) => compareHands(a.eval, b.eval));

  const bestRank = evaluated[0].eval.rank;
  const winners = evaluated
    .filter(p => p.eval.rank === bestRank)
    .map(p => p.player_id);

  const payouts = splitPot(state.pot, winners, 0);

  const players = state.players.map(p => {
    const payout = payouts.find(pay => pay.playerId === p.player_id);
    return payout ? { ...p, chips: p.chips + payout.amount } : p;
  });

  return { ...state, players, pot: 0, phase: 'showdown', updated_at: new Date().toISOString() };
}
