import { WebSocketServer } from 'ws';
import http from 'http';
import { handleConnection } from './ws/handler.js';
import { startTurnTimerPoller } from './timer/turn-timer.js';

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });
wss.on('connection', handleConnection);

startTurnTimerPoller();

server.listen(PORT, () => {
  console.log(`Cloud Hold'em server running on port ${PORT}`);
});
