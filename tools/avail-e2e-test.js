#!/usr/bin/env node
/* 티쳐스 '시간표 조사'(avail.html — 2026-11-05 원장님, 리포트 062) 검증.
 *   LC_ALL=C.UTF-8 NODE_PATH=$(npm root -g) node tools/avail-e2e-test.js
 * 가짜 수파베이스로 후보 칸(직접·기본 칸·빼기)·대상(학교+학년만·개인 여러 명·학년)·만들기 POST 본문·
 * 목록(제출 n/m·상태)·결과(가능 인원 표·칸 누르면 안 되는 학생·학교 거르기·미제출·표 복사)·닫기·마감일·삭제를 확인한다. */
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m + (x ? ' ' + x : ''))); };
const STUS = [
  { name: '김나연', school: '화정고', grade: '2026 고등 1학년', student_id: '1', code: 'c1', enrolled: '재원' },
  { name: '박지현', school: '화정고', grade: '2026 고등 1학년', student_id: '2', code: 'c2', enrolled: '재원' },
  { name: '이서윤', school: '화정고', grade: '2026 고등 2학년', student_id: '3', code: 'c3', enrolled: '재원' },
  { name: '최하늘', school: '화수고', grade: '2026 고등 1학년', student_id: '4', code: 'c4', enrolled: '재원' },
  { name: '정코드', school: '화수고', grade: '2026 고등 1학년', student_id: '5', code: '', enrolled: '재원' },
  { name: '퇴원생', school: '화정고', grade: '2026 고등 1학년', student_id: '6', code: 'c6', enrolled: '퇴원' }
];
const SL = [
  { id: '수-5:30', day: '수', start: '5:30', end: '7:30' }, { id: '토-11:00', day: '토', start: '11:00', end: '1:00' }
];
let SURV = [], TG = [], RS = [], POSTS = [], PATCHES = [], DELS = [];
function seed(){
  SURV = [{ id: 1, title: '화정고1 새 시간표', memo: '', slots: SL, target: [{ type: 'school', value: '화정고' }], due: '2099-01-01', open: true, created_by_name: '이수경', created_at: '2026-11-05T01:00:00Z' }];
  TG = [
    { survey_id: 1, code: 'c1', name: '김나연', school: '화정고', grade: '2026 고등 1학년', class_name: '화정고' },
    { survey_id: 1, code: 'c2', name: '박지현', school: '화정고', grade: '2026 고등 1학년', class_name: '화정고' },
    { survey_id: 1, code: 'c3', name: '이서윤', school: '화정고', grade: '2026 고등 2학년', class_name: '화정고' }
  ];
  RS = [
    { survey_id: 1, code: 'c1', name: '김나연', school: '화정고', grade: '2026 고등 1학년', no: ['토-11:00'], memo: '토 오전 학원', last_by: '학부모님', submitted_at: '2026-11-05T02:00:00Z', updated_at: '2026-11-05T03:00:00Z' },
    { survey_id: 1, code: 'c3', name: '이서윤', school: '화정고', grade: '2026 고등 2학년', no: [], memo: '', last_by: '학생', submitted_at: '2026-11-05T02:00:00Z', updated_at: '2026-11-05T02:00:00Z' }
  ];
}
(async () => {
  seed();
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
  await ctx.route('**/*', async route => {
    const req = route.request(), url = req.url(), m = req.method();
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: obj == null ? '' : JSON.stringify(obj) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.startsWith('http://127.0.0.1:' + PORT)) return route.continue();
    if (!url.startsWith(SB)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    const p = decodeURIComponent(url.slice(SB.length));
    if (p.startsWith('/rest/v1/teacher_accounts')) return json([{ user_id: '11111111-1111-1111-1111-111111111111', login_id: 'tester', display_name: '테스트선생', role: 'admin', active: true }]);
    if (p.startsWith('/rest/v1/students')) return json(/offset=0/.test(p) ? STUS : []);
    if (p.startsWith('/rest/v1/tt_classes')) return json(/offset=0/.test(p) ? [{ class_id: 'r001', name: '고1 가', day: '토', start_time: '11:00', teacher: '슈', roster: '김나연 최하늘' }] : []);
    if (p.startsWith('/rest/v1/avail_surveys')){
      if (m === 'GET') return json(SURV);
      if (m === 'POST'){ const b = JSON.parse(req.postData()); POSTS.push({ t: 'survey', b }); const row = Object.assign({ id: 2, created_at: '2026-11-05T04:00:00Z' }, b); SURV.unshift(row); return json([row], 201); }
      if (m === 'PATCH'){ const b = JSON.parse(req.postData()); PATCHES.push({ p, b }); const id = +(/id=eq\.(\d+)/.exec(p) || [])[1]; Object.assign(SURV.find(s => s.id === id) || {}, b); return json(null, 204); }
      if (m === 'DELETE'){ DELS.push(p); const id = +(/id=eq\.(\d+)/.exec(p) || [])[1]; SURV = SURV.filter(s => s.id !== id); return json(null, 204); }
    }
    if (p.startsWith('/rest/v1/avail_targets')){
      if (m === 'GET') return json(/offset=0/.test(p) ? TG : []);
      if (m === 'POST'){ const b = JSON.parse(req.postData()); POSTS.push({ t: 'targets', b }); b.forEach(r => TG.push(r)); return json(null, 201); }
    }
    if (p.startsWith('/rest/v1/avail_responses')) return json(/offset=0/.test(p) ? RS : []);
    return json([]);
  });
  const pg = await ctx.newPage();
  let perr = 0; pg.on('pageerror', e => { perr++; console.log('  ✗ pageerror', e.message); });
  pg.on('dialog', d => d.type() === 'prompt' ? d.accept('2026-11-20') : d.accept());
  await pg.goto('http://127.0.0.1:' + PORT + '/avail.html');
  await pg.waitForSelector('.sv');
  const T = s => (s || '').replace(/\s+/g, ' ');

  // ① 목록
  let t = T(await pg.textContent('#list'));
  ok(/화정고1 새 시간표/.test(t) && /받는 중/.test(t), '목록 제목·받는 중');
  ok(/제출 2 \/ 3명 \(67%\)/.test(t), '제출 n/m', t);
  ok(/대상 화정고/.test(t) && /후보 칸 2개/.test(t), '대상·칸 수');

  // ② 결과
  await pg.click('#s1 .acts .btn.lav'); await pg.waitForTimeout(150);
  const cells = await pg.$$eval('#s1 .heat .cell', a => a.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(JSON.stringify(cells) === JSON.stringify(['1안 됨 1', '2모두 가능']), '가능 인원 칸(토 11:00 줄이 위): ' + cells);
  const heads = await pg.$$eval('#s1 .heat thead th', a => a.map(e => e.textContent));
  ok(JSON.stringify(heads) === JSON.stringify(['', '수', '토']), '요일 열');
  const rows = await pg.$$eval('#s1 .heat tbody th', a => a.map(e => e.textContent));
  ok(JSON.stringify(rows) === JSON.stringify(['오전 11:00', '오후 5:30']), '시간 줄(오전 11시 → 오후 5:30): ' + rows);
  await pg.click('#s1 .cell[title^="토"]'); await pg.waitForTimeout(100);
  ok(/안 되는 학생 1명: 김나연/.test(T(await pg.textContent('#s1 .who-no'))), '칸 누르면 안 되는 학생');
  t = T(await pg.textContent('#s1 .resbox'));
  ok(/아직 제출하지 않은 학생 1명/.test(t) && /박지현/.test(t), '미제출 학생');
  ok(/토 오전 11:00/.test(t) && /모두 가능/.test(t) && /학부모님/.test(t), '응답 표(안 되는 칸·모두 가능·누가)');
  // 자동 배치 추천 — 1칸·주 1회
  ok(/\[추천 받기\]/.test(T(await pg.textContent('#s1 .resbox'))), '추천 안내');
  await pg.selectOption('#s1 .pl-bar select:nth-of-type(1)', '1'); await pg.waitForTimeout(100);
  await pg.click('#s1 .pl-bar .btn.lav'); await pg.waitForTimeout(400);
  let cards = await pg.$$eval('#s1 .pl-card', a => a.map(e => e.textContent.replace(/\s+/g, ' ')));
  ok(cards.length === 2 && /1안\s*수 오후 5:30/.test(cards[0]) && /2 \/ 2명 배정 · 모두/.test(cards[0]), '1안 = 수 5:30 두 명 모두', cards[0]);
  ok(/2안\s*토 오전 11:00/.test(cards[1]) && /1 \/ 2명/.test(cards[1]) && /김나연 \(가능한 칸 없음\)/.test(cards[1]), '2안 = 토 11:00 · 김나연 못 들어감(이유)', cards[1]);
  ok(/조합 2개/.test(T(await pg.textContent('#s1 .resbox'))), '따져 본 조합 수');
  await pg.click('#s1 .pl-card .btn'); await pg.waitForTimeout(150);
  const pc = (await pg.evaluate(() => navigator.clipboard.readText())).split('\n');
  ok(pc[0] === '반\t이름\t학교\t학년' && pc.some(l => /^수 오후 5:30 · 120분\t김나연\t화정고\t고1$/.test(l)), '1안 표 복사', pc);
  // 정원 1 로 바꾸면 결과가 지워지고 다시 계산
  await pg.fill('#s1 .pl-bar input', '1'); await pg.press('#s1 .pl-bar input', 'Tab'); await pg.waitForTimeout(150);
  ok(!(await pg.$('#s1 .pl-card')), '설정 바꾸면 결과 지움');
  await pg.click('#s1 .pl-bar .btn.lav'); await pg.waitForTimeout(400);
  cards = await pg.$$eval('#s1 .pl-card', a => a.map(e => e.textContent.replace(/\s+/g, ' ')));
  ok(/1 \/ 2명 배정/.test(cards[0]) && /정원이 참|가능한 칸 없음/.test(cards[0]), '정원 1이면 한 명은 못 들어감', cards[0]);
  // 주 2회 — 두 칸(수·토)
  await pg.selectOption('#s1 .pl-bar select:nth-of-type(1)', '2'); await pg.selectOption('#s1 .pl-bar select:nth-of-type(2)', '2');
  await pg.fill('#s1 .pl-bar input', '9'); await pg.press('#s1 .pl-bar input', 'Tab'); await pg.waitForTimeout(100);
  await pg.click('#s1 .pl-bar .btn.lav'); await pg.waitForTimeout(400);
  t = T(await pg.textContent('#s1 .resbox'));
  ok(/1 \/ 2명 배정/.test(t) && /김나연/.test(t) && /가·나는 선생님이 정해/.test(t), '주 2회: 토가 안 되는 김나연은 못 들어감');
  // 학년 거르기
  await pg.selectOption('#s1 .res-bar select:nth-of-type(2)', '고1'); await pg.waitForTimeout(100);
  t = T(await pg.textContent('#s1 .resbox'));
  ok(/대상 2명 · 제출 1명/.test(t) && !/이서윤/.test(t), '고1만 거르기');
  ok(!(await pg.$('#s1 .pl-card')) && /제출한 1명 기준/.test(t), '거르면 추천도 그 학생들로 다시');
  // 표 복사
  await pg.click('#s1 .resbox h4 .btn'); await pg.waitForTimeout(150);
  const clip = await pg.evaluate(() => navigator.clipboard.readText());
  const lines = clip.split('\n');
  ok(lines[0] === '이름\t학교\t학년\t수 5:30\t토 11:00\t메모\t마지막 저장', '복사 머리: ' + lines[0]);
  ok(/^김나연\t화정고\t고1\tO\tX\t토 오전 학원/.test(lines[1]) && /^박지현\t.*미제출/.test(lines[2]), '복사 줄(O/X·미제출)');

  // ③ 만들기 — 칸 직접·기본 칸·빼기
  await pg.fill('#sTitle', '화정고1 겨울 시간표');
  ok(/후보 시간 칸을 넣어/.test(await pg.textContent('#goNote')), '칸 없으면 잠김');
  await pg.click('#dPills [data-d="금"]'); await pg.selectOption('#tStart', String(17 * 60)); await pg.selectOption('#tDur', '90');
  await pg.click('text=칸 더하기');
  ok(/오후 5:00 · 90분/.test(await pg.textContent('#slots')), '직접 더한 칸(금 오후 5:00 · 90분)');
  ok(/오후 6:30까지/.test(await pg.textContent('#tEndNote')), '끝 시각 안내');
  await pg.click('text=슈국 기본 칸 넣기');
  ok(/후보 칸 15개/.test(await pg.textContent('#slots')), '기본 칸 14 + 직접 1 = 15');
  await pg.click('[data-rmslot="금-5:00"]');
  ok(/후보 칸 14개/.test(await pg.textContent('#slots')), '칸 빼기');
  // 대상: 학교 + 고1만
  await pg.click('#modeSeg [data-m=school]');
  await pg.selectOption('#schSel', '화정고');
  ok(/대상 학생 3명/.test(T(await pg.textContent('#sum'))), '화정고 3명(퇴원 제외)');
  await pg.selectOption('#schGrade', '고1');
  ok(/고1만 · 대상 학생 2명/.test(T(await pg.textContent('#sum'))), '학교 + 고1만 = 2명');
  await pg.click('#goBtn'); await pg.waitForTimeout(500);
  const sv = (POSTS.find(x => x.t === 'survey') || {}).b || {};
  ok(sv.title === '화정고1 겨울 시간표' && sv.open === true && sv.slots.length === 14 && sv.slots[0].id === '수-5:30', '조사 POST 본문', JSON.stringify(sv).slice(0, 200));
  ok(JSON.stringify(sv.target) === JSON.stringify([{ type: 'school', value: '화정고' }, { type: 'onlygrade', value: '고1' }]), '대상 명세(학교+학년만)');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(sv.due) && sv.created_by_name === '테스트선생', '마감일 기본값·만든 사람');
  const tg = (POSTS.find(x => x.t === 'targets') || {}).b || [];
  ok(tg.length === 2 && tg.every(r => r.survey_id === 2) && tg.map(r => r.code).sort().join() === 'c1,c2', '대상 POST(2명)');
  ok(/화정고1 겨울 시간표/.test(await pg.textContent('#list')), '새 조사 목록에');

  // ④ 개인 여러 명 · 접근코드 없는 학생 안내
  await pg.fill('#sTitle', '개인 조사'); await pg.click('text=슈국 기본 칸 넣기');
  await pg.click('#modeSeg [data-m=stu]');
  await pg.fill('#stuQ', '최하늘'); await pg.click('#pane-stu .btn');
  await pg.fill('#stuQ', '김나연'); await pg.click('#pane-stu .btn');
  ok(/대상 학생 2명/.test(T(await pg.textContent('#sum'))), '개인 여러 명 담기');
  await pg.click('#modeSeg [data-m=grade]'); await pg.click('#gradePills [data-g="고1"]');
  ok(/접근코드\)가 없는 학생 1명: 정코드/.test(T(await pg.textContent('#sum'))), '접근코드 없는 학생 안내');

  // ⑤ 닫기·마감일·삭제
  ok(await pg.getAttribute('#s1 .acts a.btn', 'href') === 'alimtalk.html?avail=1&kind=notice_avail' && /미제출 1명/.test(await pg.textContent('#s1 .acts a.btn')), '알림톡 보내기 링크(미제출 1명)');
  await pg.click('#s1 .acts >> text=학생 화면에서 닫기'); await pg.waitForTimeout(300);
  ok(PATCHES.some(x => /id=eq\.1/.test(x.p) && x.b.open === false), '학생 화면에서 닫기 PATCH');
  ok(/닫힘/.test(await pg.textContent('#s1')), '닫힘 표시');
  ok(!(await pg.$('#s1 .acts a.btn')), '닫힌 조사는 알림톡 링크 없음');
  await pg.click('#s1 .acts >> text=마감일 바꾸기'); await pg.waitForTimeout(300);
  ok(PATCHES.some(x => x.b.due === '2026-11-20'), '마감일 바꾸기 PATCH');
  await pg.click('#s1 .acts .danger'); await pg.waitForTimeout(300);
  ok(DELS.some(d => /avail_surveys\?id=eq\.1/.test(d)) && !(await pg.$('#s1')), '조사 삭제');

  // ⑥ 휴대폰
  await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= 392), '휴대폰 가로 넘침 없음');
  ok(perr === 0, '페이지 오류 없음');
  await browser.close(); server.close();
  console.log('\n' + pass + '건 통과, ' + fail + '건 실패');
  process.exit(fail ? 1 : 0);
})();
