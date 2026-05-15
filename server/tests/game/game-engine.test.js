import { initHand, processAction, advancePhase } from '../../src/game/game-engine.js';

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

test('processAction fold: 플레이어 상태 folded', () => {
  const state = initHand('g1', makePlayers(4), 0);
  const firstPlayer = state.current_turn;
  const next = processAction(state, firstPlayer, 'fold');
  const p = next.players.find(p => p.player_id === firstPlayer);
  expect(p.status).toBe('folded');
});

test('processAction: 자기 턴이 아닌 플레이어가 액션하면 에러', () => {
  const state = initHand('g1', makePlayers(4), 0);
  const notMyTurn = state.players.find(p => p.player_id !== state.current_turn).player_id;
  expect(() => processAction(state, notMyTurn, 'fold')).toThrow('not your turn');
});

test('processAction auto_fold: consecutive_auto_folds 증가', () => {
  const state = initHand('g1', makePlayers(4), 0);
  const firstPlayer = state.current_turn;
  const next = processAction(state, firstPlayer, 'auto_fold');
  const p = next.players.find(p => p.player_id === firstPlayer);
  expect(p.consecutive_auto_folds).toBe(1);
});

test('advancePhase preflop→flop: 커뮤니티 카드 3장', () => {
  const state = initHand('g1', makePlayers(4), 0);
  const flopped = advancePhase({ ...state, phase: 'preflop' });
  expect(flopped.phase).toBe('flop');
  expect(flopped.community_cards).toHaveLength(3);
});
