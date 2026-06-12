import { useState, useEffect, useRef } from 'react';

export default function ActionPanel({ isMyTurn, currentBet, myBet, myChips, onAction, bigBlind }) {
  const [raiseAmount, setRaiseAmount] = useState(() => (currentBet || bigBlind || 20) * 2);
  const [timeLeft, setTimeLeft] = useState(20);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isMyTurn) { setTimeLeft(20); clearInterval(timerRef.current); return; }
    setTimeLeft(20);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isMyTurn]);

  if (!isMyTurn) return null;

  const canCheck = (myBet || 0) >= (currentBet || 0);
  const callAmount = Math.min((currentBet || 0) - (myBet || 0), myChips || 0);

  return (
    <div style={styles.panel}>
      <div style={{
        ...styles.timer,
        color: timeLeft <= 5 ? '#fb7185' : '#22d3ee',
        filter: `drop-shadow(0 0 10px ${timeLeft <= 5 ? 'rgba(251,113,133,.5)' : 'rgba(34,211,238,.4)'})`,
      }}>
        ⏱ {timeLeft}초
      </div>
      <div style={styles.actions}>
        <button style={{ ...styles.btn, ...styles.btnFold }} onClick={() => onAction('fold')}>폴드</button>
        {canCheck
          ? <button style={{ ...styles.btn, ...styles.btnMain }} onClick={() => onAction('check')}>체크</button>
          : <button style={{ ...styles.btn, ...styles.btnMain }} onClick={() => onAction('call')}>콜 ({callAmount})</button>
        }
        <button style={{ ...styles.btn, ...styles.btnAllin }} onClick={() => onAction('allin')}>올인</button>
      </div>
      <div style={styles.raiseRow}>
        <input
          type="number"
          style={styles.raiseInput}
          value={raiseAmount}
          min={(currentBet || 0) + 1}
          max={myChips || 0}
          step={bigBlind || 20}
          onChange={e => setRaiseAmount(Number(e.target.value))}
        />
        <button style={{ ...styles.btn, ...styles.btnRaise, flex: 1 }} onClick={() => onAction('raise', raiseAmount)}>
          레이즈
        </button>
      </div>
    </div>
  );
}

const styles = {
  panel: {
    background: 'rgba(17,17,32,.72)',
    border: '1px solid rgba(124,58,237,.35)',
    borderRadius: 16, backdropFilter: 'blur(12px)',
    padding: 14, color: '#e7e9ff', marginTop: 12,
  },
  timer: {
    textAlign: 'center', fontSize: 17, fontWeight: 'bold', marginBottom: 10,
    fontFamily: "'Orbitron', sans-serif", letterSpacing: 1,
  },
  actions: { display: 'flex', gap: 8 },
  raiseRow: { display: 'flex', gap: 8, marginTop: 10 },
  btn: {
    flex: 1, padding: 12, color: '#fff', border: 'none', borderRadius: 10,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  btnFold: {
    background: 'rgba(244,63,94,.15)', color: '#fb7185',
    border: '1px solid rgba(244,63,94,.45)',
  },
  btnMain: {
    background: 'rgba(34,211,238,.12)', color: '#22d3ee',
    border: '1px solid rgba(34,211,238,.5)',
    boxShadow: '0 0 14px rgba(34,211,238,.2)',
  },
  btnAllin: {
    background: 'rgba(245,158,11,.14)', color: '#fbbf24',
    border: '1px solid rgba(245,158,11,.5)',
  },
  btnRaise: {
    background: 'linear-gradient(90deg, #7c3aed, #db2777)',
    boxShadow: '0 0 18px rgba(124,58,237,.4)',
  },
  raiseInput: {
    flex: 1, padding: 10, background: 'rgba(7,7,15,.8)',
    color: '#e7e9ff', border: '1px solid rgba(124,58,237,.4)', borderRadius: 10, fontSize: 14,
  },
};
