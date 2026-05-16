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
        <h1>게임 종료</h1>
        <p style={{ color: '#ffd700', fontSize: 20 }}>
          🏆 우승자: {gameState?.winner?.nickname}
        </p>
        <p style={{ color: '#aaa' }}>
          최종 칩: {gameState?.winner?.chips?.toLocaleString()}
        </p>
        <button
          style={styles.btnRefresh}
          onClick={() => window.location.reload()}
        >
          다시 시작
        </button>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div style={styles.center}>
        <p style={{ color: '#aaa' }}>게임 로딩 중...</p>
      </div>
    );
  }

  const me = gameState.players?.find(p => p.player_id === playerId);
  const isMyTurn = gameState.current_turn === playerId;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={{ color: '#00ff88', fontWeight: 'bold' }}>
          {gameState.phase?.toUpperCase()}
        </span>
        <span style={{ color: '#aaa' }}>
          SB {gameState.small_blind} / BB {gameState.big_blind}
        </span>
        <span style={{ color: '#ffd700' }}>팟 {gameState.pot}</span>
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
  container: {
    maxWidth: 640, margin: '16px auto', padding: 16,
    color: '#eee', fontFamily: 'monospace',
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    marginTop: 100, color: '#eee', fontFamily: 'monospace',
  },
  header: {
    display: 'flex', justifyContent: 'space-between',
    marginBottom: 12, fontSize: 13,
  },
  seats: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 8, marginBottom: 8,
  },
  btnRefresh: {
    marginTop: 24, padding: '10px 32px', background: '#2a6',
    color: '#fff', border: 'none', borderRadius: 4,
    fontSize: 16, cursor: 'pointer', fontFamily: 'monospace',
  },
};
