const SUIT_SYMBOL = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_COLOR = { c: '#1d2333', d: '#ef4444', h: '#ef4444', s: '#1d2333' };
const RANK_DISPLAY = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

export default function Card({ card, faceDown = false }) {
  if (faceDown || !card) {
    return (
      <div style={styles.back}>
        <div style={styles.backMark}>◆</div>
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
    width: 48, height: 68, borderRadius: 8, background: '#f4f5ff',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    padding: 5, fontSize: 14, fontWeight: 'bold',
    boxShadow: '0 4px 12px rgba(0,0,0,.45)',
    userSelect: 'none',
  },
  back: {
    width: 48, height: 68, borderRadius: 8,
    background: 'linear-gradient(135deg, #312e81, #1e1b4b)',
    border: '1px solid rgba(124,58,237,.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,.45), inset 0 0 14px rgba(124,58,237,.35)',
    userSelect: 'none',
  },
  backMark: { color: 'rgba(167,139,250,.55)', fontSize: 18 },
  top: { fontSize: 13, lineHeight: 1 },
  center: { textAlign: 'center', fontSize: 20 },
};
