const { WebSocketServer } = require('ws');
const { handleMessage, handleDisconnect } = require('./handlers');
const { sessions, sendTo } = require('./sessions');

function createWsServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    ws.nickname = null;
    ws.gameId = null;
    console.log('[WS] new connection');

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        console.log('[WS] msg:', msg.type, msg.nickname || msg.roomName || msg.action || '');
        await handleMessage(ws, msg, sessions);
      } catch (err) {
        console.error('[WS] error:', err.message);
        ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
      }
    });

    ws.on('close', () => {
      console.log('[WS] close:', ws.nickname || '(unknown)');
      if (ws.nickname) {
        handleDisconnect(ws.nickname, ws.gameId);
        sessions.delete(ws.nickname);
      }
    });
  });

  return wss;
}

module.exports = { createWsServer, sessions, sendTo };
