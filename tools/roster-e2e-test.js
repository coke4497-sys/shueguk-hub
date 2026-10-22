#!/usr/bin/env node
/* 티쳐스 '학생 명단'(roster.html — 2026-10-22 수정 요청함 최예나) 검증.
 *   NODE_PATH=$(npm root -g) node tools/roster-e2e-test.js
 * 가짜 수파베이스로 학교별·학년별 묶음·퇴원 제외·학년 표기·고르기·이름 찾기·연락처 숨기기·표 복사를 확인한다. */
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
const STUS = [
  { name: '김나연', school: '도래울고', grade: '2026 고등 1학년', teacher: '이은지', class_a: '토11:00', class_b: '수5:30', naeshin_a: '', naeshin_b: '', enrolled: '재원', phone_student: '01011112222', phone_parent1: '010-3333-4444', phone_parent2: '' },
  { name: '박지현', school: '화수고', grade: '2026 고등 2학년', teacher: '김지원', class_a: '금5:30', class_b: '', naeshin_a: '', naeshin_b: '', enrolled: '재원', phone_student: '', phone_parent1: '01055556666', phone_parent2: '' },
  { name: '가나다', school: '화수고', grade: '2026 고등 1학년', teacher: '김지원', class_a: '', class_b: '', naeshin_a: '', naeshin_b: '', enrolled: '재원', phone_student: '', phone_parent1: '', phone_parent2: '' },
  { name: '이서윤', school: '화수중', grade: '2026 중등 2학년', teacher: '배선주', class_a: '', class_b: '', naeshin_a: '', naeshin_b: '', enrolled: '', phone_student: '', phone_parent1: '', phone_parent2: '' },
  { name: '퇴원생', school: '화수고', grade: '2026 고등 1학년', teacher: '', class_a: '', class_b: '', naeshin_a: '', naeshin_b: '', enrolled: '퇴원', phone_student: '', phone_parent1: '', phone_parent2: '' }
];
(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
  }).listen(0);
  const PORT = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({
    access_token: 'tok', refresh_token: 'refresh-tok', expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '11111111-1111-1111-1111-111111111111' } })));
  let auth = '';
  await ctx.route('**/*', async route => {
    const req = route.request(), url = req.url();
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(obj) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (url.startsWith('http://127.0.0.1:' + PORT)) return route.continue();
    if (!url.startsWith(SB)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    const p = url.slice(SB.length);
    if (p.startsWith('/rest/v1/teacher_accounts')) return json([{ user_id: '11111111-1111-1111-1111-111111111111', login_id: 'tester', display_name: '테스트', role: 'assistant', active: true }]);
    if (p.startsWith('/rest/v1/students')){ auth = req.headers()['authorization']; return json(/offset=0/.test(p) ? STUS : []); }
    return json([]);
  });
  const pg = await ctx.newPage();
  let perr = 0; pg.on('pageerror', e => { perr++; console.log('  ✗ pageerror', e.message); });
  await pg.goto('http://127.0.0.1:' + PORT + '/roster.html');
  await pg.waitForSelector('.grp');
  ok(auth === 'Bearer tok', '교사 인증으로 학생 표 조회');
  const t = s => s.replace(/\s+/g, ' ');
  ok(/재원생 4명/.test(await pg.textContent('#sum')), '퇴원생 빼고 4명');
  let heads = await pg.$$eval('.grp h3', a => a.map(e => e.firstChild.textContent.trim()));
  ok(JSON.stringify(heads) === JSON.stringify(['도래울고', '화수고', '화수중']), '학교별 묶음 가나다: ' + heads);
  const hs = await pg.$$eval('.grp:nth-child(2) td.nm', a => a.map(e => e.textContent));
  ok(JSON.stringify(hs) === JSON.stringify(['가나다', '박지현']), '학교 안은 학년 → 이름 순: ' + hs);
  ok(/고1 1 · 고2 1/.test(await pg.textContent('.grp:nth-child(2) h3')), '학교 머리에 학년별 인원');
  ok(/010-1111-2222/.test(await pg.textContent('#view')) && await pg.$('a[href="tel:01033334444"]'), '연락처 표기·전화 링크');
  ok(/토11:00 \/ 수5:30/.test(t(await pg.textContent('#view'))), '정규 가 / 나');
  await pg.click('#vseg button[data-v=grade]'); await pg.waitForTimeout(150);
  heads = await pg.$$eval('.grp h3', a => a.map(e => e.firstChild.textContent.trim()));
  ok(JSON.stringify(heads) === JSON.stringify(['중2', '고1', '고2']), '학년별 묶음 순서: ' + heads);
  ok(/모든 학년 \(4명\)/.test(await pg.textContent('#selGroup')), '학년 고르기 목록');
  await pg.selectOption('#selGroup', '고1'); await pg.waitForTimeout(100);
  ok((await pg.$$('.grp')).length === 1 && /2명 보는 중/.test(await pg.textContent('#sum')), '고1만 보기');
  await pg.fill('#q', '김'); await pg.waitForTimeout(100);
  ok((await pg.$$('td.nm')).length === 1, '이름 찾기');
  await pg.fill('#q', '');
  await pg.uncheck('#showTel'); await pg.waitForTimeout(100);
  ok(!/학부모님1/.test(await pg.textContent('#view')), '연락처 숨기기');
  await pg.click('#btnCopy'); await pg.waitForTimeout(200);
  const clip = await pg.evaluate(() => navigator.clipboard.readText());
  ok(clip.split('\n').length === 3 && /^묶음\tNo\t이름/.test(clip) && !/학부모님1/.test(clip), '표 복사(보이는 2명·연락처 빼고)');
  await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '휴대폰 가로 넘침 없음');
  ok(perr === 0, '페이지 오류 없음');
  await browser.close(); server.close();
  console.log(`\n${pass} 통과 · ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
