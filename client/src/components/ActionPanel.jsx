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
      <div style={{ ...styles.timer, color: timeLeft <= 5 ? '#f44' : '#0f0' }}>
        ⏱ 남은 시간: {timeLeft}초
      </div>
      <div style={styles.actions}>
        <button style={{ ...styles.btn, background: '#922' }} onClick={() => onAction('fold')}>폴드</button>
        {canCheck
          ? <button style={styles.btn} onClick={() => onAction('check')}>체크</button>
          : <button style={styles.btn} onClick={() => onAction('call')}>콜 ({callAmount})</button>
        }
        <button style={{ ...styles.btn, background: '#a60' }} onClick={() => onAction('allin')}>올인</button>
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
        <button style={{ ...styles.btn, flex: 1 }} onClick={() => onAction('raise', raiseAmount)}>
          레이즈
        </button>
      </div>
    </div>
  );
}

const styles = {
  panel: { background: '#111', borderRadius: 8, padding: 12, color: '#eee', fontFamily: 'monospace', marginTop: 12 },
  timer: { textAlign: 'center', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  actions: { display: 'flex', gap: 6 },
  raiseRow: { display: 'flex', gap: 6, marginTop: 8 },
  btn: { flex: 1, padding: 10, background: '#2a4', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontFamily: 'monospace' },
  raiseInput: { flex: 1, padding: 8, background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 4, fontSize: 13 },
};
