const { WebSocketServer } = require('ws');
const { handleMessage, handleDisconnect } = require('./handlers');

const sessions = new Map();

function createWsServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    ws.nickname = null;
    ws.gameId = null;

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        await handleMessage(ws, msg, sessions);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
      }
    });

    ws.on('close', () => {
      if (ws.nickname) {
        handleDisconnect(ws.nickname, ws.gameId);
        sessions.delete(ws.nickname);
      }
    });
  });

  return wss;
}

function sendTo(nickname, message) {
  const ws = sessions.get(nickname);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

module.exports = { createWsServer, sessions, sendTo };
