// 슈핏 문법(shufit_grammar.html) — 문항 고르기 · A4 인쇄 · 중철 책자(A3→A4) · H WORK 출제 E2E
// LC_ALL=C.UTF-8 NODE_PATH=$(npm root -g) node tools/shufit-e2e.js [캡처 폴더]   (옆에 shueguk-h-work 저장소가 있어야 한다 — gbank.css·oh.js)
// 가짜 수파베이스(표·함수)로 돈다. 실제 문항(저작권 자료)은 저장소에 없으므로 기본은 가짜 문항 4개,
// GBANK_JSON=<리포트 tools/gbank_load.py build 결과> 를 주면 그 문항으로 출제·책자 화면을 그려 캡처한다.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SHOT = process.argv[2] || '';
const PORT = 8781;
const HW = path.join(ROOT, '..', 'shueguk-h-work');
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : (f.endsWith('.css') ? 'text/css' : 'application/octet-stream') }); r.end(b); });
}).listen(PORT);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'OK ' : 'FAIL ') + m); };
const U = 'http://localhost:' + PORT + '/';

const ch = (ans) => '<div class="ch">' + [1, 2, 3, 4, 5].map(n => `<div class="c"><span class="cn" data-d="${n}">${'①②③④⑤'[n - 1]}</span><span class="ct">선지 ${n}</span></div>`).join('') + '</div>';
let ITEMS = [
  { id: 101, area: '음운', lvl: '심화', src: '2026 사설 1회 · 고3', kind: '사설', year: '2026', pid: 'p7', ord: 1, html: '<div class="qh"><div class="stem">지문 세트 첫 문항 반모음</div></div>' + ch(), ans: 2, good: '해설 일', bad: ['① 오답 일'], plain: '지문 세트 첫 문항 반모음' },
  { id: 102, area: '음운', lvl: '심화', src: '2026 사설 1회 · 고3', kind: '사설', year: '2026', pid: 'p7', ord: 2, html: '<div class="qh"><div class="stem">지문 세트 둘째 문항</div></div>' + ch(), ans: 4, good: '해설 이', bad: [], plain: '지문 세트 둘째 문항' },
  { id: 103, area: '음운', lvl: '기본', src: '2026학년도 3월 교육청 · 고1', kind: '교육청', year: '2026', pid: '', ord: 3, html: '<div class="qh"><div class="stem">혼자 문항 셋</div></div>' + ch(), ans: 1, good: '해설 삼', bad: [], plain: '혼자 문항 셋' },
  { id: 104, area: '품사', lvl: '실력', src: '2026학년도 6월 평가원 · 고3', kind: '평가원', year: '2026', pid: '', ord: 4, html: '<div class="qh"><div class="stem">품사 문항 넷</div></div>' + ch(), ans: 5, good: '해설 사', bad: [], plain: '품사 문항 넷' },
];
let PAS = [{ pid: 'p7', html: '<p class="pp">지문 본문 글입니다.</p>' }];
if (process.env.GBANK_JSON) { const d = JSON.parse(fs.readFileSync(process.env.GBANK_JSON, 'utf8')); ITEMS = d.items; PAS = d.passages; }
const REAL = !!process.env.GBANK_JSON;

let RS_MODE = false;   // 068 — 이미 낸 교재 과제(SHUEGUK REAL) 원문 잇기
const RQ = n => `<div class="qh"><div class="stem">교재 문항 ${n}</div></div><div class="qb"><div class="bogi"><div class="bl">보기</div><div class="cp">㉠ 보기 글</div></div>` + [1, 2, 3, 4, 5].map(k => `<div class="ch"><span class="cn">${'①②③④⑤'[k - 1]}</span> 선지</div>`).join('') + '</div>';
const DB = { hws: [{ teacher: '이현지', code: '일반 과제', data: { count: 2, items: {} } }, { teacher: '김지원', code: '지원 과제', data: { bank: { '1': 104 } } }], papers: [{ id: 1, teacher: '김지원', title: '지원 모의 1', ids: [103], updated_at: '2026-11-16' }], paperPosts: [], posts: [], saved: null, qa: [], patches: [], deletes: [], calls: [] };

function fake(rt, u, method, body) {
  const hw = u.match(/coke4497-sys\.github\.io\/shueguk-h-work\/([a-z0-9_.-]+)/i);
  if (hw) { const f = path.join(HW, hw[1]); return fs.existsSync(f) ? rt.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.css') ? 'text/css' : (f.endsWith('.js') ? 'text/javascript' : 'image/png') }) : rt.fulfill({ status: 404, body: '' }); }
  if (u.includes('teacher-gate.js') || u.includes('activity.js') || u.includes('me-back.js')) return rt.fulfill({ body: '', contentType: 'text/javascript' });
  if (u.includes('teacher-name.js')) return rt.fulfill({ body: 'window.shuegukTeacherName=()=>Promise.resolve("이현지");', contentType: 'text/javascript' });
  if (u.includes('/auth/v1/token')) return rt.fulfill({ json: { access_token: 'T', expires_in: 3600 } });
  if (u.includes('fonts.g')) return rt.fulfill({ body: '' });
  if (u.includes('script.google.com')) { DB.posts.push(JSON.parse(body || '{}')); return rt.fulfill({ json: { ok: true, msg: '저장되었습니다' } }); }
  const rest = u.split('/rest/v1')[1] || '';
  if (rest.startsWith('/gbank_items')) {
    const m = rest.match(/id=eq\.(\d+)/), mi = rest.match(/id=in\.\(([\d,]+)\)/);
    if (mi) return rt.fulfill({ json: ITEMS.filter(x => mi[1].split(',').includes(String(x.id))) });
    return rt.fulfill({ json: m ? ITEMS.filter(x => x.id == m[1]) : (rest.includes('offset=0') ? ITEMS : []) });
  }
  if (rest.startsWith('/gbank_passages') && rest.includes('pid=in.')) return rt.fulfill({ json: PAS });
  if (rest.startsWith('/gbank_passages')) { const m = rest.match(/pid=eq\.([^&]+)/); return rt.fulfill({ json: m ? PAS.filter(p => p.pid === decodeURIComponent(m[1])) : (rest.includes('offset=0') ? PAS : []) }); }
  if (rest.startsWith('/hwork_homeworks')) {
    if (method === 'POST') { DB.saved = JSON.parse(body)[0]; return rt.fulfill({ status: 201, body: '' }); }
    if (rest.includes('teacher=eq') && RS_MODE) return rt.fulfill({ json: [{ data: { count: 3 } }] });
    if (rest.includes('teacher=eq')) return rt.fulfill({ json: [{ data: { bank: { '1': 101, '2': 102, '3': 103 } } }] });
    return rt.fulfill({ json: rest.includes('offset=0') ? DB.hws : [] });
  }
  if (rest.startsWith('/shufit_papers')) {
    if (method === 'PATCH') { const q = new URLSearchParams(rest.split('?')[1]); const t = q.get('teacher').replace(/^eq\./, ''), ti = q.get('title').replace(/^eq\./, ''); const b = JSON.parse(body); DB.paperPatches = (DB.paperPatches || []).concat([{ t, ti, b }]); DB.papers.filter(p => p.teacher === t && p.title === ti).forEach(p => Object.assign(p, b)); return rt.fulfill({ status: 204, body: '' }); }
    if (method === 'DELETE') { DB.paperDels = (DB.paperDels || []).concat([rest]); const q = new URLSearchParams(rest.split('?')[1]); const t = q.get('teacher').replace(/^eq\./, ''), ti = q.get('title').replace(/^eq\./, ''); DB.papers = DB.papers.filter(p => !(p.teacher === t && p.title === ti)); return rt.fulfill({ status: 204, body: '' }); }
    if (method === 'POST') { const r = JSON.parse(body)[0]; DB.paperPosts.push({ rest, r }); DB.papers = DB.papers.filter(p => !(p.teacher === r.teacher && p.title === r.title)); const row = Object.assign({ id: 50 + DB.paperPosts.length, updated_at: '2026-11-17' }, r); DB.papers.unshift(row); return rt.fulfill({ status: 201, json: [row] }); }
    return rt.fulfill({ json: rest.includes('offset=0') ? DB.papers : [] });
  }
  if (rest.startsWith('/hwork_src_items')) { DB.calls.push({ fn: 'src', rest }); return rt.fulfill({ json: [{ no: '2', html: RQ(2), pid: 'wb-P1', type: '5지', ans: '③', essay: '', src: '건대부고3 24 1 중간', err: false, book: '문장 1권(기본·실력)' }] }); }
  if (rest.startsWith('/hwork_src_passages')) return rt.fulfill({ json: [{ pid: 'wb-P1', html: '<div class="psg">교재 지문 글 나랏 말ᄊᆞ미</div>' }] });
  if (rest.startsWith('/students')) return rt.fulfill({ json: rest.includes('offset=0') ? [{ school: '화정고', enrolled: '재원' }, { school: '능곡고', enrolled: '재원' }, { school: '옛학교', enrolled: '퇴원' }] : [] });
  if (rest.startsWith('/hwork_submissions')) { const m = rest.match(/id=eq\.(\d+)/); return rt.fulfill({ json: m && DB.sub && DB.sub.id == m[1] ? [DB.sub] : [] }); }
  if (rest.startsWith('/hwork_retests')) return rt.fulfill({ json: [] });
  if (rest.startsWith('/hwork_qa')) {
    if (method === 'GET') { const m = rest.match(/sub_id=eq\.(\d+)/); return rt.fulfill({ json: m ? DB.qa.filter(x => x.sub_id == m[1]) : DB.qa.slice().sort((a, b) => b.id - a.id) }); }
    if (method === 'POST') { const r = JSON.parse(body); const row = Object.assign({ id: 900 + DB.qa.length, at: new Date().toISOString(), read_at: null, mine: '', s: DB.qa[0].s }, r); DB.qa.push(row); DB.calls.push({ fn: 'qa-post', r }); return rt.fulfill({ status: 201, json: [row] }); }
    if (method === 'PATCH') { DB.patches.push(rest); return rt.fulfill({ status: 204, body: '' }); }
    if (method === 'DELETE') { DB.deletes.push(rest); return rt.fulfill({ status: 204, body: '' }); }
  }
  // 학생 함수
  const fn = (u.match(/\/rpc\/([a-z_]+)/) || [])[1];
  if (fn) { const p = (JSON.parse(body || '{}').p) || {}; DB.calls.push({ fn, p }); return rt.fulfill({ json: rpc(fn, p) }); }
  return rt.fulfill({ status: 404, body: '' });
}

const BANK = { '1': 101, '2': 102, '3': 103 };
const KEY = { '1': 2, '2': 4, '3': 1 };
const S = { id: 55, key: 'ffffffffffffffffffffffffffffffff', review: {}, msgs: [] };
function rpc(fn, p) {
  if (fn === 'hwork_list') return { ok: true, list: [{ teacher: '이현지', code: '[모의고사 문법] 음운 1회', due: '', closed: false }] };
  if (fn === 'hwork_meta') return { ok: true, meta: { teacher: '이현지', code: '[모의고사 문법] 음운 1회', count: 3, schools: ['화정고'], items: { '1': { type: 'choice5' }, '2': { type: 'choice5' }, '3': { type: 'choice5' } }, due: '', closed: false, bank: true } };
  if (fn === 'hwork_qs' && RS_MODE) return { ok: true, style: 'real', items: { '1': { html: RQ(1), pid: 'wb-P1', src: 'A고' }, '2': { html: RQ(2), pid: 'wb-P1', src: 'B고' }, '3': { html: RQ(3), pid: '', src: 'C고' } }, passages: { 'wb-P1': '<div class="psg">교재 지문 글 나랏 말ᄊᆞ미</div>' } };
  if (fn === 'hwork_qs') { const it = {}, ps = {}; for (const k in BANK) { const g = ITEMS.find(x => x.id === BANK[k]); it[k] = { html: g.html, pid: g.pid, src: g.src }; if (g.pid) ps[g.pid] = PAS.find(x => x.pid === g.pid).html; } return { ok: true, items: it, passages: ps }; }
  if (fn === 'hwork_submit') {
    const d = {}; let got = 0; for (const q in KEY) { const okv = String(p.answers[q]) === String(KEY[q]); if (okv) got++; d[q] = { type: 'choice5', mine: String(p.answers[q] || ''), ok: okv }; if (okv) d[q].ans = String(KEY[q]); }
    S.detail = d; S.teacher = p.teacher; S.code = p.code; S.name = p.name;
    return { ok: true, id: S.id, key: S.key, result: { got, total: 3, count: 3, detail: d }, student: { teacher: p.teacher, code: p.code, school: p.school, grade: p.grade, name: p.name } };
  }
  if (fn === 'hwork_qa_mine') return p.key === 'tok-kim' ? { ok: true, list: [{ id: S.id, key: S.key, teacher: '이현지', code: S.code, ts: '2026-11-17 15:00', unread: 1, msgs: 2, done: false }] } : { ok: false, error: 'no_student' };
  if (p.id !== S.id || p.key !== S.key) return { ok: false, error: '제출 기록을 찾을 수 없습니다.' };
  const msgs = () => S.msgs.map(m => Object.assign({}, m));
  if (fn === 'hwork_qa_list') { const r = msgs(); S.msgs.forEach(m => { if (m.who === '선생님') m.read = true; }); return { ok: true, msgs: r }; }
  if (fn === 'hwork_qa_post') { if (!p.text) return { ok: false, error: '질문을 적어 주세요.' }; S.msgs.push({ id: S.msgs.length + 1, q: p.q, who: '학생', name: S.name, body: p.text, mine: S.detail[p.q].mine, at: '2026-11-17 15:10', read: false }); return { ok: true, msgs: msgs() }; }
  if (fn === 'hwork_flag') { (S.review[p.q] = S.review[p.q] || { tries: [] })[p.kind] = { at: '15:10', text: p.text }; return { ok: true, q: p.q, kind: p.kind, at: '15:10' }; }
  if (fn === 'hwork_expl' && RS_MODE) { if (!S.detail[p.q].ok && !(S.review[p.q] || {}).cleared_at) return { ok: false, reason: 'locked', error: '잠김' }; return { ok: true, q: p.q, kind: 'src', type: '5지', ans_text: '②', essay: '', err: false }; }
  if (fn === 'hwork_expl') { if (!S.detail[p.q].ok && !(S.review[p.q] || {}).cleared_at) return { ok: false, reason: 'locked', error: '잠김' }; const g = ITEMS.find(x => x.id === BANK[p.q]); return { ok: true, ans: g.ans, good: g.good, bad: g.bad }; }
  if (fn === 'hwork_retry_state') return { ok: true, stage: 'fix', teacher: S.teacher, code: S.code, name: S.name, got: 1, total: 3, detail: S.detail, review: S.review, answers: {} };
  return { ok: false };
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.route('**/*', rt => { const r = rt.request(), u = r.url(); if (u.startsWith(U)) return rt.continue(); return fake(rt, u, r.method(), r.postData()); });
  ctx.on('page', pg => pg.on('dialog', d => d.accept()));
  // ── 1. 출제·인쇄 ──
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(U + 'shufit_grammar.html'); await p.waitForSelector('.it');
  if (SHOT) await p.screenshot({ path: path.join(SHOT, 'shufit-first.png') });
  // 문항 목록은 따로 스크롤(2026-11-17) — 넓은 화면
  {
    const st = await p.evaluate(() => { const l = document.getElementById('list'), c = getComputedStyle(l); return { oy: c.overflowY, mh: parseFloat(c.maxHeight) }; });
    ok(st.oy === 'auto' && Math.abs(st.mh - (900 - 32)) < 2, '문항 목록 따로 스크롤 ' + JSON.stringify(st));
    await p.evaluate(() => { const d = document.createElement('div'); d.id = 'tallT'; d.style.height = '3000px'; document.getElementById('list').appendChild(d); document.getElementById('list').scrollIntoView(); });
    const y0 = await p.evaluate(() => scrollY); const bx = await p.locator('#list').boundingBox();
    await p.mouse.move(bx.x + 50, bx.y + 100); await p.mouse.wheel(0, 600); await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ ls: document.getElementById('list').scrollTop, wy: scrollY }));
    ok(r.ls > 0 && r.wy === y0, '목록 위에서 굴리면 목록만 움직임 ' + JSON.stringify(r) + ' ' + y0);
    await p.evaluate(() => { document.getElementById('tallT').remove(); document.getElementById('list').scrollTop = 0; scrollTo(0, 0); });
    const sd = await p.evaluate(() => { const e = document.querySelector('.side'), c = getComputedStyle(e); return { oy: c.overflowY, mh: parseFloat(c.maxHeight), pos: c.position }; });
    ok(sd.oy === 'auto' && Math.abs(sd.mh - 868) < 2 && sd.pos === 'sticky', '고른 문항·내보내기 칸도 따로 스크롤 ' + JSON.stringify(sd));
    await p.evaluate(() => { const s = document.querySelector('.side'); s.scrollTop = s.scrollHeight; });
    ok(await p.evaluate(() => { const r = document.getElementById('xTabs').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; }), '내보내기 탭이 화면 안으로 들어옴');
    await p.evaluate(() => { document.querySelector('.side').scrollTop = 0; });
    await p.setViewportSize({ width: 390, height: 900 });
    ok(await p.evaluate(() => getComputedStyle(document.getElementById('list')).overflowY === 'visible' && getComputedStyle(document.querySelector('.side')).overflowY === 'visible'), '휴대폰은 화면 스크롤 그대로');
    await p.setViewportSize({ width: 1300, height: 900 });
  }
  if (SHOT) { await p.setViewportSize({ width: 390, height: 900 }); await p.screenshot({ path: path.join(SHOT, 'shufit-phone.png'), fullPage: true }); await p.setViewportSize({ width: 1300, height: 900 }); }
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '가로 넘침 없음');
  ok(await p.locator('#fArea .chip').count() >= 2, '영역 칩');
  if (!REAL) {
    ok((await p.locator('#fInfo').textContent()).includes('문항 4개 · 지문 세트 1개'), '문항·세트 수: ' + await p.locator('#fInfo').textContent());
    ok(await p.locator('.it').count() === 3, '묶음 3개(세트는 한 묶음)');
    ok((await p.locator('.it').first().textContent()).includes('세트 2문항 담기'), '세트 담기 버튼');
    ok(await p.locator('.it').first().locator('.pas').count() === 1, '지문 보기');
    ok(await p.locator('#rLvl').isHidden() && await p.locator('#rKind').isHidden() && (await p.locator('#fStep').textContent()).includes('단원'), '처음엔 단원만 — 난도·출처 숨김');
    ok(await p.locator('#prS').isDisabled() && await p.locator('#saveBtn').isDisabled() && (await p.locator('#xHint').textContent()).includes('담으면'), '문항이 없으면 내보내기 버튼 잠김');
    ok(await p.locator('#xp-pr').isVisible() && await p.locator('#xp-ex').isHidden() && await p.locator('#xp-hw').isHidden() && (await p.locator('#xTabs').innerText()).replace(/\s+/g, '') === '학습자료인쇄시험지인쇄H WORK출제'.replace(/\s+/g, ''), '내보내기 탭 — 학습자료 인쇄 · 시험지 인쇄 · H WORK 출제, 처음엔 학습자료');
    ok((await p.locator('#tot').textContent()).includes('문항 4개') && (await p.locator('.it .no').first().textContent()) === '01', '머리 합계 · 카드 번호');
    // 문항 묶음(2026-11-17) — 0~456 = 2026 묶음, 457부터 = 2025 묶음. 가짜 문항은 모두 2026 묶음이라 2025 칩은 없다
    ok((await p.locator('#fSet').textContent()) === '전체42026 묶음4', '묶음 칩 — 있는 묶음만: ' + await p.locator('#fSet').textContent());
    ok(await p.evaluate(() => [setOf({ id: 0 }), setOf({ id: 456 }), setOf({ id: 457 }), setOf({ id: 1636 })].join()) === '2026,2026,2025,2025', '번호로 묶음 가르기');
    ok(await p.evaluate(() => { F.set = '2025'; const n = ITEMS.filter(match).length; F.set = ''; return n; }) === 0, '2025 묶음을 고르면 2026 문항은 빠짐');
    await p.click('.chip[data-k=set][data-v="2026"]'); ok(await p.locator('.it').count() === 3 && (await p.locator('#fInfo').textContent()).startsWith('2026 묶음'), '묶음 칩 누르기 — 안내 줄에 묶음');
    await p.click('.chip[data-k=set][data-v=""]');
    // 형태(2026-11-17) — 단독형 = 지문 없는 문항(103·104), 지문형 = 지문 세트(101·102)
    ok((await p.locator('#fForm').textContent()) === '전체4단독형2지문형2', '형태 칩 — 수: ' + await p.locator('#fForm').textContent());
    await p.click('.chip[data-k=form][data-v="지문"]');
    ok(await p.locator('.it').count() === 1 && (await p.locator('.it .tg').first().textContent()).includes('지문 세트') && (await p.locator('#fInfo').textContent()).startsWith('지문형'), '지문형 — 세트만: ' + await p.locator('#fInfo').textContent());
    ok((await p.locator('#fArea').textContent()) === '전체2음운2', '지문형이면 단원 수도 그 안에서: ' + await p.locator('#fArea').textContent());
    await p.click('.chip[data-k=area][data-v="음운"]'); await p.click('.chip[data-k=form][data-v="단독"]');
    ok(await p.locator('.it').count() === 1 && (await p.locator('.it').first().textContent()).includes('혼자 문항 셋'), '단독형 + 음운 — 지문 없는 문항만');
    await p.click('.chip[data-k=form][data-v=""]'); await p.click('.chip[data-k=area][data-v=""]');
    await p.click('.chip[data-k=area][data-v="품사"]'); ok(await p.locator('.it').count() === 1, '단원 거르기');
    await p.click('.chip[data-k=area][data-v="음운"]');
    ok(await p.locator('#rLvl').isVisible() && await p.locator('#rKind').isHidden(), '단원을 고르면 난도가 나타남');
    ok((await p.locator('#fLvl').textContent()) === '전체3기본1심화2', '난도 수 = 그 단원 안에서: ' + await p.locator('#fLvl').textContent());
    await p.click('.chip[data-k=lvl][data-v="심화"]');
    ok(await p.locator('#rKind').isVisible() && (await p.locator('#fKind').textContent()) === '전체2사설2', '난도를 고르면 출처가 나타남: ' + await p.locator('#fKind').textContent());
    await p.click('.chip[data-k=area][data-v="품사"]');
    ok(await p.locator('#rKind').isHidden() && await p.locator('.it').count() === 1, '단원을 바꾸면 난도·출처 풀림');
    await p.click('.chip[data-k=area][data-v=""]');
    await p.fill('#fq', '반모음'); await p.waitForTimeout(400);
    ok(await p.locator('.it').count() === 1 && (await p.locator('.it').textContent()).includes('둘째'), '찾기 — 세트 하나 걸려도 세트 전체');
    await p.fill('#fq', ''); await p.waitForTimeout(400);
    await p.check('#fAns');
    ok(await p.locator('#list.teacher .cn.ok').count() === 4, '정답·해설 보기 — 정답 표시');
    ok(await p.locator('.exb').first().isVisible(), '해설 보임');
    await p.uncheck('#fAns');
    await p.click('[data-add="101"]');
    ok((await p.locator('#selN').textContent()) === '2문항', '세트 담기 → 2문항');
    ok((await p.locator('#sel .sg .n').first().textContent()) === '1~2', '고른 목록 번호 1~2');
    ok(await p.locator('.it.on').count() === 1 && (await p.locator('.it.on .addb').textContent()) === '✓ 담음' && await p.locator('#selN.has').count() === 1 && !(await p.locator('#paperSave').isDisabled()) && await p.locator('#prS').isDisabled(), '담으면 카드 테두리·✓ 담음·수 배지·저장 버튼 풀림(인쇄는 저장 뒤)');
    ok((await p.locator('#xHint').textContent()) === '고른 2문항으로 만듭니다', '내보내기 안내 — 고른 n문항');
    ok((await p.locator('#pTitle').inputValue()) === 'Shuefit 문법: 음운 심화 (2)' && (await p.locator('#hCode').inputValue()) === 'Shuefit 문법: 음운 심화 (2)', '제목 자동: ' + await p.locator('#pTitle').inputValue());
    await p.click('[data-add="104"]');
    await p.click('#sel [data-mv="1"][data-d="-1"]');
    ok((await p.locator('#sel .sg .n').first().textContent()) === '1', '순서 바꾸기 — 세트가 통째로 내려감');
    await p.click('[data-add="101"]'); ok((await p.locator('#selN').textContent()) === '1문항', '세트 빼기 — 두 문항 함께');
    ok((await p.locator('#allBtn').textContent()) === '보이는 3문항 한번에 담기', '한번에 담기 — 남은 수: ' + await p.locator('#allBtn').textContent());
    await p.click('#allBtn'); ok((await p.locator('#selN').textContent()) === '4문항' && await p.locator('#allBtn').isHidden(), '한번에 담기 — 보이는 문항 모두·버튼 숨김');
    await p.evaluate(() => { SEL = SEL.slice(0, 1); drawSel(); drawList(); });
    await p.click('#autoBtn'); ok((await p.locator('#selN').textContent()) === '4문항', '10문항 채우기 — 남은 문항 다');
    ok((await p.locator('#hCode').inputValue()) === 'Shuefit 문법: 품사·음운 기본·실력·심화 (4)', '제목 자동 — 단원·난도 여럿(담은 순서): ' + await p.locator('#hCode').inputValue());
    ok(await p.evaluate(() => { const base = autoTitle(); HWS.push({ code: base, data: { bank: {} } }); const a = autoTitle(); HWS.push({ code: a, data: { bank: {} } }); const b = autoTitle(); HWS.splice(-2); return a.endsWith(' 02') && b.endsWith(' 03'); }), '같은 제목이 있으면 02·03');
    // 인쇄
    await p.fill('#pTitle', '음운 연습');
    await p.click('[data-add="103"]'); await p.click('[data-add="103"]');
    ok((await p.locator('#pTitle').inputValue()) === '음운 연습', '직접 고친 제목은 덮지 않음');
    ok((await p.locator('#hCode').inputValue()) === '음운 연습', '시험지 제목과 과제 제목은 같은 값');
    ok(await p.locator('#bkS').isVisible() && await p.locator('#prS').isVisible(), '학습자료 탭 = A4 학습지 + 중철 책자');
    await p.click('#xTabs [data-x=ex]'); ok(await p.locator('#xp-ex').isVisible() && await p.locator('#xp-pr').isHidden(), '탭 바꾸기 — 시험지 인쇄');
    ok(await p.locator('#pTitle').isVisible(), '제목 칸은 책자 탭에서도 보임');
    await p.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
    // 시험지 저장(2026-11-17) — 출제 선생님별, 저장해야 인쇄
    ok((await p.locator('#hTeacher').inputValue()) === '이현지' && await p.locator('#hTeacher').isVisible(), '출제 선생님 = 로그인 이름, 탭 위에 보임');
    ok(await p.locator('#prS').isDisabled() && await p.locator('#bkS').isDisabled() && (await p.locator('#paperMsg').textContent()).includes('저장해야'), '저장 전에는 인쇄·책자 잠김');
    await p.click('#paperSave'); await p.waitForFunction(() => !document.getElementById('prS').disabled);
    const pp = DB.paperPosts[0];
    ok(pp && pp.rest.includes('on_conflict=teacher,title') && pp.r.teacher === '이현지' && pp.r.title === '음운 연습' && pp.r.ids.join() === '104,101,102,103', '시험지 저장 본문: ' + JSON.stringify(pp && pp.r));
    ok((await p.locator('#paperMsg').textContent()).includes('인쇄할 수 있어요') && !(await p.locator('#bkT').isDisabled()), '저장하면 인쇄·책자 열림');
    await p.fill('#pTitle', '음운 연습 2'); ok(await p.locator('#prS').isDisabled(), '제목을 바꾸면 다시 저장해야 인쇄');
    await p.fill('#pTitle', '음운 연습'); await p.locator('#pTitle').dispatchEvent('input'); ok(!(await p.locator('#prS').isDisabled()), '저장한 제목으로 돌리면 다시 열림');
    await p.click('#xTabs [data-x=pr]'); await p.click('#prS'); await p.waitForFunction(() => window.__printed === 1);
    const pr = await p.locator('#print').innerHTML();
    ok(pr.includes('음운 연습') && !pr.includes('교사용'), '학생용 제목');
    ok((await p.title()) === '음운 연습', 'PDF 파일 이름 = 시험지 제목: ' + await p.title());
    ok((await p.locator('#print .prng').first().textContent()) === '[02~03]', '지문 범위 [02~03] (품사 문항이 1번)');
    ok(await p.locator('#print .qn').count() === 4, '문항 번호 4개');
    ok(await p.locator('#print .xbox').count() === 0 && !pr.includes('cn ok'), '학생용에 정답·해설 없음');
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('.wrap')).display) !== 'none', '화면에서는 인쇄본 숨김');
    await p.click('#prT'); await p.waitForFunction(() => window.__printed === 2);
    ok(await p.locator('#print .xbox').count() === 4 && await p.locator('#print .quick').count() === 1, '교사용 해설 4개 + 빠른 정답');
    ok(await p.locator('#print.teacher .cn.ok').count() === 4, '교사용 정답 동그라미');
    ok((await p.title()) === '음운 연습 (교사용)', '교사용 파일 이름: ' + await p.title());
    ok(await p.evaluate(() => fileTitle('Shuefit 문법: 음운 기본 (10)', false, true)) === 'Shuefit 문법 음운 기본 (10) 중철 책자', '파일 이름에 못 쓰는 글자(:) 빼기·책자');
    await p.evaluate(() => window.dispatchEvent(new Event('afterprint'))); ok((await p.title()) === 'Shuefit 문법', '인쇄 뒤 창 제목 되돌림');
    await p.emulateMedia({ media: 'print' });
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('.wrap')).display) === 'none' && await p.evaluate(() => getComputedStyle(document.getElementById('print')).display) === 'block', '인쇄 때는 시험지만');
    if (SHOT) await p.screenshot({ path: path.join(SHOT, 'shufit-print-teacher.png'), fullPage: true });
    await p.emulateMedia({ media: 'screen' });
    // 저장
    // 시험지 인쇄(2026-11-17) — 머리 칸·답안 기록표·정답표
    await p.click('#xTabs [data-x=ex]');
    // A형(기본) — 시험명·큰 과목명·둥근 학교명·로고·성명/수험 번호 칸, 지문 테두리 상자
    ok(await p.evaluate(() => EX_DES === 'A' && document.querySelector('#exDes .on').dataset.d === 'A' && getComputedStyle(document.getElementById('exYear').parentNode).display === 'none' && getComputedStyle(document.getElementById('exTitle').parentNode).display !== 'none'), 'A형 기본 · A형 칸만 보임');
    await p.fill('#exTitle', '2026년 2학기 모의 기말고사'); await p.fill('#exSubj', '문법 8'); await p.fill('#pSchool', '행신고3');
    let np = await p.evaluate(() => window.__printed || 0);
    await p.click('#exS'); await p.waitForFunction(n => window.__printed === n + 1, np);
    const ea = await p.evaluate(() => ({ cls: document.getElementById('print').className, cover: (document.querySelector('#print .cover') || {}).innerText || '', logo: !!document.querySelector('#print .cover svg.logo text'), id: document.querySelectorAll('#print .cover .digits span').length, pages: document.querySelectorAll('#print .page').length, run: document.querySelectorAll('#print .runhead').length, frac: [...document.querySelectorAll('#print .frac .b')].map(x => x.textContent).join(), qn: [...document.querySelectorAll('#print .qn')].map(x => x.textContent).join(''), instr: (document.querySelector('#print .xb.instr') || {}).textContent || '', psBorder: getComputedStyle(document.querySelector('#print .xb.passage') || document.body).borderTopWidth, notice: document.querySelectorAll('#print .notice').length, omr: document.querySelectorAll('#print .omr > div').length, circ: document.querySelectorAll('#print .omr i').length, ok: document.querySelectorAll('#print .cn.ok').length, xbox: document.querySelectorAll('#print .xbox').length, brand: (document.querySelector('#print .brandf') || {}).textContent || '', title: document.title, page: document.getElementById('pageStyle').textContent }));
    ok(ea.cls.includes('design-a') && ea.cover.includes('2026년 2학기 모의 기말고사') && ea.cover.includes('문법 8') && ea.cover.includes('행신고3') && ea.cover.includes('성명') && ea.cover.includes('수험 번호') && ea.logo && ea.id === 10, 'A형 머리(시험명·과목명·학교·로고·성명/수험 번호) ' + JSON.stringify(ea).slice(0, 300));
    ok(ea.notice === 0 && ea.instr.startsWith('※ [') && ea.psBorder !== '0px', 'A형 — 안내 상자 없음 · ※ 안내문 · 지문 테두리');
    ok(ea.pages >= 2 && ea.run === ea.pages - 1 && ea.frac.split(',').every(x => x === String(ea.pages)), 'A형 쪽 상자·2쪽부터 국어 영역 머리말·분수 쪽 번호 ' + ea.pages + '쪽');
    ok(ea.qn === '1.2.3.4.' && ea.ok === 0 && ea.xbox === 0, 'A형 = 문항만(정답·해설 없음) ' + ea.qn);
    ok(ea.omr === 4 && ea.circ === 20, '답안 기록표 4문항 × ①~⑤');
    ok(ea.brand.includes('Shueguk') && ea.brand.includes('다르게 하기의 힘') && ea.page.includes('margin:0'), '왼쪽 아래 Shueguk 다르게 하기의 힘 · 여백 0 쪽');
    ok(ea.title === '음운 연습 시험지', '시험지 파일 이름: ' + ea.title);
    if (SHOT) { await p.emulateMedia({ media: 'print' }); await p.pdf({ path: path.join(SHOT, 'shufit-exam-A.pdf'), preferCSSPageSize: true, printBackground: true }); await p.emulateMedia({ media: 'screen' }); }
    await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    // B형 — 표 머리 + 안내 상자
    await p.click('#exDes [data-d=B]');
    ok(await p.evaluate(() => EX_DES === 'B' && getComputedStyle(document.getElementById('exTitle').parentNode).display === 'none' && getComputedStyle(document.getElementById('exYear').parentNode).display !== 'none' && localStorage.getItem('sf_exdes') === 'B'), 'B형으로 바꾸면 B형 칸 · 기억');
    await p.fill('#exYear', '2026'); await p.selectOption('#exSem', '2'); await p.fill('#exType', '기말'); await p.fill('#exGrade', '1'); await p.fill('#exSubj', ''); await p.fill('#pSchool', '행신고등학교'); await p.fill('#pDate', '2026-12-01'); await p.fill('#exPts', '100'); await p.fill('#exMin', '50');
    np = await p.evaluate(() => window.__printed || 0);
    await p.click('#exS'); await p.waitForFunction(n => window.__printed === n + 1, np);
    const eb = await p.evaluate(() => ({ cls: document.getElementById('print').className, head: (document.querySelector('#print .coverB') || {}).innerText || '', notice: (document.querySelector('#print .notice') || {}).innerText || '', cover: document.querySelectorAll('#print .cover').length, instr: (document.querySelector('#print .xb.instr') || {}).textContent || '', psBorder: getComputedStyle(document.querySelector('#print .xb.passage') || document.body).borderTopWidth }));
    ok(!eb.cls.includes('design-a') && eb.cover === 0 && /2026학년도 \( 2 \)학기 \( 기말 \)고사/.test(eb.head) && eb.head.includes('( 1 )학년') && eb.head.includes('2026년 12월 1일') && eb.head.includes('행신고등학교') && eb.head.includes('총 ( 4 )문항') && eb.head.includes('문법 · 품사·음운'), 'B형 표 머리 ' + JSON.stringify(eb.head));
    ok(eb.notice.includes('( 4 )문항') && eb.notice.includes('( 100 )점') && eb.notice.includes('( 50 )분') && eb.instr.startsWith('[') && eb.psBorder === '0px', 'B형 안내 상자 · [범위] 안내문 · 지문 테두리 없음 ' + JSON.stringify(eb.notice));
    if (SHOT) { await p.emulateMedia({ media: 'print' }); await p.pdf({ path: path.join(SHOT, 'shufit-exam-B.pdf'), preferCSSPageSize: true, printBackground: true }); await p.emulateMedia({ media: 'screen' }); }
    // 인쇄 날짜·학교(2026-11-17) — 학습지 머리·답안 기록표
    ok(await p.evaluate(() => document.querySelector('#print .omrpage .sub').textContent.includes('행신고등학교')), '답안 기록표 학교 칸');
    await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await p.click('#xTabs [data-x=pr]'); np = await p.evaluate(() => window.__printed || 0); await p.click('#prS'); await p.waitForFunction(n => window.__printed === n + 1, np);
    const ph = await p.evaluate(() => document.querySelector('#print .ph1 .nm').textContent);
    ok(ph.includes('2026. 12. 1.') && ph.includes('행신고등학교') && ph.includes('이름'), '학습지 머리 날짜·학교 ' + ph);
    ok(await p.evaluate(() => (JSON.parse(localStorage.getItem('sf_pmeta') || '{}')['이현지|음운 연습'] || {}).school === '행신고등학교'), '문제지마다 날짜·학교 기억');
    const pt = (DB.paperPatches || []).slice(-1)[0];
    ok(pt && pt.t === '이현지' && pt.ti === '음운 연습' && pt.b.school === '행신고등학교' && pt.b.print_date === '2026-12-01', '날짜·학교를 문제지(데이터베이스)에 저장 ' + JSON.stringify(pt));
    await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await p.click('#xTabs [data-x=ex]'); np = await p.evaluate(() => window.__printed || 0) - 1;
    await p.click('#exT'); await p.waitForFunction(n => window.__printed === n + 1, np + 1);
    const ky = await p.evaluate(() => ({ cells: [...document.querySelectorAll('#print .kgrid > div')].map(x => x.querySelector('b').textContent + x.textContent.replace(/^\d+/, '').slice(0, 1)).join(), q: document.querySelectorAll('#print .qn').length, title: document.title }));
    ok(ky.cells === '1⑤,2②,3④,4①' && ky.q === 0 && ky.title === '음운 연습 정답표', '정답표 한 장 ' + JSON.stringify(ky));
    await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await p.click('#xTabs [data-x=pr]');
    // 선생님별 '낸 적 있음' — 이현지: 방금 저장한 시험지(104·101·102·103), 김지원: 시험지 103 + H WORK 104
    ok(await p.evaluate(() => Object.keys(USED).map(Number).sort().join()) === '101,102,103,104', '이현지 선생님 낸 문항 = 저장한 시험지');
    await p.fill('#hTeacher', '김지원'); await p.locator('#hTeacher').dispatchEvent('change');
    ok(await p.evaluate(() => Object.keys(USED).map(Number).sort().join()) === '103,104' && (await p.locator('#fUnusedLb').textContent()) === '김지원 선생님이 안 낸 문항만', '김지원 선생님 기준으로 바뀜');
    ok(await p.locator('#prS').isDisabled(), '선생님이 바뀌면 인쇄 다시 잠김');
    await p.check('#fUnused'); ok(await p.evaluate(() => ITEMS.filter(match).map(x => x.id).sort().join()) === '101,102', '김지원 선생님이 안 낸 문항만: ' + await p.evaluate(() => ITEMS.filter(match).map(x => x.id).join()));
    await p.uncheck('#fUnused');
    ok(await p.locator('#loadSel optgroup[label="저장한 문제지"] option').count() === 1 && (await p.locator('#loadSel').textContent()).includes('지원 모의 1') && !(await p.locator('#loadSel').textContent()).includes('음운 연습'), '불러오기 = 그 선생님 시험지만');
    await p.selectOption('#loadSel', { label: '지원 모의 1 · 김지원 (1문항)' });
    ok((await p.locator('#selN').textContent()) === '1문항' && (await p.locator('#pTitle').inputValue()) === '지원 모의 1' && !(await p.locator('#prS').isDisabled()), '저장한 시험지 불러오면 바로 인쇄 가능');
    await p.fill('#autoN', '3'); await p.click('#autoBtn'); ok((await p.locator('#selN').textContent()) === '3문항', '채울 문항 수 바꾸기(3)');
    await p.fill('#hTeacher', '이현지'); await p.locator('#hTeacher').dispatchEvent('change');
    await p.evaluate(() => localStorage.removeItem('sf_pmeta'));   // 다른 기기처럼 — 이 기기 기억 없이
    await p.selectOption('#loadSel', { label: '음운 연습 · 이현지 (4문항)' });
    ok((await p.locator('#selN').textContent()) === '4문항' && !(await p.locator('#prS').isDisabled()), '내 시험지 다시 불러오기');
    ok((await p.locator('#pSchool').inputValue()) === '행신고등학교' && (await p.locator('#pDate').inputValue()) === '2026-12-01', '다른 기기에서도 문제지를 불러오면 날짜·학교 채움(데이터베이스)');
    ok((await p.locator('#hTeacher').inputValue()) === '이현지', '담당 강사 = 로그인 이름');
    await p.click('#xTabs [data-x=hw]');
    await p.fill('#pTitle', '일반 과제'); await p.click('#saveBtn');
    ok((await p.locator('#saveMsg').textContent()).includes('일반 H WORK 과제가 이미'), '같은 이름 일반 과제는 막음');
    await p.fill('#pTitle', '[슈핏 문법] 음운 연습'); await p.click('#saveBtn');
    await p.waitForFunction(() => document.getElementById('saveMsg').textContent.includes('저장했습니다'));
    const post = DB.posts.find(x => x.action === 'saveHomework');
    ok(post && post.data.count === 4 && post.data.items['1'].type === 'choice5' && post.data.items['1'].ans === 5, '시트 저장 — 5지선다 정답');
    ok(post && JSON.stringify(post.data.bank) === '{"1":104,"2":101,"3":102,"4":103}', '저장 — bank 번호표 ' + JSON.stringify(post && post.data.bank));
    ok(post && post.data.schools.join() === '능곡고,화정고', '학교 목록 = 재원생 학교(퇴원 제외)');
    ok(DB.saved && DB.saved.data.bank['2'] === 101, '수파베이스 과제 표에도 저장');
    ok((await p.locator('.tg.used').count()) >= 1, '저장 뒤 낸 적 있음 표시');
    if (SHOT) await p.screenshot({ path: path.join(SHOT, 'shufit-make.png') });
    // 저장한 문제지 지우기(2026-11-17)
    await p.selectOption('#loadSel', '');
    ok(await p.locator('#paperDel').isDisabled(), '문제지를 고르기 전엔 삭제 잠김');
    await p.selectOption('#loadSel', { label: '[슈핏 문법] 음운 연습 · 이현지 (4문항)' }).catch(() => {});
    ok(await p.locator('#paperDel').isDisabled(), 'H WORK 과제는 여기서 못 지움');
    await p.selectOption('#loadSel', { label: '음운 연습 · 이현지 (4문항)' });
    ok(!(await p.locator('#paperDel').isDisabled()) && !(await p.locator('#prS').isDisabled()), '문제지를 고르면 삭제 열림');
    await p.evaluate(() => { window.__c = window.confirm; window.confirm = () => false; }); await p.click('#paperDel'); await p.evaluate(() => { window.confirm = window.__c; });
    ok(!(DB.paperDels || []).length, '확인 창에서 취소하면 안 지움');
    await p.click('#paperDel');
    await p.waitForFunction(() => !PAPERS.some(x => x.title === '음운 연습'));
    const dl = (DB.paperDels || [])[0] || '';
    ok(dl.includes('teacher=eq.' + encodeURIComponent('이현지')) && dl.includes('title=eq.' + encodeURIComponent('음운 연습')), '삭제 요청 = 선생님 + 제목 ' + dl);
    ok((await p.locator('#loadSel optgroup[label="저장한 문제지"] option').count()) === 0 && (await p.locator('#paperDel').isDisabled()) && (await p.locator('#prS').isDisabled()), '지우면 목록에서 빠지고 인쇄 다시 잠김');
    ok((await p.locator('#selN').textContent()) === '4문항' && await p.evaluate(() => !JSON.stringify(USED[101] || '').includes('문제지 · 음운 연습')), '고른 문항은 그대로 · 낸 적 있음에서 이 문제지가 빠짐');
    ok((await p.textContent('h1')) === 'Shuefit 문법' && (await p.textContent('.hd .subt')) === '너에게 꼭 맞춘 문법 학습' && !(await p.innerText('.wrap')).includes('문항 은행'), '이름 = Shuefit 문법 + 작은 제목 (문항 은행 글 없음)');
  } else {
    if (SHOT) { await p.check('#fAns'); await p.screenshot({ path: path.join(SHOT, 'shufit-make-real.png') });
      await p.click('#autoBtn'); await p.evaluate(() => { window.print = () => {}; }); await p.click('#paperSave'); await p.waitForFunction(() => !document.getElementById('prT').disabled); await p.click('#xTabs [data-x=pr]'); await p.click('#prT');
      await p.emulateMedia({ media: 'print' }); await p.screenshot({ path: path.join(SHOT, 'shufit-print-real.png'), fullPage: true }); }
    ok(true, '실제 문항 ' + ITEMS.length + '개 그림');
  }
  ok(!errs.length, '출제 화면 오류 없음 ' + errs.join(' | '));

  // ── 2. 중철 책자 — 문항이 많아 여러 쪽 ──
  if (!REAL) {
    for (let i = 0; i < 26; i++) ITEMS.push({ id: 200 + i, area: '문장', lvl: '기본', src: '연습 ' + i, kind: '교육청', year: '2026', pid: '', ord: 10 + i,
      html: '<div class="qh"><div class="stem">긴 문항 ' + i + ' ' + '문장 성분을 바르게 이해한 것은? '.repeat(6) + '</div></div>' + ch(), ans: 3, good: '해설', bad: [], plain: '긴 문항 ' + i });
  }
  const bk = await ctx.newPage(); const bkerr = []; bk.on('pageerror', e => bkerr.push(e.message));
  await bk.goto(U + 'shufit_grammar.html'); await bk.waitForSelector('.it');
  await bk.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await bk.evaluate(() => { while (document.getElementById('moreBtn')) document.getElementById('moreBtn').click(); });
  await bk.evaluate(() => document.querySelectorAll('[data-add]:not(.on)').forEach(b => b.click()));
  const nSel = Number((await bk.textContent('#selN')).replace(/\D/g, ''));
  ok(nSel >= 20, '책자용 문항 담기 ' + nSel);
  await bk.click('#paperSave'); await bk.waitForFunction(() => !document.getElementById('bkS').disabled);
  await bk.click('#xTabs [data-x=pr]'); await bk.click('#bkS'); await bk.waitForFunction(() => window.__printed === 1, null, { timeout: 15000 });
  const N = Number(await bk.getAttribute('#bkInfo', 'data-pages'));
  ok(N >= 4 && N % 4 === 0, '책자 쪽 수 4의 배수 — ' + N + '쪽');
  ok(await bk.locator('#print .sheet').count() === N, 'A4 장 수 = 쪽 수 (' + await bk.locator('#print .sheet').count() + ')');
  const order = await bk.evaluate(() => [...document.querySelectorAll('#print .sheet')].map(s => (s.querySelector('.bno') || { textContent: '' }).textContent.replace(/\D/g, '')));
  const real = await bk.evaluate(() => document.querySelectorAll('#print .bpage .bbody .blk').length);
  ok(order[0] === '' && order[1] === '2' && order[2] === '3', '1쪽 앞표지 → 2쪽 → 3쪽 차례대로 — ' + order.slice(0, 4).join(' / '));
  ok(real === nSel, '책자에 모든 문항 ' + real + ' / ' + nSel);
  const ov = await bk.evaluate(() => [...document.querySelectorAll('#print .bbody')].filter(b => b.scrollWidth > b.clientWidth + 2).length);
  ok(ov === 0, '어느 쪽도 넘치지 않음');
  ok(await bk.evaluate(() => { const t = document.getElementById('pageStyle').textContent; return t.includes('size:A4') && t.includes('margin:0') && !t.includes('A3'); }), '인쇄 용지 A4 (여백 0)');
  const cv = await bk.evaluate(() => { const ps = [...document.querySelectorAll('#print .bpage')]; const sh = [...document.querySelectorAll('#print .sheet')]; return { cover: ps.filter(p => p.classList.contains('cover')).length, back: ps.filter(p => p.classList.contains('bkback')).length, first: sh[0].firstElementChild.classList.contains('cover'), last: sh[sh.length - 1].firstElementChild.classList.contains('bkback'), sk: !!document.querySelector('#print .cover img.cv-sk') && !!document.querySelector('#print .bkback img'), title: (document.querySelector('#print .cv-title') || {}).textContent || '', on: document.querySelectorAll('#print .cv-u.on').length, units: document.querySelectorAll('#print .cv-u').length }; });
  ok(cv.cover === 1 && cv.back === 1 && cv.first && cv.last, '앞표지 = 1쪽 · 뒤표지 = 마지막 쪽 ' + JSON.stringify(cv));
  ok(cv.sk && cv.title.includes('Shuefit 문법') && cv.on >= 1 && cv.units >= cv.on, '표지 — 슈콩이·제목·단원 칸 ' + JSON.stringify(cv));
  ok(await bk.evaluate(() => coverInfo(Object.assign(docParts(false), { title: 'shuefit 문법: 음운 기본 (3)' }), false).t1) === 'Shuefit 문법', '옛 소문자 제목도 표지는 Shuefit');
  const nums = await bk.evaluate(() => [...document.querySelectorAll('#print .qn')].map(x => +x.textContent));
  const pagesSeq = await bk.evaluate(() => { const m = {}; document.querySelectorAll('#print .bpage').forEach(p => { const bn = p.querySelector('.bno'); const n = bn ? +(bn.textContent.replace(/\D/g, '')) || 0 : 0; m[n] = [...p.querySelectorAll('.qn')].map(x => +x.textContent); }); return Object.keys(m).filter(k => +k).sort((a, b) => a - b).flatMap(k => m[k]); });
  ok(pagesSeq.join() === Array.from({ length: nSel }, (_, i) => i + 1).join(), '쪽 순서대로 읽으면 문항 1~' + nSel + ' 차례대로');
  await bk.emulateMedia({ media: 'print' });
  ok(await bk.evaluate(() => Math.round(document.querySelector('#print .sheet').getBoundingClientRect().width / 96 * 25.4)) === 210, '한 장 폭 210mm');
  if (SHOT) { await bk.setViewportSize({ width: 794, height: 1123 }); await bk.screenshot({ path: path.join(SHOT, 'shufit-booklet.png'), fullPage: true }); await bk.pdf({ path: path.join(SHOT, 'shufit-booklet.pdf'), preferCSSPageSize: true, printBackground: true }); }
  await bk.emulateMedia({ media: 'screen' });
  await bk.click('#bkT'); await bk.waitForFunction(() => window.__printed === 2, null, { timeout: 15000 });
  ok(await bk.locator('#print .quick').count() === 1 && await bk.locator('#print .xbox').count() === nSel, '교사용 책자 — 빠른 정답 · 해설');
  await bk.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  ok(await bk.evaluate(() => document.getElementById('pageStyle').textContent.includes('size:A4')), '인쇄 뒤 A4 로 되돌림');
  ok(!bkerr.length, '책자 오류 없음 ' + bkerr.join(' | '));
  await b.close(); srv.close();
  console.log(`통과 ${pass} · 실패 ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
