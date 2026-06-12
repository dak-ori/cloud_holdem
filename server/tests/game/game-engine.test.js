import { initHand, processAction, advancePhase, resolveShowdown } from '../../src/game/game-engine.js';

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

test('베팅 라운드 완료: 전원 콜 후 BB 체크 → _round_done', () => {
  // dealer p1 → SB p2, BB p3, 첫 액션 p4
  let state = initHand('g1', makePlayers(4), 0);
  state = processAction(state, state.current_turn, 'call');  // p4
  state = processAction(state, state.current_turn, 'call');  // p1
  state = processAction(state, state.current_turn, 'call');  // p2 (SB)
  state = processAction(state, state.current_turn, 'check'); // p3 (BB)
  expect(state._round_done).toBe(true);
  expect(state.current_turn).toBeNull();
});

test('BB 옵션: 전원 콜이어도 BB가 행동하기 전엔 라운드 미완료', () => {
  let state = initHand('g1', makePlayers(4), 0);
  state = processAction(state, state.current_turn, 'call'); // p4
  state = processAction(state, state.current_turn, 'call'); // p1
  state = processAction(state, state.current_turn, 'call'); // p2 (SB)
  // 전원 20 매치 상태지만 BB(p3)는 아직 체크/레이즈 옵션이 남아 있다
  expect(state._round_done).toBe(false);
  expect(state.current_turn).toBe('p3');
});

test('레이즈는 액션을 재오픈: 먼저 콜한 플레이어도 다시 응답해야 라운드 완료', () => {
  let state = initHand('g1', makePlayers(4), 0);
  state = processAction(state, state.current_turn, 'call');          // p4 콜 20
  state = processAction(state, state.current_turn, 'raise', 60);     // p1 레이즈 60
  state = processAction(state, state.current_turn, 'call');          // p2 (SB)
  state = processAction(state, state.current_turn, 'call');          // p3 (BB)
  // p4는 레이즈에 아직 응답 안 함 → 미완료
  expect(state._round_done).toBe(false);
  expect(state.current_turn).toBe('p4');
  state = processAction(state, 'p4', 'call');
  expect(state._round_done).toBe(true);
});

test('플랍은 새 베팅 라운드: 전원이 체크해야 라운드 완료', () => {
  let state = initHand('g1', makePlayers(4), 0);
  state = processAction(state, state.current_turn, 'call');
  state = processAction(state, state.current_turn, 'call');
  state = processAction(state, state.current_turn, 'call');
  state = processAction(state, state.current_turn, 'check'); // BB → 프리플랍 완료
  state = advancePhase(state);
  expect(state.phase).toBe('flop');

  state = processAction(state, state.current_turn, 'check'); // 첫 체크
  expect(state._round_done).toBe(false); // 나머지 3명이 남았다
  state = processAction(state, state.current_turn, 'check');
  state = processAction(state, state.current_turn, 'check');
  state = processAction(state, state.current_turn, 'check');
  expect(state._round_done).toBe(true);
});

test('전원 폴드로 1명만 남으면 라운드 즉시 완료', () => {
  let state = initHand('g1', makePlayers(4), 0);
  state = processAction(state, state.current_turn, 'fold'); // p4
  state = processAction(state, state.current_turn, 'fold'); // p1
  state = processAction(state, state.current_turn, 'fold'); // p2 → p3만 남음
  expect(state._round_done).toBe(true);
});

test('resolveShowdown: 같은 족보(원페어)라도 높은 페어가 단독 승리한다', () => {
  const state = {
    pot: 100,
    phase: 'river',
    community_cards: ['2c', '5d', '9s', 'Jh', '3c'],
    players: [
      { player_id: 'p1', status: 'active', chips: 0, hand: ['Ah', 'Ad'] }, // A 페어
      { player_id: 'p2', status: 'active', chips: 0, hand: ['Kh', 'Kd'] }, // K 페어
    ],
  };
  const result = resolveShowdown(state);
  const p1 = result.players.find(p => p.player_id === 'p1');
  const p2 = result.players.find(p => p.player_id === 'p2');
  expect(p1.chips).toBe(100); // A 페어가 팟 전부 획득
  expect(p2.chips).toBe(0);   // K 페어는 무승부 아님
});

test('advancePhase preflop→flop: 커뮤니티 카드 3장', () => {
  const state = initHand('g1', makePlayers(4), 0);
  const flopped = advancePhase({ ...state, phase: 'preflop' });
  expect(flopped.phase).toBe('flop');
  expect(flopped.community_cards).toHaveLength(3);
});
