/* 슈톡 Shuetalk(messenger.html) 브라우저 E2E (2026-10-19)
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
let missing = false, failSendOnce = false;
let mid = 0, tid = 0, clock = 0;
const ts = () => new Date(Date.now() + (clock++)).toISOString();
const MSGS = [], TASKS = [], OBJECTS = {}, calls = [], PUSHSUBS = {}, PRESENCE = {}, PLOGS = [];
let noPres = false;
const TT = [], TTP = [], TTLOG = [], NOTES = [];
let failTT = false;   // 시간표·기간·주간 기록·수업 기록 (오늘 수업 줄)
function addMsg(author, body, files, createdIso){
  const t = createdIso || ts();
  const m = { id: ++mid, author, author_name: NAME[author], body, files: files || [], created_at: t, updated_at: t, deleted_at: null, reply_to: null };
  MSGS.push(m); return m;
}
function addTask(m, assignee, text, createdIso){
  const t = createdIso || m.created_at;
  const k = { id: ++tid, message_id: m.id, assignee, assignee_name: NAME[assignee], requester: m.author, requester_name: m.author_name, text, status: '대기', done_by_name: null, done_at: null, seen_at: null, ack_only: false, cancel_reason: '', created_at: t, updated_at: t };
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
    if (k === 'or'){   // or=(author.is.null,author.neq.X) 꼴만
      const parts = v.replace(/^\(|\)$/g, '').split(',').map(x => x.split('.'));
      out = out.filter(r => parts.some(([f, op, val]) => op === 'is' ? r[f] == null : op === 'neq' ? String(r[f]) !== val : op === 'eq' ? String(r[f]) === val : false));
      return;
    }
    const m = v.match(/^(eq|neq|gt|gte|lt|in|is|ilike|like)\.(.*)$/); if (!m) return;
    const [, op, val] = m;
    if (op === 'eq') out = out.filter(r => String(r[k]) === val);
    if (op === 'neq') out = out.filter(r => String(r[k]) !== val);
    if (op === 'is' && val === 'null') out = out.filter(r => r[k] == null);
    if (op === 'gt') out = out.filter(r => r[k] != null && (k === 'id' ? r[k] > Number(val) : r[k] > val));
    if (op === 'gte') out = out.filter(r => r[k] != null && (k === 'id' ? r[k] >= Number(val) : Date.parse(r[k]) >= Date.parse(val)));
    if (op === 'lt') out = out.filter(r => r[k] != null && (k === 'id' ? r[k] < Number(val) : r[k] < val));
    if (op === 'ilike' || op === 'like'){ const re = new RegExp('^' + val.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', op === 'ilike' ? 'is' : 's'); out = out.filter(r => re.test(String(r[k] || ''))); }
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

  async function open(viewport, opts){
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: viewport || { width: 1400, height: 900 }, acceptDownloads: true, userAgent: opts.ua });
    // 알림 허용 전에는 관문 창이 화면을 덮으므로 기본은 '이미 허용한 기기'로 연다(perm: 'default'면 처음 여는 기기)
    if (!opts.realPush) await ctx.addInitScript(perm => {
      // 헤드리스 크로미엄에는 실제 푸시 서비스가 없어 구독을 흉내 낸다
      window.__subscribed = null;
      Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: perm, requestPermission(){ window.Notification.permission = 'granted'; return Promise.resolve('granted'); } } });
      const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/fake-1', toJSON(){ return { endpoint: this.endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }; }, unsubscribe(){ window.__subscribed = null; return Promise.resolve(true); } };
      const reg = { pushManager: { getSubscription(){ return Promise.resolve(window.__subscribed); }, subscribe(o){ window.__subOpts = { uv: o.userVisibleOnly, keyLen: o.applicationServerKey.length }; window.__subscribed = sub; return Promise.resolve(sub); } } };
      if (!window.PushManager) window.PushManager = function(){};
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register(){ return Promise.resolve(reg); }, getRegistrations(){ return Promise.resolve([reg]); }, addEventListener(){} } });
    }, opts.perm || 'granted');
    if (opts.now) await ctx.addInitScript(t => { const D = Date, off = t - D.now(); window.Date = class extends D { constructor(...a){ super(...(a.length ? a : [D.now() + off])); } static now(){ return D.now() + off; } }; }, opts.now);
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
      if (p === '/rest/v1/msg_presence') return noPres ? json({ code: 'PGRST205', message: 'Could not find the table' }, 404) : json(Object.values(PRESENCE));
      if (p === '/rest/v1/msg_presence_log') return json(filterRows(PLOGS, u).sort((a, b) => a.at < b.at ? -1 : 1));
      if (p === '/rest/v1/rpc/msg_presence_set'){
        const b = JSON.parse(req.postData()); calls.push(['pres', b]);
        const old = PRESENCE[ME] || {};
        PRESENCE[ME] = { user_id: ME, name: '고희주', loc: b.p_on ? b.p_loc : (old.loc || ''), is_on: b.p_on, changed_at: NOWISO() };
        PLOGS.push({ id: PLOGS.length + 1, user_id: ME, is_on: b.p_on, at: NOWISO() });
        return json(PRESENCE[ME]);
      }
      if (p === '/rest/v1/rpc/msg_send'){
        const b = JSON.parse(req.postData()); calls.push(['send', b]);
        const m = addMsg(ME, b.p_body, b.p_files);
        if (b.p_reply) m.reply_to = b.p_reply;
        let text = b.p_body; (b.p_mentions || []).forEach(id => { text = text.split('@' + NAME[id]).join(''); });
        const all = /@(모두|전체)/.test(b.p_body);
        text = text.replace(/@(모두|전체)/g, '').replace(/\s+/g, ' ').trim() || '메시지 확인';
        const tasks = [...new Set(b.p_mentions || [])].map(id => { const k = addTask(m, id, text); k.ack_only = all; return k; });
        return json({ message: m, tasks });
      }
      if (p === '/rest/v1/rpc/msg_task_seen'){
        const b = JSON.parse(req.postData()); calls.push(['seen', b]);
        const t = TASKS.find(x => x.id === b.p_id);
        t.seen_at = t.seen_at || ts(); if (t.ack_only && t.status !== '완료'){ t.status = '완료'; t.done_at = ts(); t.done_by_name = '고희주'; } t.updated_at = ts();
        return json(t);
      }
      if (p === '/rest/v1/rpc/msg_task_cancel'){
        const b = JSON.parse(req.postData()); calls.push(['cancel', b]);
        const t = TASKS.find(x => x.id === b.p_id);
        if (b.p_undo){ t.status = '대기'; t.cancel_reason = ''; t.done_by_name = null; t.done_at = null; }
        else { if (!String(b.p_reason || '').trim()) return json({ message: 'need_reason' }, 400); t.status = '취소'; t.cancel_reason = b.p_reason.trim(); t.done_by_name = '고희주'; t.done_at = ts(); }
        t.updated_at = ts(); return json(t);
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
      if (p === '/rest/v1/rpc/msg_push_state'){ const b = JSON.parse(req.postData()); const x = PUSHSUBS[b.p_endpoint]; return json({ saved: !!x, mode: x ? x.mode : 'all', devices: Object.keys(PUSHSUBS).length }); }
      if (p === '/rest/v1/rpc/msg_push_save'){ const b = JSON.parse(req.postData()); calls.push(['psave', b]); PUSHSUBS[b.p_sub.endpoint] = { mode: b.p_mode }; return json({ id: 1, mode: b.p_mode }); }
      if (p === '/rest/v1/rpc/msg_push_remove'){ const b = JSON.parse(req.postData()); calls.push(['premove', b]); delete PUSHSUBS[b.p_endpoint]; return json({ removed: 1 }); }
      if (p === '/functions/v1/msg-push'){
        const b = JSON.parse(req.postData()); calls.push(['fn', b]);
        if (b.action === 'key') return json({ key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' });
        if (b.action === 'test') return json({ devices: 1, sent: 1, gone: 0, failed: 0 });
        if (b.action === 'send' && failSendOnce){ failSendOnce = false; return json({ error: 'lookup_failed' }, 503); }
        return json({ targets: 2, sent: 2 });
      }
      if (p === '/rest/v1/msg_messages'){
        if (/count=exact/.test(req.headers()['prefer'] || '')){
          const n = filterRows(MSGS, u).length;
          return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': (n ? '0-0/' : '*/') + n }, body: '[]' });
        }
        return json(filterRows(MSGS, u));
      }
      if (p === '/rest/v1/msg_tasks') return json(filterRows(TASKS, u));
      if (failTT && /^\/rest\/v1\/(tt_|class_notes)/.test(p)){ calls.push(['ttfail', p]); return json({ message: 'boom' }, 500); }
      if (p === '/rest/v1/tt_classes'){
        calls.push(['tt', u.search]);
        const cid = u.searchParams.get('class_id') || '', day = (u.searchParams.get('day') || '').replace(/^eq\./, '');
        return json(TT.filter(c => cid.startsWith('not.like.w') ? !/^w/.test(c.class_id) && (!day || c.day === day) : cid.startsWith('like.') ? c.class_id.startsWith(cid.slice(5).replace('*', '')) : true));
      }
      if (p === '/rest/v1/tt_period') return json(TTP.filter(x => 'eq.' + x.week_wednesday === u.searchParams.get('week_wednesday')));
      if (p === '/rest/v1/tt_log') return json(TTLOG.filter(x => 'eq.' + x.apply_date === u.searchParams.get('apply_date')));
      if (p === '/rest/v1/class_notes') return json(NOTES.filter(x => 'eq.' + x.ymd === u.searchParams.get('ymd')));
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
  const et = await eunji.textContent();
  ok(et.includes('4시간 지남') || et.includes('부터 남음'), '3시간 넘은 일은 지남 표시(자정 넘으면 M/D부터 남음)');
  ok(!(await eunji.locator('.bx').first().isDisabled()), '내가 맡긴 일은 체크 가능');
  const jiwon = page.locator('.pc[data-person="44444444-4444-4444-4444-444444444444"]');
  ok(await jiwon.locator('.bx').first().isDisabled(), '남끼리의 일은 체크 불가');
  ok((await page.locator('#sum').textContent()) === '전체 0 / 4 완료', '전체 진행');
  ok(await page.locator('.pc').count() === 4, '모든 사람에게 카드 (4장)');
  ok((await page.locator('.pc[data-person="' + BOSS + '"]').textContent()).includes('오늘 할 일이 없습니다'), '할 일 없는 사람도 카드');

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
  ok(await page.locator('.pc').count() === 3, '선생님만(관리자 포함)');
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
  await page.click('#tabBoard');
  const mB = addMsg(BOSS, '카톡처럼 숫자 시험', [], ts());
  await page.waitForFunction(() => !document.querySelector('#chatBadge').hidden, null, { timeout: 7000 });
  ok((await page.locator('#chatBadge').textContent()) === '1', '업무 카드를 보는 중 새 메시지 → 대화 탭에 빨간 1');
  await page.click('#tabChat');
  await page.evaluate(() => { const el = document.getElementById('msgs'); el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
  await page.waitForFunction(() => document.querySelector('#chatBadge').hidden);
  ok(true, '대화를 끝까지 보면 숫자 사라짐');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 390, '가로 넘침 없음 (' + sw + ')');
  await ctx.close();

  console.log('⑩-2 빨간 숫자 — 불러오지 않은 메시지·앱 아이콘 (Codex 검토)');
  const before80 = MSGS.length ? MSGS[MSGS.length - 1].id : 0;
  for (let i = 0; i < 85; i++) addMsg(BOSS, '쌓인 메시지 ' + i, [], ts());
  ({ ctx, page } = await open({ width: 390, height: 844 }));
  await page.waitForSelector('#msgs .m');
  await page.click('#tabBoard');
  await page.evaluate(([me, mk]) => { localStorage.setItem('msg_read_' + me, String(mk)); window.__cleared = 0; navigator.clearAppBadge = () => { window.__cleared++; return Promise.resolve(); }; }, [ME, before80]);
  addMsg(BOSS, '하나 더', [], ts());
  await page.waitForFunction(() => document.querySelector('#chatBadge').textContent === '86', null, { timeout: 9000 }).catch(() => {});
  ok((await page.locator('#chatBadge').textContent()) === '86', '80개 넘게 쌓여도 대화 탭 숫자는 전부 (86)');
  const offOne = MSGS.find(m => m.id > before80 && m.author === BOSS); offOne.deleted_at = ts(); offOne.body = ''; offOne.updated_at = ts();   // 화면 밖 구간 메시지를 다른 창에서 지움
  await page.waitForFunction(() => document.querySelector('#chatBadge').textContent === '85', null, { timeout: 9000 }).catch(() => {});
  ok((await page.locator('#chatBadge').textContent()) === '85', '화면 밖 메시지가 지워지면 다시 셈 (85)');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sleep(200);
  ok(await page.evaluate(() => window.__cleared) === 0, '업무 카드 탭으로 돌아오면 앱 아이콘 숫자를 지우지 않음');
  await ctx.close();
  MSGS.splice(MSGS.length - 86, 86);

  console.log('⑪ 표 없음');
  missing = true;
  ({ ctx, page } = await open());
  await page.waitForSelector('.notice');
  ok((await page.locator('.notice').textContent()).includes('준비가 아직'), '마이그레이션 안내');
  await ctx.close();
  missing = false;

  console.log('⑫ 휴대폰 알림 — 켜기·끄기 없이 기본으로 켜짐');
  ({ ctx, page } = await open(null, { perm: 'default' }));
  await page.waitForSelector('#m' + m3.id);
  await page.waitForFunction(() => !document.querySelector('#pback').hidden);
  ok(await page.locator('#pback').isVisible(), '허용 전에는 관문 창이 화면을 덮음');
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'gate.png') });
  ok(await page.evaluate(() => document.querySelector('.app').hasAttribute('inert')), '관문 창 뒤 대화는 누를 수 없음(inert)');
  ok(await page.locator('#notiBtn').count() === 0 && await page.locator('#pclose').count() === 0 && await page.locator('#pbanner').count() === 0, '알림 버튼·닫기·안내 띠 없음');
  ok(await page.locator('input[name="pm"]').count() === 0 && await page.locator('#ptest').count() === 0, '받을 범위 선택·시험 알림 없음');
  await page.keyboard.press('Escape'); await page.mouse.click(5, 5);
  ok(await page.locator('#pback').isVisible(), 'Esc·바깥을 눌러도 안 닫힘');
  await page.click('#pon');
  await page.waitForFunction(() => document.querySelector('#pback').hidden);
  ok(!(await page.evaluate(() => document.querySelector('.app').hasAttribute('inert'))), '허용하면 관문이 사라지고 대화를 씀');
  ok(calls.some(c => c[0] === 'fn' && c[1].action === 'key'), '공개 키 받기');
  const so = await page.evaluate(() => window.__subOpts);
  ok(so && so.uv === true && so.keyLen === 65, '구독 — userVisibleOnly · 65바이트 키');
  const ps = calls.filter(c => c[0] === 'psave').pop();
  ok(ps && ps[1].p_sub.endpoint.includes('fake-1') && ps[1].p_mode === 'all' && ps[1].p_sub.keys.auth, 'msg_push_save — 구독·모든 메시지');
  await page.click('#inp'); await page.keyboard.type('푸시 시험 @이은지'); await page.click('#send');
  await page.waitForFunction(() => document.querySelector('#inp').value === '');
  await sleep(300);
  const lastId = MSGS[MSGS.length - 1].id;
  ok(calls.some(c => c[0] === 'fn' && c[1].action === 'send' && c[1].message_id === lastId), '보낸 뒤 msg-push send(message_id)');
  failSendOnce = true;
  await page.click('#inp'); await page.keyboard.type('서버가 잠깐 실패'); await page.click('#send');
  await page.waitForFunction(() => document.querySelector('#inp').value === '');
  const failId = MSGS[MSGS.length - 1].id;
  await sleep(6500);
  ok(calls.filter(c => c[0] === 'fn' && c[1].action === 'send' && c[1].message_id === failId).length === 2, '알림 서버가 실패하면 5초 뒤 한 번 더');
  // 로그아웃하면 이 기기 구독도 지운다 (Codex 검토 P1)
  const rmBefore = calls.filter(c => c[0] === 'premove').length;
  await page.exposeFunction('__badgeCleared', () => calls.push(['badgeclr']));
  await page.evaluate(() => { navigator.clearAppBadge = () => { window.__badgeCleared(); return Promise.resolve(); }; });
  await page.evaluate(() => { window.TeacherAuth.logout(); });
  await page.waitForURL(/login\.html/);
  ok(calls.filter(c => c[0] === 'premove').length === rmBefore + 1, '로그아웃 → 서버 구독 삭제');
  ok(calls.some(c => c[0] === 'badgeclr'), '로그아웃 → 앱 아이콘 숫자도 0');
  await ctx.close();

  // 예전에 '나를 부른 메시지만'으로 저장한 기기는 열 때 '모든 메시지'로 다시 저장
  PUSHSUBS['https://fcm.googleapis.com/fcm/send/fake-1'] = { mode: 'mention' };
  const pb = calls.filter(c => c[0] === 'psave').length;
  ({ ctx, page } = await open());
  await page.waitForSelector('#m' + m3.id);
  await page.waitForFunction(n => true, pb); await sleep(600);
  const rs = calls.filter(c => c[0] === 'psave');
  ok(rs.length > pb && rs[rs.length - 1][1].p_mode === 'all' && await page.locator('#pback').isHidden(), "옛 '나를 부른 것만' 기기 → 모든 메시지로 다시 저장");
  await ctx.close();

  console.log('⑫-2 같은 이름 두 사람(DB가 막지만 혹시 생기면)');
  const DUP = '55555555-5555-5555-5555-555555555555';
  MEMBERS.push({ user_id: DUP, name: '김지원', role: 'assistant' }); NAME[DUP] = '김지원';
  ({ ctx, page } = await open());
  await page.waitForSelector('#m' + m3.id);
  let ds;
  await page.click('#inp'); await page.keyboard.type('직접 친 이름 @김지원'); await page.keyboard.press('Escape'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#inp').value === '');
  ds = calls.filter(c => c[0] === 'send').pop();
  ok(ds[1].p_mentions.length === 2, '같은 이름은 둘 다에게');
  ok((await page.locator('#status').textContent()).includes('같은 이름이 여럿'), '같은 이름 안내');
  await ctx.close();
  MEMBERS.pop();

  console.log('⑬ 아이폰 사파리(홈 화면 추가 전)');
  ({ ctx, page } = await open({ width: 390, height: 844 }, { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }));
  await page.waitForSelector('#m' + m3.id);
  ok(await page.locator('#pback').isVisible() && await page.locator('#pios').isVisible(), '홈 화면에 추가 안내가 화면을 덮음');
  ok(!(await page.locator('#pon').isVisible()), '켜기 버튼은 숨김');
  await ctx.close();

  console.log('⑭ 서비스 워커(msg-sw.js) — 알림 띄우기');
  ({ ctx, page } = await open(null, { realPush: true }));
  await ctx.grantPermissions(['notifications'], { origin: `http://127.0.0.1:${PORT}` });
  await page.waitForSelector('#m' + m3.id);
  const shown = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('msg-sw.js');
    await navigator.serviceWorker.ready;
    return { scope: reg.scope, ok: !!reg.active };
  });
  ok(shown.ok && shown.scope.endsWith('/'), '서비스 워커 등록 (' + shown.scope + ')');
  // 알림 처리 자체는 아래 Node 검사(msg-sw.js 를 떼어 실행)로 본다 — 헤드리스 워커 평가는 들쭉날쭉해서
  const vm = require('vm');
  const notes = [], opened = [], posted = [];
  const handlers = {};
  const fakeClients = { list: [], matchAll(){ return Promise.resolve(this.list); }, openWindow(u){ opened.push(u); return Promise.resolve(); }, claim(){ return Promise.resolve(); } };
  const selfObj = { addEventListener(t, f){ handlers[t] = f; }, skipWaiting(){}, clients: fakeClients,
    registration: { showNotification(t, o){ notes.push({ t, o }); return Promise.resolve(); } }, navigator: {} };
  const badges = []; let stored = null;
  selfObj.navigator = { setAppBadge(n){ badges.push(n); return Promise.resolve(); } };
  const fakeCaches = { open(){ return Promise.resolve({ match(){ return Promise.resolve(stored == null ? undefined : { text(){ return Promise.resolve(stored); } }); }, put(k, r){ return r.text().then(t => { stored = t; }); } }); } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'msg-sw.js'), 'utf8'), { self: selfObj, caches: fakeCaches, Response: class { constructor(b){ this.b = b; } text(){ return Promise.resolve(this.b); } } });
  let waits = [];
  const ev = (extra) => Object.assign({ waitUntil(p){ waits.push(p); } }, extra);
  handlers.push(ev({ data: { json(){ return { title: '이은지 → 나에게 할 일', body: '결석 알림톡 보내기', url: 'messenger.html#m3', tag: 'msg3' }; } } }));
  await Promise.all(waits);
  ok(notes.length === 1 && notes[0].t === '이은지 → 나에게 할 일' && notes[0].o.body === '결석 알림톡 보내기', '푸시를 받으면 알림이 뜬다');
  ok(notes[0] && notes[0].o.data.url === 'messenger.html#m3' && notes[0].o.tag === 'msg3' && notes[0].o.renotify === true, '알림에 메시지 주소·묶음 이름');
  handlers.push(ev({ data: { json(){ throw new Error('x'); }, text(){ return '글자만'; } } }));
  await Promise.all(waits);
  ok(notes[1] && notes[1].t === '슈톡' && notes[1].o.body === '글자만', '내용이 깨져도 알림은 뜬다(아이폰 구독 유지)');
  ok(badges.join(',') === '1,2', '앱 아이콘 빨간 숫자 1 → 2 (' + badges.join(',') + ')');
  for (let i = 0; i < 3; i++) handlers.push(ev({ data: { json(){ return { title: 't', body: 'b' + i }; } } }));   // 거의 동시에 셋
  await Promise.all(waits);
  ok(stored === '5' && badges[badges.length - 1] === 5, '동시에 온 푸시도 하나씩 셈 (' + badges.join(',') + ')');
  let clears = 0; selfObj.navigator.clearAppBadge = () => { clears++; return Promise.resolve(); };
  handlers.push(ev({ data: { json(){ return { title: 't', body: '진행 중' }; } } }));   // +1 이 진행 중일 때
  handlers.message(ev({ data: { type: 'badge-clear' } }));                               // 화면이 0으로
  await Promise.all(waits);
  ok(stored === '0' && clears === 1, '0으로는 진행 중인 +1 뒤에 (' + stored + ')');
  fakeClients.list = [{ id: 'c1', url: 'http://x/messenger.html', visibilityState: 'visible', postMessage(){}, focus(){ return Promise.resolve(); } }];
  handlers.push(ev({ data: { json(){ return { title: 't', body: '창만 보임' }; } } }));
  await Promise.all(waits);
  ok(stored === '1', '창이 보여도 대화를 읽는 중이 아니면(업무 카드 탭 등) 숫자를 올림');
  handlers.message(ev({ data: { type: 'badge-clear' } }));
  handlers.message(ev({ data: { type: 'reading', on: true }, source: { id: 'c1' } }));
  handlers.push(ev({ data: { json(){ return { title: 't', body: '보는 중' }; } } }));
  await Promise.all(waits);
  ok(stored === '0' && notes[notes.length - 1].o.body === '보는 중', '대화를 끝까지 읽는 중이면 알림은 뜨되 숫자는 그대로');
  fakeClients.list = [];
  waits = [];
  let closed = 0;
  handlers.notificationclick(ev({ notification: { data: { url: 'messenger.html#m9' }, close(){ closed++; } } }));
  await Promise.all(waits);
  ok(closed === 1 && opened[0] === 'messenger.html#m9', '열린 창이 없으면 새로 연다');
  waits = []; let focused = 0;
  fakeClients.list = [{ url: 'https://x/shueguk-hub/messenger.html', postMessage(m){ posted.push(m); }, focus(){ focused++; return Promise.resolve(); } }];
  handlers.notificationclick(ev({ notification: { data: { url: 'messenger.html#m10' }, close(){} } }));
  await Promise.all(waits);
  ok(focused === 1 && posted[0] && posted[0].type === 'msg-open' && posted[0].url === 'messenger.html#m10' && opened.length === 1, '열린 대화방이 있으면 그 창으로 가서 메시지를 보여 준다');
  await ctx.close();

  console.log('⑮ 티쳐스 첫 화면');
  ({ ctx, page } = await open());
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForSelector('a.card');
  ok((await page.locator('a.card').count()) === 5 && (await page.locator('a.card').nth(4).getAttribute('href')) === 'messenger.html', '2×2 아래 다섯째 카드 = 슈톡');
  const wb = await page.locator('a.card.wide').boundingBox(), g = await page.locator('#grid').boundingBox(), c1 = await page.locator('a.card').nth(2).boundingBox();
  ok(wb && Math.abs(wb.width - g.width) < 2 && wb.y > c1.y + c1.height - 1, '슈톡은 3행 두 칸 너비');
  await page.waitForFunction(() => !document.querySelector('#msgBadge').hidden);
  const others = MSGS.filter(m => m.author !== ME && !m.deleted_at && m.id > 0).length;
  ok((await page.locator('#msgBadge').textContent()) === String(others), '슈톡 카드에 안 읽은 메시지 수 (' + others + ')');
  await page.evaluate(id => localStorage.setItem('msg_read_' + id, '999999'), ME);
  await page.reload(); await page.waitForSelector('a.card.wide'); await sleep(800);
  ok(await page.locator('#msgBadge').isHidden(), '다 읽었으면 숫자 없음');
  await ctx.close();

  console.log('⑰ 꼬리표 알약');
  ({ ctx, page } = await open());
  await page.waitForSelector('#m' + m3.id);
  ok(await page.locator('#tags .tg').count() === 8 && (await page.locator('#tags').textContent()) === '입학상담결석지각이동상담요청공지기타요청질문', '알약 8개');
  await page.click('#tags [data-tag="지각"]'); await page.click('#tags [data-tag="지각"]');
  ok(await page.locator('#tags .tg.on').count() === 0, '같은 알약을 다시 누르면 빠짐');
  await page.click('#tags [data-tag="결석"]');
  ok(await page.locator('#tags .tg.on').textContent() === '결석' && await page.evaluate(() => document.querySelector('#tags').classList.contains('has')), '고른 알약만 진하게');
  await page.click('#inp'); await page.keyboard.type('중3 박하늘 병결입니다 @이은지'); await page.keyboard.press('Escape'); await page.click('#send');
  await page.waitForFunction(() => document.querySelector('#inp').value === '');
  const tsend = calls.filter(c => c[0] === 'send').pop();
  if (process.env.SHOT){ await page.screenshot({ path: path.join(process.env.SHOT, 'tags.png') });
    const pg = await ctx.newPage(); await pg.setViewportSize({ width: 390, height: 844 }); await pg.goto('http://127.0.0.1:' + PORT + '/messenger.html'); await pg.waitForSelector('#msgs .m'); await pg.click('#tags [data-tag="상담요청"]'); await pg.screenshot({ path: path.join(process.env.SHOT, 'tags-phone.png') }); await pg.close(); }
  ok(tsend[1].p_body === '[결석] 중3 박하늘 병결입니다 @이은지', '본문 앞에 [결석] (' + tsend[1].p_body + ')');
  const lastM = MSGS[MSGS.length - 1];
  const bb = page.locator('#m' + lastM.id + ' .bb');
  ok(await bb.locator('span.tg.c2').textContent() === '결석' && !(await bb.textContent()).includes('['), '대화에는 대괄호 없이 연핑크 알약');
  ok(await page.locator('#tags .tg.on').count() === 0, '보낸 뒤 알약은 풀림');
  ok(await page.locator('.pc[data-person="' + EUNJI + '"] .ctx span.tg.c2').count() >= 1, '업무 카드 할 일에도 알약');
  await page.click('#inp'); await page.keyboard.type('[모르는말] 그대로'); await page.click('#send');
  await page.waitForFunction(() => document.querySelector('#inp').value === '');
  ok((await page.locator('#m' + MSGS[MSGS.length - 1].id + ' .bb').textContent()).includes('[모르는말]'), '목록에 없는 대괄호는 글 그대로');
  await ctx.close();

  console.log('⑱ 확인했습니다 · @모두');
  const mA = addMsg(BOSS, '상담 일정 잡아 주세요 @고희주', [], ts()); addTask(mA, ME, '상담 일정 잡아 주세요');
  ({ ctx, page } = await open());
  await page.waitForSelector('#m' + mA.id);
  const ackBtn = page.locator('#m' + mA.id + ' [data-ack]');
  ok(await ackBtn.count() === 1 && (await ackBtn.textContent()) === '확인했습니다', '나를 부른 메시지 아래 [확인했습니다]');
  ok(await page.locator('#m' + m4.id + ' [data-ack]').count() === 0, '남을 부른 메시지엔 버튼 없음');
  const m1Ack = page.locator('.pc[data-person="' + ME + '"] [data-ack="' + TASKS.find(x => x.message_id === m1.id).id + '"]');
  ok(await m1Ack.count() === 1, '내 업무 카드 할 일에도 [확인]');
  await ackBtn.click();
  await page.waitForFunction(id => !document.querySelector('#m' + id + ' [data-ack]'), mA.id);
  const sc = calls.filter(c => c[0] === 'seen').pop();
  ok(sc && sc[1].p_id === TASKS.find(x => x.message_id === mA.id).id, 'msg_task_seen 호출');
  const tkTxt = await page.locator('#m' + mA.id + ' .tks').textContent();
  ok(tkTxt.includes('확인 '), '표시가 \'확인 hh:mm\'로 (' + tkTxt + ')');
  await m1Ack.click();
  await page.waitForFunction(id => !document.querySelector('.pc [data-ack="' + id + '"]'), TASKS.find(x => x.message_id === m1.id).id);
  ok((await page.locator('.pc[data-person="' + ME + '"]').textContent()).includes('확인함'), '카드에서 확인 → \'확인함\'');
  // @모두
  await page.click('#inp'); await page.keyboard.type('@모');
  await page.waitForSelector('#mention.on');
  ok((await page.locator('#mention button').first().textContent()).startsWith('모두'), '@ 목록 맨 위에 \'모두\'');
  await page.keyboard.press('Enter'); await page.keyboard.type('내일 시험지 배부합니다'); await page.click('#send');
  await page.waitForFunction(() => document.querySelector('#inp').value === '');
  const as = calls.filter(c => c[0] === 'send').pop();
  ok(as[1].p_body === '@모두 내일 시험지 배부합니다' && as[1].p_mentions.length === MEMBERS.length - 1 && !as[1].p_mentions.includes(ME), '@모두 → 나 빼고 모두 (' + as[1].p_mentions.length + '명)');
  const allId = MSGS[MSGS.length - 1].id;
  ok(await page.locator('#m' + allId + ' .bb .at').textContent() === '@모두', '@모두 강조');
  ok(await page.locator('#m' + allId + ' .tk').count() === 3, '3명이면 사람마다 표시');
  // 6명 넘는 @모두 — 접어서 '확인 n / m'
  const many = addMsg(BOSS, '@모두 회의합니다', [], ts());
  const extra = ['55555555-5555-5555-5555-55555555555', '66666666-6666-6666-6666-66666666666'];
  [ME, EUNJI, '44444444-4444-4444-4444-444444444444'].concat([1,2,3].map(i => 'x' + i)).forEach((id, i) => { NAME[id] = NAME[id] || ('선생' + i); const k = addTask(many, id, '회의합니다'); k.ack_only = true; if (i === 1){ k.status = '완료'; k.seen_at = ts(); k.done_at = ts(); } });
  await page.waitForSelector('#m' + many.id + ' .tk.sum', { timeout: 7000 });
  ok((await page.locator('#m' + many.id + ' .tk.sum').textContent()).includes('모두 · 확인 1 / 6'), '여러 명은 \'모두 · 확인 1 / 6\' 한 줄');
  await page.click('#m' + many.id + ' .tk.sum');
  ok(await page.locator('#m' + many.id + ' .tk').count() === 7, '누르면 사람마다 펼침');
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'ack.png') });
  await page.click('#m' + many.id + ' [data-ack]');
  await page.waitForFunction(id => (document.querySelector('#m' + id + ' .tk.sum') || {}).textContent.includes('확인 2 / 6'), many.id);
  ok(TASKS.filter(k => k.message_id === many.id && k.assignee === ME)[0].status === '완료', '@모두는 확인하면 완료');
  await ctx.close();

  console.log('⑲ 찾기 · 꼬리표로 모아 보기');
  addMsg(BOSS, '[결석] 중3 이하늘 병결', [], ts()); addMsg(EUNJI, '[지각] 고1 박하늘 10분 지각', [], ts()); addMsg(BOSS, '하늘반 시간표 바뀜', [], ts());
  ({ ctx, page } = await open());
  await page.waitForSelector('#m' + m3.id);
  ok(await page.locator('#find').isHidden(), '처음엔 찾기 줄 숨김');
  await page.click('#findBtn');
  ok(await page.locator('#find').isVisible() && await page.evaluate(() => document.activeElement.id === 'fq'), '돋보기 → 찾기 줄·입력칸에 초점');
  await page.fill('#fq', '하늘');
  await page.waitForSelector('#results .ritem');
  ok(await page.locator('#msgs').isHidden(), '결과를 보는 동안 대화는 숨김');
  ok(await page.locator('#results .ritem').count() === 4 && (await page.locator('#results .ritem mark').first().textContent()) === '하늘', '\'하늘\' 4개 · 글자 강조');
  await page.click('#ftags [data-ftag="결석"]');
  await page.waitForFunction(() => document.querySelectorAll('#results .ritem').length === 2);
  ok((await page.locator('#results .rsum').textContent()).includes('[결석]'), '꼬리표 + 검색어 함께 (결석·하늘 → 2개)');
  await page.fill('#fq', '');
  await page.waitForFunction(() => /\[결석\] —/.test(document.querySelector('#results .rsum').textContent));
  const absN = MSGS.filter(m => !m.deleted_at && /^\[결석\]/.test(m.body)).length;
  ok(await page.locator('#results .ritem').count() === absN && await page.locator('#results .ritem span.tg.c2').count() === absN, '[결석]만 모아 보기 (' + absN + '개)');
  const hit = MSGS.filter(m => /^\[결석\] 중3 이하늘/.test(m.body))[0];
  await page.click('#results [data-hit="' + hit.id + '"]');
  await page.waitForFunction(id => document.querySelector('#m' + id + '.flash'), hit.id);
  ok(await page.locator('#find').isHidden() && await page.locator('#msgs').isVisible(), '결과를 누르면 찾기를 닫고 그 메시지로');
  await page.click('#findBtn'); await page.fill('#fq', '없는말없는말');
  await page.waitForFunction(() => (document.querySelector('#results .rsum') || {}).textContent && document.querySelector('#results .rsum').textContent.includes('없습니다'));
  ok(true, '없으면 \'찾은 메시지가 없습니다\'');
  await page.keyboard.press('Escape');
  ok(await page.locator('#find').isHidden() && await page.locator('#msgs').isVisible(), 'Esc로 닫으면 대화로');

  console.log('⑳ 답장');
  await page.locator('#m' + hit.id).hover();
  await page.click('#m' + hit.id + ' [data-reply]');
  ok(await page.locator('#rbar').isVisible() && (await page.locator('#rtext').textContent()).includes('이수경에게 답장') && (await page.locator('#rtext').textContent()).includes('결석중3 이하늘') && await page.locator('#rtext span.tg.c2').count() === 1, '[답장] → 입력칸 위 \'이수경에게 답장 · 원문\'');
  await page.keyboard.type('보충 일정 잡았습니다'); await page.click('#send');
  await page.waitForFunction(() => document.querySelector('#inp').value === '');
  const rsd = calls.filter(c => c[0] === 'send').pop();
  ok(rsd[1].p_reply === hit.id, 'msg_send p_reply = 원글');
  ok(await page.locator('#rbar').isHidden(), '보내면 답장 줄 사라짐');
  const rid = MSGS[MSGS.length - 1].id;
  ok((await page.locator('#m' + rid + ' .quote').textContent()).includes('이수경') && (await page.locator('#m' + rid + ' .quote').textContent()).includes('중3 이하늘'), '답장 위에 원글 인용');
  await page.click('#m' + rid + ' .quote');
  await page.waitForFunction(id => document.querySelector('#m' + id + '.flash'), hit.id);
  ok(true, '인용을 누르면 원글로');
  await page.locator('#m' + m3.id).hover(); await page.click('#m' + m3.id + ' [data-reply]'); await page.click('#rcancel');
  ok(await page.locator('#rbar').isHidden(), '[취소]로 답장 그만두기');
  const sends = calls.filter(c => c[0] === 'send').length;
  await page.click('#inp'); await page.keyboard.type('그냥 글'); await page.click('#send');
  await page.waitForFunction(n => true, sends); await sleep(300);
  ok(!('p_reply' in calls.filter(c => c[0] === 'send').pop()[1]), '답장이 아니면 p_reply 안 보냄(0006 전 DB와 호환)');
  // 불러오지 않은 원글
  const far = MSGS[0];
  const rep2 = addMsg(BOSS, '예전 글에 답합니다', [], ts()); rep2.reply_to = far.id;
  await page.waitForSelector('#m' + rep2.id + ' .quote', { timeout: 7000 });
  await page.waitForFunction(id => !document.querySelector('#m' + id + ' .quote').textContent.includes('이전 메시지'), rep2.id, { timeout: 5000 }).catch(() => {});
  ok((await page.locator('#m' + rep2.id + ' .quote').textContent()).includes(far.author_name), '원글이 화면에 없어도 받아 와 인용 (' + (await page.locator('#m' + rep2.id + ' .quote').textContent()) + ')');
  far.body = ''; far.deleted_at = ts(); far.updated_at = ts();   // 다른 창에서 원글을 지움
  await page.waitForFunction(id => document.querySelector('#m' + id + ' .quote').textContent.includes('삭제된 메시지'), rep2.id, { timeout: 7000 }).catch(() => {});
  ok((await page.locator('#m' + rep2.id + ' .quote').textContent()).includes('삭제된 메시지'), '화면 밖 원글을 지우면 인용도 \'삭제된 메시지\'로');
  if (process.env.SHOT){ await page.screenshot({ path: path.join(process.env.SHOT, 'reply.png') }); await page.click('#findBtn'); await page.click('#ftags [data-ftag="결석"]'); await page.waitForSelector('#results .ritem'); await page.screenshot({ path: path.join(process.env.SHOT, 'find.png') });
    const pg = await ctx.newPage(); await pg.setViewportSize({ width: 390, height: 844 }); await pg.goto('http://127.0.0.1:' + PORT + '/messenger.html'); await pg.waitForSelector('#msgs .m'); await pg.click('#findBtn'); await pg.fill('#fq', '하늘'); await pg.waitForSelector('#results .ritem'); await pg.screenshot({ path: path.join(process.env.SHOT, 'find-phone.png') }); await pg.close(); }
  await ctx.close();

  console.log('⑳-2 답장 열이 없는 DB(0006 전)');
  const keep = MSGS.map(m => { const r = m.reply_to; delete m.reply_to; return r; });
  ({ ctx, page } = await open());
  await page.waitForSelector('#m' + m3.id);
  ok(await page.locator('[data-reply]').count() === 0, '답장 버튼을 숨김');
  await ctx.close();
  MSGS.forEach((m, i) => { m.reply_to = keep[i]; });

  console.log('⑯ 출근·퇴근');
  PRESENCE[BOSS] = { user_id: BOSS, name: '이수경', loc: '본원', is_on: true, changed_at: ago(0.05) };   // 방금 센터만 바꿈
  PLOGS.push({ id: 900, user_id: BOSS, is_on: true, at: ago(Math.min(1, (Date.now() - Date.parse(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00+09:00')) / 3600e3 / 2)) }, { id: 901, user_id: BOSS, is_on: true, at: ago(0.05) });
  PRESENCE[EUNJI] = { user_id: EUNJI, name: '이은지', loc: '화정센터', is_on: true, changed_at: ago(30) };   // 어제 출근 — 오늘은 OFF
  ({ ctx, page } = await open());
  await page.waitForSelector('#m' + m3.id);
  await page.waitForFunction(() => !document.querySelector('#presBtn').hidden);
  ok((await page.locator('#presBtn').textContent()) === '출근하기', '처음엔 [출근하기]');
  const pres0 = await page.locator('#pres').textContent();
  ok(pres0.includes('본원') && pres0.includes('이수경') && !pres0.includes('화정센터'), '업무 카드 위에 센터별 출근자 (어제 출근은 OFF)');
  ok(pres0.includes('OFF3명'), 'OFF 인원 (' + pres0 + ')');
  ok(await page.locator('.pc[data-person="' + EUNJI + '"] .pst').textContent() === 'OFF', '카드에 OFF 표시');
  await page.click('#presBtn');
  ok(await page.locator('#presMenu').isVisible() && await page.locator('#presMenu [data-out]').isHidden(), '센터 고르기 창 (출근 전엔 퇴근 없음)');
  await page.click('#presMenu [data-loc="화정센터"]');
  await page.waitForFunction(() => document.querySelector('#presBtn').textContent === '화정센터 출근');
  const pc = calls.filter(c => c[0] === 'pres').pop();
  ok(pc && pc[1].p_loc === '화정센터' && pc[1].p_on === true, 'msg_presence_set(화정센터, 출근)');
  if (process.env.SHOT){ await page.screenshot({ path: path.join(process.env.SHOT, 'pres.png') }); await page.click('#presBtn'); await page.screenshot({ path: path.join(process.env.SHOT, 'pres-menu.png') }); await page.click('#presBtn');
    const pg = await ctx.newPage(); await pg.setViewportSize({ width: 390, height: 844 }); await pg.goto('http://127.0.0.1:' + PORT + '/messenger.html'); await pg.waitForSelector('#presBtn:not([hidden])'); await pg.screenshot({ path: path.join(process.env.SHOT, 'pres-phone.png') }); await pg.click('#tabBoard'); await pg.screenshot({ path: path.join(process.env.SHOT, 'pres-phone-board.png') }); await pg.close(); }
  ok((await page.locator('#pres').textContent()).includes('화정센터고희주'), '센터 줄에 내 이름');
  ok(await page.locator('.pc[data-person="' + ME + '"] .pst.on').textContent() === '화정센터 ON', '내 카드에 화정센터 ON');
  await page.click('#presBtn');
  await page.click('#presMenu [data-out]');
  await page.waitForFunction(() => document.querySelector('#presBtn').textContent === '출근하기');
  ok(calls.filter(c => c[0] === 'pres').pop()[1].p_on === false, '퇴근 → msg_presence_set(퇴근)');
  PRESENCE[EUNJI] = { user_id: EUNJI, name: '이은지', loc: '정리정독', is_on: true, changed_at: NOWISO() };
  await page.waitForFunction(() => document.querySelector('#pres').textContent.includes('정리정독'), null, { timeout: 7000 }).catch(() => {});
  ok((await page.locator('#pres').textContent()).includes('정리정독이은지'), '다른 사람 출근이 3초 안팎에 보임');
  // 자정을 넘기면(서버 줄은 그대로) 어제 출근이 OFF로 바뀐다
  await page.evaluate(() => { const D = Date, off = 86400e3; window.Date = class extends D { constructor(...a){ super(...(a.length ? a : [D.now() + off])); } static now(){ return D.now() + off; } }; });
  await page.waitForFunction(() => !document.querySelector('#pres').textContent.includes('정리정독'), null, { timeout: 7000 }).catch(() => {});
  ok(!(await page.locator('#pres').textContent()).includes('정리정독'), '자정이 지나면 열어 둔 화면도 OFF로 바뀜');
  await page.evaluate(() => { window.Date = Object.getPrototypeOf(window.Date); });
  await page.waitForFunction(() => document.querySelector('#pres').textContent.includes('정리정독'), null, { timeout: 7000 }).catch(() => {});
  await page.click('#inp'); await page.keyboard.type('@이은');
  await page.waitForSelector('#mention.on');
  ok((await page.locator('#mention').textContent()).includes('정리정독 ON'), '@ 목록에 출근 상태');
  await page.keyboard.press('Escape'); await page.fill('#inp', '');
  // 출근 현황 목록
  ok((await page.locator('#presListBtn').textContent()) === '출근 2명', '머리에 \'출근 2명\' 버튼 (' + (await page.locator('#presListBtn').textContent()) + ')');
  await page.click('#presListBtn');
  await page.waitForSelector('#plback:not([hidden])');
  const pl = await page.locator('#plbody').textContent();
  ok(/본원.*1명.*이수경.*출근/.test(pl) && /정리정독.*1명.*이은지.*출근/.test(pl), '센터별 출근자와 출근 시각');
  const bossFirst = PLOGS.find(x => x.id === 900).at;
  const hmK = iso => { const d = new Date(Date.parse(iso) + 9 * 3600e3), h = d.getUTCHours(), m = d.getUTCMinutes(); return (h < 12 ? '오전 ' : '오후 ') + ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m; };
  await page.waitForFunction(t => document.querySelector('#plbody').textContent.includes(t), '출근 ' + hmK(bossFirst), { timeout: 5000 }).catch(() => {});
  ok((await page.locator('#plbody').textContent()).includes('출근 ' + hmK(bossFirst)), '센터만 바꿔도 처음 출근 시각 (' + hmK(bossFirst) + ')');
  ok(/오늘 퇴근.*1명.*고희주.*화정센터 · 퇴근/.test(pl), '오늘 퇴근한 사람은 퇴근 시각과 함께');
  ok(/오늘 출근 기록 없음.*1명.*김지원/.test(pl), '오늘 기록 없는 사람');
  ok((await page.locator('#pltitle').textContent()).includes('2명'), '제목에 출근 인원');
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'pres-list.png') });
  // 휴대폰에서도 내 줄이 보여야 한다(예전엔 '.me' 클래스라 휴대폰에서 숨겨졌다)
  await page.click('#plclose');
  await page.click('#presBtn'); await page.click('#presMenu [data-loc="본원"]');
  await page.waitForFunction(() => document.querySelector('#presBtn').textContent === '본원 출근');
  await page.setViewportSize({ width: 390, height: 844 });
  if ((await page.locator('#plback').isHidden())) await page.click('#presListBtn');
  await page.waitForFunction(() => [...document.querySelectorAll('#plbody .plrow')].some(r => r.textContent.includes('고희주') && r.offsetHeight > 0), null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => [...document.querySelectorAll('#plbody .plrow')].some(r => r.textContent.includes('고희주') && r.offsetHeight > 0)), '휴대폰에서도 내 출근 줄이 보임');
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.click('#plclose');
  await page.click('#presBtn'); await page.click('#presMenu [data-loc="화정센터"]');
  await page.waitForFunction(() => document.querySelector('#presBtn').textContent === '화정센터 출근');
  if ((await page.locator('#plback').isHidden())) await page.click('#presListBtn');
  await page.keyboard.press('Escape');
  ok(await page.locator('#plback').isHidden(), 'Esc로 닫힘');
  await page.click('#pres');
  ok(await page.locator('#plback').isVisible(), '업무 카드 위 출근 줄을 눌러도 열림');
  await page.click('#plclose');
  await ctx.close();
  noPres = true;
  ({ ctx, page } = await open());
  await page.waitForSelector('#m' + m3.id); await sleep(500);
  ok(await page.locator('#presBtn').isHidden() && await page.locator('#pres').isHidden() && await page.locator('#presListBtn').isHidden(), '표가 없으면(마이그레이션 전) 출근 기능만 숨김');
  await ctx.close();
  noPres = false;

  console.log('㉑ 할 일 취소 + 사유 (2026-10-20 원장님)');
  ({ ctx, page } = await open());
  await page.waitForSelector('#m' + m3.id);
  const tq = TASKS.find(x => x.message_id === m1.id);   // 이수경 → 나
  const myCard = page.locator('.pc[data-person="' + ME + '"]');
  ok(await myCard.locator('[data-cx="' + tq.id + '"]').count() === 1, '내가 맡은 할 일에 [취소]');
  const jwTask = TASKS.find(x => x.message_id === m4.id);
  ok(await page.locator('[data-cx="' + jwTask.id + '"]').count() === 0, '남끼리의 할 일엔 [취소] 없음');
  const allMine = TASKS.find(x => x.ack_only && x.assignee === ME && x.requester !== ME);
  if (allMine) ok(await page.locator('[data-cx="' + allMine.id + '"]').count() === 0, '@모두로 받은 할 일은 스스로 취소 못 함');
  await myCard.locator('[data-cx="' + tq.id + '"]').click();
  ok(await page.locator('#cxback').isVisible() && (await page.locator('#cxtask').textContent()).includes('허은재'), '취소 창에 그 할 일');
  await page.click('#cxok');
  ok(!calls.some(c => c[0] === 'cancel') && await page.locator('#cxback').isVisible(), '사유 없이는 보내지 않음');
  await page.locator('#cxq button', { hasText: '상황이 바뀌어' }).click();
  ok((await page.inputValue('#cxin')) === '상황이 바뀌어 필요 없음', '빠른 사유 고르기');
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'cancel-dialog.png') });
  await page.fill('#cxin', '퇴원 철회 — 처리할 것 없음');
  await page.click('#cxok');
  await page.waitForFunction(() => document.querySelector('#cxback').hidden);
  const cc = calls.filter(c => c[0] === 'cancel').pop();
  ok(cc && cc[1].p_id === tq.id && cc[1].p_reason === '퇴원 철회 — 처리할 것 없음', 'msg_task_cancel(id, 사유)');
  const xr = myCard.locator('.ci.x');
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'cancel.png') });
  ok(await xr.count() === 1 && (await xr.textContent()).includes('사유: 퇴원 철회'), '카드에 취소 줄과 사유');
  ok((await page.locator('#m' + m1.id + ' .tk.cx').textContent()).includes('취소'), '메시지 아래 표시도 취소');
  await xr.locator('[data-uncx]').click();
  await page.waitForFunction(id => !document.querySelector('.ci.x') && document.querySelector('[data-cx="' + id + '"]'), tq.id);
  ok(calls.filter(c => c[0] === 'cancel').pop()[1].p_undo === true, '[되돌리기] → 다시 할 일');
  await ctx.close();

  console.log('⑫ 출근 전 카드는 흐리게 · 오늘 수업 기록 줄 (2026-10-20 원장님)');
  const kd = new Date(Date.now() + 9 * 3600e3), today = kd.toISOString().slice(0, 10), dn = '일월화수목금토'[kd.getUTCDay()];
  const wedOf = y => { const d = new Date(y + 'T00:00:00Z'), k = d.getUTCDay(); d.setUTCDate(d.getUTCDate() + (k === 1 || k === 2 ? 3 - k : -((k - 3 + 7) % 7))); return d.toISOString().slice(0, 10); };   // 월·화는 다가오는 수요일 주차
  const wid = 'w' + today.slice(2).replace(/-/g, '');
  TTP.push({ week_wednesday: wedOf(today), book: '내신', overrides: { '중2': '정규' } });
  TT.push(
    { book: '내신', class_id: 'n001', name: '고2 화정A', day: dn, start_time: '5:30', end_time: '7:00', teacher: '은지', roster: '가 나' },
    { book: '내신', class_id: 'n002', name: '고2 확인', day: dn, start_time: '오전9:30', end_time: '11:00', teacher: '은지', roster: '다' },
    { book: '정규', class_id: 'r001', name: '고2 가', day: dn, start_time: '2:00', end_time: '3:30', teacher: '은지', roster: '라' },        // 내신 주라 정규 반은 없음
    { book: '정규', class_id: 'r002', name: '정리정독 중2', day: dn, start_time: '8:00', end_time: '9:30', teacher: '은지', roster: '마' }, // 학년 예외(중2 정규)라 있음
    { book: '내신', class_id: 'n003', name: '중2 진도', day: dn, start_time: '4:00', end_time: '5:00', teacher: '은지', roster: '바' },     // 학년 예외라 없음
    { book: '내신', class_id: 'n004', name: '고1 휴강반', day: dn, start_time: '3:00', end_time: '4:00', teacher: '은지', roster: '사' },
    { book: '내신', class_id: 'n005', name: '고1 빈반', day: dn, start_time: '3:00', end_time: '4:00', teacher: '은지', roster: '' },
    { book: '내신', class_id: wid + 'a', name: '고1 직보', day: dn, start_time: '1:00', end_time: '3:00', teacher: '지원', roster: '' },
    { book: '내신', class_id: 'n006', name: '고3파이널A', day: dn, start_time: '7:00', end_time: '9:00', teacher: '슈', roster: '아' },
    { book: '내신', class_id: 'n007', name: '고1 모르는T', day: dn, start_time: '7:00', end_time: '9:00', teacher: '현지', roster: '자' });
  TTLOG.push({ kind: '주간반휴강', from_class_id: 'n004', apply_date: today });
  NOTES.push({ book: '내신', class_id: 'n002', ymd: today, report_status: '요청', requested_at: ago(0.5), updated_at: ago(0.5) },
             { book: '내신', class_id: 'n001', ymd: today, report_status: '', requested_at: null, updated_at: ago(0.2) });
  PRESENCE[EUNJI] = { user_id: EUNJI, name: '이은지', loc: '본원', is_on: true, changed_at: NOWISO() };
  delete PRESENCE[ME]; delete PRESENCE[BOSS];
  ({ ctx, page } = await open());
  await page.waitForSelector('.pc[data-person="' + EUNJI + '"] .ls');
  const ec = page.locator('.pc[data-person="' + EUNJI + '"]');
  const ls = await ec.locator('.ls').allTextContents();
  ok(ls.length === 3, '이은지 오늘 수업 3개 (' + ls.length + ')');
  ok(/9:30.*고2 확인/.test(ls[0]) && /5:30.*고2 화정A/.test(ls[1]) && /8:00.*정리정독 중2/.test(ls[2]), '시작 시각 순 · 정규 반 없음 · 학년 예외 반 포함 · 휴강·빈 반 없음');
  ok(await ec.locator('.ls').nth(0).locator('.bx.on').count() === 1 && ls[0].includes('기록 완료'), '[리포트 생성]한 수업은 자동 체크');
  ok(ls[1].includes('리포트 생성 전') && await ec.locator('.ls').nth(1).locator('.bx.on').count() === 0, '저장만 한 수업은 체크 안 됨');
  ok(ls[2].includes('아직 기록 전'), '기록 없는 수업');
  ok((await ec.locator('.ls a').nth(1).getAttribute('href')).endsWith('timetable.html?cr=' + encodeURIComponent('내신|n001|' + today)), '누르면 그 수업 기록 창 주소');
  const pcnt = await ec.locator('.pcnt').textContent(), want = (await ec.locator('.ci.d').count()) + ' / ' + (await ec.locator('.ci').count());
  ok(pcnt.startsWith(want), '수업 기록도 진행률에 (' + pcnt + ')');
  ok((await page.locator('.pc[data-person="44444444-4444-4444-4444-444444444444"]').textContent()).includes('고1 직보'), '오늘 \'이 주만\' 반은 그 담당T 카드에');
  ok((await page.locator('.pc[data-person="' + BOSS + '"]').textContent()).includes('고3파이널A'), '담당T \'슈\'는 이수경');
  ok(!(await page.locator('#cards').textContent()).includes('모르는T'), '못 가린 담당T 수업은 붙이지 않음');
  ok(!(await ec.evaluate(e => e.classList.contains('offd'))), '출근한 사람 카드는 그대로');
  const jw = page.locator('.pc[data-person="44444444-4444-4444-4444-444444444444"]');
  ok(await jw.evaluate(e => e.classList.contains('offd')) && (await jw.textContent()).includes('피드백 확인'), '출근 전 카드는 흐리게, 내용은 보임');
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'lessons.png') });
  const order = await page.locator('.pc .pn').allTextContents();
  ok(order[0] === '고희주' && order[1] === '이은지', '나 → 출근한 사람 먼저 (' + order.join(',') + ')');
  NOTES[1].report_status = '요청'; NOTES[1].requested_at = NOWISO();
  await page.evaluate(() => { const D = Date, off = 61000; window.Date = class extends D { constructor(...a){ super(...(a.length ? a : [D.now() + off])); } static now(){ return D.now() + off; } }; });   // 1분이 지난 것처럼
  await page.waitForFunction(id => document.querySelectorAll('.pc[data-person="' + id + '"] .ls .bx.on').length === 2, EUNJI, { timeout: 8000 }).catch(() => {});
  ok(await ec.locator('.ls .bx.on').count() === 2, '리포트를 생성하면 1분 안에 자동 체크');
  await ctx.close();
  // 월·화는 다가오는 수요일 주차의 기간을 따른다 (Codex 검토)
  const ymdK = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
  let mon = Date.now(); while (new Date(mon + 9 * 3600e3).getUTCDay() !== 1) mon += 86400e3;
  const monY = ymdK(mon), nextWed = ymdK(mon + 2 * 86400e3), lastWed = ymdK(mon - 5 * 86400e3);
  TTP.push({ week_wednesday: nextWed, book: '내신', overrides: {} }, { week_wednesday: lastWed, book: '정규', overrides: {} });
  TT.push({ book: '내신', class_id: 'n101', name: '고1 월요진도', day: '월', start_time: '5:00', end_time: '6:30', teacher: '은지', roster: '가' },
          { book: '정규', class_id: 'r101', name: '고1 월요가', day: '월', start_time: '5:00', end_time: '6:30', teacher: '은지', roster: '가' });
  ({ ctx, page } = await open(null, { now: Date.parse(monY + 'T18:00:00+09:00') }));
  await page.waitForSelector('.pc[data-person="' + EUNJI + '"] .ls');
  const monTxt = await page.locator('.pc[data-person="' + EUNJI + '"]').textContent();
  ok(monTxt.includes('고1 월요진도') && !monTxt.includes('고1 월요가'), '월요일은 다가오는 수요일 주차(내신) 시간표');
  await ctx.close();
  // 시간표를 못 읽어도 3초마다 다시 부르지 않는다(1분 뒤에) (Codex 검토)
  failTT = true;
  ({ ctx, page } = await open());
  await page.waitForSelector('#m' + m3.id); await sleep(7500);
  const tries = calls.filter(c => c[0] === 'ttfail' && c[1] === '/rest/v1/tt_period').length;
  ok(tries === 1, '실패해도 1분 안에는 다시 안 부름 (' + tries + '번)');
  ok(await page.locator('.ls').count() === 0 && await page.locator('.pc').count() >= 4, '못 읽으면 수업 줄 없이 카드만 (' + await page.locator('.ls').count() + '·' + await page.locator('.pc').count() + ')');
  await ctx.close();
  failTT = false;

  await browser.close(); server.close();
  console.log(`\n${n - bad} / ${n} 통과`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
