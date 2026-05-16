const SUIT_SYMBOL = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_COLOR = { c: '#ddd', d: '#e44', h: '#e44', s: '#ddd' };
const RANK_DISPLAY = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

export default function Card({ card, faceDown = false }) {
  if (faceDown || !card) {
    return (
      <div style={{ ...styles.card, background: '#2244aa', color: '#aac' }}>
        <div style={styles.top}>?</div>
        <div style={styles.center}>🂠</div>
      </div>
    );
  }
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  return (
    <div style={{ ...styles.card, color: SUIT_COLOR[suit] }}>
      <div style={styles.top}>{RANK_DISPLAY[rank] || rank}</div>
      <div style={styles.center}>{SUIT_SYMBOL[suit]}</div>
    </div>
  );
}

const styles = {
  card: {
    width: 48, height: 68, borderRadius: 6, background: '#fff',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    padding: 4, fontSize: 14, fontWeight: 'bold',
    boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
    userSelect: 'none',
  },
  top: { fontSize: 13, lineHeight: 1 },
  center: { textAlign: 'center', fontSize: 20 },
};
