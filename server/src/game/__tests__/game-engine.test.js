const {
  createGame,
  addPlayer,
  startGame,
  applyAction,
  getActivePlayers,
} = require('../game-engine');

describe('createGame', () => {
  test('초기 상태를 반환한다', () => {
    const game = createGame('room1');
    expect(game.gameId).toBe('room1');
    expect(game.phase).toBe('waiting');
    expect(game.players).toEqual([]);
    expect(game.pot).toBe(0);
  });
});

describe('addPlayer', () => {
  test('플레이어를 추가한다', () => {
    const game = createGame('g1');
    const updated = addPlayer(game, '홍길동');
    expect(updated.players).toHaveLength(1);
    expect(updated.players[0].nickname).toBe('홍길동');
    expect(updated.players[0].chips).toBe(1000);
    expect(updated.players[0].status).toBe('active');
  });

  test('4명 초과 추가 시 에러', () => {
    let game = createGame('g1');
    game = addPlayer(game, 'p1');
    game = addPlayer(game, 'p2');
    game = addPlayer(game, 'p3');
    game = addPlayer(game, 'p4');
    expect(() => addPlayer(game, 'p5')).toThrow('ROOM_FULL');
  });
});

describe('startGame', () => {
  test('4명이면 preflop 시작, 카드 2장씩 배분', () => {
    let game = createGame('g1');
    ['p1','p2','p3','p4'].forEach(n => { game = addPlayer(game, n); });
    game = startGame(game);
    expect(game.phase).toBe('preflop');
    game.players.forEach(p => expect(p.hand).toHaveLength(2));
    expect(game.communityCards).toHaveLength(0);
  });

  test('블라인드 설정: dealer+1=SB(10), dealer+2=BB(20)', () => {
    let game = createGame('g1');
    ['p1','p2','p3','p4'].forEach(n => { game = addPlayer(game, n); });
    game = startGame(game);
    const sb = game.players[(game.dealerIndex + 1) % 4];
    const bb = game.players[(game.dealerIndex + 2) % 4];
    expect(sb.betThisRound).toBe(10);
    expect(bb.betThisRound).toBe(20);
    expect(game.pot).toBe(30);
    expect(game.currentBet).toBe(20);
  });
});

describe('applyAction - fold', () => {
  test('폴드하면 플레이어 status가 folded로 변한다', () => {
    let game = createGame('g1');
    ['p1','p2','p3','p4'].forEach(n => { game = addPlayer(game, n); });
    game = startGame(game);
    const currentPlayer = game.players[game.currentTurnIndex].nickname;
    game = applyAction(game, currentPlayer, 'fold', 0);
    const player = game.players.find(p => p.nickname === currentPlayer);
    expect(player.status).toBe('folded');
  });

  test('현재 턴이 아닌 플레이어 액션은 에러', () => {
    let game = createGame('g1');
    ['p1','p2','p3','p4'].forEach(n => { game = addPlayer(game, n); });
    game = startGame(game);
    const wrongPlayer = game.players[(game.currentTurnIndex + 1) % 4].nickname;
    expect(() => applyAction(game, wrongPlayer, 'fold', 0)).toThrow('NOT_YOUR_TURN');
  });
});

describe('getActivePlayers', () => {
  test('folded 제외한 active/all-in 플레이어 반환', () => {
    let game = createGame('g1');
    ['p1','p2','p3','p4'].forEach(n => { game = addPlayer(game, n); });
    game = startGame(game);
    const currentPlayer = game.players[game.currentTurnIndex].nickname;
    game = applyAction(game, currentPlayer, 'fold', 0);
    expect(getActivePlayers(game)).toHaveLength(3);
  });
});
