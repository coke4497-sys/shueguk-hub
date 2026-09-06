/* 질문 대기열 브라우저 E2E (2026-09-06)
 * 가짜 수파베이스(표·함수 흉내, 메모리)와 가짜 리포트 백엔드로 실제 페이지를 띄워
 *   ① 학생 페이지(리포트 s.html '질문하기') — 카드·올리기·중복·사진·순번·취소
 *   ② 교사 페이지(question.html) — 교사 인증 헤더·대기 순서·호출·맨 뒤로·완료·전체 보기
 *   ③ 강의실 디스플레이(question_board.html) — 호출 이름·다음 순서·선생님 고르기
 * 를 왕복 검사한다. 원격 수파베이스에는 아무것도 보내지 않는다.
 *   실행: NODE_PATH=$(npm root -g) node tools/qq-e2e-test.js
 * 학생 페이지 검사는 옆에 리포트 저장소(../shueguk-report/s.html)가 있을 때만 돈다.
 * DB 함수의 실제 SQL 검증은 리포트 저장소 tools/qq-sql-test.sh 가 한다.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const REPORT = path.join(ROOT, '..', 'shueguk-report');
const PORT = 8937;
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let n = 0, bad = 0;
function ok(cond, label) { n++; if (!cond) { bad++; console.error('  ✗', label); } else console.log('  ✓', label); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';   // 폴더를 주면 화면을 저장한다(눈으로 확인용)
const shot = (pg, name) => SHOTS ? pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }) : Promise.resolve();

/* ── 가짜 DB ─────────────────────────────────────────────── */
const STUDENTS = [
  { name: '김철수', student_id: '12345678', school: '화정고', grade: '2026 고등 1학년', teacher: '이수경' },
  { name: '박민수', student_id: '34567890', school: '서정중', grade: '2026 중등 3학년', teacher: '이수경' },
  { name: '이영희', student_id: '23456789', school: '능곡고', grade: '2026 고등 2학년', teacher: '김지원' },
];
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
let ROWS = [], NEXT = 1, ORD = 1000;
const calls = [];   // 요청 기록 {method, path, auth, body}
function stuOk(p) { return STUDENTS.some(s => s.name === (p.name || '').trim() && s.student_id === (p.student_id || '').trim()); }
function pos(r) {
  if (r.status !== '대기') return null;
  return ROWS.filter(q => q.qdate === r.qdate && q.teacher === r.teacher && q.status === '대기' && (q.ord < r.ord || (q.ord === r.ord && q.id < r.id))).length + 1;
}
function hm(iso) { return iso ? new Date(iso).toISOString().slice(11, 16) : null; }
function rowJson(r) { return { id: r.id, teacher: r.teacher, qtime: r.qtime, unit: r.unit, text: r.text, hasPhoto: r.photo !== '', status: r.status, position: pos(r), time: hm(r.created_at), calledAt: hm(r.called_at), doneAt: hm(r.done_at) }; }
function rpc(fn, args) {
  const p = (args && args.p) || {};
  if (fn === 'qq_teachers') return ['이수경', '김지원'];
  if (fn === 'qq_submit') {
    if (!stuOk(p)) return { ok: false, error: 'unknown_student' };
    if (!(p.teacher || '').trim()) return { ok: false, error: 'no_teacher' };
    if (!(p.text || '').trim() && !p.photo) return { ok: false, error: 'empty' };
    if (p.photo && !/^data:image\//.test(p.photo)) return { ok: false, error: 'photo_too_big' };
    const ex = ROWS.find(r => r.qdate === today && r.teacher === p.teacher && r.student_id === p.student_id && ['대기', '호출'].includes(r.status));
    if (ex) return { ok: true, id: ex.id, position: pos(ex), status: ex.status, dup: true };
    if (p.qtime && !/^\d{1,2}:\d{2}$/.test(p.qtime)) return { ok: false, error: 'bad_time' };
    const qt = p.qtime || new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16);
    const ord = Date.parse(today + 'T' + qt.padStart(5, '0') + ':00+09:00');
    const r = { id: NEXT++, created_at: new Date().toISOString(), qdate: today, ord, name: p.name, school: p.school || '', grade: p.grade || '', student_id: p.student_id, teacher: p.teacher, qtime: qt.padStart(5, '0'), unit: (p.unit || '').trim(), text: (p.text || '').trim(), photo: p.photo || '', status: '대기', called_at: null, done_at: null, note: '' };
    ROWS.push(r);
    return { ok: true, id: r.id, position: pos(r), status: '대기' };
  }
  if (fn === 'qq_mine') {
    if (!stuOk(p)) return { ok: false, error: 'unknown_student' };
    return { ok: true, list: ROWS.filter(r => r.qdate === today && r.student_id === p.student_id).map(rowJson) };
  }
  if (fn === 'qq_cancel') {
    const r = ROWS.find(x => x.id === +p.id && x.student_id === p.student_id && x.status === '대기');
    if (r) { r.status = '취소'; r.done_at = new Date().toISOString(); }
    return { ok: true, changed: !!r };
  }
  return null;
}
// PostgREST 흉내: select · eq · in · order
function restGet(url) {
  const u = new URL(url);
  let rows = ROWS.slice();
  for (const [k, v] of u.searchParams) {
    if (k === 'select' || k === 'order') continue;
    let m;
    if ((m = v.match(/^eq\.(.*)$/))) rows = rows.filter(r => String(r[k]) === m[1]);
    else if ((m = v.match(/^in\.\((.*)\)$/))) { const set = m[1].split(','); rows = rows.filter(r => set.includes(String(r[k]))); }
    else if ((m = v.match(/^neq\.(.*)$/))) rows = rows.filter(r => String(r[k]) !== m[1]);
  }
  const order = (u.searchParams.get('order') || '').split(',').filter(Boolean).map(s => s.split('.'));
  rows.sort((a, b) => { for (const [f, d] of order) { if (a[f] < b[f]) return d === 'desc' ? 1 : -1; if (a[f] > b[f]) return d === 'desc' ? -1 : 1; } return 0; });
  const sel = (u.searchParams.get('select') || '*').split(',');
  return rows.map(r => sel[0] === '*' ? r : Object.fromEntries(sel.map(f => [f, r[f]])));
}

(async () => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let f;
    if (p.startsWith('/report/')) f = path.join(REPORT, p.slice('/report/'.length));
    else f = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
    res.end(fs.readFileSync(f));
  }).listen(PORT);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  ctx.setDefaultTimeout(8000);
  ctx.on('dialog', d => d.accept());

  await ctx.route('**/*', async route => {
    const req = route.request();
    const url = req.url();
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }, body: obj === null ? '' : JSON.stringify(obj) });
    if (req.method() === 'OPTIONS') return json(null, 204);
    if (url.startsWith(SB)) {
      const hdr = req.headers();
      const rec = { method: req.method(), path: url.slice(SB.length), auth: hdr['authorization'] || '', body: req.postData() };
      calls.push(rec);
      if (rec.path.startsWith('/auth/v1/token')) return json({ access_token: 'tok', expires_in: 3600 });
      if (rec.path.startsWith('/rest/v1/rpc/student_bundle')) return json({ error: 'nope' }, 500);   // 학생 페이지 → 옛 백엔드 폴백
      if (rec.path.startsWith('/rest/v1/rpc/')) {
        const fn = rec.path.slice('/rest/v1/rpc/'.length).split('?')[0];
        const out = rpc(fn, rec.body ? JSON.parse(rec.body) : {});
        return out === null ? json({ error: 'unknown fn ' + fn }, 404) : json(out);
      }
      if (rec.path.startsWith('/rest/v1/question_queue')) {
        if (rec.auth !== 'Bearer tok') return json({ error: 'need teacher' }, 401);
        if (req.method() === 'GET') return json(restGet(url));
        if (req.method() === 'PATCH') {
          const id = +new URL(url).searchParams.get('id').replace('eq.', '');
          const r = ROWS.find(x => x.id === id); if (!r) return json({}, 404);
          Object.assign(r, JSON.parse(rec.body)); return json(null, 204);
        }
      }
      return json({ error: 'unhandled ' + rec.path }, 404);
    }
    if (url.includes('script.google.com') || url.includes('script.googleusercontent.com')) {
      if (/[?&]key=/.test(url) && !/action=/.test(url)) {
        return json({ result: 'success', info: { name: '김철수', id: '12345678', school: '화정고', grade: '2026 고등 1학년', teacher: '이수경', enrolled: '재원', classA: '금 5:30', classB: '' }, authed: false, examCount: 0, notices: [], homework: [], analyses: [], clinic: null, stars: null, mockGates: { grades: [], open: false }, clinicEligible: false, vocaTaken: false, mockSignups: [] });
      }
      return json({ result: 'success', grades: [], open: false });
    }
    if (url.includes('fonts.g')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.continue();
  });

  /* ══ ① 학생 페이지 ══════════════════════════════════════ */
  if (fs.existsSync(path.join(REPORT, 's.html'))) {
    console.log('① 학생 페이지 (s.html 질문하기)');
    const pg = await ctx.newPage();
    pg.on('pageerror', e => { bad++; console.error('  ✗ pageerror', e.message); });
    await pg.goto(`http://localhost:${PORT}/report/s.html?key=abc`);
    await pg.waitForFunction(() => document.getElementById('hubView').style.display !== 'none');
    await pg.waitForFunction(() => /선생님께 질문 올리기/.test(document.getElementById('menu').textContent));
    const card = pg.locator('#menu .card', { hasText: '질문하기' });
    ok(await card.count() === 1, '허브에 질문하기 카드');
    ok(/선생님께 질문 올리기 · 순서 확인/.test(await card.textContent()), '카드 기본 설명');
    await card.click();
    await pg.waitForFunction(() => document.getElementById('questionView').style.display === 'block');
    await pg.waitForFunction(() => document.querySelectorAll('#qqTeacher option').length >= 2);
    ok(await pg.$eval('#qqTeacher', s => s.value) === '이수경', '담당 선생님이 기본 선택');
    ok(/오늘 올린 질문이 없어요/.test(await pg.$eval('#qqList', e => e.textContent)), '빈 목록 안내');

    // 빈 제출 → 화면에서 막고 서버로 안 보냄
    const before = calls.filter(c => c.path.includes('qq_submit')).length;
    await pg.click('#qqSubmit');
    ok(/질문 내용을 적거나 사진/.test(await pg.$eval('#qqErr', e => e.textContent)), '빈 제출 안내');
    ok(calls.filter(c => c.path.includes('qq_submit')).length === before, '빈 제출은 서버 호출 없음');

    // 질문 타임은 지금 시각으로 미리 채워짐, 단원 입력
    const tv = await pg.$eval('#qqTime', e => e.value);
    ok(/^\d\d:\d\d$/.test(tv), '질문 타임이 지금 시각으로 미리 채워짐 (' + tv + ')');
    await pg.fill('#qqUnit', '독서');
    // 글 제출
    await pg.fill('#qqText', '독서 42쪽 3번 2번 선지가 왜 틀렸나요');
    await pg.click('#qqSubmit');
    await pg.waitForFunction(() => /대기 중/.test(document.getElementById('qqList').textContent));
    const sub1 = JSON.parse(calls.filter(c => c.path.includes('qq_submit')).pop().body).p;
    ok(sub1.name === '김철수' && sub1.student_id === '12345678' && sub1.teacher === '이수경' && sub1.text.startsWith('독서 42쪽') && sub1.photo === '' && sub1.grade === '고1' && sub1.school === '화정고' && sub1.qtime === tv && sub1.unit === '독서', 'qq_submit 페이로드(이름·학생ID·선생님·글·학교·학년·질문 타임·단원)');
    ok(/독서/.test(await pg.$eval('#qqList .qq-item .ntitle', e => e.textContent)) && /질문 타임/.test(await pg.$eval('#qqList', e => e.textContent)), '목록에 단원·질문 타임 표시');
    ok(await pg.$eval('#qqUnit', e => e.value) === '', '제출 후 단원 칸 비움');
    ok(/다음 순서예요/.test(await pg.$eval('#qqList', e => e.textContent)), '순번 1 → 다음 순서예요');
    ok(await pg.$eval('#qqText', e => e.value) === '', '제출 후 입력칸 비움');

    // 같은 선생님께 다시 → 중복 안내, 줄 수 그대로
    await pg.fill('#qqText', '또 질문');
    await pg.click('#qqSubmit');
    await pg.waitForFunction(() => /이미 .*올린 질문이 대기 중/.test(document.getElementById('qqErr').textContent));
    ok(ROWS.length === 1, '중복 제출은 새 줄을 만들지 않음');

    // 다른 학생이 앞에 있으면 '앞에 n명' — 가짜 DB에 한 명 끼워 넣고(순서 앞) 새로 받기
    ROWS[0].ord = 5000;                         // 철수를 뒤로
    ROWS.push({ id: NEXT++, created_at: new Date().toISOString(), qdate: today, ord: 2000, name: '박민수', school: '서정중', grade: '중3', student_id: '34567890', teacher: '이수경', qtime: '17:00', unit: '문학', text: '문학 12번', photo: '', status: '대기', called_at: null, done_at: null, note: '' });
    await pg.evaluate(() => qqRefresh());
    await pg.waitForFunction(() => /앞에 1명/.test(document.getElementById('qqList').textContent));
    ok(true, '앞에 1명 · 2번째 표시');

    // 사진 첨부 → 줄여서 data URL 로, 김지원 선생님께
    await pg.selectOption('#qqTeacher', '김지원');
    await pg.setInputFiles('#qqFile', { name: 'q.png', mimeType: 'image/png', buffer: PNG1 });
    await pg.waitForFunction(() => document.getElementById('qqPrev').style.display === 'block');
    ok(true, '사진 미리보기 표시');
    await pg.click('#qqSubmit');
    await pg.waitForFunction(() => document.querySelectorAll('#qqList .qq-item').length === 2);
    const sub2 = JSON.parse(calls.filter(c => c.path.includes('qq_submit')).pop().body).p;
    ok(sub2.teacher === '김지원' && /^data:image\/jpeg;base64,/.test(sub2.photo) && sub2.text === '', '사진만 제출 — JPEG data URL');
    ok(/사진 첨부/.test(await pg.$eval('#qqList', e => e.textContent)), '목록에 사진 첨부 표시');
    ok(await pg.$eval('#qqPrev', e => e.style.display) === 'none', '제출 후 미리보기 지움');

    // 교사가 호출(가짜 DB) → 학생 화면 갱신에 호출됨
    ROWS[0].status = '호출'; ROWS[0].called_at = new Date().toISOString();
    await pg.evaluate(() => qqRefresh());
    await pg.waitForFunction(() => /호출됨/.test(document.getElementById('qqList').textContent));
    ok(/선생님께 가세요/.test(await pg.$eval('#qqList', e => e.textContent)), '호출됨 표시');
    await shot(pg, 'student');

    // 대기 중인 김지원 건 취소
    await pg.click('#qqList .qq-item:has-text("김지원") .qq-cancel');
    await pg.waitForFunction(() => /취소함/.test(document.getElementById('qqList').textContent));
    const cancelBody = JSON.parse(calls.filter(c => c.path.includes('qq_cancel')).pop().body).p;
    ok(cancelBody.id === ROWS[2].id && cancelBody.student_id === '12345678', 'qq_cancel 페이로드');
    ok(await pg.$$eval('#qqList .qq-cancel', b => b.length) === 0, '취소 버튼은 대기 건에만');

    // 메뉴로 돌아가면 카드 설명이 상태를 알려 준다
    await pg.click('#qqBack');
    await pg.waitForFunction(() => document.getElementById('hubView').style.display !== 'none');
    ok(/호출됨 · 선생님께 가세요/.test(await card.textContent()), '허브 카드에 호출됨 표시');
    await pg.close();
  } else {
    console.log('① 학생 페이지 — ../shueguk-report/s.html 이 없어 건너뜀');
  }

  /* ══ ② 교사 페이지 ══════════════════════════════════════ */
  console.log('② 교사 페이지 (question.html)');
  ROWS = []; NEXT = 1; ORD = 1000;
  const mk = (name, teacher, text, photo, qtime, unit) => { const r = { id: NEXT++, created_at: new Date(Date.now() - 25 * 60000).toISOString(), qdate: today, ord: ORD++, name, school: '화정고', grade: '고1', student_id: '0', teacher, qtime: qtime || '17:30', unit: unit || '', text, photo: photo || '', status: '대기', called_at: null, done_at: null, note: '' }; ROWS.push(r); return r; };
  const a = mk('김철수', '이수경', '독서 3번', 'data:image/jpeg;base64,/9j/AAAA', '17:30', '독서');
  const b = mk('박민수', '이수경', '');
  const c = mk('최유진', '이수경', '문학 12번');
  mk('이영희', '김지원', '화작');
  const tp = await ctx.newPage();
  tp.on('pageerror', e => { bad++; console.error('  ✗ pageerror', e.message); });
  calls.length = 0;
  await tp.goto(`http://localhost:${PORT}/question.html?t=이수경`);
  await tp.waitForFunction(() => document.querySelectorAll('#waiting .item').length === 3);
  ok(calls.some(c => c.path.startsWith('/rest/v1/question_queue') && c.auth === 'Bearer tok'), '표 조회에 교사 인증 헤더');
  const listQ = calls.find(c => c.path.startsWith('/rest/v1/question_queue?select='));
  ok(listQ && !/select=[^&]*photo/.test(listQ.path) && /teacher=eq\./.test(listQ.path) && /qdate=eq\./.test(listQ.path), '목록 조회는 사진 없이 · 선생님·오늘 조건');
  await tp.waitForFunction(() => document.querySelector('#waiting img.thumb'));
  const phQ = calls.find(c => /select=id,photo/.test(c.path));
  ok(phQ && /id=in\.\(1,2,3\)/.test(phQ.path), '사진은 처음 보는 건만 따로 조회');
  ok(await tp.$$eval('#waiting img.thumb', i => i.length) === 1, '사진 있는 건만 썸네일');
  ok(await tp.$$eval('#waiting .item .nm', e => e.map(x => x.textContent).join(',')) === '김철수,박민수,최유진', '대기 순서');
  ok(/25분 기다리는 중/.test(await tp.$eval('#waiting', e => e.textContent)), '기다린 시간 표시(20분 넘으면 강조)');
  ok(/글 없이 사진만/.test(await tp.$eval('#waiting .item:nth-child(2)', e => e.textContent)), '글 없는 건 안내');
  ok(/17:30 질문 타임/.test(await tp.$eval('#waiting .item:nth-child(1)', e => e.textContent)) && await tp.$eval('#waiting .item:nth-child(1) .unit', e => e.textContent) === '독서', '질문 타임·단원 표시');
  ok(await tp.$eval('#startWrap', e => e.style.display) !== 'none', '[질문 시작] 버튼 보임');
  await shot(tp, 'teacher');

  // [질문 시작] → 1번 호출
  await tp.click('#startBtn');
  await tp.waitForFunction(() => document.querySelectorAll('#calling .item').length === 1);
  const pc = calls.filter(x => x.method === 'PATCH').pop();
  ok(/id=eq\.1$/.test(pc.path) && JSON.parse(pc.body).status === '호출' && JSON.parse(pc.body).called_at, '질문 시작 → 1번 호출 PATCH {status, called_at}');
  ok(/김철수/.test(await tp.$eval('#calling', e => e.textContent)) && await tp.$$eval('#waiting .item', e => e.length) === 2, '호출 중으로 이동');
  ok(await tp.$eval('#startWrap', e => e.style.display) === 'none', '호출 중에는 [질문 시작] 숨김');

  // 맨 뒤로
  await tp.click('#waiting .item:nth-child(1) button:has-text("맨 뒤로")');
  await tp.waitForFunction(() => document.querySelector('#waiting .item:nth-child(1) .nm').textContent === '최유진');
  ok(await tp.$$eval('#waiting .item .nm', e => e.map(x => x.textContent).join(',')) === '최유진,박민수', '맨 뒤로 → 순서 바뀜');
  ok(b.ord > c.ord, 'ord 갱신');

  // 완료 → 다음 친구(최유진) 자동 호출
  await tp.click('#calling .item button:has-text("완료 → 다음 호출")');
  await tp.waitForFunction(() => document.querySelector('#calling .item .nm') && document.querySelector('#calling .item .nm').textContent === '최유진');
  ok(a.status === '완료' && a.done_at && c.status === '호출' && c.called_at, '완료 저장 + 다음 친구 자동 호출');
  ok(await tp.$$eval('#waiting .item', e => e.length) === 1, '대기 1명 남음');
  ok(await tp.$eval('#done', e => e.style.display) === 'none', '끝난 질문은 접혀 있음');
  await tp.click('#doneTog');
  ok(/김철수/.test(await tp.$eval('#done', e => e.textContent)) && /완료/.test(await tp.$eval('#done', e => e.textContent)), '끝난 질문 목록');

  // 건너뜀 → 다음 친구(박민수) 자동 호출
  await tp.click('#calling .item button:has-text("건너뜀 → 다음 호출")');
  await tp.waitForFunction(() => document.querySelector('#calling .item .nm') && document.querySelector('#calling .item .nm').textContent === '박민수');
  ok(c.status === '건너뜀' && b.status === '호출', '건너뜀 저장 + 다음 친구 자동 호출');
  ok(await tp.$$eval('#waiting .item', e => e.length) === 0, '대기 0명');

  // 다시 대기로(건너뛴 학생) → 맨 뒤 순서
  await tp.click('#done .item:has-text("최유진") button:has-text("다시 대기로")');
  await tp.waitForFunction(() => document.querySelectorAll('#waiting .item').length === 1);
  ok(c.status === '대기' && c.ord > b.ord, '다시 대기로 → 맨 뒤 순서');

  // 완료만 (다음 호출 안 함) → 호출 중 비고 [질문 시작] 다시 보임
  await tp.click('#calling .item button:has-text("완료만")');
  await tp.waitForFunction(() => document.querySelectorAll('#calling .item').length === 0);
  ok(b.status === '완료' && c.status === '대기', '완료만 → 다음 호출 안 함');
  ok(await tp.$eval('#startWrap', e => e.style.display) !== 'none', '[질문 시작] 다시 보임');
  // 대기 카드의 [이 친구 먼저 호출]
  await tp.click('#waiting .item:nth-child(1) button:has-text("이 친구 먼저 호출")');
  await tp.waitForFunction(() => document.querySelectorAll('#calling .item').length === 1);
  ok(c.status === '호출', '개별 호출');
  await tp.click('#calling .item button:has-text("완료 → 다음 호출")');
  await tp.waitForFunction(() => document.querySelectorAll('#calling .item').length === 0);
  ok(c.status === '완료', '마지막 완료 → 더 부를 친구 없음');
  // 전체 보기 준비: 이수경 대기 2명 만들기
  c.status = '대기'; b.status = '대기';

  // 전체 보기
  await tp.selectOption('#tsel', 'all');
  await tp.waitForFunction(() => document.querySelectorAll('#waiting .item').length === 3);
  ok(await tp.$$eval('#waiting .tc', e => e.map(x => x.textContent)).then(l => l.includes('김지원T')), '전체 보기에 선생님 표시');
  // 전체 보기에서 [질문 시작] → 맨 앞 학생, 완료 → 같은 선생님의 다음 친구만
  await tp.click('#startBtn');
  await tp.waitForFunction(() => document.querySelectorAll('#calling .item').length === 1);
  const first = ROWS.find(r => r.status === '호출');
  await tp.click('#calling .item button:has-text("완료 → 다음 호출")');
  await tp.waitForFunction(nm => document.querySelectorAll('#calling .item').length === 1 && !document.querySelector('#calling .item .nm').textContent.includes(nm), first.name);
  const second = ROWS.find(r => r.status === '호출');
  ok(second && second.teacher === first.teacher, '전체 보기 완료 → 같은 선생님의 다음 친구 호출');
  b.status = '호출'; b.called_at = new Date().toISOString(); c.status = '대기';
  ROWS.forEach(r => { if (r !== b && r.status === '호출') { r.status = '대기'; } });
  ok(await tp.evaluate(() => localStorage.getItem('qq_teacher')) === 'all', '선택 기억');
  await tp.close();

  /* ══ ③ 강의실 디스플레이 ═══════════════════════════════ */
  console.log('③ 강의실 디스플레이 (question_board.html)');
  ROWS.forEach(r => { r.status = r === b ? '호출' : (r === c ? '대기' : '완료'); }); b.called_at = new Date().toISOString();
  const bp = await ctx.newPage();
  bp.on('pageerror', e => { bad++; console.error('  ✗ pageerror', e.message); });
  await bp.goto(`http://localhost:${PORT}/question_board.html?t=이수경`);
  await bp.waitForFunction(() => document.querySelector('#now .nm'));
  ok(await bp.$eval('#now .nm', e => e.textContent) === '박민수', '지금 호출 이름 크게');
  ok(await bp.$$eval('#next li', e => e.map(x => x.textContent)).then(l => l.length === 1 && /최유진/.test(l[0])), '다음 순서 목록');
  ok(/대기 1명 · 호출 1명/.test(await bp.$eval('#cnt', e => e.textContent)), '인원 표시');
  ok(/이수경 선생님/.test(await bp.$eval('#who', e => e.textContent)), '선생님 이름');
  await shot(bp, 'board');
  const bq = calls.filter(x => x.path.startsWith('/rest/v1/question_queue')).pop();
  ok(/status=in\.\(대기,호출\)/.test(decodeURIComponent(bq.path)) && bq.auth === 'Bearer tok', '대기·호출만 조회 + 교사 인증');
  // 호출 해제되면 '없어요'
  b.status = '완료';
  await bp.waitForFunction(() => /호출된 학생이 없어요/.test(document.getElementById('now').textContent), null, { timeout: 8000 });
  ok(true, '완료되면 호출 화면에서 사라짐');
  await bp.close();

  const pp = await ctx.newPage();
  await pp.goto(`http://localhost:${PORT}/question_board.html`);
  await pp.waitForFunction(() => document.querySelectorAll('#psel option').length >= 3);
  ok(await pp.$eval('#pick', e => getComputedStyle(e).display) === 'flex', '주소에 선생님이 없으면 고르기 화면');
  await pp.selectOption('#psel', '김지원');
  await Promise.all([pp.waitForNavigation(), pp.click('#pick button')]);
  ok(/t=%EA%B9%80%EC%A7%80%EC%9B%90|t=김지원/.test(decodeURIComponent(pp.url())), '고르면 ?t= 로 이동');
  await pp.close();

  await browser.close();
  server.close();
  console.log(`\n${n - bad}/${n} 통과${bad ? ' — 실패 ' + bad : ''}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
