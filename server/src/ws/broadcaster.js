// gameId → Map<playerId, WebSocket>
const connections = new Map();

export function register(gameId, playerId, ws) {
  if (!connections.has(gameId)) connections.set(gameId, new Map());
  connections.get(gameId).set(playerId, ws);
}

export function unregister(gameId, playerId) {
  connections.get(gameId)?.delete(playerId);
}

export function broadcastToGame(gameId, event) {
  const players = connections.get(gameId);
  if (!players) return;
  const msg = JSON.stringify(event);
  for (const ws of players.values()) {
    if (ws.readyState === 1 /* OPEN */) ws.send(msg);
  }
}

export function sendToPlayer(gameId, playerId, event) {
  const ws = connections.get(gameId)?.get(playerId);
  if (ws?.readyState === 1) ws.send(JSON.stringify(event));
}

export function getConnectedPlayers(gameId) {
  return [...(connections.get(gameId)?.keys() ?? [])];
}
