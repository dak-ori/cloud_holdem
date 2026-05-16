import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '../redis/client.js';

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
  const raw = await redis.hget('rooms', gameId);
  if (!raw) throw new Error('room not found');
  const room = JSON.parse(raw);

  if (room.players.length >= 4) throw new Error('room full');
  if (room.players.some(p => p.nickname === nickname)) throw new Error('nickname taken');

  room.players.push({ player_id: playerId, nickname });
  await redis.hset('rooms', gameId, JSON.stringify(room));
  return room;
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
