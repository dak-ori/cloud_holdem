import { useState } from 'react';

export default function BettingControls({ send, gameState, nickname }) {
  const [raiseAmount, setRaiseAmount] = useState(20);
  const me = gameState.players.find(p => p.nickname === nickname);
  const isMyTurn = gameState.players[gameState.currentTurnIndex]?.nickname === nickname;

  if (!isMyTurn || me?.status !== 'active') return null;

  const canCheck = me.betThisRound >= gameState.currentBet;

  return (
    <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button onClick={() => send({ type: 'PLAYER_ACTION', action: 'fold', amount: 0 })}>
        폴드
      </button>
      {canCheck ? (
        <button onClick={() => send({ type: 'PLAYER_ACTION', action: 'check', amount: 0 })}>
          체크
        </button>
      ) : (
        <button onClick={() => send({ type: 'PLAYER_ACTION', action: 'call', amount: 0 })}>
          콜 ({gameState.currentBet - me.betThisRound})
        </button>
      )}
      <span style={{ display: 'flex', gap: 4 }}>
        <input
          type="number"
          min={gameState.currentBet}
          value={raiseAmount}
          onChange={e => setRaiseAmount(Number(e.target.value))}
          style={{ width: 64 }}
        />
        <button onClick={() => send({ type: 'PLAYER_ACTION', action: 'raise', amount: raiseAmount })}>
          레이즈
        </button>
      </span>
    </div>
  );
}
