const { redis } = require('./client');

const ROOMS_KEY = 'rooms';

async function createRoom(roomId, roomName, creatorNickname) {
  const room = { roomId, roomName, players: [creatorNickname], createdAt: Date.now() };
  const ok = await redis.hsetnx(ROOMS_KEY, roomId, JSON.stringify(room));
  if (!ok) throw new Error('ROOM_ALREADY_EXISTS');
  return room;
}

async function getRoom(roomId) {
  const raw = await redis.hget(ROOMS_KEY, roomId);
  return raw ? JSON.parse(raw) : null;
}

async function getAllRooms() {
  const all = await redis.hgetall(ROOMS_KEY);
  if (!all) return [];
  return Object.values(all).map(r => JSON.parse(r));
}

async function joinRoom(roomId, nickname) {
  const room = await getRoom(roomId);
  if (!room) throw new Error('ROOM_NOT_FOUND');
  if (room.players.length >= 4) throw new Error('ROOM_FULL');
  if (room.players.includes(nickname)) throw new Error('ALREADY_IN_ROOM');
  room.players.push(nickname);
  await redis.hset(ROOMS_KEY, roomId, JSON.stringify(room));
  return room;
}

async function deleteRoom(roomId) {
  await redis.hdel(ROOMS_KEY, roomId);
}

module.exports = { createRoom, getRoom, getAllRooms, joinRoom, deleteRoom };
