import { createRoom, listRooms, joinRoom, removeRoom } from '../../src/lobby/room-manager.js';
import { getRedis } from '../../src/redis/client.js';

afterAll(async () => {
  const redis = getRedis();
  await redis.del('rooms');
  await redis.quit();
});

test('createRoom: 방 생성 후 목록에 나타남', async () => {
  const room = await createRoom('p1', 'Alice');
  expect(room.game_id).toBeDefined();
  expect(room.players).toHaveLength(1);

  const rooms = await listRooms();
  const found = rooms.find(r => r.game_id === room.game_id);
  expect(found).toBeDefined();

  await removeRoom(room.game_id);
});

test('joinRoom: 같은 방에 닉네임 중복 입장 거절', async () => {
  const room = await createRoom('p1', 'Alice');
  await expect(joinRoom(room.game_id, 'p2', 'Alice')).rejects.toThrow('nickname taken');
  await removeRoom(room.game_id);
});

test('joinRoom: 4명 꽉 찬 방에 입장 거절', async () => {
  const room = await createRoom('p1', 'P1');
  await joinRoom(room.game_id, 'p2', 'P2');
  await joinRoom(room.game_id, 'p3', 'P3');
  await joinRoom(room.game_id, 'p4', 'P4');
  await expect(joinRoom(room.game_id, 'p5', 'P5')).rejects.toThrow('room full');
  await removeRoom(room.game_id);
});

test('joinRoom: 같은 player_id가 다른 닉네임으로 중복 입장 거절 (탭 간 pid 공유 방어)', async () => {
  const room = await createRoom('p1', 'Alice');
  await expect(joinRoom(room.game_id, 'p1', 'Bob')).rejects.toThrow('already in room');
  await removeRoom(room.game_id);
});
