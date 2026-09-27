/* 복습 영상 브라우저 E2E (2026-09-27)
 * 가짜 수파베이스·가짜 유튜브 플레이어로 실제 페이지를 띄워
 *   ① 교사 페이지(review.html) — 교사 인증·반 고르기·명단 대조(동명이인·미등록 안내)·배정 POST·결과 표·숨기기·명단 다시 반영
 *   ② 학생 페이지(리포트 s.html) — 허브 카드·목록·재생 중에만 시간 세기·화면을 벗어나면 멈춤·저장 본문·별 안내
 * 를 왕복 검사한다. 원격 수파베이스·유튜브에는 아무것도 보내지 않는다.
 *   실행: LC_ALL=C.UTF-8 NODE_PATH=$(npm root -g) node tools/review-e2e-test.js
 *   (LC_ALL 이 UTF-8 이 아니면 크로미엄이 한글 파일 이름을 'download'로 바꿔 내려받기 이름 검사 2건이 실패한다 — 실제 기기와 무관)
 * DB 함수의 실제 SQL 검증은 리포트 저장소 tools/review-sql-test.sh, 시간 계산은 tools/review-core-test.js.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const REPORT = path.join(ROOT, '..', 'shueguk-report');
const PORT = 8941;
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
let n = 0, bad = 0;
function ok(cond, label){ n++; if (!cond){ bad++; console.error('  ✗', label); } else console.log('  ✓', label); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const STUDENTS = [
  { name: '김철수', school: '화정고', grade: '2026 고등 1학년', student_id: '12345678', code: 'tok-kim', enrolled: '재원' },
  { name: '박민수', school: '화정고', grade: '2026 고등 1학년', student_id: '34567890', code: 'tok-park', enrolled: '재원' },
  { name: '한동명', school: '화정고', grade: '2026 고등 1학년', student_id: '11111111', code: 'tok-h1', enrolled: '재원' },
  { name: '한동명', school: '능곡고', grade: '2026 고등 1학년', student_id: '22222222', code: 'tok-h2', enrolled: '재원' },
  { name: '양지우', school: '서정고', grade: '2026 고등 1학년', student_id: '33333333', code: 'tok-yang', enrolled: '재원' },
  { name: '코드없음', school: '화정고', grade: '2026 고등 1학년', student_id: '44444444', code: '', enrolled: '재원' },
  { name: '퇴원생', school: '화정고', grade: '2026 고등 1학년', student_id: '55555555', code: 'tok-out', enrolled: '퇴원' },
];
let CLASSES = [
  { book: '정규', class_id: 'r001', day: '금', start_time: '5:30', teacher: '슈', name: '고1 가', roster: '김철수 박민수(8/30부터) 한동명 (화정)새친구 양지우A 코드없음 퇴원생' },
  { book: '정규', class_id: 'r002', day: '토', start_time: '2:00', teacher: '지원', name: '고2 가', roster: '이영희' },
  { book: '내신', class_id: 'n001', day: '수', start_time: '7:00', teacher: '슈', name: '고1 확인', roster: '김철수' },
  { book: '정규', class_id: 'w260912a', day: '토', start_time: '9:30', teacher: '슈', name: '이 주만', roster: '유령' },
];
let VIDS = [], TGTS = [], WATCH = [], FILES = [], VNEXT = 1, FNEXT = 1;
const STORE = {};   // 가짜 저장소 path → {body, type}
const stCalls = [];
const calls = [];
const saves = [];

function fakeYT(){ return `
(function(){
  function P(id, opts){
    var el = document.getElementById(id); var d = document.createElement('div'); d.id = id; d.className = 'fake-yt'; el.parentNode.replaceChild(d, el);
    this.opts = opts; this.state = -1; this.base = (opts.playerVars && opts.playerVars.start) || 0; this.at = 0; this.rate = 1;
    window.__yt = this; var me = this;
    setTimeout(function(){ opts.events.onReady({ target: me }); }, 20);
  }
  P.prototype.getPlayerState = function(){ return this.state; };
  P.prototype.getCurrentTime = function(){ return this.state === 1 ? this.base + (Date.now() - this.at) / 1000 * this.rate : this.base; };
  P.prototype.getDuration = function(){ return 100; };
  P.prototype.playVideo = function(){ if (this.state === 1) return; this.at = Date.now(); this.state = 1; this.opts.events.onStateChange({ data: 1 }); };
  P.prototype.pauseVideo = function(){ if (this.state !== 1) return; this.base = this.getCurrentTime(); this.state = 2; this.opts.events.onStateChange({ data: 2 }); };
  P.prototype.seekTo = function(t){ this.base = t; this.at = Date.now(); };
  P.prototype.destroy = function(){ this.state = -1; window.__ytDestroyed = (window.__ytDestroyed || 0) + 1; };
  window.YT = { Player: P };
  setTimeout(function(){ window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(); }, 10);
})();`; }

function rpc(fn, body){
  const p = body.p || {};
  if (fn === 'review_list'){
    if (p.key !== 'tok-kim') return { ok: false, error: 'no_student' };
    return { ok: true, done_pct: 90, items: [
      { id: 7, yt: 'dQw4w9WgXcQ', title: '9/27 문학 복습', memo: '', duration: 0, at: '2026-09-27T01:00:00Z', cls: '고1 가', pct: 0, sec: 0, pos: 0, done: false, nfiles: 1 },
      { id: 8, yt: 'aaaaaaaaaaa', title: '지난 복습', memo: '', duration: 600, at: '2026-09-20T01:00:00Z', cls: '고1 가', pct: 100, sec: 640, pos: 0, done: true } ] };
  }
  if (fn === 'review_open'){
    if (+p.video !== 7) return { ok: false, error: 'not_assigned' };
    return { ok: true, done_pct: 90, id: 7, yt: 'dQw4w9WgXcQ', title: '9/27 문학 복습', memo: '', duration: 0, bits: '', pct: 0, sec: 0, pos: 0, done: false,
             files: [{ id: 31, name: '9월 복습지.pdf', size: 2400000 }] };
  }
  if (fn === 'review_file_url'){
    if (p.key !== 'tok-kim' || +p.file !== 31) return { ok: false, error: 'not_assigned' };
    STORE['v7/abc.pdf'] = STORE['v7/abc.pdf'] || { body: Buffer.from('%PDF-1.4 fake'), type: 'application/pdf' };
    return { ok: true, bucket: 'review-files', path: 'v7/abc.pdf', name: '9월 복습지.pdf', size: 2400000, mime: 'application/pdf' };
  }
  if (fn === 'review_save'){
    saves.push(p);
    return { ok: true, pct: 42, done: saves.length >= 2, first: saves.length === 2, sec: 10, done_pct: 90 };
  }
  return null;
}
function applyFilter(rows, url){
  const u = new URL(url);
  u.searchParams.forEach((v, k) => {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) return;
    const m = v.match(/^(eq|not\.like)\.(.*)$/); if (!m) return;
    if (m[1] === 'eq') rows = rows.filter(r => String(r[k]) === m[2]);
    else rows = rows.filter(r => !String(r[k]).startsWith(m[2].replace('*', '')));
  });
  return rows;
}

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const f = p.startsWith('/report/') ? path.join(REPORT, p.slice(8)) : path.join(ROOT, p === '/' ? 'index.html' : p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); res.end(fs.readFileSync(f));
  }).listen(PORT);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  ctx.setDefaultTimeout(8000);
  ctx.on('dialog', d => d.accept());
  await ctx.route('**/*', async route => {
    const req = route.request(), url = req.url();
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: obj === null ? '' : JSON.stringify(obj) });
    if (req.method() === 'OPTIONS') return json(null, 204);
    if (url.startsWith('https://www.youtube.com/iframe_api')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fakeYT() });
    if (url.includes('ytimg.com') || url.includes('fonts.g')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.startsWith(SB)){
      const rec = { method: req.method(), path: url.slice(SB.length), auth: req.headers()['authorization'] || '', body: req.postData(), prefer: req.headers()['prefer'] || '' };
      calls.push(rec);
      if (rec.path.startsWith('/auth/v1/token')) return json({ access_token: 'tok', expires_in: 3600 });
      if (rec.path.startsWith('/storage/v1/object')){
        stCalls.push({ method: rec.method, path: rec.path, auth: rec.auth, type: req.headers()['content-type'] || '' });
        const m = rec.path.match(/^\/storage\/v1\/object\/(?:authenticated\/)?review-files\/?(.*)$/);
        const pth = m ? decodeURIComponent(m[1]) : '';
        if (rec.method === 'POST'){ if (rec.auth !== 'Bearer tok') return json({ error: 'need teacher' }, 403); STORE[pth] = { body: req.postDataBuffer(), type: req.headers()['content-type'] }; return json({ Key: 'review-files/' + pth }); }
        if (rec.method === 'DELETE'){ JSON.parse(rec.body).prefixes.forEach(x => delete STORE[x]); return json([]); }
        if (rec.method === 'GET'){ const o = STORE[pth]; if (!o) return json({ error: 'not found' }, 400);
          return route.fulfill({ status: 200, contentType: o.type || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: o.body }); }
      }
      if (rec.path.startsWith('/rest/v1/rpc/student_bundle')) return json({ error: 'nope' }, 500);
      if (rec.path.startsWith('/rest/v1/rpc/')){
        const out = rpc(rec.path.slice(13).split('?')[0], rec.body ? JSON.parse(rec.body) : {});
        return out === null ? json({ error: 'unknown' }, 404) : json(out);
      }
      if (rec.auth !== 'Bearer tok') return json({ error: 'need teacher' }, 401);
      const tbl = rec.path.slice(9).split('?')[0];
      const M = { tt_classes: CLASSES, students: STUDENTS, review_videos: VIDS, review_targets: TGTS, review_watch: WATCH, review_files: FILES };
      if (!M[tbl]) return json({ error: 'unhandled ' + tbl }, 404);
      if (rec.method === 'GET'){
        const off = +(new URL(url).searchParams.get('offset') || 0);
        return json(off ? [] : applyFilter(M[tbl], url));
      }
      if (rec.method === 'POST'){
        const arr = [].concat(JSON.parse(rec.body));
        if (tbl === 'review_videos'){ const r = Object.assign({ id: VNEXT++, active: true, duration: 0, created_at: new Date().toISOString() }, arr[0]); VIDS.unshift(r); return json([r], 201); }
        if (tbl === 'review_files'){ arr.forEach(x => FILES.push(Object.assign({ id: FNEXT++ }, x))); return json(null, 201); }
        if (tbl === 'review_targets'){ arr.forEach(x => { if (!TGTS.some(t => t.video_id === x.video_id && t.code === x.code)) TGTS.push(x); }); return json(null, 201); }
      }
      if (rec.method === 'PATCH' && tbl === 'review_videos'){
        const id = +new URL(url).searchParams.get('id').slice(3); Object.assign(VIDS.find(v => v.id === id), JSON.parse(rec.body)); return json(null, 204);
      }
      if (rec.method === 'DELETE' && tbl === 'review_files'){
        const id = +new URL(url).searchParams.get('id').slice(3); const i = FILES.findIndex(f => f.id === id); if (i >= 0) FILES.splice(i, 1); return json(null, 204);
      }
      if (rec.method === 'DELETE' && tbl === 'review_videos'){
        const id = +new URL(url).searchParams.get('id').slice(3);
        VIDS = VIDS.filter(v => v.id !== id); TGTS = TGTS.filter(t => t.video_id !== id); WATCH = WATCH.filter(w => w.video_id !== id); return json(null, 204);
      }
      return json({ error: 'unhandled' }, 404);
    }
    if (url.includes('script.google.com') || url.includes('script.googleusercontent.com')){
      const cbm = url.match(/[?&]callback=([^&]+)/);
      if (cbm) return route.fulfill({ status: 200, contentType: 'text/javascript', body: `window[${JSON.stringify(cbm[1])}] && window[${JSON.stringify(cbm[1])}]({result:'success'})` });
      if (/[?&]key=/.test(url) && !/action=/.test(url))
        return json({ result: 'success', info: { name: '김철수', id: '12345678', school: '화정고', grade: '2026 고등 1학년', teacher: '이수경', enrolled: '재원', classA: '금 5:30', classB: '' }, authed: false, examCount: 0, notices: [], homework: [], analyses: [], clinic: null, stars: null, mockGates: { grades: [], open: false }, clinicEligible: false, vocaTaken: false, mockSignups: [] });
      return json({ result: 'success', grades: [], open: false });
    }
    return route.continue();
  });

  /* ══ ① 교사 페이지 ══ */
  console.log('① 교사 페이지 (review.html)');
  const tp = await ctx.newPage();
  tp.on('pageerror', e => { bad++; console.error('  ✗ pageerror', e.message); });
  await tp.goto(`http://localhost:${PORT}/review.html`);
  await tp.waitForSelector('#clsList .cls-item');
  ok(await tp.locator('#clsList .cls-item').count() === 2, '정규 반 2개(이 주만 반 제외)');
  ok(calls.some(c => c.path.startsWith('/rest/v1/tt_classes') && c.auth === 'Bearer tok'), '교사 인증으로 시간표 조회');
  ok(/배정한 영상이 없어요/.test(await tp.textContent('#vids')), '빈 목록 안내');
  await tp.fill('#ytUrl', 'https://youtu.be/dQw4w9WgXcQ?si=x');
  ok(/dQw4w9WgXcQ/.test(await tp.textContent('#ytPrev')), '주소에서 영상 ID 인식');
  ok(await tp.isDisabled('#goBtn'), '반을 안 고르면 배정 버튼 잠김');
  await tp.selectOption('#tSel', '슈');
  ok(await tp.locator('#clsList .cls-item').count() === 1 && /이수경T/.test(await tp.textContent('#tSel')), '강사 거르기(슈 → 이수경T)');
  await tp.check('#clsList input[data-k="정규|r001"]');
  const sum = await tp.textContent('#sum');
  ok(/배정할 학생 3명/.test(sum), '배정할 학생 3명(김철수·박민수·양지우A→양지우): ' + sum.slice(0, 40));
  ok(/동명이인.*한동명/.test(sum) && /명단에 없는.*새친구/.test(sum) && /접근코드.*코드없음/.test(sum) && /퇴원생/.test(sum), '못 넣는 학생 안내(동명이인·미등록·코드 없음·퇴원)');
  ok(!(await tp.isDisabled('#goBtn')), '배정 버튼 열림');
  await tp.fill('#vTitle', '9/27 문학 복습');
  await tp.setInputFiles('#vFiles', [
    { name: '9월 복습지.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 hello') },
    { name: '빈파일.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) } ]);
  ok(/9월 복습지\.pdf/.test(await tp.textContent('#fSel')) && /빈 파일이라 올리지 않아요/.test(await tp.textContent('#fSel')), '고른 파일 목록·빈 파일 안내');
  // 내신으로 바꿔 한 반 더
  await tp.click('#bk-내신'); await tp.waitForSelector('#clsList input[data-k="내신|n001"]');
  await tp.check('#clsList input[data-k="내신|n001"]');
  ok(/고른 반 <b>2개|고른 반 2개/.test(await tp.textContent('#sum')) && /배정할 학생 3명/.test(await tp.textContent('#sum')), '정규+내신 두 반, 같은 학생은 한 번');
  await tp.click('#goBtn');
  await tp.waitForSelector('.vid h3');
  const vpost = calls.find(c => c.method === 'POST' && c.path.startsWith('/rest/v1/review_videos'));
  const vb = JSON.parse(vpost.body);
  ok(vb.yt_id === 'dQw4w9WgXcQ' && vb.title === '9/27 문학 복습' && vb.classes.length === 2 && vb.classes[0].class_id === 'r001', '영상 POST 본문');
  const tpost = calls.find(c => c.method === 'POST' && c.path.startsWith('/rest/v1/review_targets'));
  const tb = JSON.parse(tpost.body);
  ok(tb.length === 3 && tb.every(r => r.video_id === 1) && tb.map(r => r.code).sort().join() === 'tok-kim,tok-park,tok-yang', '배정 POST 3명(접근코드)');
  ok(/on_conflict=video_id,code/.test(tpost.path) && /ignore-duplicates/.test(tpost.prefer), '중복 무시 옵션');
  ok(tb.find(r => r.code === 'tok-kim').class_name === '고1 가', '반 이름 기록');
  ok(await tp.locator('#clsList input:checked').count() === 0 && (await tp.inputValue('#ytUrl')) === '', '배정 뒤 입력 비움');
  const up = stCalls.filter(c => c.method === 'POST');
  ok(up.length === 1 && /^\/storage\/v1\/object\/review-files\/v1\/[0-9a-f]{24}\.pdf$/.test(up[0].path) && up[0].auth === 'Bearer tok' && /pdf/.test(up[0].type), '자료 파일 저장소에 올림(교사 인증·무작위 경로): ' + (up[0] && up[0].path));
  ok(FILES.length === 1 && FILES[0].video_id === 1 && FILES[0].name === '9월 복습지.pdf' && FILES[0].size === 14 && FILES[0].path === decodeURIComponent(up[0].path.split('review-files/')[1]), '파일 목록 표 기록(원래 이름·크기)');
  await tp.waitForSelector('.vfiles .fchip');
  ok(/9월 복습지\.pdf/.test(await tp.textContent('.vfiles')), '영상 카드에 자료 칩');
  const [tdl] = await Promise.all([tp.waitForEvent('download'), tp.click('.vfiles .fchip a')]);
  ok(tdl.suggestedFilename() === '9월 복습지.pdf', '선생님 자료 내려받기(원래 이름)');
  // 시청 기록 넣고 결과
  WATCH.push({ video_id: 1, code: 'tok-kim', pct: 95, total_sec: 610, updated_at: '2026-09-27T10:00:00Z', completed_at: '2026-09-27T10:00:00Z' });
  WATCH.push({ video_id: 1, code: 'tok-park', pct: 30, total_sec: 200, updated_at: '2026-09-27T11:00:00Z', completed_at: null });
  VIDS[0].duration = 600;
  await tp.reload(); await tp.waitForSelector('.vid h3');
  const stat = await tp.textContent('.vid .stat');
  ok(/완료 1 \/ 3명/.test(stat) && /시작 2명/.test(stat) && /평균 본 구간 42%/.test(stat) && /13분 30초/.test(stat), '영상 요약: ' + stat);
  await tp.click('text=학생별 결과');
  const rows = await tp.$$eval('.res tbody tr', trs => trs.map(t => t.textContent));
  ok(rows.length === 3 && /양지우/.test(rows[0]) && /안 봄/.test(rows[0]) && /김철수/.test(rows[2]) && /완료 ✓/.test(rows[2]), '결과 표 순서(안 본 학생 먼저)');
  ok(/10분 10초/.test(rows[2]) && /95%/.test(rows[2]), '시청 시간·본 구간 표시');
  await tp.selectOption('.res select', 'none');
  ok(await tp.locator('.res tbody tr').count() === 1, '거르기: 아직 안 봄 1명');
  // 명단 다시 반영: 새 학생
  STUDENTS.push({ name: '신입생', school: '화정고', grade: '2026 고등 1학년', student_id: '66666666', code: 'tok-new', enrolled: '재원' });
  await tp.reload(); await tp.waitForSelector('.vid h3');
  CLASSES[0].roster += ' 신입생';
  await tp.click('text=반 명단 다시 반영');
  await tp.waitForFunction(() => /완료 1 \/ 4명/.test(document.querySelector('.vid .stat').textContent));
  ok(TGTS.filter(t => t.video_id === 1).length === 4 && TGTS.some(t => t.code === 'tok-new'), '명단 다시 반영: 신입생 1명 추가');
  await tp.click('text=학생 화면에서 숨기기');
  await tp.waitForSelector('.vid.off');
  ok(VIDS[0].active === false && /숨김/.test(await tp.textContent('.vid h3')), '숨기기 PATCH');
  const fpath = FILES[0].path;
  await tp.click('.vfiles .fchip button');
  await tp.waitForFunction(() => !document.querySelector('.vfiles'));
  ok(FILES.length === 0 && !STORE[fpath] && stCalls.some(c => c.method === 'DELETE'), '자료 파일 지우기(표·저장소)');
  const [chooser] = await Promise.all([tp.waitForEvent('filechooser'), tp.click('text=자료 파일 추가')]);
  await chooser.setFiles([{ name: '추가 자료.hwp', mimeType: 'application/x-hwp', buffer: Buffer.from('hwp') }]);
  await tp.waitForSelector('.vfiles .fchip');
  ok(FILES.length === 1 && FILES[0].name === '추가 자료.hwp' && /\.hwp$/.test(FILES[0].path), '기존 영상에 자료 추가');
  const p2 = FILES[0].path;
  await tp.click('text=삭제');
  await tp.waitForFunction(() => /배정한 영상이 없어요/.test(document.getElementById('vids').textContent));
  ok(!STORE[p2] && VIDS.length === 0, '영상 삭제 때 저장소 파일도 지움');
  await tp.close();

  /* ══ ② 학생 페이지 ══ */
  if (fs.existsSync(path.join(REPORT, 's.html'))){
    console.log('② 학생 페이지 (s.html 복습 영상)');
    const pg = await ctx.newPage();
    pg.on('pageerror', e => { bad++; console.error('  ✗ pageerror', e.message); });
    await pg.addInitScript(() => {
      window.__hid = false;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hid });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__hid ? 'hidden' : 'visible' });
    });
    await pg.goto(`http://localhost:${PORT}/report/s.html?key=tok-kim`);
    await pg.waitForFunction(() => /복습 영상/.test(document.getElementById('menu').textContent));
    const card = pg.locator('#menu .card', { hasText: '복습 영상' });
    ok(/볼 영상 1개/.test(await card.textContent()) && await card.locator('.new-dot').count() === 1, '허브 카드: 볼 영상 1개 + 뱃지');
    await card.click();
    await pg.waitForSelector('#rvList .rv-item');
    const items = await pg.$$eval('#rvList .rv-item', a => a.map(x => x.textContent));
    ok(items.length === 2 && /자료 1개/.test(items[0]) && /아직 안 봄/.test(items[0]) && /시청 완료 ✓/.test(items[1]) && /10분 40초/.test(items[1]), '영상 목록');
    await pg.click('#rvList .rv-item >> nth=0');
    await pg.waitForFunction(() => window.__yt && document.getElementById('rvTtl').textContent === '9/27 문학 복습');
    ok(calls.some(c => c.path.includes('/rpc/review_open') && JSON.parse(c.body).p.key === 'tok-kim'), 'review_open 호출(접근코드)');
    ok(/수업 자료/.test(await pg.textContent('#rvFiles')) && /9월 복습지\.pdf/.test(await pg.textContent('#rvFiles')) && /2\.3MB/.test(await pg.textContent('#rvFiles')), '학생 화면 자료 목록(이름·크기)');
    const [sdl] = await Promise.all([pg.waitForEvent('download'), pg.click('#rvDl31')]);
    ok(sdl.suggestedFilename() === '9월 복습지.pdf', '학생 자료 내려받기(원래 이름)');
    const g = stCalls.filter(c => c.method === 'GET' && c.path.includes('/object/authenticated/review-files/v7/abc.pdf'));
    ok(g.length === 1 && /sb_publishable_/.test(g[0].auth), '공개 키로 저장소에서 받음(창 연 뒤)');
    ok(calls.some(c => c.path.includes('/rpc/review_file_url') && JSON.parse(c.body).p.file === 31), 'review_file_url 호출');
    // 재생 전에는 세지 않음
    await sleep(1500);
    ok(/시청 시간 0초/.test(await pg.textContent('#rvSec')), '재생 전엔 0초');
    await pg.evaluate(() => window.__yt.playVideo());
    await sleep(4300);
    const sec1 = await pg.textContent('#rvSec'), pct1 = await pg.textContent('#rvPct');
    ok(/시청 시간 [34]초/.test(sec1), '재생 중 시간 셈: ' + sec1);
    ok(/본 구간 [45]%/.test(pct1), '본 구간 %: ' + pct1);
    // 화면을 벗어남 → 영상 멈춤 + 안내 + 저장
    const nSave = saves.length;
    await pg.evaluate(() => { window.__hid = true; document.dispatchEvent(new Event('visibilitychange')); });
    ok(await pg.evaluate(() => window.__yt.getPlayerState()) === 2, '화면을 벗어나면 영상 멈춤');
    await sleep(600);
    ok(saves.length > nSave, '벗어날 때 저장');
    const s1 = saves[saves.length - 1];
    ok(s1.key === 'tok-kim' && s1.video === 7 && s1.duration === 100 && s1.add_sec >= 3 && s1.add_sec <= 4 && s1.ranges.length === 1 && s1.ranges[0][0] === 0, '저장 본문: ' + JSON.stringify(s1));
    // 벗어난 채로 누가 재생해도(백그라운드) 세지 않음
    await pg.evaluate(() => window.__yt.playVideo());
    await sleep(2300);
    ok(await pg.textContent('#rvSec') === sec1 || /시청 시간 [34]초/.test(await pg.textContent('#rvSec')), '화면 밖 재생은 세지 않음');
    await pg.evaluate(() => { window.__yt.pauseVideo(); window.__hid = false; document.dispatchEvent(new Event('visibilitychange')); });
    ok(/화면을 벗어나서 영상을 멈췄어요/.test(await pg.textContent('#rvWarn')), '돌아오면 멈춘 이유 안내');
    // 영상을 화면 밖으로 스크롤 → 세지 않음 안내
    await pg.evaluate(() => { document.body.style.paddingBottom = '3000px'; window.__yt.playVideo(); });
    await sleep(1300);
    const before = await pg.textContent('#rvSec');
    await pg.evaluate(() => window.scrollTo(0, 2500));
    await sleep(2300);
    ok(/화면에 보여야/.test(await pg.textContent('#rvWarn')), '영상이 안 보이면 안내');
    const after = await pg.textContent('#rvSec');
    ok(parseInt(after.replace(/\D/g, '')) - parseInt(before.replace(/\D/g, '')) <= 1, '영상이 안 보이면 세지 않음: ' + before + ' → ' + after);
    await pg.evaluate(() => window.scrollTo(0, 0));
    await sleep(1200);
    // 멈춤 → 저장 → 두 번째 저장 응답 first → 별 안내
    await pg.evaluate(() => window.__yt.pauseVideo());
    await pg.waitForFunction(() => document.getElementById('rvStar').classList.contains('on'));
    ok(true, '90% 첫 도달 → 별 +1 안내');
    // 목록으로 돌아가면 플레이어 정리 + 목록 새로 받음
    const nList = calls.filter(c => c.path.includes('/rpc/review_list')).length;
    await pg.click('#rvBack');
    await pg.waitForFunction(() => document.getElementById('rvListBox').style.display === 'block');
    await sleep(500);
    ok(await pg.evaluate(() => window.__ytDestroyed) >= 1, '목록으로 가면 플레이어 정리');
    ok(calls.filter(c => c.path.includes('/rpc/review_list')).length > nList, '목록으로 가면 진행 새로 받음');
    await pg.click('#rvBack');
    await pg.waitForFunction(() => document.getElementById('hubView').style.display !== 'none');
    ok(true, '메뉴로 돌아감');
    await pg.close();
  } else console.log('② 학생 페이지 — ../shueguk-report/s.html 이 없어 건너뜀');

  await browser.close(); server.close();
  console.log((bad ? '실패 ' + bad + ' / ' : '통과 ') + n + '건');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
