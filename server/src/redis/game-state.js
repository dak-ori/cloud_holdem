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

// TTL은 deadline보다 충분히 길어야 한다 — deadline과 동시에 키가 만료되면
// 폴러가 만료된 deadline을 읽지 못해 auto_fold가 영영 발동하지 않는다.
// 여유분 60초는 버려진 게임의 키 정리용 TTL 역할만 한다.
const DEADLINE_TTL_GRACE_SEC = 60;

export async function setTurnDeadline(gameId, deadlineUnixMs) {
  const redis = getRedis();
  const ttlSec = Math.max(1, Math.ceil((deadlineUnixMs - Date.now()) / 1000)) + DEADLINE_TTL_GRACE_SEC;
  await redis.set(`game:${gameId}:turn_deadline`, String(deadlineUnixMs), 'EX', ttlSec);
}

export async function getTurnDeadline(gameId) {
  const redis = getRedis();
  const val = await redis.get(`game:${gameId}:turn_deadline`);
  return val ? Number(val) : null;
}

// 만료된 deadline의 처리권 선점 — GETDEL은 원자적이므로 여러 인스턴스가
// 동시에 호출해도 한 곳만 값을 받는다 (나머지는 null)
export async function claimTurnDeadline(gameId) {
  const redis = getRedis();
  const val = await redis.getdel(`game:${gameId}:turn_deadline`);
  return val ? Number(val) : null;
}
