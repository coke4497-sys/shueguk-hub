// Shuefit 문법 — 슈국 자체 자료의 OX·단답 문항(리포트 093, 2026-11-25) E2E
// LC_ALL=C.UTF-8 NODE_PATH=$(npm root -g) node tools/shufit-qtype-e2e.js   (옆에 shueguk-h-work 저장소가 있어야 한다 — gbank.css)
// 가짜 수파베이스로 돈다. OX(정답 O·X 동그라미) · 단답(답 칸에 정답 글, 학생용은 빈칸) · 정답 글(빠른 정답·정답표) ·
// 답안 기록표(OX 는 O X, 단답은 빈 줄) · H WORK 출제 종류(ox·essay·choice5) · 묶음·출처 칩.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), HW = path.join(ROOT, '..', 'shueguk-h-work');
const PORT = 8783, U = 'http://localhost:' + PORT + '/';
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(b); });
}).listen(PORT);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'OK ' : 'FAIL ') + m); };

const stem = t => `<div class="qh"><div class="stem">${t}</div></div>`;
const ITEMS = [
  { id: 100001, area: '국어사', lvl: '기본', src: '슈국 문법 매뉴얼 · 1번', kind: '슈국', year: '2026', pid: '', ord: 900001, qtype: 'ox', ans: 2, answer: 'X',
    html: stem('주격 조사는 모음 조화를 따른다.') + '<div class="oxr"><span class="cn" data-d="O">O</span><span class="cn" data-d="X">X</span></div>', good: '오엑스 해설', bad: [], plain: '주격 조사는 모음 조화를 따른다.' },
  { id: 100002, area: '국어사', lvl: '기본', src: '슈국 문법 매뉴얼 · 2번', kind: '슈국', year: '2026', pid: '', ord: 900002, qtype: 'short', ans: 0, answer: '바미, 새',
    html: stem('주격 조사가 결합한 형태를 쓰시오.') + '<div class="sa"><span class="sal">답</span><span class="sat"></span></div>', good: '단답 해설', bad: [], plain: '주격 조사가 결합한 형태를 쓰시오.' },
  { id: 100003, area: '국어사', lvl: '기본', src: '슈국 문법 매뉴얼 · 3번', kind: '슈국', year: '2026', pid: '', ord: 900003, qtype: 'choice5', ans: 4, answer: '④',
    html: stem('적절한 것은?') + '<div class="tw"><table class="ot chtab"><tr><th></th><th>㉠</th></tr>' + [1, 2, 3, 4, 5].map(n => `<tr><td class="cc"><span class="cn" data-d="${n}">${'①②③④⑤'[n - 1]}</span></td><td>칸 ${n}</td></tr>`).join('') + '</table></div>', good: '표 해설', bad: [], plain: '적절한 것은?' },
  { id: 5, area: '국어사', lvl: '기본', src: '2026학년도 3월 교육청 · 고1', kind: '교육청', year: '2026', pid: '', ord: 5, ans: 1,
    html: stem('옛 문항') + '<div class="ch">' + [1, 2, 3, 4, 5].map(n => `<div class="c"><span class="cn" data-d="${n}">${'①②③④⑤'[n - 1]}</span><span class="ct">선지</span></div>`).join('') + '</div>', good: '옛 해설', bad: [], plain: '옛 문항' },
];
const DB = { saved: null, posts: [], papers: [] };
function fake(rt, u, method, body) {
  const hw = u.match(/coke4497-sys\.github\.io\/shueguk-h-work\/([a-z0-9_.-]+)/i);
  if (hw) { const f = path.join(HW, hw[1]); return fs.existsSync(f) ? rt.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript' }) : rt.fulfill({ status: 404, body: '' }); }
  if (u.includes('teacher-name.js')) return rt.fulfill({ body: 'window.shuegukTeacherName=()=>Promise.resolve("이현지");', contentType: 'text/javascript' });
  if (u.endsWith('.js') || u.includes('.js?')) return rt.fulfill({ body: '', contentType: 'text/javascript' });
  if (u.includes('script.google.com')) { const b = JSON.parse(body || '{}'); DB.posts.push(b); return rt.fulfill({ json: { ok: true, result: 'success', assignments: [] } }); }
  const rest = u.split('/rest/v1')[1] || '';
  if (rest.startsWith('/gbank_items')) return rt.fulfill({ json: rest.includes('offset=0') ? ITEMS : [] });
  if (rest.startsWith('/hwork_homeworks') && method === 'POST') { DB.saved = JSON.parse(body)[0]; return rt.fulfill({ status: 201, body: '' }); }
  if (rest.startsWith('/shufit_papers') && method === 'POST') { const r = JSON.parse(body); DB.papers.push(...[].concat(r)); return rt.fulfill({ status: 201, body: '' }); }
  if (rest.startsWith('/shufit_papers') && method === 'GET') return rt.fulfill({ json: rest.includes('offset=0') ? DB.papers : [] });
  if (method === 'GET' && rest) return rt.fulfill({ json: [] });
  if (rest) return rt.fulfill({ status: 204, body: '' });
  return rt.fulfill({ body: '' });
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.route('**/*', rt => { const r = rt.request(), u = r.url(); if (u.startsWith(U)) return rt.continue(); return fake(rt, u, r.method(), r.postData()); });
  ctx.on('page', pg => pg.on('dialog', d => d.accept()));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(U + 'shufit_grammar.html'); await p.waitForSelector('.it');
  ok(await p.locator('#fSet .chip[data-v="슈국"]').count() === 1, '묶음 칩 — 슈국 매뉴얼');
  ok(await p.evaluate(() => { F.set = '슈국'; const n = ITEMS.filter(match).length; F.set = ''; return n; }) === 3, '슈국 매뉴얼 묶음 = 100000번부터 3문항');
  await p.click('#fArea .chip[data-v="국어사"]'); await p.click('#fLvl .chip[data-v="기본"]');
  ok(await p.locator('#fKind .chip[data-v="슈국"]').count() === 1, '출처 칩 — 슈국');
  ok(await p.evaluate(() => [ansText(BYID[100001]), ansText(BYID[100002]), ansText(BYID[100003]), ansText(BYID[5])].join('|')) === 'X|바미, 새|④|①', '정답 글 — X · 단답 글 · ④ · 옛 문항 ①');
  // 목록의 정답 보기
  await p.check('#fAns');
  const lst = await p.evaluate(() => ({ ox: !!document.querySelector('#list .cn.ok[data-d="X"]'), sat: [...document.querySelectorAll('#list .sat')].map(x => x.textContent).join('|'), tab: !!document.querySelector('#list table.chtab .cn.ok[data-d="4"]') }));
  ok(lst.ox && lst.sat.includes('바미, 새') && lst.tab, '정답 보기 — OX 동그라미 · 단답 칸 · 표 선지 ' + JSON.stringify(lst));
  // 담고 저장 → H WORK 종류
  await p.click('#allBtn');
  ok(await p.evaluate(() => selIds().length) === 4, '네 문항 담음');
  await p.evaluate(() => saveOne('이현지', '시험 과제', selIds(), true));
  const items = DB.saved && DB.saved.data.items;
  ok(!!items && Object.values(items).map(x => x.type + ':' + x.ans).sort().join() === ['choice5:1', 'choice5:4', 'essay:바미, 새', 'ox:X'].sort().join(), 'H WORK 출제 종류 — ox·essay(예시 답)·choice5 ' + JSON.stringify(items));
  // 학생용 문서 — 단답 칸 비어 있음, 교사용 — 정답 글
  const stud = await p.evaluate(() => { const d = docParts(false); return d.blocks.join(''); });
  const tch = await p.evaluate(() => { const d = docParts(true); return { b: d.blocks.join(''), k: d.keyHead + d.keyBlocks.join('') }; });
  ok(stud.includes('<span class="sat"></span>') && !stud.includes('cn ok'), '학생용 — 답 칸 빈칸 · 정답 표시 없음');
  ok(tch.b.includes('<span class="sat">바미, 새</span>') && tch.b.includes('cn ok" data-d="X"') && tch.k.includes('정답 X') && tch.k.includes('정답 바미, 새'), '교사용 — 답 칸에 정답 · OX 동그라미 · 정답과 해설 글');
  // 시험지 답안 기록표 · 정답표
  await p.evaluate(() => { SAVED = { teacher: curTeacher(), title: $('pTitle').value.trim(), sig: selSig() }; });
  await p.evaluate(() => { window.print = () => {}; });
  await p.evaluate(() => examDoc(false, false));
  const omr = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#print .omr > div')].map(d => d.textContent.replace(/\s+/g, '')), blank: document.querySelectorAll('#print .omr u.oms').length }));
  ok(omr.rows.some(t => /^\dOX$/.test(t)) && omr.blank === 1, '답안 기록표 — OX 는 O X · 단답은 빈 줄 ' + omr.rows.join(' / '));
  await p.evaluate(() => examDoc(true, false));
  const key = await p.evaluate(() => document.querySelector('#print .kgrid').textContent);
  ok(key.includes('X') && key.includes('바미, 새') && key.includes('④'), '정답표 — X · 단답 글 · ④');
  ok(!errs.length, '오류 없음 ' + errs.join(' | '));
  await b.close(); srv.close();
  console.log(`통과 ${pass} · 실패 ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
