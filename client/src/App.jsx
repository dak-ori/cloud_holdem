import { useGame } from './context/GameContext.jsx';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';

export default function App() {
  const { state } = useGame();
  if (state.page === 'game' || state.page === 'gameover') return <Game />;
  return <Lobby />;
}
