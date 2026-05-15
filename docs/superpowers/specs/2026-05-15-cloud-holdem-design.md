# Cloud Hold'em — Architecture Design

**Date:** 2026-05-15  
**Stack:** Node.js + React + AWS (EC2, EBS, S3, ALB, Auto Scaling, ElastiCache Redis)

---

## Overview

4인용 텍사스 홀덤 웹 게임. 여러 테이블이 동시에 운영되며, 닉네임만 입력하면 바로 플레이 가능. AWS 서비스(EC2, EBS, S3, ALB, Auto Scaling, ElastiCache)를 활용하는 구조.

---

## 게임 규칙

### 플레이어 식별
- 닉네임은 **방 내에서만 유일**. 동일 방에 중복 닉네임 입장 불가.
- 내부 식별자는 서버가 발급하는 UUID(`player_id`). Redis 게임 상태에도 `player_id` 기준으로 저장.

### 초기 설정 (고정값)
- 초기 칩: **1,000**
- 딜러 버튼: 첫 핸드는 랜덤, 이후 시계 방향으로 이동

### 블라인드 구조 (인원에 따라 변동)
| 인원 | Small Blind | Big Blind |
|------|------------|-----------|
| 4명  | 10         | 20        |
| 3명  | 20         | 40        |
| 2명  | 40         | 80        |

- 블라인드 변경은 탈락 직후 **다음 핸드 시작 시** 적용.

### 게임 진행 방식
- 여러 핸드를 반복. 칩이 0이 되면 탈락, 최후 1명이 모든 칩을 가지면 게임 종료.
- 올인: 사이드 팟 없이 단순화 (해당 플레이어는 자기 칩만큼만 팟에 기여).
- 무승부(스플릿 팟): 팟 균등 분배. 홀수 칩은 딜러 왼쪽 플레이어에게.

### 턴 타이머
- 각 턴 제한: **20초**. 초과 시 자동 폴드.
- 타이머 관리: Redis `game:{game_id}:turn_deadline`에 만료 시각 저장. EC2는 1초마다 폴링하여 만료 감지 후 자동 폴드 처리.
- EC2 장애 시: 다른 EC2가 폴링을 이어받아 처리 (EC2 무관).

### 탈락 조건
1. 칩 0 → 즉시 방에서 퇴출
2. 자동 폴드 **3회 연속** → 칩이 남아있어도 탈락 퇴출

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
              - game:{game_id}              → 게임 상태
              - game:{game_id}:turn_deadline → 턴 타이머 만료 시각
              - rooms                       → 방 목록
              - pub/sub                     → 게임 이벤트 브로드캐스트

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
  2. 플레이어 액션 수신 (베팅, 폴드, 체크, 레이즈, 올인)
  3. 게임 로직 실행 (카드 딜, 팟 계산, 승자 판정)
  4. Redis에서 게임 상태 읽기 → 업데이트 후 다시 쓰기
  5. Redis pub/sub으로 게임 이벤트 발행
  6. 자신에게 연결된 플레이어들에게 새 상태 브로드캐스트
  7. Redis `turn_deadline` 1초마다 폴링 → 만료 시 자동 폴드 처리
- Scale out 조건: CPU 70% 초과 or 동시 WebSocket 연결 수 임계값 초과
- Scale in 조건: 트래픽 감소 시 EC2 수 축소
- 최소 1대, 최대 N대

### EBS
- 각 EC2에 부착된 블록 스토리지
- 애플리케이션 코드, 로그 저장 용도
- 게임 핵심 상태는 Redis에 저장 (EBS 의존 제거)

### ElastiCache (Redis)
- 게임 상태 저장: `game:{game_id}` → 현재 게임 전체 상태 JSON
- 턴 타이머: `game:{game_id}:turn_deadline` → 현재 턴 만료 시각 (Unix timestamp)
- 방 목록 저장: `rooms` → 현재 열린 방 목록 (원자적 연산으로 race condition 없음)
- 이벤트 브로드캐스트: pub/sub 채널 `game:{game_id}` → 서로 다른 EC2에 붙어있는 플레이어들에게 이벤트 전달

---

## 게임 흐름

### ① 로비
```
브라우저 → ALB → EC2 (아무거나)
  1. 닉네임 입력 (방 내 중복 불가)
  2. "방 만들기" → Redis rooms에 원자적으로 방 추가 + game_id 발급
  3. "방 목록 보기" → Redis rooms 읽기
  4. 4명 모이면 → "게임이 시작합니다" 안내 메시지 + 5초 카운트다운
     - 카운트다운 중 누군가 나가면 → 취소, "플레이어가 떠났습니다, 대기 중..." 복귀
  5. 카운트다운 완료 → 게임 시작
```

### ② 게임 시작 (WebSocket 연결)
```
브라우저 → ALB → EC2 (아무거나, sticky 불필요)
  - 4명이 각각 다른 EC2에 붙어도 OK
  - 각 EC2가 Redis pub/sub 채널 game:{game_id} 구독
  - 딜러 버튼 결정 (첫 게임: 랜덤, 이후: 시계 방향)
  - 블라인드 강제 베팅 후 카드 딜
```

### ③ 게임 진행 (인게임)
```
플레이어 액션 (베팅/폴드/체크/레이즈/올인)
  → WebSocket → EC2 (해당 플레이어가 붙어있는 EC2)
  → Redis Lua 스크립트로 원자적 상태 업데이트 + current_turn 검증
  → Redis turn_deadline 갱신
  → Redis pub/sub 채널에 이벤트 발행
  → 모든 EC2가 이벤트 수신 → 자기 플레이어들에게 브로드캐스트

턴 타이머 만료 시:
  → EC2 폴링으로 감지 → 자동 폴드 처리
  → 연속 자동 폴드 카운트 증가
  → 3회 연속 시 해당 플레이어 탈락 퇴출
```

### ④ 핸드 종료 → 다음 핸드
```
- 승자에게 팟 지급 (무승부 시 균등 분배, 홀수 칩은 딜러 왼쪽 플레이어)
- 칩 0인 플레이어 퇴출
- 남은 인원에 따라 블라인드 조정 (다음 핸드 시작 시 적용)
- 마지막 1명 남으면 → 게임 종료
```

### ⑤ 게임 종료
```
EC2 → S3 history/{game_id}.json 저장
EC2 → Redis에서 game:{game_id} 및 turn_deadline 삭제
EC2 → Redis rooms에서 해당 방 제거
```

---

## UX 흐름

### 핸드 종료 결과 표시
- **쇼다운**: 모든 플레이어 패 공개 + 승자/획득 칩 표시 → **3초 대기** → 다음 핸드
- **폴드로 종료**: 마지막 남은 플레이어 승리 표시 → **즉시 다음 핸드**

### 핸드 사이 전환
- 결과 표시 후 → "다음 핸드 시작..." 메시지 **2초** → 카드 딜

### 게임 종료 화면
- 최후 1명 남으면 → 순위 화면 표시 (1위~4위, 닉네임, 최종 칩)
- "로비로 돌아가기" 버튼으로만 이동 (자동 전환 없음)

### 플레이어 탈락 알림
- 탈락 즉시 → 토스트 메시지 "홍길동이 탈락했습니다"
- 해당 플레이어 자리: 현재 핸드 동안은 "탈락" 표시 유지 → 다음 핸드부터 자리 제거

### 재연결 UX
- 연결 끊김 → "재연결 중..." 오버레이 표시
- 재연결 성공 → `player_id` 브라우저 메모리 유지 → 닉네임 재입력 없이 게임 상태 자동 복원
- 재연결 실패(20초 초과) → 자동 폴드 처리 (기존 규칙 적용)

---

## 게임 상태 포맷 (Redis 저장)

```json
{
  "game_id": "abc123",
  "phase": "flop",
  "players": [
    {
      "player_id": "uuid-...",
      "nickname": "홍길동",
      "chips": 1000,
      "hand": ["Ah", "Kd"],
      "status": "active",
      "consecutive_auto_folds": 0
    }
  ],
  "community_cards": ["2h", "7c", "Qs"],
  "deck": ["..."],
  "pot": 150,
  "current_turn": "uuid-...",
  "dealer_index": 0,
  "small_blind": 10,
  "big_blind": 20,
  "updated_at": "2026-05-15T13:00:00Z"
}
```

---

## S3 게임 히스토리 포맷

```json
{
  "game_id": "abc123",
  "ended_at": "2026-05-15T14:30:00Z",
  "players": [
    { "nickname": "홍길동", "final_chips": 4000, "rank": 1 },
    { "nickname": "김철수", "final_chips": 0, "rank": 2 },
    { "nickname": "이영희", "final_chips": 0, "rank": 3 },
    { "nickname": "박민수", "final_chips": 0, "rank": 4 }
  ],
  "total_hands": 12
}
```

---

## 에러 처리

### WebSocket 끊김
- 플레이어 접속 끊김 → 턴 타이머(20초) 그대로 진행
- 20초 내 재접속 시 → Redis에서 상태 읽어 복귀 (EC2 무관), 남은 턴 시간 이어서 진행
- 20초 초과 → 자동 폴드 처리, 연속 자동 폴드 카운트 증가
- 3회 연속 자동 폴드 → 탈락 퇴출 (칩 보유 여부 무관)

### EC2 장애
- 게임 상태는 Redis에 있으므로 EC2가 죽어도 데이터 유실 없음
- 해당 EC2에 붙어있던 플레이어들이 재접속 → ALB가 살아있는 EC2로 라우팅 → Redis에서 게임 상태 복원
- 턴 타이머 폴링도 다른 EC2가 자동으로 이어받음

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
