const { v4: uuidv4 } = require('uuid');
const { createGame, addPlayer, startGame, applyAction } = require('../game/game-engine');
const { saveGame, loadGame, deleteGame, withGameLock } = require('../redis/game-store');
const { createRoom, getAllRooms, joinRoom, deleteRoom } = require('../redis/room-store');
const { subscribeGame, unsubscribeGame, publishGameEvent, subscribeLobby, unsubscribeLobby, publishLobbyUpdate } = require('../redis/pubsub');
const { sendTo } = require('./server');

const RECONNECT_TIMEOUT_MS = 20 * 1000;
const disconnectTimers = new Map();

// gameId → Set<nickname> : 이 EC2에 연결된 플레이어 목록
const localGamePlayers = new Map();
// gameId → callback : unsubscribe 시 사용
const gameCallbacks = new Map();
// nickname → callback : 로비 구독 중인 세션
const lobbyCallbacks = new Map();

function personalizeState(state, nickname) {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      hand: p.nickname === nickname ? p.hand : p.hand.map(() => '??'),
    })),
  };
}

async function broadcastToLocal(gameId) {
  const state = await loadGame(gameId);
  if (!state) return;
  const localPlayers = localGamePlayers.get(gameId) || new Set();
  for (const nickname of localPlayers) {
    sendTo(nickname, { type: 'GAME_STATE', state: personalizeState(state, nickname) });
  }
}

async function registerLocalPlayer(gameId, nickname) {
  if (!localGamePlayers.has(gameId)) {
    localGamePlayers.set(gameId, new Set());
    const callback = async () => broadcastToLocal(gameId);
    gameCallbacks.set(gameId, callback);
    await subscribeGame(gameId, callback);
  }
  localGamePlayers.get(gameId).add(nickname);
}

async function unregisterLocalPlayer(gameId, nickname) {
  const players = localGamePlayers.get(gameId);
  if (!players) return;
  players.delete(nickname);
  if (players.size === 0) {
    localGamePlayers.delete(gameId);
    const callback = gameCallbacks.get(gameId);
    gameCallbacks.delete(gameId);
    if (callback) await unsubscribeGame(gameId, callback);
  }
}

async function saveGameHistory(gameState) {
  try {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const bucket = process.env.HISTORY_BUCKET;
    if (!bucket) return;
    const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `history/${gameState.gameId}.json`,
      Body: JSON.stringify(gameState),
      ContentType: 'application/json',
    }));
  } catch (err) {
    console.error('S3 history write failed:', err.message);
  }
}

async function handleMessage(ws, msg, sessions) {
  switch (msg.type) {
    case 'JOIN_LOBBY': {
      ws.nickname = msg.nickname;
      sessions.set(msg.nickname, ws);
      if (disconnectTimers.has(msg.nickname)) {
        clearTimeout(disconnectTimers.get(msg.nickname));
        disconnectTimers.delete(msg.nickname);
      }
      const lobbyCallback = async () => {
        const updatedRooms = await getAllRooms();
        ws.send(JSON.stringify({ type: 'LOBBY_STATE', rooms: updatedRooms }));
      };
      if (lobbyCallbacks.has(msg.nickname)) {
        await unsubscribeLobby(lobbyCallbacks.get(msg.nickname));
      }
      lobbyCallbacks.set(msg.nickname, lobbyCallback);
      await subscribeLobby(lobbyCallback);
      const rooms = await getAllRooms();
      ws.send(JSON.stringify({ type: 'LOBBY_STATE', rooms }));
      break;
    }

    case 'CREATE_ROOM': {
      if (lobbyCallbacks.has(ws.nickname)) {
        await unsubscribeLobby(lobbyCallbacks.get(ws.nickname));
        lobbyCallbacks.delete(ws.nickname);
      }
      const roomId = uuidv4().slice(0, 8);
      await createRoom(roomId, msg.roomName, ws.nickname);
      let game = createGame(roomId);
      game = addPlayer(game, ws.nickname);
      await saveGame(game);
      ws.gameId = roomId;
      await registerLocalPlayer(roomId, ws.nickname);
      ws.send(JSON.stringify({ type: 'JOINED_ROOM', gameId: roomId }));
      ws.send(JSON.stringify({ type: 'GAME_STATE', state: game }));
      await publishLobbyUpdate();
      break;
    }

    case 'JOIN_ROOM': {
      if (lobbyCallbacks.has(ws.nickname)) {
        await unsubscribeLobby(lobbyCallbacks.get(ws.nickname));
        lobbyCallbacks.delete(ws.nickname);
      }
      await joinRoom(msg.roomId, ws.nickname);
      ws.gameId = msg.roomId;
      await registerLocalPlayer(msg.roomId, ws.nickname);

      await withGameLock(msg.roomId, async () => {
        let game = await loadGame(msg.roomId);
        game = addPlayer(game, ws.nickname);

        if (game.players.length === 4) {
          game = startGame(game);
          await deleteRoom(msg.roomId);
        }

        await saveGame(game);
        ws.send(JSON.stringify({ type: 'JOINED_ROOM', gameId: msg.roomId }));
        await publishGameEvent(msg.roomId, { type: 'STATE_UPDATED' });
        await publishLobbyUpdate();
      });
      break;
    }

    case 'PLAYER_ACTION': {
      if (!ws.gameId) throw new Error('NOT_IN_GAME');
      await withGameLock(ws.gameId, async () => {
        const game = await loadGame(ws.gameId);
        if (!game) throw new Error('GAME_NOT_FOUND');
        const updated = applyAction(game, ws.nickname, msg.action, msg.amount || 0);
        await saveGame(updated);
        await publishGameEvent(ws.gameId, { type: 'STATE_UPDATED' });
        if (updated.phase === 'finished') {
          await saveGameHistory(updated);
          await deleteGame(ws.gameId);
        }
      });
      break;
    }

    case 'RECONNECT': {
      const game = await loadGame(msg.gameId);
      if (!game) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'GAME_NOT_FOUND' }));
        return;
      }
      ws.nickname = msg.nickname;
      ws.gameId = msg.gameId;
      sessions.set(msg.nickname, ws);
      if (disconnectTimers.has(msg.nickname)) {
        clearTimeout(disconnectTimers.get(msg.nickname));
        disconnectTimers.delete(msg.nickname);
      }
      await registerLocalPlayer(msg.gameId, msg.nickname);
      sendTo(msg.nickname, { type: 'GAME_STATE', state: personalizeState(game, msg.nickname) });
      break;
    }
  }
}

function handleDisconnect(nickname, gameId) {
  if (lobbyCallbacks.has(nickname)) {
    unsubscribeLobby(lobbyCallbacks.get(nickname)).catch(() => {});
    lobbyCallbacks.delete(nickname);
  }
  if (!gameId) return;
  unregisterLocalPlayer(gameId, nickname);
  const timer = setTimeout(async () => {
    disconnectTimers.delete(nickname);
    try {
      await withGameLock(gameId, async () => {
        const game = await loadGame(gameId);
        if (!game) return;
        const player = game.players.find(p => p.nickname === nickname);
        if (!player || player.status === 'folded') return;
        let updated;
        if (game.players[game.currentTurnIndex]?.nickname === nickname) {
          updated = applyAction(game, nickname, 'fold', 0);
        } else {
          updated = {
            ...game,
            players: game.players.map(p =>
              p.nickname === nickname ? { ...p, status: 'disconnected' } : p
            ),
          };
        }
        await saveGame(updated);
        await publishGameEvent(gameId, { type: 'STATE_UPDATED' });
        if (updated.phase === 'finished') {
          await saveGameHistory(updated);
          await deleteGame(gameId);
        }
      });
    } catch (err) {
      console.error('Disconnect timer error:', err.message);
    }
  }, RECONNECT_TIMEOUT_MS);
  disconnectTimers.set(nickname, timer);
}

module.exports = { handleMessage, handleDisconnect };
