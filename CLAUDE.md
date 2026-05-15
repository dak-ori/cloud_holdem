# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

4인용 텍사스 홀덤 웹 게임. 닉네임만 입력하면 즉시 플레이 가능. 여러 테이블이 동시 운영됨.

**Spec:** `docs/superpowers/specs/2026-05-15-cloud-holdem-design.md`  
**구현 플랜:** `docs/superpowers/plans/`

---

## Commands

### Backend (`server/`)

```bash
cd server
npm install           # 의존성 설치
npm test              # 전체 테스트
npm test -- --testPathPattern=deck   # 특정 파일 테스트
npm start             # 서버 실행 (ws://localhost:3001)
```

**Redis 로컬 실행 (테스트/서버 실행 전 필요):**
```bash
docker run -d -p 6379:6379 --name holdem-redis redis:7
```

### Frontend (`client/`)

```bash
cd client
npm install
npm run dev           # 개발 서버 (http://localhost:5173)
npm run build         # 프로덕션 빌드 → dist/
npm run preview       # 빌드 결과 미리보기
```

### 로컬 4인 테스트

```
1. docker run -d -p 6379:6379 redis:7
2. cd server && npm start
3. cd client && npm run dev
4. 브라우저 탭 4개 → http://localhost:5173
```

---

## Architecture

```
[브라우저] → S3 버킷 A (React 정적 파일)
           → ALB → EC2 Auto Scaling Group (Node.js ws 서버)
                         ↕
                   ElastiCache Redis
                         ↓
                   S3 버킷 B (게임 히스토리)
```

**핵심 원칙:** 게임 상태는 전부 Redis에 저장. EC2는 stateless — 어느 EC2든 어느 플레이어든 처리 가능. Sticky session 불필요.

---

## Backend 구조 (`server/src/`)

| 경로 | 역할 |
|------|------|
| `game/deck.js` | 52장 덱 생성/셔플/딜 |
| `game/hand-evaluator.js` | 7장 중 최선 5장 핸드 평가 |
| `game/blinds.js` | 인원별 블라인드 (4명:10/20, 3명:20/40, 2명:40/80) |
| `game/pot.js` | 팟 분배, 스플릿 팟 (홀수 칩은 딜러 왼쪽) |
| `game/game-engine.js` | 핸드 생명주기: initHand → processAction → advancePhase → resolveShowdown |
| `lobby/room-manager.js` | 방 생성(SETNX)/조회/입장/삭제 (Redis `rooms` 해시) |
| `redis/client.js` | ioredis 싱글턴 |
| `redis/game-state.js` | 게임 상태 읽기/쓰기. Lua 스크립트로 원자적 업데이트 |
| `redis/pubsub.js` | 게임 이벤트 pub/sub 발행·구독 |
| `ws/handler.js` | WebSocket 메시지 라우터 (create_room, join_room, action 등) |
| `ws/broadcaster.js` | gameId별 연결된 WebSocket 클라이언트 관리 및 브로드캐스트 |
| `timer/turn-timer.js` | Redis `turn_deadline` 1초 폴링 → 만료 시 auto_fold 처리 |

---

## Frontend 구조 (`client/src/`)

| 경로 | 역할 |
|------|------|
| `ws/socket.js` | WebSocket 싱글턴, exponential backoff 자동 재연결 |
| `context/GameContext.jsx` | 전역 게임 상태 (playerId, room, gameState, page) |
| `pages/Lobby.jsx` | 닉네임 입력, 방 목록, 방 생성/입장, 카운트다운 대기 |
| `pages/Game.jsx` | 게임 화면 진입점 |
| `components/ActionPanel.jsx` | 베팅 버튼 + 20초 타이머 UI |

---

## Redis 키 구조

| 키 | 내용 |
|----|------|
| `rooms` | Hash — 전체 방 목록 (game_id → room JSON) |
| `game:{game_id}` | String — 게임 상태 전체 JSON |
| `game:{game_id}:turn_deadline` | String — 현재 턴 만료 Unix timestamp (TTL 설정) |

---

## 게임 상태 머신

```
[대기] → 4명 입장 → 5초 카운트다운 → [preflop] → [flop] → [turn] → [river] → [showdown]
                                          ↑___________________________|
                                          (핸드 반복, 탈락자 제거)
```

**턴 타이머:** Redis `turn_deadline` 폴링. 20초 초과 → auto_fold. 3회 연속 → 탈락.  
**race condition 방어:** Lua 스크립트로 상태 조회+검증+업데이트 원자 실행.

---

## WebSocket 메시지 계약

**클라이언트 → 서버:** `list_rooms`, `create_room`, `join_room`, `leave_room`, `action`  
**서버 → 클라이언트:** `connected`, `rooms`, `room_created`, `player_joined`, `countdown`, `game_started`, `state_update`, `player_eliminated`, `game_over`, `error`

---

## AWS 인프라 (ap-northeast-2)

- **VPC:** Default VPC (`vpc-0e4283922b93ba6ea`)
- **S3 버킷 A:** `holdem-client-026951011097` (React 정적 호스팅)
- **S3 버킷 B:** `holdem-history-026951011097` (게임 히스토리)
- **Redis:** ElastiCache `holdem-redis` (cache.t3.micro)
- **ALB:** `holdem-alb` → 타깃 그룹 `holdem-tg` → EC2 포트 3001
- **ASG:** `holdem-asg` (min 1, max 4, CPU 70% scale-out)
- **AWS Profile:** `dsu-roleswitch`

배포: `aws s3 sync client/dist/ s3://holdem-client-026951011097/ --profile dsu-roleswitch`
