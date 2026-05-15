# Cloud Hold'em — Architecture Design

**Date:** 2026-05-15  
**Stack:** Node.js + React + AWS (EC2, EBS, S3, ALB, Auto Scaling, ElastiCache Redis)

---

## Overview

4인용 텍사스 홀덤 웹 게임. 여러 테이블이 동시에 운영되며, 닉네임만 입력하면 바로 플레이 가능. AWS 서비스(EC2, EBS, S3, ALB, Auto Scaling, ElastiCache)를 활용하는 구조.

---

## Architecture

```
[브라우저]
    │
    ├─→ S3 버킷 A (정적 파일: React 빌드 결과물)
    │
    └─→ ALB (Application Load Balancer)
            │  sticky session 불필요 — 어느 EC2든 어느 게임이든 처리 가능
            ├─→ EC2 #1 (Node.js 게임 서버) ← EBS (앱 코드/로그)
            ├─→ EC2 #2 (Node.js 게임 서버) ← EBS
            └─→ EC2 #N ... (Auto Scaling Group 관리)
                    ↕
            ElastiCache (Redis)
              - game:{game_id}  → 게임 상태
              - rooms           → 방 목록
              - pub/sub         → 게임 이벤트 브로드캐스트

게임 종료 시 → S3 버킷 B (게임 히스토리 저장)
```

---

## 서비스별 역할

### S3
- **버킷 A**: React 빌드 결과물 정적 호스팅 (index.html, JS, CSS)
- **버킷 B**: 게임 종료 후 결과 로그 저장 (`history/{game_id}.json`)

### ALB (Application Load Balancer)
- WebSocket 연결 지원 (HTTP → WS 업그레이드)
- Sticky session 불필요 — Redis가 공유 상태를 들고 있으므로 어느 EC2가 요청을 받아도 처리 가능

### EC2 Auto Scaling Group
- 각 EC2: Node.js WebSocket 게임 서버 실행
- EC2가 하는 일:
  1. 브라우저의 WebSocket 연결 수락
  2. 플레이어 액션 수신 (베팅, 폴드, 체크, 레이즈)
  3. 게임 로직 실행 (카드 딜, 팟 계산, 승자 판정)
  4. Redis에서 게임 상태 읽기 → 업데이트 후 다시 쓰기
  5. Redis pub/sub으로 게임 이벤트 발행
  6. 자신에게 연결된 플레이어들에게 새 상태 브로드캐스트
- Scale out 조건: CPU 70% 초과 or 동시 WebSocket 연결 수 임계값 초과
- Scale in 조건: 트래픽 감소 시 EC2 수 축소
- 최소 1대, 최대 N대

### EBS
- 각 EC2에 부착된 블록 스토리지
- 애플리케이션 코드, 로그 저장 용도
- 게임 핵심 상태는 Redis에 저장 (EBS 의존 제거)

### ElastiCache (Redis)
- 게임 상태 저장: `game:{game_id}` → 현재 게임 전체 상태 JSON
- 방 목록 저장: `rooms` → 현재 열린 방 목록 (원자적 연산으로 race condition 없음)
- 이벤트 브로드캐스트: pub/sub 채널 `game:{game_id}` → 서로 다른 EC2에 붙어있는 플레이어들에게 이벤트 전달

---

## 게임 흐름

### ① 로비
```
브라우저 → ALB → EC2 (아무거나)
  1. 닉네임 입력
  2. "방 만들기" → Redis rooms에 원자적으로 방 추가 + game_id 발급
  3. "방 목록 보기" → Redis rooms 읽기
  4. 4명 모이면 → "게임 시작" 신호
```

### ② 게임 시작 (WebSocket 연결)
```
브라우저 → ALB → EC2 (아무거나, sticky 불필요)
  - 4명이 각각 다른 EC2에 붙어도 OK
  - 각 EC2가 Redis pub/sub 채널 game:{game_id} 구독
```

### ③ 게임 진행 (인게임)
```
플레이어 액션 (베팅/폴드/체크/레이즈)
  → WebSocket → EC2 (해당 플레이어가 붙어있는 EC2)
  → 게임 로직 처리
  → Redis game:{game_id} 상태 업데이트
  → Redis pub/sub 채널에 이벤트 발행
  → 모든 EC2가 이벤트 수신 → 자기 플레이어들에게 브로드캐스트
```

### ④ 게임 종료
```
EC2 → 결과 JSON을 S3 history/{game_id}.json 저장
EC2 → Redis에서 game:{game_id} 삭제
EC2 → Redis rooms에서 해당 방 제거
```

---

## 게임 상태 포맷 (Redis 저장)

```json
{
  "game_id": "abc123",
  "phase": "flop",
  "players": [
    { "nickname": "홍길동", "chips": 1000, "hand": ["Ah", "Kd"], "status": "active" }
  ],
  "community_cards": ["2h", "7c", "Qs"],
  "deck": ["..."],
  "pot": 150,
  "current_turn": "홍길동",
  "dealer_index": 0,
  "updated_at": "2026-05-15T13:00:00Z"
}
```

---

## 에러 처리

### WebSocket 끊김
- 플레이어 접속 끊기면 → 해당 플레이어 자동 폴드 처리
- **20초** 내 재접속 시 → Redis에서 상태 읽어 복귀 가능 (EC2 무관)
- 20초 초과 → 게임 강제 종료, 나머지 플레이어에게 알림

### EC2 장애
- 게임 상태는 Redis에 있으므로 EC2가 죽어도 데이터 유실 없음
- 해당 EC2에 붙어있던 플레이어들이 재접속 → ALB가 살아있는 EC2로 라우팅 → Redis에서 게임 상태 복원

### ASG Scale-In (WebSocket 롱 커넥션 보호)
ALB connection draining 기본값(300초)은 장시간 WebSocket 연결을 강제 종료할 수 있음. 두 가지 대응:

1. **클라이언트 자동 재접속**: WebSocket 끊기면 exponential backoff로 자동 재연결. 상태는 Redis에 있으므로 어느 EC2에 붙어도 게임 이어서 진행 (플레이어 입장에서 짧은 재연결 후 복귀)
2. **ASG Lifecycle Hook**: Scale-In 신호 오면 해당 EC2가 health check 503 반환 → ALB가 새 연결 차단 → 기존 연결 자연 종료 대기 → 완료 후 lifecycle hook 완료 신호 전송 (최대 48시간 종료 지연 가능)

### Redis Race Condition (Read-Modify-Write)
턴제 게임이지만 버튼 연타·타이머 마감 직전 동시 액션 시 GET→수정→SET 사이 데이터 덮어쓰기 위험 존재. 두 가지 레이어로 방어:

1. **Redis Lua 스크립트**: 상태 조회 + 검증 + 업데이트를 단일 스크립트로 원자적 실행. Node.js 왕복 없이 Redis 내부에서 완결됨 → race condition 원천 차단
2. **current_turn 검증**: Lua 스크립트 내에서 액션 주체가 `current_turn`인지 확인 후 처리 → 순서 외 액션은 즉시 거절

### 동시 방 생성 (race condition)
- Redis SETNX로 원자적 방 생성 → 중복 생성 불가

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React (S3 정적 호스팅) |
| 백엔드 | Node.js + ws (WebSocket 서버) |
| 게임/로비 상태 | ElastiCache Redis |
| 게임 히스토리 | S3 |
| 인프라 | EC2 (Auto Scaling), ALB, S3, EBS, ElastiCache |

---

## 테스트 전략

- **로컬**: Node.js 서버 + Redis(Docker) + React dev server, 4개 브라우저 탭으로 4명 시뮬레이션
- **AWS**: EC2 2대 + ElastiCache 올려서 다른 EC2에 붙은 플레이어 간 게임 동기화 확인
