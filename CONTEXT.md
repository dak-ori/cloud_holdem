# Cloud Hold'em

닉네임만으로 즉시 참여 가능한 4인용 텍사스 홀덤 웹 게임. 여러 테이블이 동시에 운영되며, 게임 상태는 Redis에서 중앙 관리된다.

## Language

### 플레이어 & 식별

**Player (플레이어)**:
게임에 참가 중인 사람. 방 안에서 닉네임으로 표시되지만 시스템 내부는 `player_id`(UUID)로 식별.
_Avoid_: User, client, seat

**Nickname (닉네임)**:
플레이어가 입력하는 표시 이름. 같은 방 안에서만 유일성이 보장됨.
_Avoid_: Username, name, handle

**player_id**:
서버가 WebSocket 연결 시 발급하는 UUID. 재연결 시에도 동일 player_id로 게임 상태를 복원함.
_Avoid_: session_id, user_id

### 방 & 게임

**Room (방)**:
최대 4명이 모여 하나의 게임을 진행하는 단위. Redis `rooms` 해시에 저장. 게임 종료 시 삭제됨.
_Avoid_: Table, lobby, session

**game_id**:
방 생성 시 발급되는 UUID. Redis 키 `game:{game_id}`의 식별자.
_Avoid_: room_id, match_id

**Lobby (로비)**:
플레이어가 닉네임을 입력하고 방을 만들거나 입장하는 대기 화면. 게임 중이 아닌 상태.
_Avoid_: Main screen, home

### 게임 진행

**Hand (핸드)**:
카드를 딜하고 베팅을 진행하여 승자를 결정하는 한 라운드. 게임 내에서 여러 핸드가 반복됨.
_Avoid_: Round, game, deal

**Phase (페이즈)**:
핸드 내의 진행 단계. `preflop → flop → turn → river → showdown` 순서.
_Avoid_: Stage, step, round

**Community Cards (커뮤니티 카드)**:
테이블 가운데에 공개되어 모든 플레이어가 공유하는 카드. Flop(3장), Turn(1장), River(1장) 순으로 공개.
_Avoid_: Board, shared cards, table cards

**Hole Cards (홀 카드)**:
각 플레이어에게 비공개로 딜된 2장의 개인 카드.
_Avoid_: Pocket cards, private cards, hand cards

**Showdown (쇼다운)**:
River 이후 남은 플레이어들이 홀 카드를 공개하고 핸드를 비교하는 마지막 단계.
_Avoid_: Reveal, final, face-off

### 포지션 & 베팅

**Dealer Button (딜러 버튼)**:
각 핸드에서 딜러 역할을 나타내는 포지션 마커. 첫 핸드는 랜덤, 이후 시계 방향으로 이동.
_Avoid_: Button, dealer position, D

**Small Blind (SB)**:
딜러 버튼 왼쪽 첫 번째 플레이어가 강제로 내는 작은 베팅. 인원에 따라 변동(4명:10, 3명:20, 2명:40).
_Avoid_: Small bet, first blind

**Big Blind (BB)**:
딜러 버튼 왼쪽 두 번째 플레이어가 강제로 내는 큰 베팅. 항상 SB의 2배.
_Avoid_: Big bet, second blind

**Pot (팟)**:
현재 핸드에서 모든 플레이어가 베팅한 칩의 합계. 핸드 승자에게 지급됨.
_Avoid_: Prize, pool, total bet

**All-in (올인)**:
플레이어가 보유한 칩 전부를 베팅하는 액션. 사이드 팟 없이 단순화되어 있음.
_Avoid_: Push, shove

**Split Pot (스플릿 팟)**:
무승부 시 팟을 동점자들에게 균등 분배. 홀수 칩은 딜러 왼쪽 플레이어에게.
_Avoid_: Tie, draw, chop

### 탈락 & 종료

**Elimination (탈락)**:
칩이 0이 되거나 자동 폴드가 3회 연속으로 발생하여 방에서 퇴출되는 상태.
_Avoid_: Bust, out, removed

**Auto-fold (자동 폴드)**:
턴 타이머(20초) 초과 시 서버가 해당 플레이어 대신 폴드 처리하는 동작.
_Avoid_: Timeout fold, forced fold

**consecutive_auto_folds**:
플레이어가 연속으로 자동 폴드된 횟수. 3회 도달 시 탈락 처리.
_Avoid_: Timeout count, afk count

**Turn Deadline (턴 데드라인)**:
현재 턴 플레이어가 액션을 완료해야 하는 Unix timestamp. Redis `game:{game_id}:turn_deadline`에 저장.
_Avoid_: Turn timer, timeout, expiry

---

## Relationships

- **Room**은 하나의 **game_id**를 가지며, 최대 4명의 **Player**를 포함한다
- **Player**는 **player_id**로 식별되고, 하나의 **Room**에만 소속된다
- **Hand**는 **Room** 안에서 반복 진행되며, 각 **Hand**는 하나의 **Showdown** 또는 폴드로 종료된다
- **Phase**는 한 **Hand** 안에서 순서대로 진행된다: `preflop → flop → turn → river → showdown`
- **Pot**은 **Hand** 단위로 관리되며, **Showdown** 또는 마지막 플레이어에게 지급된다
- **Elimination**은 **Hand** 종료 시점에 처리된다 (자리는 다음 **Hand**부터 제거)

---

## Example dialogue

> **Dev:** "플레이어가 연결이 끊어지면 **Hand**는 어떻게 돼?"
>
> **Domain expert:** "**Turn Deadline**이 그대로 돌아가. 20초 안에 재연결 못 하면 **Auto-fold** 처리되고, **consecutive_auto_folds** 카운트가 올라가. 3번 되면 **Elimination**이야."
>
> **Dev:** "그 **Elimination**은 바로 처리돼?"
>
> **Domain expert:** "**Auto-fold**는 즉시 처리되는데, 자리 제거는 현재 **Hand**가 끝나고 나서야. 다음 **Hand** 시작할 때 **Room**에서 빠지는 거야. 근데 **Pot**은 그 **Hand**에서 이미 제외된 상태로 계산돼."

---

## Flagged ambiguities

- "게임"은 대화 중 **Room** 전체(여러 핸드)를 뜻하기도 하고 **Hand** 하나를 뜻하기도 했음 → 해결: 전체 세션은 **Room**, 개별 라운드는 **Hand**로 구분.
- "타이머"는 **Turn Deadline**을 가리킴 — `setTimeout`(EC2 메모리)이 아니라 Redis에 저장된 만료 시각.
