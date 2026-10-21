#!/usr/bin/env node
/* 티쳐스 '학력평가 성적'(smock.html, 057 — 2026-10-21) 검증.
 *   NODE_PATH=$(npm root -g) node tools/smock-e2e-test.js
 * 가짜 수파베이스로 회차 만들기·입력 받기 켜기·결과(타일·영역·문항 오답률·입력 안 한 학생)·
 * 구글 설문 응답 붙여 넣기(머리글 찾기·여러 줄 후기·같은 이름 번호로 가리기·중복 응답·이미 입력한 학생)를 확인한다. */
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let pass = 0, fail = 0;
const SHOT = process.env.SHOT || '';
const shot = (pg, n, sel) => SHOT ? pg.locator(sel).screenshot({ path: path.join(SHOT, n + '.png') }) : Promise.resolve();   // SHOT=폴더면 화면 캡처
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

const STUS = [
  { name: '김나연', school: '도래울고', grade: '2026 고등 1학년', student_id: '62792773', code: 'c-kny', enrolled: '재원', phone_student: '' },
  { name: '박지현', school: '화수고', grade: '2026 고등 1학년', student_id: '55361348', code: 'c-pjh', enrolled: '재원', phone_student: '' },
  { name: '김민재', school: '화정고', grade: '2026 고등 1학년', student_id: '11112222', code: 'c-kmj1', enrolled: '재원', phone_student: '010-1234-5967' },
  { name: '김민재', school: '화정고', grade: '2026 고등 1학년', student_id: '33334444', code: 'c-kmj2', enrolled: '재원', phone_student: '010-9999-0000' },
  { name: '이승준C', school: '화수고', grade: '2026 고등 1학년', student_id: '89087586', code: 'c-lsj', enrolled: '재원', phone_student: '' },
  { name: '안온학생', school: '행신고', grade: '2026 고등 1학년', student_id: '77778888', code: 'c-none', enrolled: '재원', phone_student: '' },
  { name: '고2학생', school: '행신고', grade: '2026 고등 2학년', student_id: '12121212', code: 'c-g2', enrolled: '재원', phone_student: '' }
];
let EXAMS = [], ENTRIES = [], CALLS = [];

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
  }).listen(0);
  const PORT = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({
    access_token: 'tok', refresh_token: 'refresh-tok', expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '11111111-1111-1111-1111-111111111111' }
  })));
  ctx.on('dialog', d => d.accept());
  await ctx.route('**/*', async route => {
    const req = route.request(), url = req.url();
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: obj === null ? '' : JSON.stringify(obj) });
    if (req.method() === 'OPTIONS') return json(null, 204);
    if (url.startsWith('http://127.0.0.1:' + PORT)) return route.continue();
    if (!url.startsWith(SB)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    const p = url.slice(SB.length), m = req.method(), body = req.postData() ? JSON.parse(req.postData()) : null;
    CALLS.push({ m, p, auth: req.headers()['authorization'], prefer: req.headers()['prefer'] || '', body });
    if (p.startsWith('/auth/v1/token')) return json({ access_token: 'tok', refresh_token: 'refresh-tok', expires_in: 3600, user: { id: '11111111-1111-1111-1111-111111111111' } });
    if (p.startsWith('/rest/v1/teacher_accounts')) return json([{ user_id: '11111111-1111-1111-1111-111111111111', login_id: 'tester', display_name: '테스트', role: 'admin', active: true }]);
    if (req.headers()['authorization'] !== 'Bearer tok') return json({ error: 'need teacher' }, 401);
    if (p.startsWith('/rest/v1/students')) return json(/offset=0/.test(p) ? STUS : []);
    if (p.startsWith('/rest/v1/smock_exams')){
      if (m === 'GET') return json(EXAMS.slice());
      if (m === 'POST'){ EXAMS.unshift(body); return json(null, 201); }
      if (m === 'PATCH'){ const k = decodeURIComponent(p.match(/key=eq\.([^&]+)/)[1]); EXAMS.forEach(e => { if (e.key === k) Object.assign(e, body); }); return json(null, 204); }
      if (m === 'DELETE'){ const k = decodeURIComponent(p.match(/key=eq\.([^&]+)/)[1]); EXAMS = EXAMS.filter(e => e.key !== k); return json(null, 204); }
    }
    if (p.startsWith('/rest/v1/smock_entries')){
      if (m === 'GET') return json(/offset=0/.test(p) ? ENTRIES : []);
      if (m === 'POST'){ (Array.isArray(body) ? body : [body]).forEach(r => { if (!ENTRIES.some(x => x.exam_key === r.exam_key && x.code === r.code)) ENTRIES.push(r); }); return json(null, 201); }
    }
    return json([]);
  });
  const pg = await ctx.newPage();
  let perr = 0; pg.on('pageerror', e => { perr++; console.log('  ✗ pageerror', e.message); });
  await pg.goto('http://127.0.0.1:' + PORT + '/smock.html');
  await pg.waitForSelector('#exams .muted');
  ok(/아직 회차가 없어요/.test(await pg.textContent('#exams')), '회차 없음 안내');
  ok(CALLS.some(c => c.p.startsWith('/rest/v1/smock_exams') && c.auth === 'Bearer tok'), '교사 인증으로 회차 조회');

  // ① 회차 만들기
  await pg.selectOption('#nYear', '2026'); await pg.selectOption('#nMonth', '9'); await pg.selectOption('#nGrade', '고1');
  await pg.click('#addExam'); await pg.waitForTimeout(400);
  const post = CALLS.find(c => c.m === 'POST' && c.p.startsWith('/rest/v1/smock_exams'));
  ok(post && post.body.key === '2026-09-고1' && post.body.layout === '통합' && post.body.title === '2026년 9월 고1 모의고사' && post.body.open === false, '회차 본문(키·형식·제목·꺼짐)');
  ok(/2026년 9월 고1 모의고사/.test(await pg.textContent('#exams')) && /입력 꺼짐/.test(await pg.textContent('#exams')), '목록에 새 회차');
  ok(await pg.isVisible('#resCard'), '새로 만든 회차 결과 창 열림');
  await pg.click('[data-open="2026-09-고1"]'); await pg.waitForTimeout(300);
  ok(EXAMS[0].open === true && /입력 받는 중/.test(await pg.textContent('#exams')), '입력 받기 켜기 PATCH');
  await pg.selectOption('#nGrade', '고3'); await pg.click('#addExam'); await pg.waitForTimeout(400);
  ok(EXAMS.some(e => e.key === '2026-09-고3' && e.layout === '고3'), '고3 회차는 고3 형식');
  await pg.click('[data-del="2026-09-고3"]'); await pg.waitForTimeout(300);
  ok(!EXAMS.some(e => e.key === '2026-09-고3'), '입력 없는 회차 지우기');

  // ② 학생이 이미 입력한 줄
  ENTRIES.push({ exam_key: '2026-09-고1', code: 'c-pjh', name: '박지현', school: '화수고', score: 80, score_text: '80', feel: '중', subject: '', wrong: { '독서': [12] }, review: '', src: '학생' });

  // ③ 설문으로 옮겨 둔 기록(옮겨 오기 칸은 없음)
  await pg.click('[data-sel="2026-09-고1"]'); await pg.waitForTimeout(300);
  ok(!(await pg.$('#impText')) && !/구글 설문 응답 옮겨 오기/.test(await pg.textContent('main')), '설문 옮겨 오기 칸 없음');
  ENTRIES.push(
    { exam_key: '2026-09-고1', code: 'c-kny', name: '김나연', school: '도래울고', score: 91, score_text: '91', feel: '중', subject: '', wrong: { '언어': [9], '독서': [18, 20], '문학': [36] }, review: '', src: '설문' },
    { exam_key: '2026-09-고1', code: 'c-kmj1', name: '김민재', school: '화정고', score: null, score_text: '65?', feel: '상', subject: '', wrong: { '독서': [13] }, review: '', src: '설문' },
    { exam_key: '2026-09-고1', code: 'c-lsj', name: '이승준C', school: '화수고', score: 96, score_text: '96', feel: '중', subject: '', wrong: { '화법': [4], '문학': [31] }, review: '', src: '설문' });
  await pg.evaluate(() => load());

  // ④ 결과
  await pg.waitForTimeout(300);
  const res = await pg.textContent('#res');
  ok(/입력4명/.test(res.replace(/\s+/g, '')), '입력 4명 타일');
  ok(/평균89\.0/.test(res.replace(/\s+/g, '')), '평균(숫자 점수만 — 80·91·96) 89.0');
  ok(/설문/.test(res), '설문 표시 꼬리표');
  const q36 = await pg.getAttribute('.qgrid .q:nth-child(36)', 'title');
  ok(q36 === '36번 · 1명 틀림', '36번 오답 1명: ' + q36);
  ok(await pg.$eval('.qgrid .q:nth-child(36)', e => e.className) === 'q h1', '25%는 옅은 칸');
  ok(await pg.$eval('.qgrid .q:nth-child(1)', e => e.className) === 'q', '아무도 안 틀린 칸은 색 없음');
  ok(/아직입력하지않은고1재원생2명/.test(res.replace(/\s+/g, '')) && /안온학생/.test(res) && !/고2학생/.test(res), '입력 안 한 고1 재원생(고2 제외)');
  ok(/입력 4명/.test(await pg.textContent('#exams')), '목록의 입력 수');
  if (SHOT){ await pg.waitForTimeout(3000); await shot(pg, '4-선생님-회차와결과', 'main'); }
  // ⑤ 정답·등급컷이 있는 회차(058)
  const INFO = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'shueguk-report', 'supabase', 'smock-info', '2026-10-고1.json'), 'utf8'));
  EXAMS.forEach(e => { if (e.key === '2026-09-고1') e.info = INFO; });
  await pg.evaluate(() => load()); await pg.waitForTimeout(400);
  const r2 = (await pg.textContent('#res')).replace(/\s+/g, '');
  ok(/정답·등급컷 있음/.test(await pg.textContent('#exams')), '정답·등급컷 있음 표시');
  ok(/등급분포/.test(r2) && /21등급/.test(r2) && /12등급/.test(r2), '등급 분포(91·96 → 1등급 2명, 80 → 2등급 1명)');
  ok(/세부영역별우리학생오답률/.test(r2) && /독서\(과학\)11~14번/.test(r2), '세부 영역별 오답률');
  ok(/많이틀린문항/.test(r2) && /번호영역출제의도배점정답우리오답률전국차이/.test(r2), '많이 틀린 문항 표(정답·전국 비교)');
  ok(await pg.$eval('.qgrid .q:nth-child(14)', e => /전국 70/.test(e.textContent)), '문항 칸에 전국 오답률');
  const tb = await pg.evaluate(() => [...document.querySelectorAll('#res table')].pop().textContent.replace(/\s+/g, ''));
  ok(/961등급/.test(tb), '학생 줄에 등급: ' + tb.slice(0, 80));
  ok(perr === 0, '페이지 오류 없음');
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
