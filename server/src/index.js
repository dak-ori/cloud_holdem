const http = require('http');
const { createWsServer, sessions } = require('./ws/server');
const { redis } = require('./redis/client');

const PORT = process.env.PORT || 3001;
let isShuttingDown = false;

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(isShuttingDown ? 503 : 200);
    res.end(isShuttingDown ? 'shutting down' : 'ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = createWsServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Game server running on port ${PORT}`);
});

async function gracefulShutdown() {
  isShuttingDown = true;
  console.log('Shutting down: stopping new connections');

  const deadline = Date.now() + 5 * 60 * 1000;
  while (sessions.size > 0 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
  }

  wss.close();
  httpServer.close(async () => {
    await redis.quit();
    console.log('Shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
