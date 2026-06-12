export default function PotDisplay({ pot }) {
  return (
    <div style={{
      textAlign: 'center', color: '#22d3ee',
      fontSize: 21, fontWeight: 'bold',
      fontFamily: "'Orbitron', sans-serif",
      letterSpacing: 1,
      margin: '10px 0',
      filter: 'drop-shadow(0 0 12px rgba(34,211,238,.45))',
    }}>
      팟 {(pot || 0).toLocaleString()}
    </div>
  );
}
