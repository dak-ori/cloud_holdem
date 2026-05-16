import Card from './Card.jsx';

export default function PlayerSeat({ player, isMyTurn, isMe }) {
  if (!player) {
    return <div style={styles.empty}>빈 자리</div>;
  }

  const statusColor = {
    active: isMyTurn ? '#00ff88' : '#aaa',
    folded: '#555',
    allin: '#f90',
    eliminated: '#600',
  }[player.status] || '#aaa';

  return (
    <div style={{ ...styles.seat, borderColor: statusColor }}>
      <div style={{ color: statusColor, fontWeight: 'bold', fontSize: 13 }}>
        {player.nickname}{isMe ? ' (나)' : ''}
        {isMyTurn && ' ◀'}
      </div>
      <div style={styles.chips}>{(player.chips || 0).toLocaleString()} 칩</div>
      {player.current_bet > 0 && (
        <div style={{ color: '#aaa', fontSize: 11 }}>베팅: {player.current_bet}</div>
      )}
      <div style={{ color: '#666', fontSize: 11 }}>{player.status}</div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'center' }}>
        {(player.hand || []).map((card, i) => (
          <Card key={i} card={isMe ? card : null} faceDown={!isMe} />
        ))}
      </div>
    </div>
  );
}

const styles = {
  seat: {
    background: '#111', border: '2px solid #444', borderRadius: 8,
    padding: 8, minWidth: 120, textAlign: 'center', color: '#eee', fontFamily: 'monospace',
  },
  chips: { color: '#ffd700', fontSize: 13, margin: '2px 0' },
  empty: { color: '#333', textAlign: 'center', padding: 16, fontFamily: 'monospace' },
};
