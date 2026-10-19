/* 조교 근무 일지(worklog.html) 브라우저 E2E (2026-10-20)
 * 가짜 수파베이스로 실제 페이지를 띄워 — 시계는 2026-11-12(목) 15:00 한국 시간에 고정
 *   원장님: 월별 표(근무시간·시급·총 급여·실수령·확인할 기록)·펼치기(대신 근무·일찍 출근)·표 복사 ·
 *           주간 근무표(work_ensure 범위·본원 두 자리·상태 색)·근무자 교체(work_swap·슈톡 [이동] 글·푸시) ·
 *           설정(사람·시급 work_staff_set, 기본 근무표 자리 추가·work_roster_save)
 *   조교:   내 근무만·내 급여·설정 탭 없음·시각 고치기(work_fix, 이유 필수)
 *   표 없음 안내 · 휴대폰 폭 · 슈국 운영 카드
 * 를 검사한다. 원격에는 아무것도 보내지 않는다.
 *   실행: LC_ALL=C.UTF-8 NODE_PATH=$(npm root -g) node tools/worklog-e2e-test.js   (SHOT=폴더 → 화면 캡처)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8953;
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
const NOW = '2026-11-12T06:00:00Z';   // 한국 15:00 (목)
let n = 0, bad = 0;
function ok(cond, label){ n++; if (!cond){ bad++; console.error('  ✗', label); } else console.log('  ✓', label); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BOSS = '10000000-0000-0000-0000-000000000001', HEE = '20000000-0000-0000-0000-000000000002',
      SUM = '30000000-0000-0000-0000-000000000003', KIM = '40000000-0000-0000-0000-000000000004', EUN = '50000000-0000-0000-0000-000000000005';
const MEMBERS = [
  { user_id: BOSS, name: '이수경', role: 'admin' }, { user_id: HEE, name: '고희주', role: 'assistant' },
  { user_id: SUM, name: '조수민', role: 'assistant' }, { user_id: KIM, name: '김영훈', role: 'assistant' }, { user_id: EUN, name: '이은지', role: 'teacher' }];
const NAME = {}; MEMBERS.forEach(m => NAME[m.user_id] = m.name);
const STAFF = [{ user_id: HEE, wage: 12000, active: true }, { user_id: SUM, wage: 12000, active: true }, { user_id: KIM, wage: 13000, active: true }];
const K = (y, t) => new Date(y + 'T' + t + ':00+09:00').toISOString();
let sid = 0, rid = 0;
const SH = (ymd, loc, slot, user, s, e, extra) => Object.assign({ id: ++sid, ymd, loc, slot, user_id: user, start_hm: s, end_hm: e, note: '', orig_user_id: null, swap_reason: '', swapped_by_name: '', swapped_at: null }, extra || {});
const SHIFTS = [
  SH('2026-11-05', '본원', 1, KIM, '16:00', '22:00'), SH('2026-11-05', '본원', 2, HEE, '16:00', '22:00'),
  SH('2026-11-06', '본원', 2, HEE, '16:00', '22:00', { orig_user_id: SUM, swap_reason: '병원', swapped_by_name: '조수민', swapped_at: K('2026-11-04', '20:00') }),
  SH('2026-11-07', '민초센터', 1, SUM, '10:30', '20:00'),
  SH('2026-11-12', '본원', 1, KIM, '16:00', '22:00'), SH('2026-11-12', '본원', 2, HEE, '16:00', '22:00'),
  SH('2026-11-13', '본원', 2, SUM, '16:00', '22:00'), SH('2026-11-14', '민초센터', 1, SUM, '10:30', '20:00')];
const RC = (ymd, user, loc, inn, start, out) => ({ id: ++rid, ymd, user_id: user, name: NAME[user], loc, in_at: K(ymd, inn), start_at: K(ymd, start), out_at: out ? K(ymd, out) : null, fixed: false, fix_reason: '', fixed_by_name: '', fixed_at: null });
const RECS = [
  RC('2026-11-05', KIM, '본원', '15:40', '16:00', '22:00'), RC('2026-11-05', HEE, '본원', '16:05', '16:05', '22:00'),
  RC('2026-11-06', HEE, '본원', '16:00', '16:00', '22:00'), RC('2026-11-08', SUM, '화정센터', '10:30', '10:30', null)];
const ROSTER = [{ id: 1, dow: 4, loc: '본원', slot: 1, user_id: KIM, start_hm: '16:00', end_hm: '22:00', note: '' }, { id: 2, dow: 4, loc: '본원', slot: 2, user_id: HEE, start_hm: '16:00', end_hm: '22:00', note: '' }];
const calls = [];
let missing = false;

function filt(rows, u){
  let out = rows.slice();
  u.searchParams.forEach((v, k) => {
    if (['select', 'order', 'limit'].includes(k)) return;
    const m = v.match(/^(eq|gte|lte)\.(.*)$/); if (!m) return;
    if (m[1] === 'eq') out = out.filter(r => String(r[k]) === m[2]);
    if (m[1] === 'gte') out = out.filter(r => String(r[k]) >= m[2]);
    if (m[1] === 'lte') out = out.filter(r => String(r[k]) <= m[2]);
  });
  return out;
}

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript' }); res.end(fs.readFileSync(f));
  }).listen(PORT);
  const browser = await chromium.launch();

  async function open(who, viewport, hash){
    const ctx = await browser.newContext({ viewport: viewport || { width: 1400, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:' + PORT });
    await ctx.clock.setFixedTime(new Date(NOW));
    await ctx.addInitScript(id => localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id } })), who);
    ctx.setDefaultTimeout(8000);
    ctx.on('dialog', d => d.accept());
    const viewer = who === BOSS;
    await ctx.route('**/*', async route => {
      const req = route.request(), url = req.url();
      const json = (o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: o === null ? '' : JSON.stringify(o) });
      if (req.method() === 'OPTIONS') return json(null, 204);
      if (url.includes('fonts.g')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (!url.startsWith(SB)) return route.continue();
      const u = new URL(url), p = u.pathname, body = req.postData() ? JSON.parse(req.postData()) : null;
      if (p === '/rest/v1/teacher_accounts'){ const m = MEMBERS.find(x => x.user_id === who); return json([{ user_id: who, login_id: 'x', display_name: m.name, active: true, role: m.role }]); }
      if (missing && /work_/.test(p)) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
      if (p === '/rest/v1/rpc/msg_members') return json(MEMBERS);
      if (p === '/rest/v1/rpc/work_me') return json({ viewer, staff: STAFF.some(s => s.user_id === who && s.active), today: '2026-11-12' });
      if (p === '/rest/v1/rpc/work_staff_list') return json(STAFF.map(s => ({ user_id: s.user_id, name: NAME[s.user_id], role: 'assistant', active: s.active })));
      if (p === '/rest/v1/work_staff') return json(viewer ? STAFF : STAFF.filter(s => s.user_id === who));
      if (p === '/rest/v1/work_records') return json(filt(RECS, u));
      if (p === '/rest/v1/work_shifts') return json(filt(SHIFTS, u));
      if (p === '/rest/v1/work_roster') return json(ROSTER);
      if (p.startsWith('/rest/v1/rpc/')){
        const fn = p.slice(13); calls.push([fn, body]);
        if (fn === 'work_ensure') return json(null, 204);
        if (fn === 'work_swap'){ const s = SHIFTS.find(x => x.id === body.p_id); s.orig_user_id = s.orig_user_id || s.user_id; s.user_id = body.p_user; s.swap_reason = body.p_reason; s.swapped_by_name = '이수경'; s.swapped_at = NOW; return json(s); }
        if (fn === 'msg_send') return json({ message: { id: 77 }, tasks: [] });
        if (fn === 'work_fix') return json({ id: body.p_id, fixed: true });
        if (fn === 'work_staff_set'){ const s = STAFF.find(x => x.user_id === body.p_user); if (s){ s.wage = body.p_wage; s.active = body.p_active; } else STAFF.push({ user_id: body.p_user, wage: body.p_wage, active: body.p_active }); return json(null, 204); }
        if (fn === 'work_roster_save') return json(body.p_rows.length);
        return json({ message: 'unknown ' + fn }, 404);
      }
      if (p === '/functions/v1/msg-push'){ calls.push(['push', body]); return json({ sent: 1 }); }
      return json({ message: 'no route ' + p }, 404);
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.error('  [page error]', e.message));
    await page.goto('http://127.0.0.1:' + PORT + '/worklog.html' + (hash || ''));
    return { ctx, page };
  }
  const shot = async (page, name) => { if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, name + '.png'), fullPage: true }); };

  console.log('· 원장님 — 월별 근무');
  let { ctx, page } = await open(BOSS);
  await page.waitForSelector('#mBody table');
  ok((await page.locator('#mLabel').textContent()) === '2026년 11월', '이번 달(11월)이 열림');
  ok(!(await page.locator('.tab[data-tab="set"]').isHidden()), '원장님에게는 [사람·근무표 설정] 탭');
  const rows = await page.$$eval('tr.person', trs => trs.map(t => [...t.querySelectorAll('td')].map(td => td.textContent.trim())));
  const kim = rows.find(r => r[0].startsWith('김영훈')), hee = rows.find(r => r[0].startsWith('고희주')), sum = rows.find(r => r[0].startsWith('조수민'));
  ok(kim && kim[2] === '6시간' && kim[3] === '13,000' && kim[4] === '78,000' && kim[5] === '75,426', '김영훈: 15:40 출근이라도 16:00부터 6시간 · 78,000 · 실수령 75,426 (' + (kim || []).join('|') + ')');
  ok(hee && hee[1] === '2일' && hee[2] === '11시간 55분' && hee[4] === '143,000' && hee[5] === '138,281', '고희주: 2일 · 11시간 55분 · 143,000 · 138,281');
  ok(sum && sum[6] === '확인 2건', '조수민: 출근 기록 없음 + 퇴근 기록 없음 = 확인 2건');
  ok((await page.locator('tr.sum').textContent()).includes('221,000'), '합계 총 급여 221,000');
  const tiles = await page.locator('#mTiles').textContent();
  ok(tiles.includes('확인이 필요한 기록2건') && tiles.includes('221,000'), '위 칸: 총 급여·확인할 기록 (' + tiles + ')');
  await page.click('tr.person:has-text("김영훈")');
  ok((await page.locator('tr.detail').first().textContent()).includes('출근 15:40 → 16:00부터'), '펼치면 일찍 출근한 날 \'16:00부터\' 표시');
  await page.click('tr.person:has-text("고희주")');
  ok((await page.locator('#mBody').textContent()).includes('조수민 대신 근무'), '대신 근무한 날 표시');
  await page.click('tr.person:has-text("조수민")');
  const sd = await page.locator('#mBody').textContent();
  ok(sd.includes('출근 기록 없음') && sd.includes('퇴근 기록 없음'), '조수민: 출근 기록 없음·퇴근 기록 없음 줄');
  ok(await page.locator('[data-add]').count() === 1, '출근 기록 없는 날에 [기록 넣기]');
  await page.click('#mCopy');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip.split('\n')[0].split('\t').length === 7 && clip.includes('김영훈\t1\t6:00\t360\t13000\t78000\t75426'), '표 복사(탭 구분)');
  await shot(page, 'month-boss');

  console.log('· 원장님 — 주간 근무표·교체');
  await page.click('.tab[data-tab="week"]');
  await page.waitForSelector('.wk');
  const ens = calls.filter(c => c[0] === 'work_ensure').pop();
  ok(ens && ens[1].p_from === '2026-11-09' && ens[1].p_to === '2026-11-15', 'work_ensure(이번 주 월~일)');
  ok((await page.locator('#wLabel').textContent()) === '11/9 ~ 11/15', '주 표시 11/9 ~ 11/15');
  const thu = await page.$$eval('[data-shift]', bs => bs.map(b => b.textContent));
  ok(thu.filter(t => /김영훈|고희주/.test(t)).length === 2, '목요일 본원 두 자리(김영훈·고희주)');
  ok(await page.locator('.dh.today').count() === 1, '오늘 머리 강조');
  ok(await page.locator('.slot.mine').count() === 0, '원장님은 내 칸 없음');
  await page.click('[data-shift="' + SHIFTS[6].id + '"]');
  ok(await page.locator('#swapDlg').isVisible() && (await page.locator('#swCtx').textContent()) === '11/13 (금) · 본원', '교체 창 — 11/13 (금) · 본원');
  await page.selectOption('#swWho', KIM);
  await page.fill('#swWhy', '학교 행사');
  await page.click('#swSave');
  await page.waitForFunction(() => document.querySelector('#swapDlg').hidden);
  const sw = calls.filter(c => c[0] === 'work_swap').pop();
  ok(sw && sw[1].p_id === SHIFTS[6].id && sw[1].p_user === KIM && sw[1].p_reason === '학교 행사', 'work_swap(칸, 김영훈, 사유)');
  await sleep(300);
  const ms = calls.filter(c => c[0] === 'msg_send').pop();
  ok(ms && ms[1].p_body === '[이동] 11/13 (금) 본원 근무 교체: 조수민 → @김영훈 · 학교 행사' && ms[1].p_mentions[0] === KIM, '슈톡 [이동] 글 + 새 근무자 @부름 (' + (ms && ms[1].p_body) + ')');
  ok(calls.some(c => c[0] === 'push' && c[1].message_id === 77), '휴대폰 알림 보내기');
  await page.waitForFunction(() => document.querySelector('#wLog').textContent.includes('학교 행사'));
  ok((await page.locator('[data-shift="' + SHIFTS[6].id + '"]').getAttribute('class')).includes('swap') && (await page.locator('[data-shift="' + SHIFTS[6].id + '"]').textContent()).includes('조수민 대신'), '바뀐 칸은 노랑 + \'조수민 대신\'');
  await page.click('#wPrev');
  await page.waitForFunction(() => document.querySelector('#wLabel').textContent === '11/2 ~ 11/8');
  await page.waitForSelector('.slot.miss');
  ok((await page.locator('.slot.miss').first().textContent()).includes('출근 기록 없음'), '지난주: 출근 기록 없는 칸은 분홍');
  ok((await page.locator('.slot.ok').first().textContent()).includes('✓'), '출근·퇴근 확인 칸은 연녹 ✓');
  await shot(page, 'week-boss');

  console.log('· 원장님 — 설정');
  await page.click('.tab[data-tab="set"]');
  await page.waitForSelector('#sStaff table');
  ok(await page.locator('#sStaff tr[data-u]').count() === 5, '계정 다섯 명 모두 목록');
  const er = page.locator('#sStaff tr[data-u="' + EUN + '"]');
  await er.locator('.sOn').check(); await er.locator('.sWage').fill('15000'); await er.locator('[data-ssave]').click();
  await sleep(300);
  const ss = calls.filter(c => c[0] === 'work_staff_set').pop();
  ok(ss && ss[1].p_user === EUN && ss[1].p_wage === 15000 && ss[1].p_active === true, 'work_staff_set(이은지, 15000, 포함)');
  ok((await page.locator('#rFrom').inputValue()) === '2026-11-13', '적용 시작일 기본 = 내일');
  await page.click('[data-add-slot="3|본원"]');
  const box = page.locator('.rss').filter({ has: page.locator('select') }).last();
  await page.locator('.rss').nth(0).locator('select').selectOption(HEE);   // 정렬: 수요일 본원이 첫 칸
  await page.click('#rSave');
  await sleep(300);
  const rs = calls.filter(c => c[0] === 'work_roster_save').pop();
  ok(rs && rs[1].p_from === '2026-11-13' && rs[1].p_rows.some(r => r.dow === 3 && r.loc === '본원' && r.slot === 1 && r.user_id === HEE && r.start_hm === '16:00' && r.end_hm === '22:30'), '수요일 본원 자리 추가 → work_roster_save(수 16:00~22:30)');
  ok(rs && rs[1].p_rows.filter(r => r.dow === 4 && r.loc === '본원').length === 2, '목요일 본원 두 자리 유지');
  await shot(page, 'set-boss');
  await ctx.close();

  console.log('· 조교 — 내 근무');
  ({ ctx, page } = await open(HEE, { width: 390, height: 844 }));
  await page.waitForSelector('#mBody table');
  ok(await page.locator('.tab[data-tab="set"]').isHidden(), '조교에게는 설정 탭 없음');
  ok((await page.locator('#mTitle').textContent()) === '내 근무', '제목 \'내 근무\'');
  ok(await page.locator('tr.person').count() === 1, '내 줄만');
  const mt = await page.locator('#mTiles').textContent();
  ok(mt.includes('143,000') && mt.includes('138,281') && mt.includes('2일'), '내 급여·실수령 (' + mt + ')');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), '휴대폰 폭에서 가로 스크롤 없음');
  const rq = calls.filter(c => c[0] === 'work_records');
  await page.locator('[data-fix]').first().click();
  ok(await page.locator('#fixDlg').isVisible() && (await page.locator('#fxIn').inputValue()) === '16:05', '시각 고치기 창 — 지금 기록 16:05');
  ok(await page.locator('#fxDel').isHidden(), '조교에게는 [기록 지우기] 없음');
  await page.fill('#fxOut', '22:30'); await page.click('#fxSave');
  ok((await page.locator('#fxErr').textContent()).includes('이유'), '이유 없이 저장하면 안내');
  await page.fill('#fxWhy', '퇴근 버튼을 늦게 눌렀어요'); await page.click('#fxSave');
  await page.waitForFunction(() => document.querySelector('#fixDlg').hidden);
  const fx = calls.filter(c => c[0] === 'work_fix').pop();
  ok(fx && fx[1].p_in === '16:05' && fx[1].p_out === '22:30' && fx[1].p_reason === '퇴근 버튼을 늦게 눌렀어요' && fx[1].p_loc === '본원', 'work_fix(16:05 ~ 22:30, 이유)');
  await page.click('.tab[data-tab="week"]');
  await page.waitForSelector('.wl');
  ok(await page.locator('.wk').count() === 0 && await page.locator('.wl .wd').count() === 3, '휴대폰은 날짜별 목록(근무 있는 날만)');
  ok(await page.locator('.slot.mine').count() >= 1, '근무표에서 내 칸 강조');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), '근무표도 가로 스크롤 없음');
  await shot(page, 'week-phone');
  await ctx.close();

  console.log('· 표 없음 · 운영 카드');
  missing = true;
  ({ ctx, page } = await open(BOSS));
  await page.waitForSelector('#setupNote:not([hidden])');
  ok((await page.locator('#setupNote').textContent()).includes('202610200001'), '마이그레이션 전 안내');
  await page.goto('http://127.0.0.1:' + PORT + '/ops.html');
  await page.waitForSelector('a.card[href="worklog.html"]');
  ok((await page.locator('a.card[href="worklog.html"]').textContent()).includes('조교 근무 일지'), '슈국 운영에 [조교 근무 일지] 카드');
  await ctx.close();
  missing = false;

  await browser.close(); server.close();
  console.log(`\n${n - bad} / ${n} 통과`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
