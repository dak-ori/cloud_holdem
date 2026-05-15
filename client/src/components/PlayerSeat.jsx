export default function PlayerSeat({ player, isCurrentTurn, isMe }) {
  const border = isCurrentTurn ? '2px solid gold' : '1px solid #555';
  return (
    <div style={{ border, padding: 8, margin: 4, borderRadius: 4, minWidth: 130, background: '#1a1a2e' }}>
      <strong style={{ color: isMe ? '#00d4ff' : '#fff' }}>
        {player.nickname}{isMe ? ' (나)' : ''}
        {isCurrentTurn ? ' ▶' : ''}
      </strong>
      <div style={{ color: '#aaa', fontSize: 13 }}>칩: {player.chips}</div>
      <div style={{ color: '#aaa', fontSize: 13 }}>상태: {player.status}</div>
      {isMe && player.hand[0] !== '??' && (
        <div style={{ fontSize: 18, marginTop: 4 }}>{player.hand.join(' ')}</div>
      )}
      {player.betThisRound > 0 && (
        <div style={{ color: '#ffd700', fontSize: 13 }}>베팅: {player.betThisRound}</div>
      )}
    </div>
  );
}
