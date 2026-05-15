import { initHand, processAction } from '../../src/game/game-engine.js';

const makePlayers = (count) =>
  Array.from({ length: count }, (_, i) => ({
    player_id: `p${i + 1}`,
    nickname: `Player${i + 1}`,
    chips: 1000,
    status: 'active',
    consecutive_auto_folds: 0,
  }));

test('initHand: 4인 프리플랍 설정', () => {
  const state = initHand('game1', makePlayers(4), 0);
  expect(state.phase).toBe('preflop');
  expect(state.players).toHaveLength(4);
  state.players.forEach(p => expect(p.hand).toHaveLength(2));
  expect(state.community_cards).toHaveLength(0);
  const sb = state.players[1];
  const bb = state.players[2];
  expect(sb.chips).toBe(990);
  expect(bb.chips).toBe(980);
  expect(state.pot).toBe(30);
  expect(state.small_blind).toBe(10);
  expect(state.big_blind).toBe(20);
});

test('initHand: dealer_index 순환', () => {
  const players = makePlayers(4);
  const state1 = initHand('g1', players, 3);
  expect(state1.dealer_index).toBe(3);
});
