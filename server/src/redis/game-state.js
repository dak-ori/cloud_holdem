import { getRedis } from './client.js';

const UPDATE_SCRIPT = `
local key = KEYS[1]
local expected_turn = ARGV[1]
local new_state = ARGV[2]
local current = redis.call('GET', key)
if current == false then return redis.error_reply('NOT_FOUND') end
local state = cjson.decode(current)
if state['current_turn'] ~= expected_turn then
  return redis.error_reply('NOT_YOUR_TURN')
end
redis.call('SET', key, new_state)
return 'OK'
`;

export async function getGameState(gameId) {
  const redis = getRedis();
  const raw = await redis.get(`game:${gameId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[GameState] Parse failed for game:${gameId}`, err.message);
    throw new Error(`Invalid game state for ${gameId}`);
  }
}

export async function setGameState(gameId, state) {
  const redis = getRedis();
  await redis.set(`game:${gameId}`, JSON.stringify(state));
}

export async function atomicUpdateGameState(gameId, expectedTurn, newState) {
  const redis = getRedis();
  try {
    return await redis.eval(
      UPDATE_SCRIPT,
      1,
      `game:${gameId}`,
      expectedTurn,
      JSON.stringify(newState)
    );
  } catch (err) {
    if (err.message.includes('NOT_FOUND')) throw new Error('GAME_NOT_FOUND');
    if (err.message.includes('NOT_YOUR_TURN')) throw new Error('NOT_YOUR_TURN');
    throw err;
  }
}

export async function deleteGameState(gameId) {
  const redis = getRedis();
  await redis.del(`game:${gameId}`, `game:${gameId}:turn_deadline`);
}

export async function setTurnDeadline(gameId, deadlineUnixMs) {
  const redis = getRedis();
  const ttlSec = Math.max(1, Math.ceil((deadlineUnixMs - Date.now()) / 1000));
  await redis.set(`game:${gameId}:turn_deadline`, String(deadlineUnixMs), 'EX', ttlSec);
}

export async function getTurnDeadline(gameId) {
  const redis = getRedis();
  const val = await redis.get(`game:${gameId}:turn_deadline`);
  return val ? Number(val) : null;
}
