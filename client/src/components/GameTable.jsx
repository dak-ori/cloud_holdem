import PlayerSeat from './PlayerSeat';
import BettingControls from './BettingControls';

const PHASE_LABEL = {
  preflop: '프리플랍',
  flop: '플랍',
  turn: '턴',
  river: '리버',
  showdown: '쇼다운',
  finished: '게임 종료',
};

export default function GameTable({ gameState, nickname, send }) {
  if (gameState.phase === 'finished') {
    return (
      <div style={{ padding: 40 }}>
        <h2>게임 종료</h2>
        <p>우승자: <strong>{gameState.winners?.join(', ')}</strong></p>
        <h3>최종 칩</h3>
        {gameState.players.map(p => (
          <div key={p.nickname}>{p.nickname}: {p.chips}</div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>Cloud Hold'em — {PHASE_LABEL[gameState.phase] || gameState.phase}</h2>
      <div>팟: <strong>{gameState.pot}</strong> | 현재 베팅: {gameState.currentBet}</div>

      <div style={{ marginTop: 16 }}>
        <h3>커뮤니티 카드</h3>
        <div style={{ fontSize: 28, letterSpacing: 8 }}>
          {gameState.communityCards.length > 0
            ? gameState.communityCards.join(' ')
            : '(없음)'}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 16 }}>
        {gameState.players.map((p, i) => (
          <PlayerSeat
            key={p.nickname}
            player={p}
            isCurrentTurn={i === gameState.currentTurnIndex}
            isMe={p.nickname === nickname}
          />
        ))}
      </div>

      <BettingControls send={send} gameState={gameState} nickname={nickname} />
    </div>
  );
}
