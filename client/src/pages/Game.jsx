import { useGame } from '../context/GameContext.jsx';
import CommunityCards from '../components/CommunityCards.jsx';
import PlayerSeat from '../components/PlayerSeat.jsx';
import PotDisplay from '../components/PotDisplay.jsx';
import ActionPanel from '../components/ActionPanel.jsx';

export default function Game() {
  const { state, doAction } = useGame();
  const { gameState, playerId, page } = state;

  if (page === 'gameover') {
    return (
      <div style={styles.center}>
        <div style={styles.overPanel}>
          <h1 style={styles.overTitle}>GAME OVER</h1>
          <p style={styles.winner}>🏆 우승자: {gameState?.winner?.nickname}</p>
          <p style={{ color: '#8b8fb8' }}>
            최종 칩: {gameState?.winner?.chips?.toLocaleString()}
          </p>
          <button style={styles.btnRefresh} onClick={() => window.location.reload()}>
            다시 시작
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div style={styles.center}>
        <p style={{ color: '#8b8fb8' }}>게임 로딩 중...</p>
      </div>
    );
  }

  const me = gameState.players?.find(p => p.player_id === playerId);
  const isMyTurn = gameState.current_turn === playerId;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.phase}>{gameState.phase?.toUpperCase()}</span>
        <span style={{ color: '#8b8fb8' }}>
          SB {gameState.small_blind} / BB {gameState.big_blind}
        </span>
        <span style={styles.headerPot}>팟 {gameState.pot}</span>
      </div>

      <div style={styles.seats}>
        {gameState.players?.map(player => (
          <PlayerSeat
            key={player.player_id}
            player={player}
            isMe={player.player_id === playerId}
            isMyTurn={gameState.current_turn === player.player_id}
          />
        ))}
      </div>

      <CommunityCards cards={gameState.community_cards || []} />
      <PotDisplay pot={gameState.pot} />

      {me && me.status === 'active' && (
        <ActionPanel
          isMyTurn={isMyTurn}
          currentBet={gameState.current_bet}
          myBet={me.current_bet}
          myChips={me.chips}
          bigBlind={gameState.big_blind}
          onAction={(action, amount) => doAction(action, amount)}
        />
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 680, margin: '0 auto', padding: '24px 16px', position: 'relative' },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    paddingTop: 100, position: 'relative',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 18px', marginBottom: 14, fontSize: 14,
    background: 'rgba(17,17,32,.72)', border: '1px solid rgba(124,58,237,.35)',
    borderRadius: 14, backdropFilter: 'blur(12px)',
  },
  phase: {
    fontFamily: "'Orbitron', sans-serif", fontWeight: 900, letterSpacing: 2,
    background: 'linear-gradient(90deg, #22d3ee, #a78bfa)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
  },
  headerPot: { color: '#22d3ee', fontFamily: "'Orbitron', sans-serif", fontSize: 13 },
  seats: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 10, marginBottom: 8,
  },
  overPanel: {
    background: 'rgba(17,17,32,.72)', border: '1px solid rgba(124,58,237,.35)',
    borderRadius: 18, backdropFilter: 'blur(12px)', padding: '40px 60px', textAlign: 'center',
  },
  overTitle: {
    fontFamily: "'Orbitron', sans-serif", fontSize: 38, letterSpacing: 3, marginBottom: 18,
    background: 'linear-gradient(90deg, #22d3ee, #a78bfa, #f472b6)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
    filter: 'drop-shadow(0 0 18px rgba(167,139,250,.4))',
  },
  winner: { color: '#f5d061', fontSize: 22, marginBottom: 8 },
  btnRefresh: {
    marginTop: 26, padding: '13px 44px',
    background: 'linear-gradient(90deg, #7c3aed, #db2777)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 16, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 0 24px rgba(124,58,237,.5)',
  },
};
