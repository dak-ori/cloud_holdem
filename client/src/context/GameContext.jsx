import { createContext, useContext, useEffect, useReducer } from 'react';
import { connect, on, send } from '../ws/socket.js';

const GameContext = createContext(null);

const initialState = {
  playerId: null,
  nickname: null,
  room: null,
  gameState: null,
  countdown: null,
  page: 'lobby',   // 'lobby' | 'waiting' | 'game' | 'gameover'
  error: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PLAYER_ID':
      return { ...state, playerId: action.playerId };
    case 'SET_NICKNAME':
      return { ...state, nickname: action.nickname };
    case 'SET_ROOM':
      return { ...state, room: action.room, page: 'waiting' };
    case 'SET_COUNTDOWN':
      return { ...state, countdown: action.seconds };
    case 'COUNTDOWN_CANCELLED':
      return { ...state, countdown: null };
    case 'GAME_STARTED':
      return { ...state, gameState: action.state, page: 'game', countdown: null };
    case 'STATE_UPDATE':
      return { ...state, gameState: action.state };
    case 'GAME_OVER':
      return { ...state, page: 'gameover', gameState: { ...state.gameState, winner: action.winner } };
    case 'SET_ERROR':
      return { ...state, error: action.message };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'RESET':
      return { ...initialState, playerId: state.playerId };
    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    connect();

    const unsubs = [
      on('connected', (msg) => dispatch({ type: 'SET_PLAYER_ID', playerId: msg.player_id })),
      on('room_created', (msg) => dispatch({ type: 'SET_ROOM', room: msg.room })),
      on('player_joined', (msg) => dispatch({ type: 'SET_ROOM', room: msg.room })),
      on('countdown', (msg) => dispatch({ type: 'SET_COUNTDOWN', seconds: msg.seconds })),
      on('countdown_cancelled', () => dispatch({ type: 'COUNTDOWN_CANCELLED' })),
      on('game_started', (msg) => dispatch({ type: 'GAME_STARTED', state: msg.state })),
      on('state_update', (msg) => dispatch({ type: 'STATE_UPDATE', state: msg.state })),
      on('game_over', (msg) => dispatch({ type: 'GAME_OVER', winner: msg.winner })),
      on('error', (msg) => dispatch({ type: 'SET_ERROR', message: msg.message })),
    ];

    return () => unsubs.forEach(u => u());
  }, []);

  const actions = {
    setNickname: (nickname) => dispatch({ type: 'SET_NICKNAME', nickname }),
    createRoom: (nickname) => send({ type: 'create_room', nickname }),
    joinRoom: (gameId, nickname) => send({ type: 'join_room', game_id: gameId, nickname }),
    leaveRoom: () => { send({ type: 'leave_room' }); dispatch({ type: 'RESET' }); },
    listRooms: () => send({ type: 'list_rooms' }),
    doAction: (action, amount) => send({ type: 'action', action, amount }),
    clearError: () => dispatch({ type: 'CLEAR_ERROR' }),
  };

  return (
    <GameContext.Provider value={{ state, ...actions }}>
      {children}
    </GameContext.Provider>
  );
}

export const useGame = () => useContext(GameContext);
