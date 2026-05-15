import { useState } from 'react';

export default function Lobby({ rooms, nickname, send, gameState }) {
  const [roomName, setRoomName] = useState('');

  if (gameState?.phase === 'waiting') {
    return (
      <div style={{ padding: 40, maxWidth: 400 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#555', marginBottom: 8 }}>WAITING</div>
        <h2 style={{ margin: '0 0 20px', fontSize: 20 }}>
          {gameState.players.length} / 4 명
        </h2>
        <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 16 }}>
          {gameState.players.map(p => (
            <div key={p.nickname} style={{
              padding: '10px 0', borderBottom: '1px solid #1a1a1a',
              color: p.nickname === nickname ? '#fff' : '#666',
              fontSize: 14,
            }}>
              {p.nickname === nickname ? '▶ ' : '  '}{p.nickname}
            </div>
          ))}
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: '#444' }}>4명이 모이면 자동으로 시작됩니다.</p>
      </div>
    );
  }

  const createRoom = () => {
    const name = roomName.trim();
    if (!name) return;
    send({ type: 'CREATE_ROOM', roomName: name });
    setRoomName('');
  };

  return (
    <div style={{ padding: 40, maxWidth: 480 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: '#555', marginBottom: 6 }}>LOBBY</div>
      <h2 style={{ margin: '0 0 24px', fontSize: 20 }}>{nickname}</h2>

      {/* 방 만들기 */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#444', marginBottom: 10 }}>NEW ROOM</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="방 이름 입력"
            value={roomName}
            onChange={e => setRoomName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createRoom()}
            autoFocus
            style={{ flex: 1 }}
          />
          <button onClick={createRoom} disabled={!roomName.trim()}>
            만들기
          </button>
        </div>
      </div>

      {/* 방 목록 */}
      <div>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#444', marginBottom: 10 }}>ROOMS</div>
        {rooms.length === 0 ? (
          <p style={{ color: '#333', fontSize: 13 }}>열린 방이 없습니다.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rooms.map(r => (
              <div key={r.roomId} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', border: '1px solid #222', borderRadius: 6,
                background: '#0d0d0d',
              }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.roomName}</span>
                  <span style={{ color: '#444', fontSize: 12, marginLeft: 8 }}>
                    {r.players.length}/4
                  </span>
                </div>
                {r.players.length < 4 && (
                  <button
                    onClick={() => send({ type: 'JOIN_ROOM', roomId: r.roomId })}
                    style={{ padding: '6px 14px', fontSize: 13 }}
                  >
                    참여
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
