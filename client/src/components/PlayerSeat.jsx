import Card from './Card';

export default function PlayerSeat({ player, isCurrentTurn, isMe }) {
  const isFolded = player.status === 'folded';

  return (
    <div style={{
      border: isCurrentTurn ? '2px solid #fff' : '1px solid #333',
      borderRadius: 8,
      padding: '12px 14px',
      margin: 6,
      minWidth: 140,
      background: isFolded ? '#0d0d0d' : '#111',
      opacity: isFolded ? 0.45 : 1,
      transition: 'all 0.2s',
      position: 'relative',
    }}>
      {isCurrentTurn && (
        <div style={{
          position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
          background: '#fff', color: '#000', fontSize: 10, fontWeight: 700,
          padding: '2px 8px', borderRadius: 10, letterSpacing: 1,
        }}>TURN</div>
      )}

      <div style={{ fontWeight: 700, fontSize: 14, color: isMe ? '#fff' : '#aaa', marginBottom: 4 }}>
        {player.nickname}
        {isMe && <span style={{ color: '#555', fontWeight: 400, fontSize: 11, marginLeft: 4 }}>(나)</span>}
      </div>

      <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
        칩 <span style={{ color: '#ccc', fontWeight: 600 }}>{player.chips}</span>
        {player.betThisRound > 0 && (
          <span style={{ marginLeft: 8, color: '#777' }}>베팅 {player.betThisRound}</span>
        )}
      </div>

      <div style={{ display: 'flex' }}>
        {player.hand.map((c, i) => (
          <Card key={i} card={c} hidden={c === '??'} small />
        ))}
      </div>

      {isFolded && (
        <div style={{ fontSize: 11, color: '#444', marginTop: 6, letterSpacing: 1 }}>FOLDED</div>
      )}
    </div>
  );
}
