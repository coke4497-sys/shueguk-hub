#!/usr/bin/env node
/* 티쳐스 활동 기록(activity.html — 2026-10-29 원장님 '따로 두기', 마이그레이션 202610290001) 검증.
 *   NODE_PATH=$(npm root -g) node tools/activity-e2e-test.js
 * 가짜 수파베이스로 원장님만 보기·슈국 운영 카드·flush 호출·알림 글·날짜별 기록·거르기·더 보기·#n 강조·휴대폰을 확인한다. */
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
const BOSS = 'aaaaaaaa-0000-0000-0000-000000000001', HEEJU = 'cccccccc-0000-0000-0000-000000000003';
const ACC = {
  [BOSS]: { user_id: BOSS, login_id: 'admin', display_name: '이수경', role: 'admin', active: true },
  [HEEJU]: { user_id: HEEJU, login_id: 'heeju', display_name: '고희주', role: 'assistant', active: true },
};
// 활동 기록 — 오늘 2건(즉시 1) + 어제 2건, 알림 2건(즉시 보냄·요약 아직)
const NOW = Date.now(), D = 86400e3;
const iso = (t) => new Date(t).toISOString();
const LOG = [
  { id: 4, at: iso(NOW - 5 * 60e3), page: 'shueguk-report/timetable.html', what: '출석', action: '출석', target: '고1 가 · 10/29', detail: '김민준 출석', author: '고희주', urgent: false },
  { id: 3, at: iso(NOW - 30 * 60e3), page: 'shueguk-report/timetable.html', what: '시험 범위', action: '저장 (입력 완료)', target: '고1 화정 · 26-2-기말', detail: '교과서: 천재수 공통국어2', author: '김현지', urgent: true },
  { id: 2, at: iso(NOW - D), page: 'shueguk-report/timetable.html', what: '출석', action: '지각', target: '고2 나 · 10/28', detail: '박서연 지각', author: '최예나', urgent: false },
  { id: 1, at: iso(NOW - D - 3600e3), page: 'shueguk-report/m.html', what: '지필 리포트', action: '등록', target: '26-2-기말-화정고1-공통국어2', detail: '', author: '이수경', urgent: true },
];
const NOTES = [
  { id: 2, at: iso(NOW - 10 * 60e3), kind: '요약', text: '티쳐스 활동 요약 · 10/29 12:00~14:00 · 3건\n· 출석 출석 3건 (고희주 2, 최예나 1)', pushed_at: null },
  { id: 1, at: iso(NOW - 30 * 60e3), kind: '즉시', text: '[시험 범위] 김현지 · 저장 (입력 완료) · 고1 화정 · 26-2-기말\n교과서: 천재수 공통국어2', pushed_at: iso(NOW - 30 * 60e3 + 2000) },
];
(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
  }).listen(0);
  const PORT = server.address().port;
  const browser = await chromium.launch();
  const calls = [];
  async function open(file, uid, hash){
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    await ctx.addInitScript((uid) => localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({
      access_token: 'tok-' + uid, refresh_token: 'refresh-tok', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid } })), uid);
    await ctx.route('**/*', async route => {
      const req = route.request(), url = req.url();
      const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(obj) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      if (url.startsWith('http://127.0.0.1:' + PORT)) return route.continue();
      if (!url.startsWith(SB)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      const p = url.slice(SB.length), auth = req.headers()['authorization'] || '';
      const me = ACC[(auth.match(/^Bearer tok-(.+)$/) || [])[1]];
      if (p.startsWith('/rest/v1/teacher_accounts')) return json(me ? [me] : []);
      if (p.startsWith('/functions/v1/activity')){ calls.push({ auth, body: JSON.parse(req.postData() || '{}') }); return json({ digest: 'none', repush: { tried: 0 } }); }
      const off = Number((p.match(/offset=(\d+)/) || [])[1] || 0), lim = Number((p.match(/limit=(\d+)/) || [])[1] || 1000);
      if (p.startsWith('/rest/v1/activity_log')){ calls.push({ auth, log: p }); if (!me || me.role !== 'admin') return json([]); return json(off === 0 ? LOG : []); }
      if (p.startsWith('/rest/v1/activity_notices')){ if (!me || me.role !== 'admin') return json([]); return json(off === 0 ? NOTES : []); }
      return json([]);
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => { fail++; console.log('  ✗ pageerror', e.message); });
    await page.goto('http://127.0.0.1:' + PORT + '/' + file + (hash || ''));
    return { ctx, page };
  }
  const t = s => s.replace(/\s+/g, ' ');

  console.log('① 원장님만');
  let { ctx, page } = await open('activity.html', HEEJU);
  await page.waitForSelector('#deny:not([hidden])');
  ok(await page.locator('#app').isHidden() && !calls.some(c => c.log), '조교는 안내만 — 표도 flush 도 부르지 않음');
  await ctx.close();
  ({ ctx, page } = await open('ops.html', HEEJU));
  await page.waitForSelector('.card'); await page.waitForTimeout(300);
  ok(!(await page.textContent('#list')).includes('티쳐스 활동 기록'), '조교 운영 메뉴에는 카드 없음');
  await ctx.close();
  ({ ctx, page } = await open('ops.html', BOSS));
  await page.waitForFunction(() => document.querySelector('#list').textContent.includes('티쳐스 활동 기록'));
  ok(await page.locator('a.card[href="activity.html"]').count() === 1, '원장님 운영 메뉴에 [티쳐스 활동 기록] 카드');
  await ctx.close();

  console.log('② 알림 · 기록');
  calls.length = 0;
  ({ ctx, page } = await open('activity.html', BOSS));
  await page.waitForSelector('.day');
  await page.waitForFunction(() => window.__f = true);
  await page.waitForTimeout(300);
  const fl = calls.find(c => c.body && c.body.action === 'flush');
  ok(fl && fl.auth === 'Bearer tok-' + BOSS, '열면 flush 를 원장님 신분으로 한 번 부른다');
  ok(calls.filter(c => c.body && c.body.action === 'flush').length === 1, 'flush 는 한 번');
  ok(calls.find(c => c.log) && calls.find(c => c.log).auth === 'Bearer tok-' + BOSS && /order=id\.desc/.test(calls.find(c => c.log).log), '활동 기록을 원장님 신분으로 최신순 조회');
  ok((await page.$$('.nt')).length === 2, '알림 글 2건');
  const n1 = await page.textContent('#n1'), n2 = await page.textContent('#n2');
  ok(/\[시험 범위\] 김현지/.test(n1) && /바로 알림/.test(n1) && /휴대폰으로 보냄/.test(n1), '즉시 알림 — 제목 줄·바로 알림·보낸 시각');
  ok(/묶음 요약/.test(n2) && /아직 못 보냄/.test(n2), '요약 알림 — 아직 못 보냄 표시');
  ok(/최근 2건/.test(await page.textContent('#ntSum')) && await page.locator('#ntMore').isHidden(), '알림 건수 · 20건 미만이면 더 보기 없음');
  const days = await page.$$eval('.day h3', a => a.map(e => e.textContent.replace(/\s+/g, ' ')));
  ok(days.length === 2 && /오늘/.test(days[0]) && /2건/.test(days[0]) && !/오늘/.test(days[1]), '날짜별 묶음 — 오늘 2건, 어제 2건: ' + days.join(' | '));
  ok(/오늘 2건/.test(t(await page.textContent('#sum'))) && /바로 알린 일 2건/.test(t(await page.textContent('#sum'))), '요약 줄');
  const rows = await page.$$eval('.day tbody tr', a => a.map(e => e.className + ':' + e.querySelector('td.who').textContent));
  ok(JSON.stringify(rows) === JSON.stringify([':고희주', 'urg:김현지', ':최예나', 'urg:이수경']), '줄 순서·바로 알린 일 표시: ' + rows);
  ok(/교과서: 천재수 공통국어2/.test(await page.textContent('.day')), '내용 칸');
  const whats = await page.$$eval('#selWhat option', a => a.map(o => o.value));
  ok(JSON.stringify(whats) === JSON.stringify(['', '출석', '시험 범위', '지필 리포트']), '종류 드롭다운은 많은 순: ' + whats);
  ok((await page.$$eval('#selWho option', a => a.map(o => o.value))).length === 5, '사람 드롭다운 4명');

  console.log('③ 거르기');
  await page.selectOption('#selWhat', '출석'); await page.waitForTimeout(100);
  ok((await page.$$('.day tbody tr')).length === 2 && /지금 2건 보는 중/.test(t(await page.textContent('#sum'))), '종류 거르기');
  await page.selectOption('#selWhat', ''); await page.selectOption('#selWho', '김현지'); await page.waitForTimeout(100);
  ok((await page.$$('.day tbody tr')).length === 1 && (await page.$$('.day')).length === 1, '사람 거르기(날짜 묶음도 줄어듦)');
  await page.selectOption('#selWho', ''); await page.check('#urgOnly'); await page.waitForTimeout(100);
  ok((await page.$$('.day tbody tr')).length === 2 && (await page.$$('.day tbody tr.urg')).length === 2, '[바로 알린 일만]');
  await page.uncheck('#urgOnly'); await page.fill('#q', '박서연'); await page.waitForTimeout(100);
  ok((await page.$$('.day tbody tr')).length === 1 && await page.evaluate(() => document.activeElement.id === 'q'), '내용 찾기 — 입력칸은 그대로(한글 조합)');
  await page.fill('#q', '없는글'); await page.waitForTimeout(100);
  ok(/조건에 맞는 기록이 없습니다/.test(await page.textContent('#view')), '조건에 맞는 것이 없으면 안내');
  await page.fill('#q', '');
  ok(await page.locator('#lgMore').isHidden(), '300건 미만이면 더 보기 없음');
  await ctx.close();

  console.log('④ 알림 번호로 열기 · 휴대폰');
  ({ ctx, page } = await open('activity.html', BOSS, '#n2'));
  await page.waitForSelector('#n2.hl');
  ok((await page.$$('.nt.hl')).length === 1, '#n2 로 오면 그 알림만 강조');
  await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '휴대폰 가로 넘침 없음');
  await ctx.close();

  console.log('⑤ 비어 있을 때');
  LOG.length = 0; NOTES.length = 0;
  ({ ctx, page } = await open('activity.html', BOSS));
  await page.waitForSelector('.empty');
  ok(/아직 기록이 없습니다/.test(await page.textContent('#view')) && /아직 보낸 알림이 없습니다/.test(await page.textContent('#notices')), '빈 안내');
  await ctx.close();

  await browser.close(); server.close();
  console.log(`\n${pass} 통과 · ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
