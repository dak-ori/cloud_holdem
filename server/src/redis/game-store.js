const { redis } = require('./client');

const GAME_TTL = 60 * 60 * 4;

async function saveGame(state) {
  await redis.set(`game:${state.gameId}`, JSON.stringify(state), 'EX', GAME_TTL);
}

async function loadGame(gameId) {
  const raw = await redis.get(`game:${gameId}`);
  return raw ? JSON.parse(raw) : null;
}

async function deleteGame(gameId) {
  await redis.del(`game:${gameId}`);
}

async function withGameLock(gameId, fn) {
  const lockKey = `lock:game:${gameId}`;
  const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 5);
  if (!acquired) throw new Error('LOCK_FAILED');
  try {
    return await fn();
  } finally {
    await redis.del(lockKey);
  }
}

module.exports = { saveGame, loadGame, deleteGame, withGameLock };
