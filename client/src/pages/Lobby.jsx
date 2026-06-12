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
        <div style={styles.panel}>
          <h2 style={styles.waitTitle}>대기 중...</h2>
          {state.room && (
            <p style={styles.waitCount}>{state.room.players.length} / 4 명 입장</p>
          )}
          {state.countdown !== null && (
            <h1 style={styles.countdown}>게임 시작까지 {state.countdown}초</h1>
          )}
          <div style={{ marginTop: 16 }}>
            {state.room?.players.map(p => (
              <div key={p.player_id} style={styles.waitPlayer}>
                <span style={styles.liveDot} />{p.nickname}
              </div>
            ))}
          </div>
        </div>
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
      <div style={styles.badge}>REAL-TIME MULTIPLAYER</div>
      <h1 style={styles.title}>CLOUD HOLD'EM</h1>
      <p style={styles.sub}>닉네임 하나로 바로 시작하는 4인 텍사스 홀덤</p>

      {state.error && (
        <div style={styles.error} onClick={() => state.clearError?.()}>
          {state.error}
        </div>
      )}

      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>PLAYER ENTRY</h3>
        <input
          style={styles.input}
          placeholder="닉네임 입력 (최대 12자)"
          value={nickname}
          maxLength={12}
          onChange={e => setNickname(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button style={styles.btn} onClick={handleCreate}>⚡ 방 만들기</button>
      </div>

      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>LIVE TABLES</h3>
        {rooms.length === 0 && <p style={styles.empty}>열린 방이 없습니다</p>}
        {rooms.map(room => {
          const full = room.players.length >= 4;
          return (
            <div key={room.game_id} style={{ ...styles.roomRow, opacity: full ? 0.35 : 1 }}>
              <span style={styles.roomNames}>
                <span style={styles.liveDot} />
                {room.players.map(p => p.nickname).join(', ')}
              </span>
              <span style={styles.roomRight}>
                <span style={styles.roomCount}>{room.players.length}/4</span>
                <button
                  style={styles.btnJoin}
                  disabled={full}
                  onClick={() => handleJoin(room.game_id)}
                >
                  {full ? 'FULL' : 'JOIN'}
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <p style={styles.foot}>NO SIGN-UP · INSTANT PLAY</p>
    </div>
  );
}

const styles = {
  container: { maxWidth: 520, margin: '0 auto', padding: '56px 20px', position: 'relative' },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    paddingTop: 100, position: 'relative',
  },
  badge: {
    width: 'fit-content', margin: '0 auto 14px', padding: '5px 16px',
    borderRadius: 999, fontSize: 11, letterSpacing: 3,
    color: '#22d3ee', border: '1px solid rgba(34,211,238,.45)',
    background: 'rgba(34,211,238,.08)', boxShadow: '0 0 18px rgba(34,211,238,.25)',
  },
  title: {
    fontFamily: "'Orbitron', sans-serif",
    textAlign: 'center', fontSize: 42, fontWeight: 900, letterSpacing: 3,
    background: 'linear-gradient(90deg, #22d3ee 0%, #a78bfa 50%, #f472b6 100%)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
    filter: 'drop-shadow(0 0 22px rgba(167,139,250,.45))',
  },
  sub: { textAlign: 'center', color: '#8b8fb8', fontSize: 14, margin: '12px 0 36px' },
  panel: {
    background: 'rgba(17,17,32,.72)',
    border: '1px solid rgba(124,58,237,.35)',
    borderRadius: 18,
    backdropFilter: 'blur(12px)',
    boxShadow: '0 0 0 1px rgba(255,255,255,.03) inset, 0 18px 50px rgba(0,0,0,.55)',
    padding: 26, marginBottom: 22, minWidth: 320,
  },
  panelTitle: { fontSize: 13, letterSpacing: 3, color: '#a78bfa', margin: '0 0 16px', fontWeight: 700 },
  input: {
    width: '100%', padding: '14px 16px',
    background: 'rgba(7,7,15,.8)',
    border: '1px solid rgba(124,58,237,.4)', borderRadius: 12,
    color: '#e7e9ff', fontSize: 16, outline: 'none',
  },
  btn: {
    width: '100%', marginTop: 14, padding: 15,
    background: 'linear-gradient(90deg, #7c3aed, #db2777)',
    color: '#fff', fontWeight: 700, fontSize: 16, letterSpacing: 1,
    border: 'none', borderRadius: 12, cursor: 'pointer',
    boxShadow: '0 0 28px rgba(124,58,237,.5)',
  },
  empty: { color: '#565a82', margin: 0, fontSize: 14 },
  roomRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '13px 14px', marginBottom: 10,
    background: 'rgba(124,58,237,.07)',
    border: '1px solid rgba(124,58,237,.2)', borderRadius: 12,
  },
  roomNames: { fontSize: 15, display: 'flex', alignItems: 'center' },
  roomRight: { display: 'flex', alignItems: 'center' },
  roomCount: {
    fontSize: 12, color: '#22d3ee', marginRight: 12,
    fontFamily: "'Orbitron', sans-serif",
  },
  btnJoin: {
    padding: '8px 20px',
    background: 'rgba(34,211,238,.12)', color: '#22d3ee',
    border: '1px solid rgba(34,211,238,.5)', borderRadius: 8,
    fontSize: 13, cursor: 'pointer', fontWeight: 700,
    boxShadow: '0 0 14px rgba(34,211,238,.2)',
  },
  liveDot: {
    display: 'inline-block', width: 7, height: 7,
    background: '#34d399', borderRadius: '50%', marginRight: 8,
    boxShadow: '0 0 8px #34d399',
  },
  foot: { textAlign: 'center', color: '#565a82', fontSize: 12, marginTop: 10, letterSpacing: 2 },
  error: {
    background: 'rgba(244,63,94,.12)', color: '#fb7185',
    border: '1px solid rgba(244,63,94,.4)',
    padding: 12, borderRadius: 12, marginBottom: 16, cursor: 'pointer', fontSize: 14,
  },
  waitTitle: { textAlign: 'center', fontSize: 22, color: '#e7e9ff', margin: 0 },
  waitCount: { textAlign: 'center', color: '#8b8fb8', marginTop: 10 },
  countdown: {
    fontFamily: "'Orbitron', sans-serif",
    textAlign: 'center', fontSize: 26, marginTop: 18,
    background: 'linear-gradient(90deg, #22d3ee, #a78bfa)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
    filter: 'drop-shadow(0 0 16px rgba(34,211,238,.4))',
  },
  waitPlayer: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#c7c9e8', margin: 6, fontSize: 15,
  },
};
