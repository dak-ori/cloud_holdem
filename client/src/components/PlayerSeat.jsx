import Card from './Card.jsx';

const STATUS_LABEL = { active: 'ACTIVE', folded: 'FOLD', allin: 'ALL-IN', eliminated: 'OUT' };

export default function PlayerSeat({ player, isMyTurn, isMe }) {
  if (!player) {
    return <div style={styles.empty}>빈 자리</div>;
  }

  const statusColor = {
    active: isMyTurn ? '#22d3ee' : 'rgba(124,58,237,.45)',
    folded: 'rgba(86,90,130,.4)',
    allin: '#f59e0b',
    eliminated: 'rgba(244,63,94,.5)',
  }[player.status] || 'rgba(124,58,237,.45)';

  const dimmed = player.status === 'folded' || player.status === 'eliminated';

  return (
    <div style={{
      ...styles.seat,
      borderColor: statusColor,
      opacity: dimmed ? 0.45 : 1,
      boxShadow: isMyTurn ? '0 0 22px rgba(34,211,238,.35)' : 'none',
    }}>
      <div style={{ color: isMyTurn ? '#22d3ee' : '#e7e9ff', fontWeight: 700, fontSize: 15 }}>
        {player.nickname}{isMe ? ' (나)' : ''}
        {isMyTurn && ' ◀'}
      </div>
      <div style={styles.chips}>{(player.chips || 0).toLocaleString()} 칩</div>
      {player.current_bet > 0 && (
        <div style={{ color: '#a78bfa', fontSize: 12 }}>베팅: {player.current_bet}</div>
      )}
      <div style={{ color: '#565a82', fontSize: 11, letterSpacing: 2, marginTop: 2 }}>
        {STATUS_LABEL[player.status] || player.status}
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 8, justifyContent: 'center' }}>
        {(player.hand || []).map((card, i) => (
          <Card key={i} card={isMe ? card : null} faceDown={!isMe} />
        ))}
      </div>
    </div>
  );
}

const styles = {
  seat: {
    background: 'rgba(17,17,32,.72)', border: '1.5px solid', borderRadius: 14,
    padding: '12px 10px', minWidth: 120, textAlign: 'center', color: '#e7e9ff',
    backdropFilter: 'blur(12px)',
  },
  chips: {
    color: '#22d3ee', fontSize: 14, margin: '3px 0',
    fontFamily: "'Orbitron', sans-serif",
  },
  empty: { color: '#565a82', textAlign: 'center', padding: 16 },
};
