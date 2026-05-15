# Cloud Hold'em — Architecture Design

**Date:** 2026-05-15  
**Stack:** Node.js + React + AWS (EC2, EBS, S3, ALB, Auto Scaling)

---

## Overview

4인용 텍사스 홀덤 웹 게임. 여러 테이블이 동시에 운영되며, 닉네임만 입력하면 바로 플레이 가능. 배운 AWS 서비스(EC2, EBS, S3, ALB, Auto Scaling)를 모두 활용하는 구조.

---

## Architecture

```
[브라우저]
    │
    ├─→ S3 버킷 A (정적 파일: React 빌드 결과물)
    │
    └─→ ALB (Application Load Balancer)
            │  WebSocket sticky session (game_id 쿠키 기준)
            ├─→ EC2 #1 (Node.js 게임 서버) ← EBS
            ├─→ EC2 #2 (Node.js 게임 서버) ← EBS
            └─→ EC2 #N ... (Auto Scaling Group 관리)

게임 종료 시 → S3 버킷 B (게임 로그/히스토리 저장)
로비 공유 상태 → S3 버킷 B / rooms.json
```

---

## 서비스별 역할

### S3
- **버킷 A**: React 빌드 결과물 정적 호스팅 (index.html, JS, CSS)
- **버킷 B**:
  - `rooms.json` — 현재 열린 방 목록 (로비 공유 상태)
  - `history/{game_id}.json` — 게임 종료 후 결과 로그

### ALB (Application Load Balancer)
- WebSocket 연결 지원 (HTTP → WS 업그레이드)
- **Sticky session**: `game_id` 쿠키 기준으로 같은 게임의 4명이 항상 같은 EC2로 라우팅
- 로비 요청(방 생성/참여)은 sticky 없이 아무 EC2에나 라우팅

### EC2 Auto Scaling Group
- 각 EC2: Node.js WebSocket 게임 서버 실행
- 1개 EC2가 여러 게임 테이블을 메모리에서 동시 처리
- Scale out 조건: CPU 70% 초과 or 동시 WebSocket 연결 수 임계값 초과
- Scale in 조건: 트래픽 감소 시 EC2 수 축소
- 최소 1대, 최대 N대 (필요에 따라 조정)

### EBS
- 각 EC2에 부착된 블록 스토리지
- 매 턴마다 게임 상태를 JSON 파일로 EBS에 덤프
- EC2 재시작 시 EBS에서 게임 상태 복원

---

## 게임 흐름

### ① 로비
```
브라우저 → ALB → EC2 (아무거나)
  1. 닉네임 입력
  2. "방 만들기" → S3 rooms.json 업데이트 + game_id 발급
  3. "방 목록 보기" → S3 rooms.json 읽기
  4. 4명 모이면 → "게임 시작" 신호
```

### ② 게임 시작 (WebSocket 연결)
```
브라우저 → ALB → 특정 EC2 (game_id sticky session)
  - 4명 전원이 같은 EC2에 WebSocket 연결
  - EC2가 게임 방을 메모리에 로드
```

### ③ 게임 진행 (인게임)
```
플레이어 액션 (베팅/폴드/체크/레이즈)
  → WebSocket → EC2
  → 게임 로직 처리 (카드 딜, 팟 계산, 승자 판정 등)
  → 게임 상태를 EBS에 저장 (JSON 파일)
  → 4명에게 새 상태 브로드캐스트
```

### ④ 게임 종료
```
EC2 → 결과 JSON을 S3 history/{game_id}.json 저장
EC2 → S3 rooms.json에서 해당 방 제거
메모리에서 게임 상태 정리
```

---

## 게임 상태 포맷 (EBS 저장)

```json
{
  "game_id": "abc123",
  "phase": "flop",
  "players": [
    { "nickname": "홍길동", "chips": 1000, "hand": ["Ah", "Kd"], "status": "active" }
  ],
  "community_cards": ["2h", "7c", "Qs"],
  "deck": [...],
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
- **20초** 내 재접속 시 → EBS 상태에서 복귀 가능
- 20초 초과 → 게임 강제 종료, 나머지 플레이어에게 알림

### EC2 장애
- EBS에 저장된 마지막 게임 상태로 복원
- 클라이언트 재접속 → ALB가 재시작된 EC2로 재라우팅

### S3 rooms.json 동시 수정 (race condition)
- S3 Versioning 활성화
- 쓰기 전 ETag 비교로 충돌 감지 → 충돌 시 재시도

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React (S3 정적 호스팅) |
| 백엔드 | Node.js + ws (WebSocket 서버) |
| 게임 상태 저장 | JSON → EBS (로컬), S3 (히스토리) |
| 인프라 | EC2 (Auto Scaling), ALB, S3, EBS |

---

## 테스트 전략

- **로컬**: Node.js 서버 + React dev server, 4개 브라우저 탭으로 4명 시뮬레이션
- **AWS**: EC2 2대 올려서 sticky session 라우팅 동작 확인
