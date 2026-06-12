import { jest } from '@jest/globals';
import WebSocket, { WebSocketServer } from 'ws';
import { handleConnection } from '../../src/ws/handler.js';
import { getRedis } from '../../src/redis/client.js';
import { getSubscriber } from '../../src/redis/pubsub.js';

let wss;
let port;

beforeAll(async () => {
  wss = new WebSocketServer({ port: 0 });
  wss.on('connection', handleConnection);
  await new Promise(r => wss.once('listening', r));
  port = wss.address().port;
});

beforeEach(async () => {
  await getRedis().del('rooms');
});

afterAll(async () => {
  // 실패한 테스트가 소켓을 안 닫았어도 서버 종료가 막히지 않게 강제 종료
  wss.clients.forEach(c => c.terminate());
  await new Promise(r => wss.close(r));
  await getSubscriber().quit();
  await getRedis().quit();
});

// 테스트용 WS 클라이언트: 받은 메시지를 큐에 쌓고 타입별로 기다린다
function connect(pid) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}${pid ? `/?pid=${pid}` : ''}`);
    const queue = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      const i = waiters.findIndex(w => w.type === msg.type);
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else queue.push(msg);
    });
    ws.on('error', reject);
    const client = {
      ws,
      send: (obj) => ws.send(JSON.stringify(obj)),
      waitFor: (type, timeoutMs = 3000) => {
        const i = queue.findIndex(m => m.type === type);
        if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          const timer = setTimeout(() => rej(new Error(`timeout waiting for ${type}`)), timeoutMs);
          waiters.push({ type, resolve: (m) => { clearTimeout(timer); res(m); } });
        });
      },
    };
    client.waitFor('connected').then((msg) => { client.playerId = msg.player_id; resolve(client); });
  });
}

// 닫힘 처리는 비동기 — 조건이 참이 될 때까지 list_rooms 폴링
async function pollRooms(client, predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let rooms;
  while (Date.now() < deadline) {
    client.send({ type: 'list_rooms' });
    rooms = (await client.waitFor('rooms')).rooms;
    if (predicate(rooms)) return rooms;
    await new Promise(r => setTimeout(r, 150));
  }
  return rooms;
}

test('대기 중 플레이어가 연결을 끊으면 방 인원에서 제거된다', async () => {
  const host = await connect();
  host.send({ type: 'create_room', nickname: 'kim' });
  const { room } = await host.waitFor('room_created');

  const guest = await connect();
  guest.send({ type: 'join_room', game_id: room.game_id, nickname: 'lee' });
  await host.waitFor('player_joined');

  guest.ws.close(); // 브라우저 닫기와 동일 — leave_room 메시지 없음

  const observer = await connect();
  const rooms = await pollRooms(observer, rs => rs[0]?.players.length === 1);
  expect(rooms).toHaveLength(1);
  expect(rooms[0].players.map(p => p.nickname)).toEqual(['kim']);

  host.ws.close();
  observer.ws.close();
}, 15_000);

test('클라이언트가 보낸 pid로 접속하면 같은 player_id를 돌려받는다 (재접속 신원 유지)', async () => {
  const pid = '11111111-2222-4333-8444-555555555555';
  const c = await connect(pid);
  expect(c.playerId).toBe(pid);
  c.ws.close();
});

test('게임 중 끊긴 플레이어가 같은 pid로 재접속하면 게임에 재합류한다', async () => {
  // 4명 입장 → 게임 시작
  const host = await connect();
  host.send({ type: 'create_room', nickname: 'kim' });
  const { room } = await host.waitFor('room_created');
  const guests = [];
  for (const nick of ['lee', 'park', 'choi']) {
    const g = await connect();
    g.send({ type: 'join_room', game_id: room.game_id, nickname: nick });
    guests.push(g);
  }
  await host.waitFor('game_started', 10_000); // 5초 카운트다운 포함

  // choi가 브라우저를 닫음 (leave_room 없이)
  const choi = guests[2];
  const choiPid = choi.playerId;
  choi.ws.close();
  await new Promise(r => setTimeout(r, 300));

  // 게임 중이므로 방 인원은 그대로 4명이어야 한다
  const obs = await connect();
  const rooms = await pollRooms(obs, rs => rs[0]?.players.length === 4);
  expect(rooms[0].players).toHaveLength(4);

  // 같은 pid로 재접속 → 재합류
  const back = await connect(choiPid);
  const rejoined = await back.waitFor('rejoined');
  expect(rejoined.room.game_id).toBe(room.game_id);
  expect(rejoined.state.players.map(p => p.player_id)).toContain(choiPid);

  [host, ...guests.slice(0, 2), obs, back].forEach(c => c.ws.close());
}, 25_000);

test('마지막 플레이어가 연결을 끊으면 방이 삭제된다', async () => {
  const host = await connect();
  host.send({ type: 'create_room', nickname: 'kim' });
  await host.waitFor('room_created');

  host.ws.close(); // 유일한 플레이어가 브라우저 닫음

  const observer = await connect();
  const rooms = await pollRooms(observer, rs => rs.length === 0);
  expect(rooms).toHaveLength(0);

  observer.ws.close();
}, 15_000);
