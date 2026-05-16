import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { on } from '../ws/socket.js';

export default function Lobby() {
  const { state, createRoom, joinRoom, listRooms } = useGame();
  const [nickname, setNickname] = useState('');
  const [rooms, setRooms] = useState([]);
  const [view, setView] = useState('home'); // 'home' | 'waiting'

  useEffect(() => {
    const unsub = on('rooms', (msg) => setRooms(msg.rooms));
    listRooms();
    const interval = setInterval(listRooms, 3000);
    return () => { unsub(); clearInterval(interval); };
  }, []);

  // 대기 화면
  if (view === 'waiting' || state.page === 'waiting') {
    return (
      <div style={styles.center}>
        <h2>대기 중...</h2>
        {state.room && <p>{state.room.players.length} / 4 명 입장</p>}
        {state.countdown !== null && (
          <h1 style={{ color: '#00ff88' }}>게임 시작까지 {state.countdown}초</h1>
        )}
        {state.room?.players.map(p => (
          <div key={p.player_id} style={{ color: '#ccc', margin: 4 }}>{p.nickname}</div>
        ))}
      </div>
    );
  }

  function handleCreate() {
    if (!nickname.trim()) return;
    createRoom(nickname.trim());
    setView('waiting');
  }

  function handleJoin(gameId) {
    if (!nickname.trim()) { alert('닉네임을 먼저 입력하세요'); return; }
    joinRoom(gameId, nickname.trim());
    setView('waiting');
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Cloud Hold'em</h1>

      {state.error && (
        <div style={styles.error} onClick={() => state.clearError?.()}>
          {state.error}
        </div>
      )}

      <div style={styles.card}>
        <input
          style={styles.input}
          placeholder="닉네임 입력 (최대 12자)"
          value={nickname}
          maxLength={12}
          onChange={e => setNickname(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button style={styles.btn} onClick={handleCreate}>방 만들기</button>
      </div>

      <div style={styles.card}>
        <h3 style={{ margin: '0 0 8px', color: '#aaa' }}>방 목록</h3>
        {rooms.length === 0 && <p style={{ color: '#555', margin: 0 }}>열린 방이 없습니다</p>}
        {rooms.map(room => (
          <div key={room.game_id} style={styles.roomRow}>
            <span style={{ flex: 1 }}>{room.players.map(p => p.nickname).join(', ')}</span>
            <span style={{ color: '#666', marginRight: 8 }}>{room.players.length}/4</span>
            <button
              style={{ ...styles.btnSmall, opacity: room.players.length >= 4 ? 0.4 : 1 }}
              disabled={room.players.length >= 4}
              onClick={() => handleJoin(room.game_id)}
            >
              입장
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: 480, margin: '40px auto', padding: 16, color: '#eee', fontFamily: 'monospace' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 80, color: '#eee', fontFamily: 'monospace' },
  title: { textAlign: 'center', fontSize: 32, letterSpacing: 4, color: '#fff', marginBottom: 24 },
  card: { background: '#1a1a1a', borderRadius: 8, padding: 16, marginBottom: 16 },
  input: { width: '100%', padding: 10, background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 4, fontSize: 16, boxSizing: 'border-box' },
  btn: { marginTop: 8, width: '100%', padding: 10, background: '#2a6', color: '#fff', border: 'none', borderRadius: 4, fontSize: 16, cursor: 'pointer' },
  btnSmall: { padding: '4px 14px', background: '#2a6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 },
  roomRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #2a2a2a' },
  error: { background: '#500', color: '#f88', padding: 10, borderRadius: 4, marginBottom: 12, cursor: 'pointer' },
};
