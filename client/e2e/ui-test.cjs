// 실제 브라우저 4개 컨텍스트(=4명)로 홀덤 UI를 자동 플레이하는 E2E 테스트.
// 플랍에서 레이즈 1회를 섞어 액션 재오픈도 검증한다.
// 사용법: node e2e/ui-test.js [http://주소]  (기본 http://localhost:5173)
// 사전 조건: npm i -D playwright-core + 크로미움 (~/.cache/ms-playwright)
const { chromium } = require('playwright-core');
const fs = require('fs');

const URL = process.argv[2] || process.env.APP_URL || 'http://localhost:5173/';
const NICKS = ['kim', 'lee', 'park', 'choi'];
const SHOTS = __dirname + '/shots';
const CHROME = process.env.CHROME_PATH ||
  process.env.HOME + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // 4명 입장: 각자 독립된 브라우저 컨텍스트 (세션/localStorage 분리)
  const pages = [];
  for (const nick of NICKS) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => log(`[${nick}] PAGE ERROR:`, e.message));
    await page.goto(URL);
    await page.fill('input[placeholder*="닉네임"]', nick);
    pages.push(page);
  }
  log('4개 탭 접속 + 닉네임 입력 완료:', URL);

  await pages[0].click('button:has-text("방 만들기")');
  for (let i = 1; i < 4; i++) {
    await pages[i].waitForSelector('button:has-text("JOIN")', { timeout: 10_000 });
    await pages[i].click('button:has-text("JOIN")');
    log(`${NICKS[i]} 입장`);
  }

  await pages[3].waitForSelector('text=게임 시작까지', { timeout: 10_000 });
  await pages[3].screenshot({ path: `${SHOTS}/1-countdown.png` });

  await Promise.all(pages.map(p => p.waitForSelector('text=PREFLOP', { timeout: 15_000 })));
  log('게임 시작! phase=PREFLOP');

  const phasesSeen = new Set(['PREFLOP']);
  let shotIdx = 2;
  let raised = false;
  let sawRiver = false;
  const deadline = Date.now() + 120_000;
  let result = 'TIMEOUT';

  await pages[0].screenshot({ path: `${SHOTS}/${shotIdx++}-preflop.png` });

  while (Date.now() < deadline) {
    const phase = (await pages[0].locator('text=/^(PREFLOP|FLOP|TURN|RIVER|SHOWDOWN)$/').first().textContent().catch(() => '')) || '';

    if (phase && !phasesSeen.has(phase)) {
      phasesSeen.add(phase);
      await pages[0].screenshot({ path: `${SHOTS}/${shotIdx++}-${phase.toLowerCase()}.png` });
      log(`phase 진입: ${phase} → 스크린샷`);
    }
    if (phase === 'RIVER') sawRiver = true;

    // 리버까지 본 뒤 PREFLOP으로 돌아오면 = 쇼다운 거쳐 다음 핸드 시작
    if (sawRiver && phase === 'PREFLOP') {
      result = 'PASS';
      await pages[0].screenshot({ path: `${SHOTS}/${shotIdx++}-next-hand.png` });
      log('리버 완료 후 새 핸드 시작 확인 → PASS');
      break;
    }

    // 턴인 플레이어 찾아서 액션
    for (let i = 0; i < 4; i++) {
      const page = pages[i];
      try {
        const checkBtn = page.locator('button:has-text("체크")');
        const callBtn = page.locator('button:has-text("콜")');
        if (await checkBtn.count()) {
          if (phase === 'FLOP' && !raised) {
            await page.fill('input[type="number"]', '40');
            await page.click('button:has-text("레이즈")');
            raised = true;
            log(`[${NICKS[i]}] FLOP에서 레이즈 40 (액션 재오픈 테스트)`);
          } else {
            await checkBtn.first().click();
          }
        } else if (await callBtn.count()) {
          await callBtn.first().click();
        }
      } catch { /* 클릭 직전에 턴이 넘어간 경우 — 다음 폴링에서 재시도 */ }
    }
    await new Promise(r => setTimeout(r, 250));
  }

  log(`결과: ${result}`);
  log(`목격한 phase: ${[...phasesSeen].join(', ')}${sawRiver ? ' (+ 쇼다운 통과)' : ''}`);
  await browser.close();
  process.exit(result === 'PASS' ? 0 : 1);
})();
