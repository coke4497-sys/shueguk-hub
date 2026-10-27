/* 강사 관리(staff.html) · 슈국 운영 카드 · 화면 사용 시간 기록 브라우저 E2E (2026-10-19)
 * 가짜 수파베이스로 실제 페이지를 띄워
 *   보는 사람 제한(원장님·대표님) · 근무 시간·장소(센터 옮김·퇴근 없음·근무 중) · 수업 시간(그 주 기간·휴강·이 주만 반·'슈') ·
 *   업무 진행(상태별 수·사유·기록) · 티쳐스/슈톡 사용 시간 · 기간 바꾸기 · 마이그레이션 전 안내 · 운영 메뉴 카드 ·
 *   teacher-auth.js 사용 시간 기록(1분마다 usage_tick, 화면이 숨으면 안 셈)
 * 을 검사한다. 원격에는 아무것도 보내지 않는다.
 *   실행: NODE_PATH=$(npm root -g) node tools/staff-e2e-test.js   (SHOT=폴더 면 화면을 찍어 둔다)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8953;
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let n = 0, bad = 0;
function ok(cond, label){ n++; if (!cond){ bad++; console.error('  ✗', label); } else console.log('  ✓', label); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BOSS = '33333333-3333-3333-3333-333333333333', EUNJI = '22222222-2222-2222-2222-222222222222', HEEJU = '11111111-1111-1111-1111-111111111111', PARK = '99999999-9999-9999-9999-999999999999';
const ACC = {
  [BOSS]: { user_id: BOSS, login_id: 'admin', display_name: '이수경', role: 'admin', active: true },
  [EUNJI]: { user_id: EUNJI, login_id: 'eunji', display_name: '이은지', role: 'teacher', active: true },
  [HEEJU]: { user_id: HEEJU, login_id: 'heeju', display_name: '고희주', role: 'assistant', active: true },
  [PARK]: { user_id: PARK, login_id: 'parkeh', display_name: '박언호대표님', role: 'teacher', active: true },   // 2026-10-27 원장님 — 끝의 '대표님'은 teacherKey가 뗀다
};
const MEMBERS = Object.values(ACC).map(a => ({ user_id: a.user_id, name: a.display_name, role: a.role }));
const NOW = Date.parse('2026-10-21T20:00:00+09:00');   // 수요일 저녁
const K = (d, t) => new Date(Date.parse(d + 'T' + t + ':00+09:00')).toISOString();
const PLOGS = [
  { user_id: HEEJU, name: '고희주', loc: '화정센터', is_on: true, at: K('2026-10-21', '15:00') },
  { user_id: HEEJU, name: '고희주', loc: '본원', is_on: true, at: K('2026-10-21', '17:00') },
  { user_id: HEEJU, name: '고희주', loc: '본원', is_on: false, at: K('2026-10-21', '19:30') },
  { user_id: EUNJI, name: '이은지', loc: '본원', is_on: true, at: K('2026-10-20', '14:00') },   // 어제 퇴근 안 누름
  { user_id: EUNJI, name: '이은지', loc: '본원', is_on: true, at: K('2026-10-21', '16:00') },   // 오늘 근무 중
  { user_id: PARK, name: '박언호', loc: '화정센터', is_on: true, at: K('2026-10-20', '21:00') },   // 자정 넘어 퇴근(근무일 경계 새벽 5시)
  { user_id: PARK, name: '박언호', loc: '화정센터', is_on: false, at: K('2026-10-21', '00:40') },
];
const TT = [
  { book: '정규', class_id: 'r001', name: '고2 가', day: '수', start_time: '5:30', end_time: '7:00', teacher: '은지', roster: '가 나' },
  { book: '정규', class_id: 'r002', name: '고1 나', day: '수', start_time: '7:30', end_time: '9:00', teacher: '은지', roster: '다' },
  { book: '내신', class_id: 'n001', name: '고2 진도', day: '수', start_time: '5:30', end_time: '7:00', teacher: '은지', roster: '가' },
  { book: '정규', class_id: 'r003', name: '고3파이널A', day: '수', start_time: '3:00', end_time: '5:00', teacher: '슈', roster: '라' },
  { book: '정규', class_id: 'r107', name: '논술B 수학', day: '수', start_time: '8:30', end_time: '밤10:00', teacher: '언호', roster: '김선우' },   // '박언호대표님' ↔ '언호'
  { book: '정규', class_id: 'r004', name: '중2 가', day: '수', start_time: '3:00', end_time: '4:30', teacher: '은지', roster: '마' },   // 휴강
  { book: '정규', class_id: 'r005', name: '빈 반', day: '수', start_time: '3:00', end_time: '4:30', teacher: '은지', roster: '' },
  { book: '정규', class_id: 'w261021a', name: '고2 직보', day: '수', start_time: '오전9:30', end_time: '11:00', teacher: '은지', roster: '' },
  { book: '정규', class_id: 'w261022a', name: '다음날 직보', day: '목', start_time: '5:00', end_time: '6:00', teacher: '은지', roster: '' },
];
const TTP = [{ week_wednesday: '2026-10-21', book: '정규', overrides: {} }];
const TTLOG = [{ kind: '주간반휴강', from_class_id: 'r004', apply_date: '2026-10-21' }];
// 슈톡 할 일 — 대기·완료·취소(cancel_reason), 미룸 = 대기 + due_at, 넘김 = history(맡은 사람이 바뀜)
const TASKS = [
  { id: 1, message_id: 1, assignee: HEEJU, assignee_name: '고희주', requester: BOSS, requester_name: '이수경', text: '중3 김민준 결석 처리', status: '완료', done_at: K('2026-10-21', '16:10'), created_at: K('2026-10-21', '15:30'), history: [] },
  { id: 2, message_id: 2, assignee: HEEJU, assignee_name: '고희주', requester: EUNJI, requester_name: '이은지', text: '학부모님 상담 전화', status: '대기', done_at: null, due_at: K('2026-10-21', '19:00'), due_note: '학부모님 통화가 안 됨', created_at: K('2026-10-21', '15:40'),
    history: [{ kind: '미룸', until: K('2026-10-21', '19:00'), by: '고희주', at: K('2026-10-21', '17:10'), note: '학부모님 통화가 안 됨' }] },
  { id: 3, message_id: 3, assignee: EUNJI, assignee_name: '이은지', requester: BOSS, requester_name: '이수경', text: '교재 주문', status: '대기', done_at: null, created_at: K('2026-10-21', '15:50'),
    history: [{ kind: '넘김', from: '고희주', to: '이은지', by: '고희주', at: K('2026-10-21', '18:00'), note: '내일 쉬어요' }] },
  { id: 4, message_id: 4, assignee: HEEJU, assignee_name: '고희주', requester: BOSS, requester_name: '이수경', text: '시험지 복사', status: '취소', done_at: K('2026-10-21', '18:30'), done_by_name: '이수경', cancel_reason: '상황이 바뀌어 필요 없음', created_at: K('2026-10-21', '16:00'), history: [] },
  { id: 6, message_id: 6, assignee: EUNJI, assignee_name: '이은지', requester: BOSS, requester_name: '이수경', text: '상담 일지 정리', status: '대기', done_at: null, progress_at: K('2026-10-21', '19:00'), progress_by: '이은지', created_at: K('2026-10-21', '18:40'),
    history: [{ kind: '진행 중', by: '이은지', at: K('2026-10-21', '19:00') }] },
  { id: 5, message_id: 5, assignee: HEEJU, assignee_name: '고희주', requester: BOSS, requester_name: '이수경', text: '옛날 일', status: '완료', done_at: K('2026-10-01', '10:00'), created_at: K('2026-10-01', '09:00'), updated_at: K('2026-10-01', '10:00'), history: [] },
];
const USAGE = [
  { user_id: HEEJU, name: '고희주', ymd: '2026-10-21', page: 'shueguk-report/timetable.html', minutes: 30, first_at: K('2026-10-21', '15:02'), last_at: K('2026-10-21', '19:20') },
  { user_id: HEEJU, name: '고희주', ymd: '2026-10-21', page: 'shueguk-hub/ops.html', minutes: 5, first_at: K('2026-10-21', '15:00'), last_at: K('2026-10-21', '15:10') },
  { user_id: HEEJU, name: '고희주', ymd: '2026-10-21', page: 'shueguk-hub/messenger.html', minutes: 42, first_at: K('2026-10-21', '15:00'), last_at: K('2026-10-21', '19:30') },
];
let noFn = false;
const calls = [];

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript' }); res.end(fs.readFileSync(f));
  }).listen(PORT);
  const browser = await chromium.launch();

  async function open(file, who, opts){
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1300, height: 900 } });
    await ctx.addInitScript(t => { const D = Date, off = t - D.now(); window.Date = class extends D { constructor(...a){ super(...(a.length ? a : [D.now() + off])); } static now(){ return D.now() + off; } }; }, NOW);
    await ctx.addInitScript(id => localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id } })), who);
    if (opts.usage) await ctx.addInitScript(() => { window.__shuegukUsageForce = true; window.__shuegukUsageEvery = 100; });
    ctx.setDefaultTimeout(8000);
    await ctx.route('**/*', async route => {
      const req = route.request(), url = req.url();
      const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(obj) });
      if (req.method() === 'OPTIONS') return json({}, 204);
      if (url.includes('fonts.g')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (!url.startsWith(SB)) return route.continue();
      const u = new URL(url), p = u.pathname;
      calls.push([p, u.search, req.postData()]);
      if (p === '/rest/v1/teacher_accounts') return json([ACC[who]]);
      if (p === '/rest/v1/rpc/usage_tick') return json(true);
      if (p === '/rest/v1/rpc/msg_members') return json(MEMBERS);
      if (p === '/rest/v1/msg_presence_log'){
        const g = u.searchParams.getAll('at'), from = Date.parse(g[0].slice(4)), to = Date.parse(g[1].slice(3));
        return json(PLOGS.filter(l => Date.parse(l.at) >= from && Date.parse(l.at) < to));
      }
      if (p === '/rest/v1/tt_classes'){ const c = u.searchParams.get('class_id'); return json(TT.filter(x => c === 'like.w*' ? /^w/.test(x.class_id) : !/^w/.test(x.class_id))); }
      if (p === '/rest/v1/tt_period') return json(TTP);
      if (p === '/rest/v1/tt_log') return json(TTLOG);
      if (p === '/rest/v1/msg_tasks') return json(TASKS);
      if (p === '/rest/v1/rpc/staff_usage'){
        if (noFn) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
        const b = JSON.parse(req.postData()); return json(USAGE.filter(x => x.ymd >= b.p_from && x.ymd <= b.p_to));
      }
      return json({ message: 'unexpected ' + p }, 400);
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => { bad++; console.error('  ✗ 페이지 오류', e.message); });
    await page.goto(`http://127.0.0.1:${PORT}/${file}`);
    return { ctx, page };
  }
  const rowOf = (page, id) => page.locator('#tb tr[data-id="' + id + '"]');

  console.log('① 보는 사람');
  let { ctx, page } = await open('staff.html', HEEJU);
  await page.waitForSelector('#deny:not([hidden])');
  ok(await page.locator('#app').isHidden(), '조교·선생님은 못 봄');
  await ctx.close();
  ({ ctx, page } = await open('ops.html', HEEJU));
  await page.waitForSelector('.card'); await sleep(300);
  ok(!(await page.locator('#list').textContent()).includes('강사 관리'), '운영 메뉴에 강사 관리 카드 없음(조교)');
  await ctx.close();
  ({ ctx, page } = await open('ops.html', PARK));
  await page.waitForFunction(() => document.querySelector('#list').textContent.includes('강사 관리'));
  ok(await page.locator('a.card[href="staff.html"]').count() === 1, '대표님(parkeh)에게는 강사 관리 카드');
  await ctx.close();

  console.log('② 오늘');
  ({ ctx, page } = await open('staff.html', BOSS));
  await page.waitForSelector('#app:not([hidden])');
  await page.click('[data-p="today"]');
  await page.waitForSelector('#tb tr[data-id="' + HEEJU + '"]');
  ok((await page.locator('#range').textContent()) === '10/21 (수) ~ 10/21 (수)', '기간 표시');
  const hj = await rowOf(page, HEEJU).textContent();
  ok(hj.includes('4시간 30분') && hj.includes('1일 · 본원·화정센터'), '고희주 근무 4시간 30분 · 센터 두 곳 (' + hj + ')');
  ok(hj.includes('1 / 3 완료') && hj.includes('미룸 1') && hj.includes('위임 1') && hj.includes('취소 1'), '고희주 업무 1 / 3 완료 · 미룸 1 · 위임(넘김) 1 · 취소 1 (옛 완료는 빠짐)');
  ok(hj.includes('35분') && hj.includes('42분'), '티쳐스 35분 · 슈톡 42분');
  const ej = await rowOf(page, EUNJI).textContent();
  ok(ej.includes('4시간 0분') || ej.includes('4시간'), '이은지 근무 = 오늘 16:00~지금(20:00) 4시간 (' + ej + ')');
  ok(ej.includes('4시간 30분') && ej.includes('3회'), '이은지 수업 4시간 30분 · 3회 (정규 2 + 이 주만 1, 내신·휴강·빈 반·다음날 제외)');
  ok(ej.includes('0 / 2 완료') && ej.includes('대기 1') && ej.includes('진행 중 1'), '이은지 넘겨받은 일 대기 · 진행 중 1');
  const bs = await rowOf(page, BOSS).textContent();
  ok(bs.includes('2시간') && bs.includes('1회'), "'슈' 수업 = 이수경 2시간");
  ok(bs.includes('출근 기록 없음') && bs.includes('맡은 일 없음'), '기록 없는 사람도 줄');
  const pk = await rowOf(page, PARK).textContent();
  ok(pk.includes('1시간 30분') && pk.includes('1회'), "'언호' 수업 = 박언호대표님 1시간 30분 (끝의 '대표님'은 떼고 대조)");
  console.log('③ 자세히');
  await rowOf(page, HEEJU).click();
  await page.waitForSelector('#detail:not([hidden])');
  const dt = await page.locator('#detail').textContent();
  ok(dt.includes('화정센터 · 15:00 ~ 17:00 (센터 옮김)') && dt.includes('본원 · 17:00 ~ 19:30'), '근무 기록 줄(센터 옮김)');
  ok(dt.includes('미룸 학부모님 상담 전화') && dt.includes('10/21 (수) 19:00까지 하겠다고 미룸 — 학부모님 통화가 안 됨') && dt.includes('약속 지남'), '미룸 = 언제까지 + 메모 + 약속 지남');
  ok(dt.includes('이은지님에게 넘김 — 내일 쉬어요 · 지금 이은지 · 대기'), '위임(넘김) = 받은 사람 + 사유 + 지금 상태');
  ok(dt.includes('취소 사유: 상황이 바뀌어 필요 없음') && dt.includes('(이수경)'), '취소 = 사유 + 취소한 사람');
  ok(dt.includes('고희주 · 10/21 (수) 19:00까지 미룸'), '기록 리스트(누가·언제)');
  ok(dt.includes('슈국 스케쥴') && dt.includes('30분') && dt.includes('슈국 운영'), '페이지별 사용 시간');
  ok(dt.includes('15:00 ~ 19:30 사이'), '슈톡 사용 시각 범위');
  await rowOf(page, EUNJI).click();
  const dt2 = await page.locator('#detail').textContent();
  ok(dt2.includes('16:00 ~ 20:00 (근무 중)'), '오늘 근무 중 = 지금까지');
  ok(dt2.includes('진행 중 상담 일지 정리') && dt2.includes('10/21 (수) 19:00부터 진행 중'), '진행 중 = 언제부터');
  ok(dt2.includes('오전9:30~11:00 고2 직보') && dt2.includes('(이 주만)'), '이 주만 반 표시');
  ok(!dt2.includes('중2 가') && !dt2.includes('고2 진도'), '휴강·다른 기간 반은 없음');
  if (process.env.SHOT){ await page.screenshot({ path: path.join(process.env.SHOT, 'staff-pc.png'), fullPage: true }); }
  await page.fill('#from', '2026-10-20'); await page.dispatchEvent('#from', 'change');
  await page.waitForFunction(() => document.querySelector('#range').textContent === '10/20 (화) ~ 10/21 (수)');
  const dt3 = await page.locator('#detail').textContent();
  ok(dt3.includes('10/20 (화)본원 · 14:00 ~ 퇴근 기록 없음'), '어제 퇴근을 안 누르면 퇴근 기록 없음(시간에 안 넣음)');
  ok((await rowOf(page, EUNJI).textContent()).includes('퇴근 기록 없음 1'), '표에도 퇴근 기록 없음 1');
  ok(!(await page.locator('[data-p].on').count()), '날짜를 직접 고르면 기간 알약 꺼짐');
  await rowOf(page, PARK).click();
  const dtp = await page.locator('#detail').textContent();
  ok(dtp.includes('10/20 (화)화정센터 · 21:00 ~ 0:40') && !dtp.includes('퇴근 기록 없음'), '자정 넘은 퇴근은 그 근무일에 붙음(새벽 5시 경계)');
  ok((await rowOf(page, PARK).textContent()).includes('3시간 40분'), '자정 넘은 근무 시간 3시간 40분');
  ok(await page.evaluate(() => document.querySelector('#wsel').value === '' && document.querySelector('#msel').value === ''), '날짜를 직접 고르면 주·월 메뉴도 비움');
  console.log('④ 주 메뉴 · 월 메뉴 · 사람 고르기');
  const wopts = await page.$$eval('#wsel option', os => os.map(o => o.value + '|' + o.textContent));
  ok(wopts[1] === 'week:2026-10-21|10/21 주차 · 이번 주' && wopts[2] === 'week:2026-10-14|10/14 주차 · 지난주' && wopts[3] === 'week:2026-10-07|10/7 주차' && wopts.length === 14, '주 메뉴 = 이번 주부터 12주 전까지 수요일 주차 (' + wopts.slice(0, 4).join(' / ') + ')');
  const mopts = await page.$$eval('#msel option', os => os.map(o => o.value + '|' + o.textContent));
  ok(mopts[1] === 'month:2026-10|10월 · 이번 달' && mopts[2] === 'month:2026-09|9월 · 지난달' && mopts[3] === 'month:2026-08|8월' && mopts[mopts.length - 1] === 'month:2026-04|4월' && mopts.length === 8, '월 메뉴 = 이번 달부터 6달 전까지 (' + mopts.slice(0, 4).join(' / ') + ')');
  await page.selectOption('#wsel', 'week:2026-10-21');
  await page.waitForFunction(() => document.querySelector('#range').textContent === '10/21 (수) ~ 10/27 (화)');
  ok(true, '10/21 주차 = 수~화');
  await page.selectOption('#wsel', 'week:2026-10-14');
  await page.waitForFunction(() => document.querySelector('#range').textContent === '10/14 (수) ~ 10/20 (화)');
  ok((await rowOf(page, EUNJI).textContent()).includes('퇴근 기록 없음 1'), '10/14 주차 = 지난주(10/20 기록만)');
  await page.selectOption('#msel', 'month:2026-09');
  await page.waitForFunction(() => document.querySelector('#range').textContent === '9/1 (화) ~ 9/30 (수)');
  ok(await page.evaluate(() => document.querySelector('#wsel').value === '' && document.querySelector('#msel').value === 'month:2026-09'), '9월을 고르면 주 메뉴는 비고 월 메뉴만 선택');
  ok(await page.evaluate(() => sessionStorage.getItem('staff_period') === 'month:2026-09'), '고른 기간은 이 탭에 기억');
  await page.selectOption('#wsel', 'week:2026-10-21');
  await page.waitForFunction(() => document.querySelector('#range').textContent === '10/21 (수) ~ 10/27 (화)');
  const ejw = await rowOf(page, EUNJI).textContent();
  ok(ejw.includes('4회'), '다음날 이 주만 반도 이번 주에 (4회)');
  await page.selectOption('#who', HEEJU);
  ok(await page.locator('#tb tr').count() === 1, '사람 고르면 그 사람만');
  await ctx.close();

  console.log('⑤ 마이그레이션 전');
  noFn = true;
  ({ ctx, page } = await open('staff.html', BOSS, { viewport: { width: 390, height: 844 } }));
  await page.waitForSelector('.warn');
  ok((await page.locator('#warns').textContent()).includes('202610200005'), '사용 시간 함수 없음 안내');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), '휴대폰 가로 스크롤 없음(표는 상자 안에서)');
  if (process.env.SHOT){ await page.screenshot({ path: path.join(process.env.SHOT, 'staff-phone.png'), fullPage: true }); }
  await ctx.close();
  noFn = false;

  console.log('⑥ 사용 시간 기록 (teacher-auth.js)');
  calls.length = 0;
  ({ ctx, page } = await open('ops.html', HEEJU, { usage: true }));
  await page.waitForSelector('.card');
  await sleep(1000);
  const ticks = calls.filter(c => c[0] === '/rest/v1/rpc/usage_tick');
  ok(ticks.length >= 1 && JSON.parse(ticks[0][2]).p_page === 'site/ops.html', '1분 모이면 usage_tick(페이지 이름) (' + ticks.length + '번)');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
  const k0 = calls.filter(c => c[0] === '/rest/v1/rpc/usage_tick').length; await sleep(1000);
  ok(calls.filter(c => c[0] === '/rest/v1/rpc/usage_tick').length === k0, '화면이 숨으면 세지 않음');
  await ctx.close();
  calls.length = 0;
  ({ ctx, page } = await open('ops.html', HEEJU));
  await page.waitForSelector('.card'); await sleep(600);
  ok(!calls.some(c => c[0] === '/rest/v1/rpc/usage_tick'), '로컬(github.io 아님)에서는 세지 않음');
  await ctx.close();

  await browser.close(); server.close();
  console.log(`\n${n - bad} / ${n} 통과`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
