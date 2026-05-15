const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_DISPLAY = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

export default function Card({ card, hidden = false, small = false }) {
  if (hidden || card === '??') {
    return (
      <div style={{
        ...cardBase(small),
        background: '#1a1a1a',
        border: '1px solid #444',
        backgroundImage: 'repeating-linear-gradient(45deg, #222 0px, #222 2px, #1a1a1a 2px, #1a1a1a 8px)',
      }} />
    );
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const red = suit === 'h' || suit === 'd';
  const display = RANK_DISPLAY[rank] || rank;

  return (
    <div style={{ ...cardBase(small), color: red ? '#e63946' : '#f1f1f1' }}>
      <span style={{ fontSize: small ? 10 : 14, fontWeight: 700, lineHeight: 1 }}>{display}</span>
      <span style={{ fontSize: small ? 12 : 18, lineHeight: 1 }}>{SUIT_SYMBOL[suit]}</span>
    </div>
  );
}

function cardBase(small) {
  return {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: small ? 32 : 48,
    height: small ? 44 : 68,
    background: '#fff',
    border: '1px solid #333',
    borderRadius: small ? 4 : 6,
    margin: '0 3px',
    gap: 2,
    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
    flexShrink: 0,
  };
}
