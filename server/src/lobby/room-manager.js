import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '../redis/client.js';

const JOIN_ROOM_SCRIPT = `
local key = 'rooms'
local game_id = ARGV[1]
local player_id = ARGV[2]
local nickname = ARGV[3]

local raw = redis.call('HGET', key, game_id)
if raw == false then return redis.error_reply('ROOM_NOT_FOUND') end

local room = cjson.decode(raw)

if #room['players'] >= 4 then return redis.error_reply('ROOM_FULL') end

for _, p in ipairs(room['players']) do
  if p['nickname'] == nickname then return redis.error_reply('NICKNAME_TAKEN') end
  if p['player_id'] == player_id then return redis.error_reply('ALREADY_IN_ROOM') end
end

table.insert(room['players'], { player_id = player_id, nickname = nickname })
local updated = cjson.encode(room)
redis.call('HSET', key, game_id, updated)
return updated
`;

export async function createRoom(playerId, nickname) {
  const redis = getRedis();
  const gameId = uuidv4();
  const room = {
    game_id: gameId,
    players: [{ player_id: playerId, nickname }],
    created_at: new Date().toISOString(),
  };
  await redis.hset('rooms', gameId, JSON.stringify(room));
  return room;
}

export async function listRooms() {
  const redis = getRedis();
  const raw = await redis.hgetall('rooms');
  return Object.values(raw || {}).map(v => JSON.parse(v));
}

export async function joinRoom(gameId, playerId, nickname) {
  const redis = getRedis();
  try {
    const result = await redis.eval(JOIN_ROOM_SCRIPT, 0, gameId, playerId, nickname);
    return JSON.parse(result);
  } catch (err) {
    if (err.message.includes('ROOM_NOT_FOUND')) throw new Error('room not found');
    if (err.message.includes('ROOM_FULL')) throw new Error('room full');
    if (err.message.includes('NICKNAME_TAKEN')) throw new Error('nickname taken');
    if (err.message.includes('ALREADY_IN_ROOM')) throw new Error('already in room');
    throw err;
  }
}

export async function removeRoom(gameId) {
  const redis = getRedis();
  await redis.hdel('rooms', gameId);
}

export async function getRoom(gameId) {
  const redis = getRedis();
  const raw = await redis.hget('rooms', gameId);
  return raw ? JSON.parse(raw) : null;
}

export async function updateRoom(gameId, room) {
  const redis = getRedis();
  await redis.hset('rooms', gameId, JSON.stringify(room));
}
