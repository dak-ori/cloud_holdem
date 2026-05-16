export default function PotDisplay({ pot }) {
  return (
    <div style={{
      textAlign: 'center', color: '#ffd700',
      fontSize: 20, fontWeight: 'bold', fontFamily: 'monospace',
      margin: '8px 0',
    }}>
      팟: {(pot || 0).toLocaleString()} 칩
    </div>
  );
}
