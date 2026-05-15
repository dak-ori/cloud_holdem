# Cloud Hold'em Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Node.js WebSocket 게임 서버 + React 프론트엔드를 AWS(EC2+ALB+ElastiCache+S3+Auto Scaling)에 배포하는 4인용 텍사스 홀덤 게임을 구현한다.

**Architecture:** EC2 Auto Scaling 풀의 Node.js 서버들이 ElastiCache Redis를 공유 상태 저장소 및 pub/sub 버스로 사용. Redis 분산 락으로 게임 액션 원자성 보장. 클라이언트는 WebSocket 자동 재접속. React 프론트엔드는 S3 정적 호스팅.

**Tech Stack:** Node.js 20 (CommonJS), ws, ioredis, pokersolver, Jest, React 18, Vite, AWS CLI

---

## File Structure

```
cloud_holdem/
├── server/
│   ├── src/
│   │   ├── game/
│   │   │   ├── deck.js              # 카드 덱 (셔플, 딜)
│   │   │   ├── game-engine.js       # 게임 상태 머신 (베팅, 턴 진행, 승자 판정)
│   │   │   └── __tests__/
│   │   │       ├── deck.test.js
│   │   │       └── game-engine.test.js
│   │   ├── redis/
│   │   │   ├── client.js            # ioredis 연결 (일반 + pub/sub 전용)
│   │   │   ├── game-store.js        # 게임 상태 CRUD + 분산 락
│   │   │   ├── room-store.js        # 방 목록 CRUD
│   │   │   └── pubsub.js            # 이벤트 발행/구독 래퍼
│   │   ├── ws/
│   │   │   ├── server.js            # WebSocket 서버 설정 + 세션 맵
│   │   │   └── handlers.js          # 메시지 타입별 핸들러
│   │   └── index.js                 # 진입점, SIGTERM 처리
│   ├── package.json
│   └── jest.config.js
├── client/
│   ├── src/
│   │   ├── hooks/
│   │   │   └── useWebSocket.js      # WS 연결 + 자동 재접속 (exponential backoff)
│   │   ├── components/
│   │   │   ├── Lobby.jsx            # 방 생성/참여 UI
│   │   │   ├── GameTable.jsx        # 게임 테이블 (커뮤니티 카드, 팟)
│   │   │   ├── PlayerSeat.jsx       # 개별 플레이어 (패, 칩, 상태)
│   │   │   └── BettingControls.jsx  # 폴드/체크/콜/레이즈 버튼
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── vite.config.js
└── infra/
    ├── 01-elasticache.sh
    ├── 02-s3.sh
    ├── 03-alb-asg.sh
    └── 04-lifecycle-hook.sh
```

---

## WebSocket 메시지 프로토콜

**Client → Server:**
```json
{ "type": "JOIN_LOBBY", "nickname": "홍길동" }
{ "type": "CREATE_ROOM", "roomName": "고수방" }
{ "type": "JOIN_ROOM", "roomId": "abc123" }
{ "type": "PLAYER_ACTION", "action": "fold|check|call|raise", "amount": 100 }
{ "type": "RECONNECT", "gameId": "abc123", "nickname": "홍길동" }
```

**Server → Client:**
```json
{ "type": "LOBBY_STATE", "rooms": [{ "roomId": "...", "roomName": "...", "players": 2 }] }
{ "type": "JOINED_ROOM", "gameId": "abc123" }
{ "type": "GAME_STATE", "state": { ...gameState } }
{ "type": "ERROR", "message": "NOT_YOUR_TURN" }
```

---

## 게임 상태 포맷

```json
{
  "gameId": "abc123",
  "phase": "waiting|preflop|flop|turn|river|showdown|finished",
  "players": [
    {
      "nickname": "홍길동",
      "chips": 980,
      "hand": ["Ah", "Kd"],
      "status": "active|folded|all-in|disconnected",
      "betThisRound": 20
    }
  ],
  "communityCards": [],
  "deck": ["2h", "3d", "..."],
  "pot": 30,
  "currentBet": 20,
  "currentTurnIndex": 2,
  "dealerIndex": 0,
  "updatedAt": "2026-05-15T13:00:00Z"
}
```

---

## Phase 1: 프로젝트 초기화

### Task 1: Server 패키지 초기화

**Files:**
- Create: `server/package.json`
- Create: `server/jest.config.js`

- [ ] **Step 1: server 디렉토리 만들고 npm 초기화**

```bash
mkdir -p server/src/game/__tests__ server/src/redis server/src/ws
cd server
npm init -y
npm install ws ioredis pokersolver uuid
npm install --save-dev jest
```

- [ ] **Step 2: package.json scripts 수정**

`server/package.json`의 `scripts` 섹션을 아래로 교체:
```json
"scripts": {
  "start": "node src/index.js",
  "test": "jest --runInBand"
}
```

- [ ] **Step 3: jest.config.js 작성**

`server/jest.config.js`:
```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
};
```

- [ ] **Step 4: Client 패키지 초기화**

```bash
cd ..
npm create vite@latest client -- --template react
cd client
npm install
```

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/jest.config.js client/
git commit -m "feat: initialize server and client packages"
```

---

## Phase 2: 게임 로직

### Task 2: 카드 덱

**Files:**
- Create: `server/src/game/deck.js`
- Create: `server/src/game/__tests__/deck.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/src/game/__tests__/deck.test.js`:
```js
const { createDeck, shuffle, dealCard } = require('../deck');

test('덱은 52장이다', () => {
  expect(createDeck()).toHaveLength(52);
});

test('덱에 중복 카드가 없다', () => {
  const deck = createDeck();
  expect(new Set(deck).size).toBe(52);
});

test('카드 형식이 올바르다 (예: Ah, 2c, Td, Ks)', () => {
  const deck = createDeck();
  deck.forEach(card => {
    expect(card).toMatch(/^[2-9TJQKA][shdc]$/);
  });
});

test('셔플 후 순서가 바뀐다', () => {
  const deck = createDeck();
  const shuffled = shuffle([...deck]);
  expect(shuffled).not.toEqual(deck);
  expect(shuffled).toHaveLength(52);
});

test('dealCard는 덱 맨 앞에서 카드를 꺼낸다', () => {
  const deck = ['Ah', 'Kd', '2c'];
  const { card, remaining } = dealCard(deck);
  expect(card).toBe('Ah');
  expect(remaining).toEqual(['Kd', '2c']);
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd server && npx jest src/game/__tests__/deck.test.js
```
Expected: FAIL (deck.js not found)

- [ ] **Step 3: 구현**

`server/src/game/deck.js`:
```js
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = ['s','h','d','c'];

function createDeck() {
  return RANKS.flatMap(rank => SUITS.map(suit => `${rank}${suit}`));
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealCard(deck) {
  return { card: deck[0], remaining: deck.slice(1) };
}

module.exports = { createDeck, shuffle, dealCard };
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest src/game/__tests__/deck.test.js
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/game/deck.js server/src/game/__tests__/deck.test.js
git commit -m "feat: add card deck with shuffle and deal"
```

---

### Task 3: 게임 엔진

**Files:**
- Create: `server/src/game/game-engine.js`
- Create: `server/src/game/__tests__/game-engine.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/src/game/__tests__/game-engine.test.js`:
```js
const {
  createGame,
  addPlayer,
  startGame,
  applyAction,
  getActivePlayers,
} = require('../game-engine');

describe('createGame', () => {
  test('초기 상태를 반환한다', () => {
    const game = createGame('room1');
    expect(game.gameId).toBe('room1');
    expect(game.phase).toBe('waiting');
    expect(game.players).toEqual([]);
    expect(game.pot).toBe(0);
  });
});

describe('addPlayer', () => {
  test('플레이어를 추가한다', () => {
    const game = createGame('g1');
    const updated = addPlayer(game, '홍길동');
    expect(updated.players).toHaveLength(1);
    expect(updated.players[0].nickname).toBe('홍길동');
    expect(updated.players[0].chips).toBe(1000);
    expect(updated.players[0].status).toBe('active');
  });

  test('4명 초과 추가 시 에러', () => {
    let game = createGame('g1');
    game = addPlayer(game, 'p1');
    game = addPlayer(game, 'p2');
    game = addPlayer(game, 'p3');
    game = addPlayer(game, 'p4');
    expect(() => addPlayer(game, 'p5')).toThrow('ROOM_FULL');
  });
});

describe('startGame', () => {
  test('4명이면 preflop 시작, 카드 2장씩 배분', () => {
    let game = createGame('g1');
    ['p1','p2','p3','p4'].forEach(n => { game = addPlayer(game, n); });
    game = startGame(game);
    expect(game.phase).toBe('preflop');
    game.players.forEach(p => expect(p.hand).toHaveLength(2));
    expect(game.communityCards).toHaveLength(0);
  });

  test('블라인드 설정: dealer+1=SB(10), dealer+2=BB(20)', () => {
    let game = createGame('g1');
    ['p1','p2','p3','p4'].forEach(n => { game = addPlayer(game, n); });
    game = startGame(game);
    const sb = game.players[(game.dealerIndex + 1) % 4];
    const bb = game.players[(game.dealerIndex + 2) % 4];
    expect(sb.betThisRound).toBe(10);
    expect(bb.betThisRound).toBe(20);
    expect(game.pot).toBe(30);
    expect(game.currentBet).toBe(20);
  });
});

describe('applyAction - fold', () => {
  test('폴드하면 플레이어 status가 folded로 변한다', () => {
    let game = createGame('g1');
    ['p1','p2','p3','p4'].forEach(n => { game = addPlayer(game, n); });
    game = startGame(game);
    const currentPlayer = game.players[game.currentTurnIndex].nickname;
    game = applyAction(game, currentPlayer, 'fold', 0);
    const player = game.players.find(p => p.nickname === currentPlayer);
    expect(player.status).toBe('folded');
  });

  test('현재 턴이 아닌 플레이어 액션은 에러', () => {
    let game = createGame('g1');
    ['p1','p2','p3','p4'].forEach(n => { game = addPlayer(game, n); });
    game = startGame(game);
    const wrongPlayer = game.players[(game.currentTurnIndex + 1) % 4].nickname;
    expect(() => applyAction(game, wrongPlayer, 'fold', 0)).toThrow('NOT_YOUR_TURN');
  });
});

describe('getActivePlayers', () => {
  test('folded 제외한 active/all-in 플레이어 반환', () => {
    let game = createGame('g1');
    ['p1','p2','p3','p4'].forEach(n => { game = addPlayer(game, n); });
    game = startGame(game);
    const currentPlayer = game.players[game.currentTurnIndex].nickname;
    game = applyAction(game, currentPlayer, 'fold', 0);
    expect(getActivePlayers(game)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx jest src/game/__tests__/game-engine.test.js
```
Expected: FAIL

- [ ] **Step 3: 구현**

`server/src/game/game-engine.js`:
```js
const { createDeck, shuffle, dealCard } = require('./deck');
const { Hand } = require('pokersolver');

const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const STARTING_CHIPS = 1000;

function createGame(gameId) {
  return {
    gameId,
    phase: 'waiting',
    players: [],
    communityCards: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    currentTurnIndex: 0,
    dealerIndex: 0,
    updatedAt: new Date().toISOString(),
  };
}

function addPlayer(game, nickname) {
  if (game.players.length >= 4) throw new Error('ROOM_FULL');
  return {
    ...game,
    players: [
      ...game.players,
      { nickname, chips: STARTING_CHIPS, hand: [], status: 'active', betThisRound: 0 },
    ],
  };
}

function startGame(game) {
  let deck = shuffle(createDeck());
  let players = game.players.map(p => ({ ...p, hand: [], betThisRound: 0, status: 'active' }));

  // Deal 2 cards each
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < players.length; j++) {
      const { card, remaining } = dealCard(deck);
      players[j] = { ...players[j], hand: [...players[j].hand, card] };
      deck = remaining;
    }
  }

  // Post blinds
  const sbIdx = (game.dealerIndex + 1) % players.length;
  const bbIdx = (game.dealerIndex + 2) % players.length;
  players[sbIdx] = { ...players[sbIdx], chips: players[sbIdx].chips - SMALL_BLIND, betThisRound: SMALL_BLIND };
  players[bbIdx] = { ...players[bbIdx], chips: players[bbIdx].chips - BIG_BLIND, betThisRound: BIG_BLIND };

  // First to act: player after BB
  const firstActIdx = (game.dealerIndex + 3) % players.length;

  return {
    ...game,
    phase: 'preflop',
    players,
    deck,
    communityCards: [],
    pot: SMALL_BLIND + BIG_BLIND,
    currentBet: BIG_BLIND,
    currentTurnIndex: firstActIdx,
    updatedAt: new Date().toISOString(),
  };
}

function getActivePlayers(game) {
  return game.players.filter(p => p.status === 'active' || p.status === 'all-in');
}

function nextTurnIndex(game, currentIdx) {
  let next = (currentIdx + 1) % game.players.length;
  let attempts = 0;
  while (game.players[next].status === 'folded' && attempts < game.players.length) {
    next = (next + 1) % game.players.length;
    attempts++;
  }
  return next;
}

function isBettingRoundOver(game) {
  const active = game.players.filter(p => p.status === 'active');
  return active.every(p => p.betThisRound === game.currentBet);
}

function advancePhase(game) {
  const phaseOrder = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const currentIdx = phaseOrder.indexOf(game.phase);
  const nextPhase = phaseOrder[currentIdx + 1];

  let deck = [...game.deck];
  let communityCards = [...game.communityCards];
  let players = game.players.map(p => ({ ...p, betThisRound: 0 }));

  if (nextPhase === 'flop') {
    for (let i = 0; i < 3; i++) {
      const { card, remaining } = dealCard(deck);
      communityCards.push(card);
      deck = remaining;
    }
  } else if (nextPhase === 'turn' || nextPhase === 'river') {
    const { card, remaining } = dealCard(deck);
    communityCards.push(card);
    deck = remaining;
  }

  if (nextPhase === 'showdown') {
    return resolveShowdown({ ...game, players, communityCards, deck, phase: 'showdown' });
  }

  // First to act after dealer
  const firstActIdx = (game.dealerIndex + 1) % players.length;
  const firstActive = players.findIndex((p, i) => {
    let idx = (firstActIdx + i) % players.length;
    return players[idx].status === 'active';
  });

  return {
    ...game,
    phase: nextPhase,
    players,
    communityCards,
    deck,
    currentBet: 0,
    currentTurnIndex: (firstActIdx + firstActive) % players.length,
    updatedAt: new Date().toISOString(),
  };
}

function resolveShowdown(game) {
  const activePlayers = getActivePlayers(game);
  const hands = activePlayers.map(p => ({
    nickname: p.nickname,
    hand: Hand.solve([...p.hand, ...game.communityCards]),
  }));
  const winnerHands = Hand.winners(hands.map(h => h.hand));
  const winners = hands.filter(h => winnerHands.includes(h.hand)).map(h => h.nickname);

  const split = Math.floor(game.pot / winners.length);
  const players = game.players.map(p => ({
    ...p,
    chips: winners.includes(p.nickname) ? p.chips + split : p.chips,
  }));

  return {
    ...game,
    phase: 'finished',
    players,
    winners,
    updatedAt: new Date().toISOString(),
  };
}

function applyAction(game, nickname, action, amount) {
  if (game.players[game.currentTurnIndex].nickname !== nickname) {
    throw new Error('NOT_YOUR_TURN');
  }

  let players = game.players.map(p => ({ ...p }));
  const idx = game.currentTurnIndex;
  let { pot, currentBet } = game;

  if (action === 'fold') {
    players[idx].status = 'folded';
  } else if (action === 'check') {
    if (players[idx].betThisRound < currentBet) throw new Error('CANNOT_CHECK');
  } else if (action === 'call') {
    const toCall = currentBet - players[idx].betThisRound;
    const actual = Math.min(toCall, players[idx].chips);
    players[idx].chips -= actual;
    players[idx].betThisRound += actual;
    pot += actual;
  } else if (action === 'raise') {
    const toCall = currentBet - players[idx].betThisRound;
    const total = toCall + amount;
    if (total > players[idx].chips) throw new Error('NOT_ENOUGH_CHIPS');
    players[idx].chips -= total;
    players[idx].betThisRound += total;
    pot += total;
    currentBet = players[idx].betThisRound;
  }

  // Check if only one active player left
  const remaining = players.filter(p => p.status === 'active' || p.status === 'all-in');
  if (remaining.length === 1) {
    const winner = remaining[0].nickname;
    players = players.map(p => ({
      ...p,
      chips: p.nickname === winner ? p.chips + pot : p.chips,
    }));
    return { ...game, players, pot: 0, currentBet, phase: 'finished', winners: [winner], updatedAt: new Date().toISOString() };
  }

  let updated = { ...game, players, pot, currentBet, updatedAt: new Date().toISOString() };

  if (isBettingRoundOver(updated)) {
    return advancePhase(updated);
  }

  return { ...updated, currentTurnIndex: nextTurnIndex(updated, idx) };
}

module.exports = { createGame, addPlayer, startGame, applyAction, getActivePlayers };
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest src/game/__tests__/game-engine.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/game/
git commit -m "feat: add game engine with Texas Hold'em state machine"
```

---

## Phase 3: Redis 레이어

### Task 4: Redis 클라이언트 + 게임 스토어

**Files:**
- Create: `server/src/redis/client.js`
- Create: `server/src/redis/game-store.js`

- [ ] **Step 1: 로컬 Redis 실행 (Docker)**

```bash
docker run -d --name redis-local -p 6379:6379 redis:7-alpine
```

- [ ] **Step 2: Redis 클라이언트 작성**

`server/src/redis/client.js`:
```js
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function createClient() {
  return new Redis(REDIS_URL, { lazyConnect: true });
}

// 일반 명령용 클라이언트
const redis = createClient();

// pub/sub은 별도 연결 필요
function createSubscriber() {
  return createClient();
}

module.exports = { redis, createSubscriber };
```

- [ ] **Step 3: 게임 스토어 작성**

`server/src/redis/game-store.js`:
```js
const { redis } = require('./client');

const GAME_TTL = 60 * 60 * 4; // 4시간

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

// 분산 락을 이용한 원자적 상태 업데이트
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
```

- [ ] **Step 4: 수동 연결 테스트**

```bash
node -e "
const { redis } = require('./src/redis/client');
redis.set('test', 'ok').then(() => redis.get('test')).then(console.log).then(() => process.exit());
"
```
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add server/src/redis/client.js server/src/redis/game-store.js
git commit -m "feat: add Redis client and game store with distributed lock"
```

---

### Task 5: 방(Room) 스토어

**Files:**
- Create: `server/src/redis/room-store.js`

- [ ] **Step 1: room-store 작성**

`server/src/redis/room-store.js`:
```js
const { redis } = require('./client');

const ROOMS_KEY = 'rooms';

async function createRoom(roomId, roomName, creatorNickname) {
  const room = { roomId, roomName, players: [creatorNickname], createdAt: Date.now() };
  // HSETNX: 같은 roomId 중복 생성 방지
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
```

- [ ] **Step 2: Commit**

```bash
git add server/src/redis/room-store.js
git commit -m "feat: add room store with atomic HSETNX creation"
```

---

### Task 6: Pub/Sub 래퍼

**Files:**
- Create: `server/src/redis/pubsub.js`

- [ ] **Step 1: pubsub 작성**

`server/src/redis/pubsub.js`:
```js
const { redis, createSubscriber } = require('./client');

// subscriber 인스턴스는 채널 구독 전용 (일반 명령 불가)
const subscriber = createSubscriber();

// gameId → Set<callback> 맵
const listeners = new Map();

subscriber.on('message', (channel, message) => {
  const callbacks = listeners.get(channel);
  if (callbacks) {
    const data = JSON.parse(message);
    callbacks.forEach(cb => cb(data));
  }
});

async function subscribeGame(gameId, callback) {
  const channel = `game:${gameId}`;
  if (!listeners.has(channel)) {
    listeners.set(channel, new Set());
    await subscriber.subscribe(channel);
  }
  listeners.get(channel).add(callback);
}

async function unsubscribeGame(gameId, callback) {
  const channel = `game:${gameId}`;
  const callbacks = listeners.get(channel);
  if (!callbacks) return;
  callbacks.delete(callback);
  if (callbacks.size === 0) {
    listeners.delete(channel);
    await subscriber.unsubscribe(channel);
  }
}

async function publishGameEvent(gameId, event) {
  await redis.publish(`game:${gameId}`, JSON.stringify(event));
}

module.exports = { subscribeGame, unsubscribeGame, publishGameEvent };
```

- [ ] **Step 2: Commit**

```bash
git add server/src/redis/pubsub.js
git commit -m "feat: add Redis pub/sub wrapper for game event broadcasting"
```

---

## Phase 4: WebSocket 서버

### Task 7: WS 서버 + 세션 관리

**Files:**
- Create: `server/src/ws/server.js`

- [ ] **Step 1: WS 서버 작성**

`server/src/ws/server.js`:
```js
const { WebSocketServer } = require('ws');
const { handleMessage, handleDisconnect } = require('./handlers');

// nickname → WebSocket 맵 (재접속 시 교체)
const sessions = new Map();

function createWsServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    ws.nickname = null;
    ws.gameId = null;

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        await handleMessage(ws, msg, sessions);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
      }
    });

    ws.on('close', () => {
      if (ws.nickname) {
        handleDisconnect(ws.nickname, ws.gameId);
        sessions.delete(ws.nickname);
      }
    });
  });

  return wss;
}

function sendTo(nickname, message) {
  const ws = sessions.get(nickname);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

module.exports = { createWsServer, sessions, sendTo };
```

- [ ] **Step 2: Commit**

```bash
git add server/src/ws/server.js
git commit -m "feat: add WebSocket server with session map"
```

---

### Task 8: 메시지 핸들러

**Files:**
- Create: `server/src/ws/handlers.js`

- [ ] **Step 1: handlers 작성**

`server/src/ws/handlers.js`:
```js
const { v4: uuidv4 } = require('uuid');
const { createGame, addPlayer, startGame, applyAction } = require('../game/game-engine');
const { saveGame, loadGame, deleteGame, withGameLock } = require('../redis/game-store');
const { createRoom, getAllRooms, joinRoom, deleteRoom } = require('../redis/room-store');
const { subscribeGame, unsubscribeGame, publishGameEvent } = require('../redis/pubsub');
const { sendTo } = require('./server');

const RECONNECT_TIMEOUT_MS = 20 * 1000;
const disconnectTimers = new Map(); // nickname → timer

// gameId → Set<nickname> : 이 EC2에 연결된 플레이어 목록
const localGamePlayers = new Map();

// gameId → callback : pub/sub 콜백 (unsubscribe 시 필요)
const gameCallbacks = new Map();

function personalizeState(state, nickname) {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      hand: p.nickname === nickname ? p.hand : p.hand.map(() => '??'),
    })),
  };
}

async function broadcastToLocal(gameId) {
  const state = await loadGame(gameId);
  if (!state) return;
  const localPlayers = localGamePlayers.get(gameId) || new Set();
  for (const nickname of localPlayers) {
    sendTo(nickname, { type: 'GAME_STATE', state: personalizeState(state, nickname) });
  }
}

async function registerLocalPlayer(gameId, nickname) {
  if (!localGamePlayers.has(gameId)) {
    localGamePlayers.set(gameId, new Set());
    // EC2당 게임당 하나의 구독만 생성
    const callback = async () => broadcastToLocal(gameId);
    gameCallbacks.set(gameId, callback);
    await subscribeGame(gameId, callback);
  }
  localGamePlayers.get(gameId).add(nickname);
}

async function unregisterLocalPlayer(gameId, nickname) {
  const players = localGamePlayers.get(gameId);
  if (!players) return;
  players.delete(nickname);
  if (players.size === 0) {
    localGamePlayers.delete(gameId);
    const callback = gameCallbacks.get(gameId);
    gameCallbacks.delete(gameId);
    if (callback) await unsubscribeGame(gameId, callback);
  }
}

async function saveGameHistory(gameState) {
  try {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const bucket = process.env.HISTORY_BUCKET;
    if (!bucket) return;
    const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `history/${gameState.gameId}.json`,
      Body: JSON.stringify(gameState),
      ContentType: 'application/json',
    }));
  } catch (err) {
    console.error('S3 history write failed:', err.message);
  }
}

async function handleMessage(ws, msg, sessions) {
  switch (msg.type) {
    case 'JOIN_LOBBY': {
      ws.nickname = msg.nickname;
      sessions.set(msg.nickname, ws);
      if (disconnectTimers.has(msg.nickname)) {
        clearTimeout(disconnectTimers.get(msg.nickname));
        disconnectTimers.delete(msg.nickname);
      }
      const rooms = await getAllRooms();
      ws.send(JSON.stringify({ type: 'LOBBY_STATE', rooms }));
      break;
    }

    case 'CREATE_ROOM': {
      const roomId = uuidv4().slice(0, 8);
      await createRoom(roomId, msg.roomName, ws.nickname);
      let game = createGame(roomId);
      game = addPlayer(game, ws.nickname);
      await saveGame(game);
      ws.gameId = roomId;
      await registerLocalPlayer(roomId, ws.nickname);
      ws.send(JSON.stringify({ type: 'JOINED_ROOM', gameId: roomId }));
      ws.send(JSON.stringify({ type: 'GAME_STATE', state: game }));
      break;
    }

    case 'JOIN_ROOM': {
      await joinRoom(msg.roomId, ws.nickname);
      ws.gameId = msg.roomId;
      await registerLocalPlayer(msg.roomId, ws.nickname);

      await withGameLock(msg.roomId, async () => {
        let game = await loadGame(msg.roomId);
        game = addPlayer(game, ws.nickname);

        if (game.players.length === 4) {
          game = startGame(game);
          await deleteRoom(msg.roomId);
        }

        await saveGame(game);
        ws.send(JSON.stringify({ type: 'JOINED_ROOM', gameId: msg.roomId }));
        // pub/sub으로 모든 EC2에 상태 전파
        await publishGameEvent(msg.roomId, { type: 'STATE_UPDATED' });
      });
      break;
    }

    case 'PLAYER_ACTION': {
      if (!ws.gameId) throw new Error('NOT_IN_GAME');
      await withGameLock(ws.gameId, async () => {
        const game = await loadGame(ws.gameId);
        if (!game) throw new Error('GAME_NOT_FOUND');
        const updated = applyAction(game, ws.nickname, msg.action, msg.amount || 0);
        await saveGame(updated);
        await publishGameEvent(ws.gameId, { type: 'STATE_UPDATED' });
        if (updated.phase === 'finished') {
          await saveGameHistory(updated);
          await deleteGame(ws.gameId);
        }
      });
      break;
    }

    case 'RECONNECT': {
      const game = await loadGame(msg.gameId);
      if (!game) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'GAME_NOT_FOUND' }));
        return;
      }
      ws.nickname = msg.nickname;
      ws.gameId = msg.gameId;
      sessions.set(msg.nickname, ws);
      if (disconnectTimers.has(msg.nickname)) {
        clearTimeout(disconnectTimers.get(msg.nickname));
        disconnectTimers.delete(msg.nickname);
      }
      await registerLocalPlayer(msg.gameId, msg.nickname);
      sendTo(msg.nickname, { type: 'GAME_STATE', state: personalizeState(game, msg.nickname) });
      break;
    }
  }
}

function handleDisconnect(nickname, gameId) {
  if (!gameId) return;
  unregisterLocalPlayer(gameId, nickname);
  const timer = setTimeout(async () => {
    disconnectTimers.delete(nickname);
    try {
      await withGameLock(gameId, async () => {
        const game = await loadGame(gameId);
        if (!game) return;
        const player = game.players.find(p => p.nickname === nickname);
        if (!player || player.status === 'folded') return;
        let updated;
        if (game.players[game.currentTurnIndex]?.nickname === nickname) {
          updated = applyAction(game, nickname, 'fold', 0);
        } else {
          updated = {
            ...game,
            players: game.players.map(p =>
              p.nickname === nickname ? { ...p, status: 'disconnected' } : p
            ),
          };
        }
        await saveGame(updated);
        await publishGameEvent(gameId, { type: 'STATE_UPDATED' });
        if (updated.phase === 'finished') {
          await saveGameHistory(updated);
          await deleteGame(gameId);
        }
      });
    } catch (err) {
      console.error('Disconnect timer error:', err.message);
    }
  }, RECONNECT_TIMEOUT_MS);
  disconnectTimers.set(nickname, timer);
}

module.exports = { handleMessage, handleDisconnect };
```

- [ ] **Step 2: S3 SDK 설치**

```bash
cd server && npm install @aws-sdk/client-s3
```

- [ ] **Step 3: Commit**

```bash
git add server/src/ws/handlers.js server/package.json server/package-lock.json
git commit -m "feat: add WebSocket message handlers for lobby and game actions"
```

---

### Task 9: 서버 진입점 + SIGTERM 처리

**Files:**
- Create: `server/src/index.js`

- [ ] **Step 1: index.js 작성**

`server/src/index.js`:
```js
const http = require('http');
const { createWsServer, sessions } = require('./ws/server');
const { redis } = require('./redis/client');

const PORT = process.env.PORT || 3001;
let isShuttingDown = false;

const httpServer = http.createServer((req, res) => {
  // Health check — Scale-In 시 503 반환으로 ALB 새 연결 차단
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

// Graceful shutdown (ASG Lifecycle Hook 대응)
async function gracefulShutdown() {
  isShuttingDown = true;
  console.log('Shutting down: stopping new connections');

  // 기존 연결이 자연 종료될 때까지 최대 5분 대기
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
```

- [ ] **Step 2: 서버 로컬 실행 테스트**

```bash
cd server && node src/index.js
```
Expected: `Game server running on port 3001`

```bash
curl http://localhost:3001/health
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add server/src/index.js
git commit -m "feat: add server entry point with graceful SIGTERM shutdown"
```

---

## Phase 5: React 프론트엔드

### Task 10: WebSocket Hook (자동 재접속)

**Files:**
- Create: `client/src/hooks/useWebSocket.js`

- [ ] **Step 1: useWebSocket 작성**

`client/src/hooks/useWebSocket.js`:
```js
import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const retryDelay = useRef(1000);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryDelay.current = 1000;
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      onMessageRef.current(msg);
    };

    ws.onclose = () => {
      setConnected(false);
      // Exponential backoff (최대 16초)
      setTimeout(() => connect(), retryDelay.current);
      retryDelay.current = Math.min(retryDelay.current * 2, 16000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send, connected };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useWebSocket.js
git commit -m "feat: add WebSocket hook with exponential backoff reconnection"
```

---

### Task 11: App + Lobby UI

**Files:**
- Modify: `client/src/App.jsx`
- Create: `client/src/components/Lobby.jsx`

- [ ] **Step 1: App.jsx 작성**

`client/src/App.jsx`:
```jsx
import { useState, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import Lobby from './components/Lobby';
import GameTable from './components/GameTable';

export default function App() {
  const [nickname, setNickname] = useState('');
  const [joined, setJoined] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [gameState, setGameState] = useState(null);

  const onMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'LOBBY_STATE': setRooms(msg.rooms); break;
      case 'GAME_STATE': setGameState(msg.state); break;
      case 'JOINED_ROOM': break;
      case 'ERROR': alert(msg.message); break;
    }
  }, []);

  const { send, connected } = useWebSocket(onMessage);

  function handleJoin() {
    if (!nickname.trim()) return;
    setJoined(true);
    send({ type: 'JOIN_LOBBY', nickname: nickname.trim() });
  }

  if (!joined) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Cloud Hold'em</h1>
        <input
          placeholder="닉네임 입력"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
        />
        <button onClick={handleJoin}>입장</button>
        {!connected && <p style={{ color: 'red' }}>서버 연결 중...</p>}
      </div>
    );
  }

  if (gameState && gameState.phase !== 'waiting') {
    return <GameTable gameState={gameState} nickname={nickname} send={send} />;
  }

  return <Lobby rooms={rooms} nickname={nickname} send={send} gameState={gameState} />;
}
```

- [ ] **Step 2: Lobby.jsx 작성**

`client/src/components/Lobby.jsx`:
```jsx
import { useState } from 'react';

export default function Lobby({ rooms, nickname, send, gameState }) {
  const [roomName, setRoomName] = useState('');

  function createRoom() {
    if (!roomName.trim()) return;
    send({ type: 'CREATE_ROOM', roomName: roomName.trim() });
  }

  if (gameState?.phase === 'waiting') {
    return (
      <div style={{ padding: 40 }}>
        <h2>대기 중 ({gameState.players.length}/4)</h2>
        <ul>{gameState.players.map(p => <li key={p.nickname}>{p.nickname}</li>)}</ul>
        <p>플레이어 4명이 모이면 게임이 시작됩니다.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>로비 — {nickname}</h2>
      <div>
        <input
          placeholder="방 이름"
          value={roomName}
          onChange={e => setRoomName(e.target.value)}
        />
        <button onClick={createRoom}>방 만들기</button>
      </div>
      <h3>방 목록</h3>
      {rooms.length === 0 && <p>열린 방이 없습니다.</p>}
      <ul>
        {rooms.map(r => (
          <li key={r.roomId}>
            {r.roomName} ({r.players.length}/4)
            {r.players.length < 4 && (
              <button onClick={() => send({ type: 'JOIN_ROOM', roomId: r.roomId })}>
                참여
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/App.jsx client/src/components/Lobby.jsx
git commit -m "feat: add App and Lobby UI"
```

---

### Task 12: 게임 테이블 UI

**Files:**
- Create: `client/src/components/GameTable.jsx`
- Create: `client/src/components/PlayerSeat.jsx`
- Create: `client/src/components/BettingControls.jsx`

- [ ] **Step 1: PlayerSeat.jsx 작성**

`client/src/components/PlayerSeat.jsx`:
```jsx
export default function PlayerSeat({ player, isCurrentTurn, isMe }) {
  const border = isCurrentTurn ? '2px solid gold' : '1px solid gray';
  return (
    <div style={{ border, padding: 8, margin: 4, borderRadius: 4, minWidth: 120 }}>
      <strong>{player.nickname}{isMe ? ' (나)' : ''}</strong>
      <div>칩: {player.chips}</div>
      <div>상태: {player.status}</div>
      {isMe && player.hand[0] !== '??' && (
        <div>패: {player.hand.join(' ')}</div>
      )}
      {player.betThisRound > 0 && <div>베팅: {player.betThisRound}</div>}
    </div>
  );
}
```

- [ ] **Step 2: BettingControls.jsx 작성**

`client/src/components/BettingControls.jsx`:
```jsx
import { useState } from 'react';

export default function BettingControls({ send, gameState, nickname }) {
  const [raiseAmount, setRaiseAmount] = useState(20);
  const me = gameState.players.find(p => p.nickname === nickname);
  const isMyTurn = gameState.players[gameState.currentTurnIndex]?.nickname === nickname;

  if (!isMyTurn || me?.status !== 'active') return null;

  const canCheck = me.betThisRound >= gameState.currentBet;

  return (
    <div style={{ marginTop: 16 }}>
      <button onClick={() => send({ type: 'PLAYER_ACTION', action: 'fold', amount: 0 })}>폴드</button>
      {canCheck
        ? <button onClick={() => send({ type: 'PLAYER_ACTION', action: 'check', amount: 0 })}>체크</button>
        : <button onClick={() => send({ type: 'PLAYER_ACTION', action: 'call', amount: 0 })}>
            콜 ({gameState.currentBet - me.betThisRound})
          </button>
      }
      <span>
        <input
          type="number"
          min={gameState.currentBet}
          value={raiseAmount}
          onChange={e => setRaiseAmount(Number(e.target.value))}
          style={{ width: 60 }}
        />
        <button onClick={() => send({ type: 'PLAYER_ACTION', action: 'raise', amount: raiseAmount })}>레이즈</button>
      </span>
    </div>
  );
}
```

- [ ] **Step 3: GameTable.jsx 작성**

`client/src/components/GameTable.jsx`:
```jsx
import PlayerSeat from './PlayerSeat';
import BettingControls from './BettingControls';

const PHASE_LABEL = {
  preflop: '프리플랍',
  flop: '플랍',
  turn: '턴',
  river: '리버',
  showdown: '쇼다운',
  finished: '게임 종료',
};

export default function GameTable({ gameState, nickname, send }) {
  if (gameState.phase === 'finished') {
    return (
      <div style={{ padding: 40 }}>
        <h2>게임 종료</h2>
        <p>우승자: {gameState.winners?.join(', ')}</p>
        <p>팟: {gameState.pot}</p>
        <h3>최종 칩</h3>
        {gameState.players.map(p => (
          <div key={p.nickname}>{p.nickname}: {p.chips}</div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>Cloud Hold'em — {PHASE_LABEL[gameState.phase] || gameState.phase}</h2>
      <div>팟: {gameState.pot} | 현재 베팅: {gameState.currentBet}</div>

      <div>
        <h3>커뮤니티 카드</h3>
        <div style={{ fontSize: 24, letterSpacing: 8 }}>
          {gameState.communityCards.length > 0
            ? gameState.communityCards.join(' ')
            : '(없음)'}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 16 }}>
        {gameState.players.map((p, i) => (
          <PlayerSeat
            key={p.nickname}
            player={p}
            isCurrentTurn={i === gameState.currentTurnIndex}
            isMe={p.nickname === nickname}
          />
        ))}
      </div>

      <BettingControls send={send} gameState={gameState} nickname={nickname} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/
git commit -m "feat: add GameTable, PlayerSeat, BettingControls UI"
```

---

## Phase 6: 로컬 통합 테스트

### Task 13: 4탭 로컬 테스트

- [ ] **Step 1: 환경변수 파일 만들기**

`client/.env`:
```
VITE_WS_URL=ws://localhost:3001
```

- [ ] **Step 2: 서버 실행**

터미널 1:
```bash
docker run -d --name redis-local -p 6379:6379 redis:7-alpine  # 이미 실행 중이면 skip
cd server && node src/index.js
```

터미널 2:
```bash
cd client && npm run dev
```

- [ ] **Step 3: 4개 브라우저 탭으로 테스트**

1. `http://localhost:5173` 4번 열기
2. 각 탭에서 닉네임 입력 (p1, p2, p3, p4)
3. p1이 방 만들기 → p2, p3, p4가 참여
4. 4명 다 들어오면 자동으로 게임 시작 확인
5. 각 탭에서 베팅/폴드/체크/콜 테스트
6. 게임 종료 시 결과 화면 확인

- [ ] **Step 4: 재접속 테스트**

1. 게임 진행 중 탭 하나 닫기
2. 20초 내 다시 열고 같은 닉네임으로 입장 → 게임 이어서 진행 확인
3. 20초 초과 후 → 게임 강제 종료 확인 (현재 구현에서는 disconnect timer가 발동)

- [ ] **Step 5: Commit**

```bash
git add client/.env.example
# client/.env는 .gitignore에 추가
echo "client/.env" >> .gitignore
git add .gitignore
git commit -m "chore: add local dev env config and gitignore"
```

---

## Phase 7: AWS 인프라

> 모든 명령에 `--profile dsu-roleswitch` 붙이기. 리전: `ap-northeast-2`

### Task 14: ElastiCache (Redis) 생성

**Files:**
- Create: `infra/01-elasticache.sh`

- [ ] **Step 1: 인프라 디렉토리 생성 + 스크립트 작성**

`infra/01-elasticache.sh`:
```bash
#!/bin/bash
set -e
PROFILE="dsu-roleswitch"
REGION="ap-northeast-2"

# 기본 VPC ID 가져오기
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=is-default,Values=true" \
  --query "Vpcs[0].VpcId" \
  --output text \
  --profile $PROFILE --region $REGION)
echo "Default VPC: $VPC_ID"

# 서브넷 ID 가져오기 (첫 2개)
SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[0:2].SubnetId" \
  --output text \
  --profile $PROFILE --region $REGION)
echo "Subnets: $SUBNET_IDS"

# Redis용 보안 그룹 생성
SG_ID=$(aws ec2 create-security-group \
  --group-name "cloud-holdem-redis-sg" \
  --description "Redis for cloud-holdem" \
  --vpc-id $VPC_ID \
  --query "GroupId" --output text \
  --profile $PROFILE --region $REGION)
echo "Redis SG: $SG_ID"

# EC2에서 6379 허용 (나중에 EC2 SG ID로 교체 권장, 지금은 VPC CIDR 허용)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 6379 \
  --cidr 172.31.0.0/16 \
  --profile $PROFILE --region $REGION

# 서브넷 그룹 생성
SUBNET_ARRAY=($SUBNET_IDS)
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name "cloud-holdem-subnet-group" \
  --cache-subnet-group-description "cloud-holdem redis subnets" \
  --subnet-ids "${SUBNET_ARRAY[@]}" \
  --profile $PROFILE --region $REGION

# Redis 클러스터 생성 (t3.micro, 단일 노드)
aws elasticache create-cache-cluster \
  --cache-cluster-id "cloud-holdem-redis" \
  --cache-node-type "cache.t3.micro" \
  --engine redis \
  --num-cache-nodes 1 \
  --cache-subnet-group-name "cloud-holdem-subnet-group" \
  --security-group-ids $SG_ID \
  --profile $PROFILE --region $REGION

echo "ElastiCache 생성 중 (5-10분 소요)..."
aws elasticache wait cache-cluster-available \
  --cache-cluster-id "cloud-holdem-redis" \
  --profile $PROFILE --region $REGION

# 엔드포인트 출력
REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id "cloud-holdem-redis" \
  --show-cache-node-info \
  --query "CacheClusters[0].CacheNodes[0].Endpoint.Address" \
  --output text \
  --profile $PROFILE --region $REGION)
echo "Redis endpoint: $REDIS_ENDPOINT"
echo "REDIS_URL=redis://$REDIS_ENDPOINT:6379" > infra/.env.redis
```

- [ ] **Step 2: 스크립트 실행**

```bash
chmod +x infra/01-elasticache.sh && bash infra/01-elasticache.sh
```
Expected: `Redis endpoint: cloud-holdem-redis.xxxxx.cfg.apn2.cache.amazonaws.com`

- [ ] **Step 3: Commit**

```bash
git add infra/01-elasticache.sh
git commit -m "infra: add ElastiCache Redis setup script"
```

---

### Task 15: S3 버킷 생성 + 프론트엔드 배포

**Files:**
- Create: `infra/02-s3.sh`

- [ ] **Step 1: S3 스크립트 작성**

`infra/02-s3.sh`:
```bash
#!/bin/bash
set -e
PROFILE="dsu-roleswitch"
REGION="ap-northeast-2"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile $PROFILE)
FRONTEND_BUCKET="cloud-holdem-frontend-$ACCOUNT_ID"
HISTORY_BUCKET="cloud-holdem-history-$ACCOUNT_ID"

# 프론트엔드 버킷 (정적 웹 호스팅)
aws s3api create-bucket \
  --bucket $FRONTEND_BUCKET \
  --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION \
  --profile $PROFILE

aws s3api put-public-access-block \
  --bucket $FRONTEND_BUCKET \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
  --profile $PROFILE

aws s3api put-bucket-website \
  --bucket $FRONTEND_BUCKET \
  --website-configuration '{"IndexDocument":{"Suffix":"index.html"},"ErrorDocument":{"Key":"index.html"}}' \
  --profile $PROFILE

aws s3api put-bucket-policy \
  --bucket $FRONTEND_BUCKET \
  --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::$FRONTEND_BUCKET/*\"}]}" \
  --profile $PROFILE

# 히스토리 버킷 (비공개)
aws s3api create-bucket \
  --bucket $HISTORY_BUCKET \
  --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION \
  --profile $PROFILE

echo "Frontend bucket: $FRONTEND_BUCKET"
echo "History bucket: $HISTORY_BUCKET"
echo "FRONTEND_BUCKET=$FRONTEND_BUCKET" >> infra/.env.s3
echo "HISTORY_BUCKET=$HISTORY_BUCKET" >> infra/.env.s3
echo "S3_WEBSITE=http://$FRONTEND_BUCKET.s3-website.$REGION.amazonaws.com" >> infra/.env.s3
```

- [ ] **Step 2: 스크립트 실행**

```bash
bash infra/02-s3.sh
```

- [ ] **Step 3: Vite 빌드 후 S3 업로드**

```bash
source infra/.env.s3
source infra/.env.redis  # ALB URL 결정 후 VITE_WS_URL 교체 필요
cd client
VITE_WS_URL="ws://YOUR_ALB_DNS" npm run build
aws s3 sync dist/ s3://$FRONTEND_BUCKET --delete --profile dsu-roleswitch
echo "Frontend URL: $S3_WEBSITE"
```

> Note: `YOUR_ALB_DNS`는 Task 16에서 생성 후 교체

- [ ] **Step 4: Commit**

```bash
git add infra/02-s3.sh
git commit -m "infra: add S3 bucket setup script for frontend and history"
```

---

### Task 16: EC2 AMI + ALB + Auto Scaling

**Files:**
- Create: `infra/03-alb-asg.sh`

- [ ] **Step 1: EC2 User Data 스크립트 작성**

`infra/userdata.sh`:
```bash
#!/bin/bash
# Node.js 설치
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs git

# 앱 클론 및 설치
git clone https://github.com/dak-ori/cloud_holdem.git /app
cd /app/server && npm install --production

# systemd 서비스 등록
cat > /etc/systemd/system/holdem.service <<EOF
[Unit]
Description=Cloud Holdem Game Server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/app/server
Environment=PORT=3001
Environment=REDIS_URL=REDIS_ENDPOINT_PLACEHOLDER
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl enable holdem
systemctl start holdem
```

- [ ] **Step 2: ALB + ASG 스크립트 작성**

`infra/03-alb-asg.sh`:
```bash
#!/bin/bash
set -e
PROFILE="dsu-roleswitch"
REGION="ap-northeast-2"
source infra/.env.redis

VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=is-default,Values=true" \
  --query "Vpcs[0].VpcId" --output text \
  --profile $PROFILE --region $REGION)

SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[*].SubnetId" --output text \
  --profile $PROFILE --region $REGION)

# EC2 보안그룹 (ALB에서 3001 허용, 외부에서 직접 접근 차단)
EC2_SG=$(aws ec2 create-security-group \
  --group-name "cloud-holdem-ec2-sg" \
  --description "EC2 game servers" \
  --vpc-id $VPC_ID \
  --query "GroupId" --output text \
  --profile $PROFILE --region $REGION)

# ALB 보안그룹 (0.0.0.0/0 에서 80 허용)
ALB_SG=$(aws ec2 create-security-group \
  --group-name "cloud-holdem-alb-sg" \
  --description "ALB for cloud-holdem" \
  --vpc-id $VPC_ID \
  --query "GroupId" --output text \
  --profile $PROFILE --region $REGION)

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0 \
  --profile $PROFILE --region $REGION

# EC2 SG: ALB SG에서만 3001 허용
aws ec2 authorize-security-group-ingress \
  --group-id $EC2_SG --protocol tcp --port 3001 \
  --source-group $ALB_SG \
  --profile $PROFILE --region $REGION

# User Data에 Redis URL 삽입
REDIS_URL=$(grep REDIS_URL infra/.env.redis | cut -d= -f2-)
sed "s|REDIS_ENDPOINT_PLACEHOLDER|$REDIS_URL|g" infra/userdata.sh > /tmp/userdata-rendered.sh

# Launch Template
LATEST_AMI=$(aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=al2023-ami-*-x86_64" "Name=state,Values=available" \
  --query "sort_by(Images,&CreationDate)[-1].ImageId" \
  --output text \
  --profile $PROFILE --region $REGION)

LT_ID=$(aws ec2 create-launch-template \
  --launch-template-name "cloud-holdem-lt" \
  --version-description "v1" \
  --launch-template-data "{
    \"ImageId\": \"$LATEST_AMI\",
    \"InstanceType\": \"t3.micro\",
    \"SecurityGroupIds\": [\"$EC2_SG\"],
    \"UserData\": \"$(base64 -w0 /tmp/userdata-rendered.sh)\"
  }" \
  --query "LaunchTemplate.LaunchTemplateId" --output text \
  --profile $PROFILE --region $REGION)
echo "Launch Template: $LT_ID"

# ALB 생성
SUBNET_ARRAY=($SUBNET_IDS)
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name "cloud-holdem-alb" \
  --subnets "${SUBNET_ARRAY[@]}" \
  --security-groups $ALB_SG \
  --query "LoadBalancers[0].LoadBalancerArn" --output text \
  --profile $PROFILE --region $REGION)

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query "LoadBalancers[0].DNSName" --output text \
  --profile $PROFILE --region $REGION)
echo "ALB DNS: $ALB_DNS"

# Target Group (WebSocket 지원을 위해 HTTP 프로토콜 사용)
TG_ARN=$(aws elbv2 create-target-group \
  --name "cloud-holdem-tg" \
  --protocol HTTP --port 3001 \
  --vpc-id $VPC_ID \
  --health-check-path /health \
  --health-check-interval-seconds 15 \
  --healthy-threshold-count 2 \
  --query "TargetGroups[0].TargetGroupArn" --output text \
  --profile $PROFILE --region $REGION)

# ALB Listener (HTTP 80 → Target Group)
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN \
  --profile $PROFILE --region $REGION

# Auto Scaling Group (최소 1, 희망 2, 최대 5)
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name "cloud-holdem-asg" \
  --launch-template LaunchTemplateId=$LT_ID,Version='$Latest' \
  --min-size 1 --desired-capacity 2 --max-size 5 \
  --target-group-arns $TG_ARN \
  --vpc-zone-identifier "$(IFS=,; echo "${SUBNET_ARRAY[*]}")" \
  --health-check-type ELB \
  --health-check-grace-period 120 \
  --profile $PROFILE --region $REGION

# Scale Out 정책: CPU 70% 초과
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name "cloud-holdem-asg" \
  --policy-name "scale-out" \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {"PredefinedMetricType": "ASGAverageCPUUtilization"},
    "TargetValue": 70.0
  }' \
  --profile $PROFILE --region $REGION

echo "ALB_DNS=$ALB_DNS" > infra/.env.alb
echo "ALB_ARN=$ALB_ARN" >> infra/.env.alb
echo "TG_ARN=$TG_ARN" >> infra/.env.alb
echo "ASG_NAME=cloud-holdem-asg" >> infra/.env.alb
```

- [ ] **Step 3: 스크립트 실행**

```bash
bash infra/03-alb-asg.sh
```
Expected: `ALB DNS: cloud-holdem-alb-xxxxx.ap-northeast-2.elb.amazonaws.com`

- [ ] **Step 4: ALB DNS로 Vite 빌드 재실행 후 S3 업로드**

```bash
source infra/.env.alb
source infra/.env.s3
cd client
VITE_WS_URL="ws://$ALB_DNS" npm run build
aws s3 sync dist/ s3://$FRONTEND_BUCKET --delete --profile dsu-roleswitch
echo "접속 URL: $S3_WEBSITE"
```

- [ ] **Step 5: Commit**

```bash
git add infra/03-alb-asg.sh infra/userdata.sh
git commit -m "infra: add ALB, Auto Scaling Group, and Launch Template setup"
```

---

### Task 17: ASG Lifecycle Hook

**Files:**
- Create: `infra/04-lifecycle-hook.sh`

- [ ] **Step 1: 스크립트 작성**

`infra/04-lifecycle-hook.sh`:
```bash
#!/bin/bash
set -e
PROFILE="dsu-roleswitch"
source infra/.env.alb

aws autoscaling put-lifecycle-hook \
  --auto-scaling-group-name $ASG_NAME \
  --lifecycle-hook-name "cloud-holdem-drain" \
  --lifecycle-transition "autoscaling:EC2_INSTANCE_TERMINATING" \
  --heartbeat-timeout 300 \
  --default-result "CONTINUE" \
  --profile $PROFILE --region ap-northeast-2

echo "Lifecycle hook 등록 완료"
echo "EC2 종료 전 최대 300초 대기 (서버에서 SIGTERM 받아 graceful shutdown)"
```

> Note: EC2의 graceful shutdown은 이미 `server/src/index.js`의 SIGTERM 핸들러로 구현됨.
> systemd가 SIGTERM을 전달하고 lifecycle hook이 300초 대기를 보장.

- [ ] **Step 2: 스크립트 실행**

```bash
bash infra/04-lifecycle-hook.sh
```

- [ ] **Step 3: Commit**

```bash
git add infra/04-lifecycle-hook.sh
git commit -m "infra: add ASG lifecycle hook for graceful WebSocket drain"
```

---

## Phase 8: 최종 검증

### Task 18: AWS 환경 E2E 테스트

- [ ] **Step 1: ALB 헬스체크 확인**

```bash
source infra/.env.alb
curl http://$ALB_DNS/health
```
Expected: `ok`

- [ ] **Step 2: 브라우저에서 S3 프론트엔드 접속**

```bash
source infra/.env.s3
echo $S3_WEBSITE
```
URL을 브라우저에서 열어 닉네임 입력 → 로비 진입 확인

- [ ] **Step 3: 4명 게임 테스트 (다른 브라우저 탭 4개)**

1. S3 URL을 4개 탭에서 열기
2. 각 탭 닉네임: p1, p2, p3, p4
3. 방 만들기 → 참여 → 게임 시작 → 베팅 진행 → 종료 확인

- [ ] **Step 4: 다른 EC2로 연결 테스트**

```bash
# EC2 인스턴스 ID 2개 확인
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names cloud-holdem-asg \
  --query "AutoScalingGroups[0].Instances[*].InstanceId" \
  --output text --profile dsu-roleswitch --region ap-northeast-2
```

4명이 서로 다른 EC2에 붙어있을 때도 게임이 동기화되는지 확인 (ALB가 자동 분산)

- [ ] **Step 5: 최종 커밋 + 태그**

```bash
git tag v1.0.0
git push origin main --tags
```

---

## 리소스 정리 (게임 종료 후)

```bash
# ASG 먼저 종료 (인스턴스 자동 삭제)
aws autoscaling delete-auto-scaling-group --auto-scaling-group-name cloud-holdem-asg --force-delete --profile dsu-roleswitch --region ap-northeast-2

# ALB + Target Group
source infra/.env.alb
aws elbv2 delete-listener --listener-arn $(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --query "Listeners[0].ListenerArn" --output text --profile dsu-roleswitch) --profile dsu-roleswitch
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN --profile dsu-roleswitch
aws elbv2 delete-target-group --target-group-arn $TG_ARN --profile dsu-roleswitch

# ElastiCache
aws elasticache delete-cache-cluster --cache-cluster-id cloud-holdem-redis --profile dsu-roleswitch --region ap-northeast-2

# S3
source infra/.env.s3
aws s3 rb s3://$FRONTEND_BUCKET --force --profile dsu-roleswitch
aws s3 rb s3://$HISTORY_BUCKET --force --profile dsu-roleswitch
```
