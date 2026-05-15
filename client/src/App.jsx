import { useState, useCallback, useEffect, useRef } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import Lobby from './components/Lobby'
import GameTable from './components/GameTable'
import './App.css'

function App() {
  const [nickname, setNickname] = useState(() => sessionStorage.getItem('nickname') || '')
  const [input, setInput] = useState('')
  const [rooms, setRooms] = useState([])
  const [gameState, setGameState] = useState(null)
  const connectedRef = useRef(false)

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'LOBBY_STATE':
        setRooms(msg.rooms)
        break
      case 'GAME_STATE':
        setGameState(msg.state)
        if (msg.state?.gameId) sessionStorage.setItem('gameId', msg.state.gameId)
        break
      case 'JOINED_ROOM':
        sessionStorage.setItem('gameId', msg.gameId)
        break
      case 'ERROR':
        if (msg.message === 'GAME_NOT_FOUND') {
          sessionStorage.removeItem('gameId')
          setGameState(null)
        }
        break
    }
  }, [])

  const { send, connected } = useWebSocket(handleMessage)

  useEffect(() => {
    if (connected && !connectedRef.current && nickname) {
      const savedGameId = sessionStorage.getItem('gameId')
      if (savedGameId) {
        send({ type: 'RECONNECT', nickname, gameId: savedGameId })
      } else {
        send({ type: 'JOIN_LOBBY', nickname })
      }
    }
    connectedRef.current = connected
  }, [connected, nickname, send])

  const joinLobby = () => {
    const n = input.trim()
    if (!n) return
    setNickname(n)
    sessionStorage.setItem('nickname', n)
    send({ type: 'JOIN_LOBBY', nickname: n })
    setInput('')
  }

  const leaveGame = () => {
    sessionStorage.removeItem('gameId')
    setGameState(null)
    send({ type: 'JOIN_LOBBY', nickname })
    setRooms([])
  }

  if (!nickname) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 100 }}>
        <h1>Cloud Hold'em</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="닉네임 입력"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinLobby()}
            autoFocus
          />
          <button onClick={joinLobby} disabled={!input.trim()}>입장</button>
        </div>
        {!connected && <p style={{ color: '#888', marginTop: 16 }}>서버 연결 중...</p>}
      </div>
    )
  }

  const inGame = gameState && gameState.phase !== 'waiting'

  if (inGame) {
    return (
      <>
        <GameTable gameState={gameState} nickname={nickname} send={send} />
        {gameState.phase === 'finished' && (
          <div style={{ padding: '0 40px' }}>
            <button onClick={leaveGame}>로비로 돌아가기</button>
          </div>
        )}
      </>
    )
  }

  return <Lobby rooms={rooms} nickname={nickname} send={send} gameState={gameState} />
}

export default App
