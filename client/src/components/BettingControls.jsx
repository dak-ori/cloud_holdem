import { useState } from 'react';

export default function BettingControls({ send, gameState, nickname }) {
  const [raiseAmount, setRaiseAmount] = useState(40);
  const me = gameState.players.find(p => p.nickname === nickname);
  const isMyTurn = gameState.players[gameState.currentTurnIndex]?.nickname === nickname;

  if (!isMyTurn || me?.status !== 'active') return null;

  const canCheck = me.betThisRound >= gameState.currentBet;
  const callAmount = gameState.currentBet - me.betThisRound;
  const minRaise = gameState.currentBet + 20;

  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
      padding: '16px 20px',
      background: '#0a0a0a',
      borderTop: '1px solid #222',
    }}>
      <ActionButton
        onClick={() => send({ type: 'PLAYER_ACTION', action: 'fold', amount: 0 })}
        label="폴드"
        variant="danger"
      />

      {canCheck ? (
        <ActionButton
          onClick={() => send({ type: 'PLAYER_ACTION', action: 'check', amount: 0 })}
          label="체크"
          variant="neutral"
        />
      ) : (
        <ActionButton
          onClick={() => send({ type: 'PLAYER_ACTION', action: 'call', amount: 0 })}
          label={`콜  +${callAmount}`}
          variant="neutral"
        />
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="number"
          min={minRaise}
          step={20}
          value={raiseAmount}
          onChange={e => setRaiseAmount(Number(e.target.value))}
          style={{
            width: 72, padding: '8px 10px',
            background: '#111', border: '1px solid #333', borderRadius: 6,
            color: '#fff', fontSize: 14, textAlign: 'center',
          }}
        />
        <ActionButton
          onClick={() => send({ type: 'PLAYER_ACTION', action: 'raise', amount: raiseAmount - gameState.currentBet })}
          label={`레이즈  ${raiseAmount}`}
          variant="primary"
          disabled={raiseAmount < minRaise || raiseAmount > me.chips}
        />
      </div>
    </div>
  );
}

function ActionButton({ onClick, label, variant, disabled }) {
  const colors = {
    danger:  { bg: '#1a0a0a', border: '#5a1a1a', text: '#e63946' },
    neutral: { bg: '#111',    border: '#333',     text: '#ccc'   },
    primary: { bg: '#111',    border: '#555',     text: '#fff'   },
  };
  const c = colors[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '9px 18px',
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6,
      color: c.text, fontSize: 14, fontWeight: 600,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1, letterSpacing: 0.3,
    }}>
      {label}
    </button>
  );
}
