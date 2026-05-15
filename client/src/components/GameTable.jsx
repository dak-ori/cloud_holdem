import PlayerSeat from './PlayerSeat';
import BettingControls from './BettingControls';
import Card from './Card';

const PHASE_LABEL = {
  preflop: 'PRE-FLOP',
  flop: 'FLOP',
  turn: 'TURN',
  river: 'RIVER',
  showdown: 'SHOWDOWN',
  finished: 'FINISHED',
};

export default function GameTable({ gameState, nickname, send }) {
  if (gameState.phase === 'finished') {
    return (
      <div style={{ padding: 40, maxWidth: 480 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#555', marginBottom: 8 }}>GAME OVER</div>
        <h2 style={{ margin: '0 0 20px', fontSize: 22 }}>
          우승: <span style={{ color: '#fff' }}>{gameState.winners?.join(', ')}</span>
        </h2>
        <div style={{ borderTop: '1px solid #222', paddingTop: 16 }}>
          {gameState.players.map(p => (
            <div key={p.nickname} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: '1px solid #1a1a1a',
              color: gameState.winners?.includes(p.nickname) ? '#fff' : '#555',
            }}>
              <span>{p.nickname}</span>
              <span style={{ fontWeight: 700 }}>{p.chips}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const currentPlayer = gameState.players[gameState.currentTurnIndex];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #1a1a1a',
      }}>
        <span style={{ fontWeight: 700, letterSpacing: 1 }}>Cloud Hold'em</span>
        <span style={{
          fontSize: 11, letterSpacing: 2, color: '#fff',
          background: '#1a1a1a', padding: '4px 10px', borderRadius: 4,
        }}>
          {PHASE_LABEL[gameState.phase]}
        </span>
        <span style={{ fontSize: 13, color: '#555' }}>
          {currentPlayer && `${currentPlayer.nickname}의 차례`}
        </span>
      </div>

      <div style={{ flex: 1, padding: '20px' }}>
        {/* 팟 정보 */}
        <div style={{
          textAlign: 'center', padding: '12px 0', marginBottom: 16,
          borderBottom: '1px solid #1a1a1a',
        }}>
          <span style={{ fontSize: 11, color: '#555', letterSpacing: 2, marginRight: 16 }}>POT</span>
          <span style={{ fontSize: 22, fontWeight: 700 }}>{gameState.pot}</span>
          {gameState.currentBet > 0 && (
            <span style={{ fontSize: 13, color: '#555', marginLeft: 16 }}>
              현재 베팅 {gameState.currentBet}
            </span>
          )}
        </div>

        {/* 커뮤니티 카드 */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#444', letterSpacing: 2, marginBottom: 10 }}>COMMUNITY CARDS</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
            {gameState.communityCards.length > 0
              ? gameState.communityCards.map((c, i) => <Card key={i} card={c} />)
              : [0,1,2,3,4].map(i => (
                  <div key={i} style={{
                    width: 48, height: 68, borderRadius: 6,
                    border: '1px dashed #2a2a2a', margin: '0 3px',
                  }} />
                ))
            }
          </div>
        </div>

        {/* 플레이어 시트 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
          {gameState.players.map((p, i) => (
            <PlayerSeat
              key={p.nickname}
              player={p}
              isCurrentTurn={i === gameState.currentTurnIndex}
              isMe={p.nickname === nickname}
            />
          ))}
        </div>
      </div>

      {/* 베팅 컨트롤 */}
      <BettingControls send={send} gameState={gameState} nickname={nickname} />
    </div>
  );
}
