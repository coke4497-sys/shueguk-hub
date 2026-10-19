/* 슈국 대화방(messenger.html) 브라우저 E2E (2026-10-19)
 * 가짜 수파베이스(표·함수·저장소)로 실제 페이지를 띄워
 *   대화 그리기 · @부르기 목록 · 보내기(p_mentions) · 업무 카드(내 카드 먼저·진행률·지남 표시·체크 권한) ·
 *   체크 → msg_task_set · 다른 사람 메시지 새로 받기(폴링) · 파일 올리기/내려받기 · 지우기 · 할 일 → 메시지로 이동 ·
 *   거르기 · 휴대폰 탭 · 표 없음 안내 · 티쳐스 첫 화면 카드
 * 를 검사한다. 원격에는 아무것도 보내지 않는다.
 *   실행: LC_ALL=C.UTF-8 NODE_PATH=$(npm root -g) node tools/messenger-e2e-test.js
 *   (LC_ALL — 이 컨테이너는 로캘이 없어 크로미엄이 한글 파일 이름을 'download'로 바꾼다)
 *   SHOT=폴더 를 주면 컴퓨터·휴대폰 화면을 찍어 둔다
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8951;
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let n = 0, bad = 0;
function ok(cond, label){ n++; if (!cond){ bad++; console.error('  ✗', label); } else console.log('  ✓', label); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ME = '11111111-1111-1111-1111-111111111111';     // 고희주 조교
const EUNJI = '22222222-2222-2222-2222-222222222222';  // 이은지 선생님
const BOSS = '33333333-3333-3333-3333-333333333333';   // 이수경 관리자
const NOWISO = () => new Date().toISOString();
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const MEMBERS = [
  { user_id: ME, name: '고희주', role: 'assistant' },
  { user_id: EUNJI, name: '이은지', role: 'teacher' },
  { user_id: BOSS, name: '이수경', role: 'admin' },
  { user_id: '44444444-4444-4444-4444-444444444444', name: '김지원', role: 'teacher' },
];
const NAME = { [ME]: '고희주', [EUNJI]: '이은지', [BOSS]: '이수경' };
let missing = false;
let mid = 0, tid = 0, clock = 0;
const ts = () => new Date(Date.now() + (clock++)).toISOString();
const MSGS = [], TASKS = [], OBJECTS = {}, calls = [];
function addMsg(author, body, files, createdIso){
  const t = createdIso || ts();
  const m = { id: ++mid, author, author_name: NAME[author], body, files: files || [], created_at: t, updated_at: t, deleted_at: null };
  MSGS.push(m); return m;
}
function addTask(m, assignee, text, createdIso){
  const t = createdIso || m.created_at;
  const k = { id: ++tid, message_id: m.id, assignee, assignee_name: NAME[assignee], requester: m.author, requester_name: m.author_name, text, status: '대기', done_by_name: null, done_at: null, created_at: t, updated_at: t };
  TASKS.push(k); return k;
}
// 어제 남은 일 · 4시간 지난 일 · 오늘 일
const m1 = addMsg(BOSS, '중3 허은재 퇴원. @고희주', [], ago(30));
addTask(m1, ME, '중3 허은재 퇴원.', ago(30));
const m2 = addMsg(ME, '지도중1 이주현 등원 문의입니다. 회신 부탁드립니다! @이은지T', [], ago(4));
addTask(m2, EUNJI, '지도중1 이주현 등원 문의입니다. 회신 부탁드립니다!', ago(4));
const m3 = addMsg(EUNJI, '중3 김민준 결석입니다 @고희주', [], ago(0.2));
const t3 = addTask(m3, ME, '중3 김민준 결석입니다', ago(0.2));
const m4 = addMsg(BOSS, '김지원T 피드백 확인 부탁 @김지원', [], ago(0.1));
TASKS.push({ id: ++tid, message_id: m4.id, assignee: '44444444-4444-4444-4444-444444444444', assignee_name: '김지원', requester: BOSS, requester_name: '이수경', text: '김지원T 피드백 확인 부탁', status: '대기', done_by_name: null, done_at: null, created_at: m4.created_at, updated_at: m4.created_at });
NAME['44444444-4444-4444-4444-444444444444'] = '김지원';

function filterRows(rows, u){
  let out = rows.slice();
  u.searchParams.forEach((v, k) => {
    if (['select', 'order', 'limit'].includes(k)) return;
    const m = v.match(/^(eq|gt|gte|lt|in)\.(.*)$/); if (!m) return;
    const [, op, val] = m;
    if (op === 'eq') out = out.filter(r => String(r[k]) === val);
    if (op === 'gt') out = out.filter(r => r[k] != null && (k === 'id' ? r[k] > Number(val) : r[k] > val));
    if (op === 'gte') out = out.filter(r => r[k] != null && (k === 'id' ? r[k] >= Number(val) : Date.parse(r[k]) >= Date.parse(val)));
    if (op === 'lt') out = out.filter(r => r[k] != null && (k === 'id' ? r[k] < Number(val) : r[k] < val));
    if (op === 'in') { const set = val.replace(/[()]/g, '').split(',').map(Number); out = out.filter(r => set.includes(r[k])); }
  });
  const ord = u.searchParams.get('order');
  if (ord === 'id.desc') out.sort((a, b) => b.id - a.id); else out.sort((a, b) => a.id - b.id);
  const lim = Number(u.searchParams.get('limit') || 0); if (lim) out = out.slice(0, lim);
  return out;
}

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    const type = f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }); res.end(fs.readFileSync(f));
  }).listen(PORT);
  const browser = await chromium.launch();

  async function open(viewport){
    const ctx = await browser.newContext({ viewport: viewport || { width: 1400, height: 900 }, acceptDownloads: true });
    await ctx.addInitScript(id => localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({
      access_token: 'tok', refresh_token: 'refresh-tok', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id } })), ME);
    ctx.setDefaultTimeout(8000);
    ctx.on('dialog', d => d.accept());
    await ctx.route('**/*', async route => {
      const req = route.request(), url = req.url();
      const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: obj === null ? '' : JSON.stringify(obj) });
      if (req.method() === 'OPTIONS') return json(null, 204);
      if (url.includes('fonts.g')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (!url.startsWith(SB)) return route.continue();
      const u = new URL(url), p = u.pathname, auth = req.headers()['authorization'] || '';
      if (!/Bearer tok/.test(auth)) return json({ message: 'no auth' }, 401);
      if (p === '/rest/v1/teacher_accounts') return json([{ user_id: ME, login_id: 'heeju', display_name: '고희주', active: true, role: 'assistant' }]);
      if (missing && p.startsWith('/rest/v1/rpc/msg')) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
      if (p === '/rest/v1/rpc/msg_members') return json(MEMBERS);
      if (p === '/rest/v1/rpc/msg_send'){
        const b = JSON.parse(req.postData()); calls.push(['send', b]);
        const m = addMsg(ME, b.p_body, b.p_files);
        let text = b.p_body; (b.p_mentions || []).forEach(id => { text = text.split('@' + NAME[id]).join(''); });
        text = text.replace(/\s+/g, ' ').trim() || '메시지 확인';
        const tasks = (b.p_mentions || []).map(id => addTask(m, id, text));
        return json({ message: m, tasks });
      }
      if (p === '/rest/v1/rpc/msg_task_set'){
        const b = JSON.parse(req.postData()); calls.push(['task', b]);
        const t = TASKS.find(x => x.id === b.p_id);
        t.status = b.p_done ? '완료' : '대기'; t.done_at = b.p_done ? ts() : null; t.done_by_name = b.p_done ? '고희주' : null; t.updated_at = ts();
        return json(t);
      }
      if (p === '/rest/v1/rpc/msg_delete'){
        const b = JSON.parse(req.postData()); calls.push(['del', b]);
        const m = MSGS.find(x => x.id === b.p_id);
        m.body = ''; m.files = []; m.deleted_at = ts(); m.updated_at = m.deleted_at;
        for (let i = TASKS.length - 1; i >= 0; i--) if (TASKS[i].message_id === m.id) TASKS.splice(i, 1);
        return json(m);
      }
      if (p === '/rest/v1/msg_messages') return json(filterRows(MSGS, u));
      if (p === '/rest/v1/msg_tasks') return json(filterRows(TASKS, u));
      if (p.startsWith('/storage/v1/object/authenticated/msg-files/')){
        const key = decodeURIComponent(p.slice('/storage/v1/object/authenticated/msg-files/'.length));
        calls.push(['get', key]);
        return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: OBJECTS[key] || Buffer.from('x') });
      }
      if (p.startsWith('/storage/v1/object/msg-files/') && req.method() === 'POST'){
        const key = p.slice('/storage/v1/object/msg-files/'.length);
        OBJECTS[key] = req.postDataBuffer(); calls.push(['up', key, req.headers()['content-type']]);
        return json({ Key: 'msg-files/' + key });
      }
      if (p === '/storage/v1/object/msg-files' && req.method() === 'DELETE'){ calls.push(['rm', JSON.parse(req.postData())]); return json([]); }
      return json({ message: 'unexpected ' + p }, 400);
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => { bad++; console.error('  ✗ 페이지 오류', e.message); });
    await page.goto(`http://127.0.0.1:${PORT}/messenger.html`);
    return { ctx, page };
  }

  console.log('① 처음 화면');
  let { ctx, page } = await open();
  await page.waitForSelector('#m' + m3.id);
  ok(await page.locator('#cnt').textContent() === '4명', '사람 수 4명');
  ok((await page.locator('#me').textContent()).includes('고희주 조교'), '내 이름·역할');
  ok(await page.locator('.m').count() === 4, '메시지 4개');
  ok(await page.locator('#m' + m2.id).evaluate(e => e.classList.contains('mine')), '내 메시지는 오른쪽(mine)');
  ok((await page.locator('#m' + m3.id + ' .at').textContent()) === '@고희주', '@이름 강조');
  ok((await page.locator('#m' + m2.id + ' .tk').textContent()).includes('이은지 · 아직'), '메시지 아래 할 일 표시');
  ok(await page.locator('#live').textContent() === '실시간', '실시간 표시');

  console.log('② 업무 카드');
  const firstCard = page.locator('.pc').first();
  ok((await firstCard.locator('.pn').textContent()) === '고희주', '내 카드가 맨 앞');
  ok((await firstCard.locator('.pcnt').textContent()) === '0 / 2', '내 카드 0 / 2');
  ok((await firstCard.textContent()).includes('부터 남음'), '어제 남은 일 표시');
  const eunji = page.locator('.pc[data-person="' + EUNJI + '"]');
  ok((await eunji.textContent()).includes('4시간 지남'), '3시간 넘은 일은 지남 표시');
  ok(!(await eunji.locator('.bx').first().isDisabled()), '내가 맡긴 일은 체크 가능');
  const jiwon = page.locator('.pc[data-person="44444444-4444-4444-4444-444444444444"]');
  ok(await jiwon.locator('.bx').first().isDisabled(), '남끼리의 일은 체크 불가');
  ok((await page.locator('#sum').textContent()) === '전체 0 / 4 완료', '전체 진행');
  ok((await page.locator('.idle').textContent()).includes('이수경'), '할 일 없는 사람 줄');

  console.log('③ 체크');
  await firstCard.locator('.bx').last().click();
  await page.waitForFunction(() => document.querySelector('.pc .pcnt').textContent === '1 / 2');
  ok(calls.some(c => c[0] === 'task' && c[1].p_id === t3.id && c[1].p_done === true), 'msg_task_set(완료) 호출');
  await page.waitForFunction(id => (document.querySelector('#m' + id + ' .tk') || {}).textContent.includes('완료'), m3.id);
  ok(true, '메시지 아래 표시도 완료로');
  ok((await page.locator('#sum').textContent()) === '전체 1 / 4 완료', '전체 진행 갱신');

  console.log('④ @부르기 · 보내기');
  await page.click('#inp');
  await page.keyboard.type('윤태연 결석 알림톡 부탁해요 @이은');
  await page.waitForSelector('#mention.on');
  ok((await page.locator('#mention button').count()) === 1 && (await page.locator('#mention button').textContent()).includes('이은지'), '부를 사람 목록');
  await page.keyboard.press('Enter');
  ok((await page.inputValue('#inp')).endsWith('@이은지 '), '이름이 들어감');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#inp').value === '');
  const send = calls.filter(c => c[0] === 'send').pop();
  ok(send && send[1].p_mentions.length === 1 && send[1].p_mentions[0] === EUNJI, 'p_mentions = 이은지');
  ok(send && send[1].p_body === '윤태연 결석 알림톡 부탁해요 @이은지', '보낸 글');
  await page.waitForFunction(() => document.querySelector('.pc[data-person="22222222-2222-2222-2222-222222222222"] .pcnt').textContent === '0 / 2');
  ok(true, '이은지 카드에 할 일 추가');

  console.log('⑤ 다른 사람 메시지 새로 받기');
  const m5 = addMsg(BOSS, '고1 시험지 올렸어요 @고희주', [], ts());
  addTask(m5, ME, '고1 시험지 올렸어요', m5.created_at);
  await page.waitForSelector('#m' + m5.id, { timeout: 7000 });
  ok(true, '3초 안팎에 새 메시지 보임');
  await page.waitForFunction(() => document.querySelector('.pc .pcnt').textContent === '1 / 3');
  ok(true, '내 카드에 새 할 일');

  console.log('⑥ 파일');
  await page.setInputFiles('#file', [{ name: '고1 시험지.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') }]);
  ok((await page.locator('.pf').textContent()).includes('고1 시험지.pdf'), '보낼 파일 표시');
  await page.click('#send');
  await page.waitForFunction(() => !document.querySelector('.pf'));
  const up = calls.filter(c => c[0] === 'up').pop();
  ok(up && /^m\/\d{6}\/[A-Za-z0-9]{24}\.pdf$/.test(up[1]), '저장소 경로 m/년월/무작위.pdf (' + (up && up[1]) + ')');
  ok(up && up[2] === 'application/pdf', '파일 종류 그대로');
  const fsend = calls.filter(c => c[0] === 'send').pop();
  ok(fsend[1].p_files.length === 1 && fsend[1].p_files[0].name === '고1 시험지.pdf' && fsend[1].p_files[0].path === up[1], 'p_files에 이름·경로');
  const fileBtn = page.locator('.file').last();
  ok((await fileBtn.textContent()).includes('고1 시험지.pdf'), '대화에 파일 버튼');
  const [dl] = await Promise.all([page.waitForEvent('download'), fileBtn.click()]);
  ok(dl.suggestedFilename() === '고1 시험지.pdf', '원래 이름으로 내려받기');
  ok(calls.some(c => c[0] === 'get' && c[1] === up[1]), '교사 신분으로 받기');

  console.log('⑦ 지우기');
  const fm = MSGS[MSGS.length - 1];
  await page.hover('#m' + fm.id);
  await page.click('#m' + fm.id + ' [data-del]');
  await page.waitForSelector('#m' + fm.id + ' .bb.del');
  ok(calls.some(c => c[0] === 'rm' && c[1].prefixes[0] === up[1]), '저장소 파일 먼저 지움');
  ok(calls.some(c => c[0] === 'del' && c[1].p_id === fm.id), 'msg_delete 호출');
  ok(await page.locator('#m' + m3.id + ' [data-del]').count() === 0, '남의 메시지엔 지우기 없음');

  console.log('⑧ 할 일 → 메시지로');
  await page.locator('.pc').first().locator('.ctx', { hasText: '허은재' }).click();
  await page.waitForFunction(id => document.querySelector('#m' + id).classList.contains('flash'), m1.id);
  ok(true, '그 메시지가 강조됨');

  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'desktop.png') });
  console.log('⑨ 거르기');
  await page.click('.fl[data-f="assistant"]');
  ok(await page.locator('.pc').count() === 1, '조교만');
  await page.click('.fl[data-f="teacher"]');
  ok(await page.locator('.pc').count() === 2, '선생님만');
  await page.click('.fl[data-f="all"]');
  await ctx.close();

  console.log('⑩ 휴대폰');
  ({ ctx, page } = await open({ width: 390, height: 844 }));
  await page.waitForSelector('#m' + m3.id);
  ok(await page.locator('.tabs').isVisible(), '탭 보임');
  ok(!(await page.locator('#board').isVisible()), '처음엔 대화만');
  ok((await page.locator('#tabBoard').textContent()).includes('내 할 일'), '탭에 내 할 일 수');
  await page.click('#tabBoard');
  ok(await page.locator('#board').isVisible() && !(await page.locator('#chat').isVisible()), '업무 카드 탭');
  await page.locator('.pc').first().locator('.ctx').first().click();
  await page.waitForFunction(() => document.body.dataset.tab === 'chat');
  ok(true, '할 일을 누르면 대화 탭으로');
  if (process.env.SHOT){ await page.screenshot({ path: path.join(process.env.SHOT, 'phone-chat.png') }); await page.click('#tabBoard'); await page.screenshot({ path: path.join(process.env.SHOT, 'phone-board.png') }); await page.click('#tabChat'); }
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 390, '가로 넘침 없음 (' + sw + ')');
  await ctx.close();

  console.log('⑪ 표 없음');
  missing = true;
  ({ ctx, page } = await open());
  await page.waitForSelector('.notice');
  ok((await page.locator('.notice').textContent()).includes('준비가 아직'), '마이그레이션 안내');
  await ctx.close();
  missing = false;

  console.log('⑫ 티쳐스 첫 화면');
  ({ ctx, page } = await open());
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForSelector('a.card');
  ok((await page.locator('a.card').first().getAttribute('href')) === 'messenger.html', '첫 카드 = 슈국 대화방');
  await ctx.close();

  await browser.close(); server.close();
  console.log(`\n${n - bad} / ${n} 통과`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
