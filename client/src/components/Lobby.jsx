import { useState } from 'react';

export default function Lobby({ rooms, nickname, send, gameState }) {
  const [roomName, setRoomName] = useState('');

  if (gameState?.phase === 'waiting') {
    return (
      <div style={{ padding: 40 }}>
        <h2>대기 중 ({gameState.players.length}/4)</h2>
        <ul>{gameState.players.map(p => <li key={p.nickname}>{p.nickname}</li>)}</ul>
        <p>플레이어 4명이 모이면 게임이 시작됩니다.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>로비 — {nickname}</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          placeholder="방 이름"
          value={roomName}
          onChange={e => setRoomName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && roomName.trim() && send({ type: 'CREATE_ROOM', roomName: roomName.trim() })}
        />
        <button onClick={() => roomName.trim() && send({ type: 'CREATE_ROOM', roomName: roomName.trim() })}>
          방 만들기
        </button>
      </div>
      <h3>방 목록</h3>
      {rooms.length === 0 && <p style={{ color: '#888' }}>열린 방이 없습니다.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {rooms.map(r => (
          <li key={r.roomId} style={{ marginBottom: 8 }}>
            {r.roomName} ({r.players.length}/4)
            {r.players.length < 4 && (
              <button
                style={{ marginLeft: 8 }}
                onClick={() => send({ type: 'JOIN_ROOM', roomId: r.roomId })}
              >
                참여
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
