// Cloud Hold'em 발표 PPTX — 블랙&화이트 모던, 클라우드 인프라 중심 (16:9)
// 실행: node gen-pptx-bw.js  (사전: npm i pptxgenjs)
const pptxgen = require('pptxgenjs');
const path = require('path');
const A = path.resolve(__dirname, '../assets');
const OUT = path.resolve(__dirname, '../cloud-holdem-발표.pptx');

const INK = '111827';   // 본문 블랙
const DIM = '6B7280';   // 회색
const LINE = 'D1D5DB';  // 연한 선
const LIGHT = 'F9FAFB'; // 패널 배경

const p = new pptxgen();
p.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
p.layout = 'WIDE';

// ───────────────────────── 발표 대본 (슬라이드 순서대로)
const NOTES = [
  // 1 타이틀
  `안녕하세요. AWS 위에 구축한 실시간 멀티플레이어 텍사스 홀덤, Cloud Hold'em 발표를 시작하겠습니다.
이 발표는 게임 자체보다 "실시간 게임 서비스를 클라우드에서 어떻게 운영하는가" — 즉 AWS 아키텍처 설계가 중심입니다.`,
  // 2 개요
  `서비스를 간단히 소개하면, 회원가입 없이 닉네임만 입력하면 4명이 실시간으로 홀덤을 칠 수 있는 웹 게임입니다.
지금 화면의 주소로 실제 서비스가 AWS에 배포되어 돌아가고 있습니다.
오늘은 이 게임을 받치고 있는 클라우드 인프라를 하나씩 설명드리겠습니다.`,
  // 3 요구사항
  `먼저, 게임 서비스가 클라우드에 요구하는 조건입니다.
첫째, WebSocket 연결이 오래 유지되어야 하고. 둘째, 사용자가 늘면 서버도 자동으로 늘어야 합니다.
셋째, 서버 한 대가 장애 나도 게임이 사라지면 안 되고. 넷째, 여러 서버에 분산 접속해도 같은 게임이 일관되게 보여야 합니다.
이 네 가지를 만족시키는 것이 아키텍처 설계의 목표였습니다.`,
  // 4 아키텍처 그림
  `전체 아키텍처입니다. 번호 순서대로 흐름을 따라가 보겠습니다.
①번 S3가 웹사이트(React)를 서빙하고, ②번 ALB가 WebSocket 연결을 받아 ③번 ECS 클러스터의 컨테이너들에게 분산합니다.
모든 컨테이너는 ④번 ElastiCache Redis 하나를 공유해서 게임 상태를 읽고 씁니다.
끝난 게임은 ⑤번 S3에 기록으로 남고, ⑥번 ECR에서 컨테이너 이미지를 받아옵니다.
다음 두 장에서 이 흐름과 각 구성요소를 자세히 설명드리겠습니다.`,
  // 5 아키텍처 상세 - 흐름
  `요청 흐름을 단계별로 보면 —
① 사용자가 접속하면 S3 정적 웹사이트가 React 앱을 내려줍니다. 웹서버 EC2가 필요 없습니다.
② 앱은 ws 프로토콜로 ALB에 연결합니다. ALB는 헬스체크를 통과한 컨테이너에게만, 3개 가용영역에 걸쳐 분산 라우팅합니다.
③ 어떤 컨테이너가 받아도 동일하게 처리됩니다. 서버에 상태가 없기 때문입니다.
④ 게임 상태는 전부 Redis에 있고, "누가 베팅했다" 같은 이벤트는 Redis Pub/Sub으로 모든 컨테이너에 전파됩니다.
⑤ 게임이 끝나면 결과가 S3에 영구 저장되고, ⑥ 배포 시에는 ECR의 이미지를 받아 무중단으로 교체됩니다.`,
  // 6 아키텍처 상세 - 표
  `각 구성요소의 역할과 선택 이유를 표로 정리했습니다.
포인트만 짚으면 — ALB는 idle timeout을 1시간으로 늘려 WebSocket이 안 끊기게 했고, ECS는 컨테이너 수를, ASG는 EC2 수를 각각 자동 조절합니다.
ElastiCache가 이 아키텍처의 심장인데, 서버를 무상태로 만들어주는 단일 상태 저장소입니다.
모든 리소스는 서울 리전, 기본 VPC의 3개 가용영역에 걸쳐 있습니다.`,
  // 7 왜 ECS
  `컨테이너 오케스트레이션 선택 과정입니다. 처음엔 쿠버네티스(EKS)를 계획했지만, 관리 비용이 월 73달러 고정이고 학습 곡선이 가파릅니다. 컨테이너 몇 개 규모에는 과합니다.
Fargate도 검토했지만 24시간 상시 가동 서비스엔 EC2 방식이 더 저렴합니다.
그래서 ECS on EC2 — 관리비 무료, AWS 서비스와 네이티브 통합, 그리고 EC2를 직접 다루는 학습 효과까지 챙겼습니다.`,
  // 8 네트워크/AZ
  `네트워크 구성입니다. 서울 리전 기본 VPC의 서브넷 3개를 썼는데, 각각 다른 가용영역(데이터센터)에 있습니다.
ALB도, ECS 태스크도, EC2도 3개 영역에 분산 배치되어 데이터센터 하나가 통째로 장애 나도 서비스가 유지됩니다.
태스크는 awsvpc 모드라 각자 VPC IP를 갖고, 보안 그룹을 컨테이너 단위로 적용할 수 있습니다.`,
  // 9 상태관리
  `이 아키텍처의 핵심 설계입니다. 서버(컨테이너)는 완전한 Stateless — 메모리에 게임 데이터를 두지 않습니다.
카드, 칩, 턴, 타이머까지 전부 ElastiCache Redis에 있습니다.
덕분에 ① 어느 컨테이너가 죽어도 게임이 보존되고 ② sticky session 없이 아무 컨테이너나 요청을 처리하고 ③ 스케일 아웃이 자유롭습니다.
4명이 서로 다른 컨테이너에 붙어도 Pub/Sub으로 이벤트가 전파되어 같은 게임이 진행됩니다 — 실제 프로덕션에서 검증했습니다.`,
  // 10 ALB
  `ALB에서 가장 중요한 설정 하나만 꼽으면 idle timeout입니다.
기본 60초면 1분만 가만히 있어도 WebSocket이 끊깁니다. 3600초로 늘렸습니다.
타깃 타입은 ip로 해서 컨테이너의 ENI로 직접 라우팅하고, 30초마다 /health를 검사해 아픈 컨테이너는 라우팅에서 제외합니다.`,
  // 11 S3
  `S3는 용도가 다른 버킷 두 개입니다.
A는 정적 웹 호스팅 — 웹서버 없이 S3가 React 앱을 서빙합니다. 사실상 무료에 가깝고 관리할 서버가 없습니다.
B는 게임 히스토리 — 게임이 끝나면 결과 JSON이 저장됩니다. Redis가 "현재 진행 중인 상태"라면 S3는 "영구 기록"입니다. 핫 데이터와 콜드 데이터의 분리입니다.`,
  // 12 오토스케일링
  `오토스케일링은 2단입니다.
1단: 컨테이너 CPU가 70%를 넘으면 ECS가 컨테이너 수를 2~8개로 조절합니다.
2단: 컨테이너 들어갈 자리가 부족하면 Capacity Provider가 EC2 자체를 2~4대로 늘립니다.
트래픽 증가 → 컨테이너 증설 → 자리 부족 → EC2 증설까지 전부 자동이고, 한가하면 역순으로 줄어듭니다. 실습 중엔 밤마다 0대로 내려 비용을 아꼈습니다.`,
  // 13 보안
  `보안은 최소 권한 원칙입니다.
보안 그룹을 IP가 아닌 그룹 참조로 체인을 만들어서 — ALB는 인터넷에서 80만, EC2는 ALB에서만, Redis는 EC2에서만 받습니다. Redis는 인터넷에서 아예 도달 불가능합니다.
IAM 역할도 컨테이너용/배포용/EC2용 3개로 분리해 각자 필요한 권한만 갖습니다.
작업자 계정 권한도 필요할 때마다 최소로 추가받는 방식으로 운영했습니다.`,
  // 14 운영
  `운영 측면입니다. 배포는 이미지를 ECR에 올리고 명령 한 줄이면, 새 컨테이너가 헬스체크를 통과한 뒤에야 구버전이 내려가는 무중단 롤링 방식입니다.
로그와 CPU 지표는 CloudWatch로 모이고, 5xx 급증·컨테이너 이상을 잡는 알람 2개가 동작 중입니다.
검증은 실제 배포 환경에서 — 브라우저 4개가 자동으로 풀 게임을 완주하는 테스트로 했습니다.`,
  // 15 데모 스크린샷
  `실제 화면입니다. 왼쪽이 로비 — 닉네임 입력 후 방을 만들거나 입장하고, 4명이 모이면 자동 시작됩니다.
오른쪽이 게임 — 내 카드만 보이고, 자기 턴에만 20초 타이머와 액션 버튼이 나타납니다.`,
  // 16 데모 라이브
  `이제 라이브로 보여드리겠습니다. (미리 띄워둔 탭 4개로 전환)
문제가 생기면 당황하지 말고 앞의 스크린샷 슬라이드로 대체할 것.
발표 전 체크: EC2 2대 가동, 헬스체크 정상, S3 최신 배포.`,
  // 17 비용/마무리
  `비용은 EC2 2대, Redis, ALB 합쳐 월 약 78달러입니다. EKS였다면 73달러가 더 들었을 겁니다.
정리하면 — 상태를 밖으로 빼면(Stateless) 확장과 장애 복구가 쉬워지고, 관리형 서비스 조합이 직접 구축보다 운영 부담이 적으며, 안 쓸 때 끄는 것이 클라우드 비용 관리의 시작입니다.
이상입니다. 감사합니다.`,
];

let slideIdx = 0;
function slide() {
  const s = p.addSlide();
  s.background = { color: 'FFFFFF' };
  if (NOTES[slideIdx]) s.addNotes(NOTES[slideIdx]);
  slideIdx++;
  return s;
}
function kicker(s, t) {
  s.addText(t, { x: 0.7, y: 0.38, w: 11, h: 0.35, fontSize: 12, color: DIM, bold: true, charSpacing: 4, fontFace: 'Noto Sans KR' });
}
function title(s, t) {
  s.addText(t, { x: 0.7, y: 0.72, w: 12, h: 0.75, fontSize: 29, color: INK, bold: true, fontFace: 'Noto Sans KR' });
  s.addShape('line', { x: 0.72, y: 1.55, w: 1.1, h: 0, line: { color: INK, width: 2.5 } });
}
function bullets(s, items, opt = {}) {
  s.addText(items.map(([main, sub]) => ([
    { text: '—  ', options: { color: DIM, fontSize: (opt.fontSize || 16) } },
    { text: main, options: { color: INK, fontSize: opt.fontSize || 16, bold: true } },
    ...(sub ? [{ text: '  ' + sub, options: { color: DIM, fontSize: (opt.fontSize || 16) - 2.5 } }] : []),
    { text: '\n', options: {} },
  ])).flat(), {
    x: opt.x ?? 0.7, y: opt.y ?? 1.9, w: opt.w ?? 12, h: opt.h ?? 5,
    fontFace: 'Noto Sans KR', lineSpacingMultiple: 1.45, valign: 'top',
  });
}
function panel(s, x, y, w, h, head, body, opt = {}) {
  s.addShape('roundRect', { x, y, w, h, rectRadius: 0.06, fill: { color: opt.fill || LIGHT }, line: { color: LINE, width: 1 } });
  s.addText(head, { x: x + 0.25, y: y + 0.15, w: w - 0.5, h: 0.4, fontSize: 12.5, color: INK, bold: true, charSpacing: 2, fontFace: 'Noto Sans KR' });
  s.addText(body, { x: x + 0.25, y: y + 0.55, w: w - 0.5, h: h - 0.75, fontSize: opt.fontSize || 14, color: '374151', fontFace: 'Noto Sans KR', valign: 'top', lineSpacingMultiple: 1.35 });
}

// ───── 1. 타이틀
let s = slide();
s.addText('CLOUD COMPUTING PROJECT', { x: 0.7, y: 2.2, w: 12, h: 0.4, fontSize: 13, color: DIM, charSpacing: 6, align: 'center', fontFace: 'Noto Sans KR' });
s.addText("CLOUD HOLD'EM", { x: 0.7, y: 2.7, w: 12, h: 1.2, fontSize: 56, bold: true, color: INK, align: 'center', charSpacing: 3, fontFace: 'Noto Sans KR' });
s.addShape('line', { x: 5.92, y: 4.05, w: 1.5, h: 0, line: { color: INK, width: 2.5 } });
s.addText('AWS ECS 기반 실시간 멀티플레이어 텍사스 홀덤', { x: 0.7, y: 4.25, w: 12, h: 0.5, fontSize: 19, color: DIM, align: 'center', fontFace: 'Noto Sans KR' });
s.addText('발표자: ___________   ·   2026.06', { x: 0.7, y: 5.7, w: 12, h: 0.4, fontSize: 13, color: DIM, align: 'center', fontFace: 'Noto Sans KR' });

// ───── 2. 개요
s = slide();
kicker(s, '01 — OVERVIEW');
title(s, '프로젝트 개요');
bullets(s, [
  ['4인 텍사스 홀덤 웹 게임', '— 회원가입 없이 닉네임만으로 즉시 플레이'],
  ['실시간 멀티플레이어', '— WebSocket 양방향 통신, 20초 턴 타이머'],
  ['AWS에 실제 배포·운영 중', '— 아래 주소에서 바로 접속 가능'],
], { w: 6.4, fontSize: 16 });
panel(s, 0.7, 4.2, 6.1, 1.9, '서비스 주소', 'http://holdem-client-026951011097\n.s3-website.ap-northeast-2.amazonaws.com', { fontSize: 13 });
s.addImage({ path: `${A}/lobby.png`, x: 7.3, y: 1.7, w: 5.3, h: 5.3 * 0.86 });

// ───── 3. 요구사항
s = slide();
kicker(s, '02 — REQUIREMENTS');
title(s, '게임 서비스가 클라우드에 요구하는 것');
bullets(s, [
  ['연결 유지', '— WebSocket이 게임 내내 끊기지 않아야 한다'],
  ['탄력적 확장', '— 사용자가 늘면 서버도 자동으로 늘어야 한다'],
  ['장애 격리', '— 서버 한 대가 죽어도 진행 중인 게임은 보존'],
  ['분산 일관성', '— 4명이 서로 다른 서버에 붙어도 같은 게임'],
], { fontSize: 18 });
panel(s, 0.7, 5.1, 12, 1.7, '설계 원칙', '서버는 Stateless로, 상태는 관리형 저장소(ElastiCache)로, 확장·복구·라우팅은 AWS 관리형 서비스에 위임한다');

// ───── 4. 아키텍처
s = slide();
kicker(s, '03 — ARCHITECTURE');
title(s, '전체 아키텍처');
s.addImage({ path: `${A}/architecture-bw.png`, x: 1.07, y: 1.6, w: 11.2, h: 11.2 * (800 / 1400) * 0.88 });

// ───── 5. 아키텍처 상세 — 흐름
s = slide();
kicker(s, '03 — ARCHITECTURE · DETAIL');
title(s, '요청 흐름 따라가기');
const flows = [
  ['①  정적 콘텐츠', 'S3 정적 웹 호스팅이 React 앱(HTML/JS)을 서빙 — 웹서버 EC2 불필요, 사실상 무료'],
  ['②  WebSocket 연결', '앱이 ws://로 ALB에 연결. ALB는 헬스체크 통과한 컨테이너에만, 3개 가용영역에 분산 라우팅'],
  ['③  게임 처리', '어느 컨테이너가 받아도 동일 — 서버에 상태가 없기 때문 (Stateless)'],
  ['④  상태 저장·전파', '게임 상태는 전부 ElastiCache Redis에. 이벤트는 Pub/Sub으로 모든 컨테이너에 전파'],
  ['⑤  영구 기록', '게임 종료 시 결과 JSON을 S3 히스토리 버킷에 저장'],
  ['⑥  이미지·관측', '배포 시 ECR에서 이미지 pull, 로그·지표는 CloudWatch 수집'],
];
flows.forEach(([head, body], i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = 0.7 + col * 6.2, y = 1.85 + row * 1.72;
  s.addShape('roundRect', { x, y, w: 5.9, h: 1.55, rectRadius: 0.06, fill: { color: LIGHT }, line: { color: LINE, width: 1 } });
  s.addText(head, { x: x + 0.22, y: y + 0.1, w: 5.5, h: 0.4, fontSize: 14.5, color: INK, bold: true, fontFace: 'Noto Sans KR' });
  s.addText(body, { x: x + 0.22, y: y + 0.5, w: 5.5, h: 1.0, fontSize: 12.5, color: '374151', fontFace: 'Noto Sans KR', valign: 'top', lineSpacingMultiple: 1.25 });
});

// ───── 6. 아키텍처 상세 — 구성요소 표
s = slide();
kicker(s, '03 — ARCHITECTURE · COMPONENTS');
title(s, '구성요소별 역할과 선택 이유');
const headOpt = { bold: true, color: INK, fill: { color: 'EFF1F5' } };
const rows = [
  [{ text: '서비스', options: headOpt }, { text: '역할', options: headOpt }, { text: '핵심 설정', options: headOpt }, { text: '왜 이걸 썼나', options: headOpt }],
  ['S3 (버킷 A)', '프론트엔드 정적 호스팅', 'GetObject만 퍼블릭', '서버 없이 웹 서빙, 비용 ≈ 0'],
  ['ALB', 'WebSocket 로드밸런서', 'idle 3600s · target-type ip · /health', 'L7 헬스체크 + ws 업그레이드 지원'],
  ['ECS (EC2)', '컨테이너 오케스트레이션', '태스크 2~8개 · awsvpc', '관리비 무료, AWS 네이티브 통합'],
  ['EC2 ASG', '컴퓨팅 (노드)', 't3.small 2~4대 · Capacity Provider', '컨테이너 자리 자동 증감'],
  ['ElastiCache', '게임 상태 단일 저장소', 'Redis 7 · cache.t3.micro', '서버 Stateless화의 핵심'],
  ['S3 (버킷 B)', '게임 히스토리 영구 기록', '종료 시 JSON 저장', '핫(Redis)/콜드(S3) 분리'],
  ['ECR · CloudWatch', '이미지 저장 · 관측', '롤링 배포 · 알람 2종', '배포·운영 자동화'],
];
s.addTable(rows, {
  x: 0.7, y: 1.85, w: 12, color: '374151', fontSize: 12.5, fontFace: 'Noto Sans KR',
  border: { type: 'solid', color: LINE, pt: 0.75 }, rowH: 0.58, valign: 'middle',
});

// ───── 7. 왜 ECS
s = slide();
kicker(s, '04 — WHY ECS');
title(s, '왜 ECS(EC2)인가');
panel(s, 0.7, 1.85, 3.9, 4.0, 'EKS (Kubernetes)', '관리비 $73/월 고정\n+ 가파른 학습 곡선\n\n컨테이너 몇 개 규모에는 과한 복잡도\n\n→ 제외', { fontSize: 14 });
panel(s, 4.75, 1.85, 3.9, 4.0, 'ECS Fargate', '서버 관리 완전 위임\n대신 단가 높음\n\n24시간 상시 가동에는 EC2보다 비쌈\n\n→ 제외', { fontSize: 14 });
panel(s, 8.8, 1.85, 3.9, 4.0, '✔ ECS on EC2 (선택)', '클러스터 관리비 무료\nALB·ASG·CloudWatch 네이티브 통합\n\n상시 가동 시 최저 비용\n+ EC2 직접 운영 경험', { fill: 'FFFFFF', fontSize: 14 });
s.addShape('roundRect', { x: 8.8, y: 1.85, w: 3.9, h: 4.0, rectRadius: 0.06, fill: { type: 'none' }, line: { color: INK, width: 2 } });
s.addText('기술 선택 기준은 유행이 아니라 "규모에 맞는 복잡도"', { x: 0.7, y: 6.2, w: 12, h: 0.5, fontSize: 15, color: DIM, italic: true, fontFace: 'Noto Sans KR' });

// ───── 8. 네트워크/AZ
s = slide();
kicker(s, '05 — NETWORK & AZ');
title(s, '네트워크와 가용영역 — 데이터센터 장애에 견디기');
bullets(s, [
  ['서울 리전 · Default VPC · 서브넷 3개', '— 각각 다른 가용영역(AZ) = 물리적으로 다른 데이터센터'],
  ['ALB·ECS 태스크·EC2 모두 3개 AZ에 분산 배치', '— AZ 하나가 통째로 장애 나도 서비스 유지'],
  ['awsvpc 네트워크 모드', '— 컨테이너마다 자체 VPC IP(ENI), 보안 그룹을 컨테이너 단위로 적용'],
  ['프라이빗 통신', '— Redis는 VPC 내부 통신만, 인터넷 노출 없음'],
], { fontSize: 17 });
panel(s, 0.7, 5.3, 12, 1.5, 'AZ 분산의 의미', '"서버 두 대"가 아니라 "서로 다른 데이터센터에 있는 서버 두 대" — 같은 비용으로 얻는 고가용성');

// ───── 9. 상태관리
s = slide();
kicker(s, '06 — STATE MANAGEMENT');
title(s, 'Stateless 서버 + ElastiCache — 이 아키텍처의 심장');
bullets(s, [
  ['서버(컨테이너)는 아무것도 기억하지 않는다', '— 카드·칩·턴·타이머 전부 Redis에'],
  ['그래서 가능한 것 ①', '어느 컨테이너가 죽어도 게임 보존 → 새 컨테이너가 이어서 처리'],
  ['그래서 가능한 것 ②', 'sticky session 불필요 → 아무 컨테이너나 요청 처리'],
  ['그래서 가능한 것 ③', '스케일 아웃 자유 → 컨테이너를 늘리기만 하면 됨'],
], { w: 6.7, fontSize: 15.5 });
panel(s, 7.6, 1.85, 5.1, 4.4, '프로덕션에서 검증', '4명의 클라이언트가 ALB를 거쳐 서로 다른 컨테이너에 분산 접속한 상태로 풀 게임 완주 ✓\n\nRedis Pub/Sub이 "누가 베팅했다"를 모든 컨테이너에 전파 — 분산 환경에서도 4명이 같은 게임을 본다', { fontSize: 14 });

// ───── 10. ALB
s = slide();
kicker(s, '07 — LOAD BALANCER');
title(s, 'ALB — WebSocket을 위한 설정');
bullets(s, [
  ['idle timeout 3600초', '— 기본 60초면 1분 방치 시 연결 끊김. 이 한 줄이 WebSocket 서비스의 핵심'],
  ['target-type: ip', '— 컨테이너의 ENI로 직접 라우팅 (awsvpc 모드와 한 쌍)'],
  ['헬스체크 GET /health · 30초', '— 실패 3회면 라우팅 제외, 회복 2회면 복귀'],
  ['ws:// 업그레이드 네이티브 지원', '— 별도 설정 없이 WebSocket 통과'],
], { fontSize: 17 });

// ───── 11. S3
s = slide();
kicker(s, '08 — STORAGE');
title(s, 'S3 — 정적 호스팅과 게임 히스토리');
panel(s, 0.7, 1.85, 5.9, 4.6, '버킷 A — 정적 웹 호스팅', '· 웹서버 없이 S3가 React 앱 서빙\n\n· 버킷 정책으로 GetObject만 퍼블릭 허용\n\n· 배포는 aws s3 sync 한 줄\n\n· 비용 사실상 0, 관리할 서버 없음', { fontSize: 14.5 });
panel(s, 6.9, 1.85, 5.9, 4.6, '버킷 B — 게임 히스토리', '· 게임 종료 시 결과 JSON 저장 (승자·최종 칩)\n\n· 컨테이너 IAM 역할에 이 버킷 쓰기 권한만 부여\n\n· Redis = 진행 중인 상태 (핫)\n  S3 = 끝난 게임의 영구 기록 (콜드)\n\n· 저장 실패해도 게임 흐름은 비차단', { fontSize: 14.5 });

// ───── 12. 오토스케일링
s = slide();
kicker(s, '09 — AUTO SCALING');
title(s, '2단 Auto Scaling — 컨테이너와 EC2가 따로 늘어난다');
panel(s, 0.7, 1.85, 5.9, 2.2, '1단 · 컨테이너 (ECS Service)', 'CPU 70% 타깃 트래킹\n컨테이너 2 ~ 8개 자동 조절', { fontSize: 15 });
panel(s, 0.7, 4.3, 5.9, 2.2, '2단 · EC2 (Capacity Provider)', '컨테이너 들어갈 자리가 부족하면\nEC2를 2 ~ 4대로 자동 증설', { fontSize: 15 });
panel(s, 6.9, 1.85, 5.9, 4.65, '동작 시나리오', '트래픽 증가\n→ 컨테이너 CPU 70% 초과\n→ 컨테이너 증설 (1단)\n→ EC2에 빈 자리 부족\n→ EC2 증설 (2단)\n\n한가해지면 역순으로 자동 축소\n실습 중엔 밤마다 0대로 — 비용 절약', { fontSize: 15 });

// ───── 13. 보안
s = slide();
kicker(s, '10 — SECURITY');
title(s, '최소 권한 — 보안 그룹 체인과 IAM 분리');
s.addShape('roundRect', { x: 0.7, y: 1.85, w: 12, h: 0.95, rectRadius: 0.06, fill: { color: LIGHT }, line: { color: LINE, width: 1 } });
s.addText([
  { text: 'ALB-SG', options: { bold: true, color: INK } },
  { text: ' (80 ← 인터넷)   →   ', options: { color: DIM } },
  { text: 'EC2-SG', options: { bold: true, color: INK } },
  { text: ' (3001 ← ALB만)   →   ', options: { color: DIM } },
  { text: 'Redis-SG', options: { bold: true, color: INK } },
  { text: ' (6379 ← EC2만)', options: { color: DIM } },
], { x: 0.9, y: 1.92, w: 11.6, h: 0.8, fontSize: 16, align: 'center', fontFace: 'Noto Sans KR' });
bullets(s, [
  ['IP가 아닌 보안 그룹 참조로 인바운드 제한', '— Redis는 인터넷에서 도달 자체가 불가'],
  ['IAM 역할 3종 분리', '— 컨테이너(히스토리 쓰기만) / 배포(ECR·로그만) / EC2(클러스터 등록만)'],
  ['작업자 계정도 최소 권한', '— 필요한 액션만 정책 파일로 관리하며 점진 확장'],
], { y: 3.2, fontSize: 16 });

// ───── 14. 운영
s = slide();
kicker(s, '11 — OPERATIONS');
title(s, '운영 — 무중단 배포와 모니터링');
bullets(s, [
  ['무중단 롤링 배포', '— 새 컨테이너가 헬스체크 통과 후에만 구버전 종료 (minimumHealthy 100%)'],
  ['배포 절차 = 이미지 push + 명령 한 줄', '— ECR → update-service'],
  ['CloudWatch 로그·지표 수집 + 알람 2종', '— ALB 5xx 급증, 컨테이너 unhealthy'],
  ['실배포 환경 검증', '— 브라우저 4개 자동 조작으로 프로덕션 풀 게임 완주 테스트'],
], { fontSize: 17 });

// ───── 15. 데모 (스크린샷)
s = slide();
kicker(s, '12 — DEMO · SCREENSHOTS');
title(s, '게임 화면');
s.addImage({ path: `${A}/lobby.png`, x: 0.7, y: 1.8, w: 5.9, h: 5.9 * 0.86 });
s.addImage({ path: `${A}/game-table.png`, x: 6.9, y: 1.8, w: 5.5, h: 5.5 * 0.917 });

// ───── 16. 데모 (라이브)
s = slide();
kicker(s, '12 — LIVE DEMO');
title(s, '라이브 데모');
const steps = [
  '브라우저 탭 4개로 접속 (시크릿 창 혼용)',
  '탭1: 닉네임 입력 → 방 만들기',
  '탭2~4: 같은 방 JOIN → 5초 카운트다운',
  '베팅 한 바퀴 → 플랍 공개',
  '탭 하나 방치 → 20초 자동 폴드 시연',
  '쇼다운 → 칩 정산 → 다음 핸드 자동 시작',
];
steps.forEach((t, idx) => {
  s.addShape('ellipse', { x: 0.7, y: 1.85 + idx * 0.8, w: 0.48, h: 0.48, fill: { color: INK } });
  s.addText(String(idx + 1), { x: 0.7, y: 1.85 + idx * 0.8, w: 0.48, h: 0.48, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
  s.addText(t, { x: 1.4, y: 1.85 + idx * 0.8, w: 5.6, h: 0.6, fontSize: 15, color: INK, valign: 'middle', fontFace: 'Noto Sans KR' });
});
panel(s, 7.4, 1.85, 5.3, 4.8, '접속 주소 & 체크리스트', 'http://holdem-client-026951011097\n.s3-website.ap-northeast-2.amazonaws.com\n\n(백업: 로컬 localhost:5173)\n\n발표 전 체크\n· EC2 2대 가동 (ASG desired 2)\n· ALB 타깃 healthy 확인\n· S3 최신 배포 확인', { fontSize: 13.5 });

// ───── 17. 비용/마무리
s = slide();
kicker(s, '13 — COST & LESSONS');
title(s, '비용과 배운 점');
const costHead = { bold: true, color: INK, fill: { color: 'EFF1F5' } };
const costRows = [
  [{ text: '리소스', options: costHead }, { text: '사양', options: costHead }, { text: '월 예상', options: costHead }],
  ['EC2 (ECS 노드)', 't3.small ×2', '~$42'],
  ['ElastiCache', 'cache.t3.micro', '~$18'],
  ['ALB', '+ LCU', '~$17+'],
  ['S3 / ECR', '정적 + 이미지', '~$1'],
  [{ text: '합계 (EKS였다면 +$73)', options: { bold: true } }, '', { text: '~$78', options: { bold: true, fontSize: 16 } }],
];
s.addTable(costRows, { x: 0.7, y: 1.9, w: 5.9, color: '374151', fontSize: 13, fontFace: 'Noto Sans KR', border: { type: 'solid', color: LINE, pt: 0.75 }, rowH: 0.52 });
bullets(s, [
  ['상태를 밖으로 빼면(Stateless) 확장·복구가 쉬워진다', ''],
  ['관리형 서비스 조합 > 직접 구축', '— 운영 부담이 다르다'],
  ['고가용성은 "여러 대"가 아니라 "여러 AZ"', ''],
  ['안 쓸 때 끄기 — 클라우드 비용은 습관', ''],
], { x: 7.0, y: 1.9, w: 5.7, fontSize: 14.5 });
s.addText('감사합니다', { x: 7.0, y: 5.7, w: 5.7, h: 0.6, fontSize: 22, bold: true, color: INK, fontFace: 'Noto Sans KR' });

p.writeFile({ fileName: OUT }).then(() => console.log('PPTX 생성 완료:', OUT));
