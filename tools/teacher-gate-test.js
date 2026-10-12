#!/usr/bin/env node
/* 허브 밖 교사 페이지 로그인 게이트(assets/teacher-gate.js) — 2026-10-12 원장님 "전부"(모든 교사 페이지에 허브 로그인)
 *   NODE_PATH=$(npm root -g) node tools/teacher-gate-test.js
 * ① 로그인 없음 → 허브 login.html?next=원래 주소&reason=login_required
 * ② 로그인 + 활성 교사 → 본문 보임(data-teacher-auth=ready), fetch를 바꾸지 않음
 * ③ 교사 표에 없음 → not_teacher 로 보내고 세션을 지움
 * ④ 만료 직전 세션 → refresh 뒤 통과(새 토큰 저장)
 * ⑤ 교사 확인 통신 실패 → 막지 않음(세션은 있으므로)
 * ⑥ 127.0.0.1(검증·로컬) → 게이트 꺼짐(요청 없음). ①~⑤·⑦은 github.io 주소를 가로채 실제 배포 조건(data-force 없음)으로 돈다
 * ⑦ login.html 이 reason을 한 줄로 알리고 next(다른 저장소 절대 주소)로 돌아간다 */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const GATE = fs.readFileSync(path.join(ROOT, 'assets', 'teacher-gate.js'), 'utf8');
const PAGE = f => '<!doctype html><html><head><meta charset="UTF-8"><script src="assets/teacher-gate.js"' + (f ? ' data-force="on"' : '') + '></script><title>교사 페이지</title></head><body><h1 id="h">시간표</h1><script>window.__after = typeof fetch;</script></body></html>';
const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/assets/teacher-gate.js'){ res.writeHead(200, { 'Content-Type': 'text/javascript;charset=utf-8' }); return res.end(GATE); }
  if (u === '/gate.html'){ res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' }); return res.end(PAGE(true)); }
  if (u === '/nogate.html'){ res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' }); return res.end(PAGE(false)); }
  const f = path.join(ROOT, decodeURIComponent(u));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : 'text/html') + ';charset=utf-8' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const port = srv.address().port, LOCAL = 'http://127.0.0.1:' + port, BASE = 'https://coke4497-sys.github.io/shueguk-report';
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };
const sess = (exp) => JSON.stringify({ access_token: 'tok-old', refresh_token: 'ref', expires_at: Math.floor(Date.now() / 1000) + (exp == null ? 7200 : exp), user: { id: 'u-kim' } });

(async () => {
  const b = await chromium.launch();
  async function open(opts){
    opts = opts || {};
    const calls = [];
    const ctx = await b.newContext();
    // 허브 login.html 로 보내면 로컬 허브 파일을 대신 준다(주소는 github.io 그대로 남아 검사에 쓴다)
    // 다른 저장소의 교사 페이지(같은 출처 github.io) — 실제 배포와 같은 조건이라 data-force 없이 게이트가 켜진다
    await ctx.route(/coke4497-sys\.github\.io\/shueguk-report\/gate\.html/, r => r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: PAGE(false).replace('src="assets/', 'src="https://coke4497-sys.github.io/shueguk-hub/assets/') }));
    await ctx.route(/coke4497-sys\.github\.io\/shueguk-hub\//, r => {
      const u = new URL(r.request().url());
      const f = path.join(ROOT, u.pathname.replace('/shueguk-hub/', ''));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
      r.fulfill({ status: 200, contentType: (/\.js$/.test(f) ? 'text/javascript' : 'text/html') + ';charset=utf-8', body: fs.readFileSync(f, 'utf8') });
    });
    await ctx.route(/supabase\.co/, r => {
      const u = r.request().url(); calls.push({ u: u.replace(/^.*supabase\.co/, ''), m: r.request().method(), auth: r.request().headers()['authorization'] || '' });
      if (/auth\/v1\/token\?grant_type=refresh/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok-new', refresh_token: 'ref2', expires_in: 3600, user: { id: 'u-kim' } }) });
      if (/auth\/v1\/token\?grant_type=password/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok-login', refresh_token: 'ref3', expires_in: 3600, user: { id: 'u-kim' } }) });
      if (/teacher_accounts/.test(u)){
        if (opts.netfail) return r.abort();
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.notTeacher ? [] : [{ user_id: 'u-kim', login_id: 'kim', display_name: '김현지', role: 'teacher', active: true }]) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage();
    if (opts.session) await page.addInitScript(s => { if (!sessionStorage.getItem('__init')) { localStorage.setItem('shueguk_teacher_session_v2', s); sessionStorage.setItem('__init', '1'); } }, opts.session);
    await page.goto(opts.page ? LOCAL + opts.page : BASE + '/gate.html');
    await page.waitForTimeout(700);
    return { page, ctx, calls };
  }
  const state = p => p.evaluate(() => ({ url: location.href, attr: document.documentElement.getAttribute('data-teacher-auth'),
    vis: getComputedStyle(document.body).visibility, fetchNative: /native code/.test(String(window.fetch)),
    sess: localStorage.getItem('shueguk_teacher_session_v2') }));

  /* ① */
  let { page, ctx, calls } = await open({});
  let s = await state(page);
  ok('① 로그인 없음 → 허브 login.html', /coke4497-sys\.github\.io\/shueguk-hub\/login\.html\?/.test(s.url), s.url);
  ok('① next = 원래 주소, reason=login_required', s.url.indexOf('next=' + encodeURIComponent(BASE + '/gate.html')) > 0 && /reason=login_required/.test(s.url), s.url);
  ok('① 로그인 화면에 이유 한 줄', /로그인이 필요한 페이지/.test(await page.evaluate(() => document.getElementById('message').textContent)));
  /* ⑦ 로그인하면 next 로 돌아간다 */
  await page.fill('#loginId', 'kim'); await page.fill('#password', 'pw'); await page.click('#submitBtn');
  await page.waitForTimeout(900);
  s = await state(page);
  ok('⑦ 로그인 뒤 원래 교사 페이지로 돌아와 본문이 보인다', s.url === BASE + '/gate.html' && s.attr === 'ready' && s.vis === 'visible', JSON.stringify(s));
  await ctx.close();

  /* ② */
  ({ page, ctx, calls } = await open({ session: sess() }));
  s = await state(page);
  ok('② 로그인 + 교사 → 본문 보임', s.url === BASE + '/gate.html' && s.attr === 'ready' && s.vis === 'visible', JSON.stringify(s));
  ok('② 교사 확인은 개인 토큰으로, fetch는 바꾸지 않음', calls.some(c => /teacher_accounts/.test(c.u) && c.auth === 'Bearer tok-old') && s.fetchNative, JSON.stringify(calls));
  await ctx.close();

  /* ③ */
  ({ page, ctx, calls } = await open({ session: sess(), notTeacher: true }));
  s = await state(page);
  ok('③ 교사 표에 없음 → not_teacher 로 보내고 세션 삭제', /reason=not_teacher/.test(s.url) && !s.sess, JSON.stringify([s.url, s.sess]));
  ok('③ 로그인 화면 문구', /사용할 수 없는 교사 계정/.test(await page.evaluate(() => document.getElementById('message').textContent)));
  await ctx.close();

  /* ④ */
  ({ page, ctx, calls } = await open({ session: sess(30) }));
  s = await state(page);
  const saved = JSON.parse(s.sess || 'null');
  ok('④ 만료 직전 → refresh 뒤 통과, 새 토큰 저장', s.attr === 'ready' && calls.some(c => /grant_type=refresh/.test(c.u)) && saved && saved.access_token === 'tok-new' && saved.user.id === 'u-kim', JSON.stringify([s.attr, saved]));
  await ctx.close();

  /* ⑤ */
  ({ page, ctx, calls } = await open({ session: sess(), netfail: true }));
  s = await state(page);
  ok('⑤ 교사 확인 통신 실패 → 막지 않음', s.attr === 'ready' && s.vis === 'visible' && s.url === BASE + '/gate.html', JSON.stringify(s));
  await ctx.close();

  /* ⑥ */
  ({ page, ctx, calls } = await open({ page: '/nogate.html' }));
  s = await state(page);
  const g = await page.evaluate(() => window.ShuegukGate && window.ShuegukGate.active);
  ok('⑥ github.io 가 아니면 게이트 꺼짐(요청 없음·본문 보임)', g === false && !calls.length && s.vis === 'visible' && !s.attr, JSON.stringify([g, calls.length, s]));
  await ctx.close();

  /* ⑥-2 127.0.0.1 이라도 data-force="on" 이면 켜진다(검사용) */
  ({ page, ctx, calls } = await open({ page: '/gate.html' }));
  s = await state(page);
  ok('⑥-2 data-force 로 로컬에서도 게이트 작동', /login\.html\?next=/.test(s.url) && /reason=login_required/.test(s.url), s.url);
  await ctx.close();

  await b.close(); srv.close();
  console.log((fail ? '✗ ' : '✓ ') + pass + ' 통과' + (fail ? ' · ' + fail + ' 실패' : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
