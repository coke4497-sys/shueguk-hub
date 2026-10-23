/* AI 교무실(aioffice.html) · 슈국 운영 카드 브라우저 E2E (2026-10-23)
 * 가짜 수파베이스로 실제 페이지를 띄워
 *   보는 사람 제한(원장님·대표님) · 운영 메뉴 카드 · 교무실 장면(칠판·팀장·조교 자리 말) · 업무판 다섯 칸 ·
 *   지시 남기기(빈 지시·맡길 조교) · 접수 지시 취소 · 카드 펼침(지시 원문·결과·기록) · 승인 · 다시 고쳐 줘(의견 필수) ·
 *   질문 카드 답하기 · 그만두기 · 조교 자리로 거르기 · 마지막 순찰 · 마이그레이션 전 안내 · 휴대폰
 * 을 검사한다. 원격에는 아무것도 보내지 않는다.
 *   실행: NODE_PATH=$(npm root -g) node tools/ai-office-e2e-test.js   (SHOT=폴더 면 화면을 찍어 둔다)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8957;
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let n = 0, bad = 0;
function ok(cond, label){ n++; if (!cond){ bad++; console.error('  ✗', label); } else console.log('  ✓', label); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BOSS = '33333333-3333-3333-3333-333333333333', HEEJU = '11111111-1111-1111-1111-111111111111', PARK = '99999999-9999-9999-9999-999999999999';
const ACC = {
  [BOSS]: { user_id: BOSS, login_id: 'admin', display_name: '이수경', role: 'admin', active: true },
  [HEEJU]: { user_id: HEEJU, login_id: 'heeju', display_name: '고희주', role: 'assistant', active: true },
  [PARK]: { user_id: PARK, login_id: 'parkeh', display_name: '박언호', role: 'teacher', active: true },
};
const NOW = Date.parse('2026-10-23T15:40:00+09:00');
const K = t => new Date(Date.parse('2026-10-23T' + t + ':00+09:00')).toISOString();

let ORDERS, TASKS, META, noTable;
function seed(){
  noTable = false;
  ORDERS = [
    { id: 1, body: '11/8(토) 오후 2시 예비 고1 설명회 카드뉴스 3장 문구', to_role: 'hong', author_name: '이수경', status: '진행', picked_at: K('15:30'), created_at: K('15:20'), updated_at: K('15:30') },
    { id: 2, body: '10월 수업 회차 기준 초과 학생 정리', to_role: 'lead', author_name: '박언호', status: '진행', picked_at: null, created_at: K('09:50'), updated_at: K('10:20') },
    { id: 3, body: '고1 문학 학습지 관동별곡 초안', to_role: 'lead', author_name: '이수경', status: '접수', picked_at: null, created_at: K('15:35'), updated_at: K('15:35') },
    { id: 4, body: '수요일 가산 안내 공지 문구', to_role: 'hong', author_name: '이수경', status: '완료', picked_at: null, created_at: K('08:00'), updated_at: K('09:00') },
    { id: 5, body: '어휘 9주차 원본 대조', to_role: 'lead', author_name: '이수경', status: '진행', picked_at: K('15:38'), created_at: K('15:36'), updated_at: K('15:38') },
  ];
  TASKS = [
    { id: 11, order_id: 1, role: 'hong', title: '카드뉴스 3장 문구', col: '진행', stage: 2, last: '1장 표지 문구 완성', result: '', result_url: '', log: [{ at: '10/23 15:31', who: '팀장 클로슈', text: '홍보 조교에게 맡김' }], updated_at: K('15:34') },
    { id: 12, order_id: 2, role: 'haeng', title: '기준 초과 학생 정리표', col: '확인', stage: 4, last: '기준보다 많은 학생 12명', result: '학년\t이름\t차이\n고1\t김민준\t+2', result_url: 'https://github.com/coke4497-sys/shueguk-hub/pull/999',
      log: [{ at: '10/23 10:20', who: '행정 조교', text: '정리 완료' }], updated_at: K('10:20') },
    { id: 13, order_id: 2, role: 'gum', title: '정리표 숫자 다시 세기', col: '검수', stage: 3, last: '고2 줄 대조 중', result: '', result_url: '', log: [], updated_at: K('10:24') },
    { id: 14, order_id: 4, role: 'hong', title: '수요일 가산 공지 문구', col: '완료', stage: 5, last: '원장님 승인', result: '공지 문구', result_url: '', log: [], updated_at: K('09:00') },
    { id: 15, order_id: 2, role: 'lead', title: '기준을 무엇으로 볼까요', col: '확인', stage: 0, last: '질문: 주1회 4회 기준이 맞나요?', result: '보기 ① 4회 ② 5회', result_url: '', log: [], updated_at: K('10:10') },
  ];
  META = [{ key: 'patrol', at: K('15:00') }];
}
const calls = [];
function errOut(json, msg){ return json({ code: 'P0001', message: msg }, 400); }

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : 'text/javascript' }); res.end(fs.readFileSync(f));
  }).listen(PORT);
  const browser = await chromium.launch();

  async function open(file, who, opts){
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1300, height: 900 } });
    await ctx.addInitScript(t => { const D = Date, off = t - D.now(); window.Date = class extends D { constructor(...a){ super(...(a.length ? a : [D.now() + off])); } static now(){ return D.now() + off; } }; }, NOW);
    await ctx.addInitScript(id => localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id } })), who);
    ctx.setDefaultTimeout(8000);
    await ctx.route('**/*', async route => {
      const req = route.request(), url = req.url();
      const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(obj) });
      if (req.method() === 'OPTIONS') return json({}, 204);
      if (url.includes('fonts.g')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (!url.startsWith(SB)) return route.continue();
      const u = new URL(url), p = u.pathname, body = req.postData() ? JSON.parse(req.postData()) : null;
      calls.push([p, u.search, body]);
      if (p === '/rest/v1/teacher_accounts') return json([ACC[who]]);
      if (p === '/rest/v1/rpc/usage_tick') return json(true);
      if (noTable && /ai_/.test(p)) return json({ code: '42P01', message: 'relation "public.ai_orders" does not exist' }, 404);
      if (p === '/rest/v1/ai_orders') return json(ORDERS.slice().sort((a, b) => b.id - a.id));
      if (p === '/rest/v1/ai_tasks'){
        const c = decodeURIComponent(u.searchParams.get('col') || '');
        const want = c.replace(/^in\.\(|\)$/g, '').split(',');
        return json(TASKS.filter(t => want.includes(t.col)));
      }
      if (p === '/rest/v1/ai_meta') return json(META);
      const me = ACC[who];
      if (p === '/rest/v1/rpc/ai_order_add'){
        if (!body.p_body.trim()) return errOut(json, 'empty');
        const o = { id: ORDERS.length + 10, body: body.p_body.trim(), to_role: body.p_role, author_name: me.display_name, status: '접수', picked_at: null, created_at: K('15:40'), updated_at: K('15:40') };
        ORDERS.push(o); return json(o);
      }
      if (p === '/rest/v1/rpc/ai_order_cancel'){
        const o = ORDERS.find(x => x.id === body.p_id);
        if (!o || o.status !== '접수' || o.picked_at) return errOut(json, 'not_open');
        o.status = '취소'; return json(true);
      }
      if (p === '/rest/v1/rpc/ai_task_decide'){
        const t = TASKS.find(x => x.id === body.p_id);
        if (t.col !== '확인') return errOut(json, 'not_waiting');
        if (!body.p_ok && !String(body.p_note || '').trim()) return errOut(json, 'need_note');
        if (body.p_ok){ t.col = '완료'; t.stage = 5; t.last = '원장님 승인'; }
        else { t.col = '진행'; t.stage = Math.min(t.stage, 2); t.last = '원장님 의견: ' + body.p_note.trim(); }
        t.log = t.log.concat([{ at: '10/23 15:40', who: me.display_name, text: body.p_ok ? '승인' : '다시 고쳐 줘 — ' + body.p_note }]);
        t.updated_at = K('15:40'); return json(t);
      }
      if (p === '/rest/v1/rpc/ai_task_stop'){
        const t = TASKS.find(x => x.id === body.p_id);
        t.col = '중단'; t.last = '원장님이 그만두게 함'; t.updated_at = K('15:40'); return json(t);
      }
      return json({ message: 'unexpected ' + p }, 400);
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => { bad++; console.error('  ✗ 페이지 오류', e.message); });
    await page.goto(`http://127.0.0.1:${PORT}/${file}`);
    return { ctx, page };
  }
  const col = (page, k) => page.locator('.col[data-col="' + k + '"]');
  const card = (page, id) => page.locator('.task[data-id="' + id + '"]');

  seed();
  console.log('① 보는 사람 · 운영 메뉴');
  let { ctx, page } = await open('aioffice.html', HEEJU);
  await page.waitForSelector('#deny:not([hidden])');
  ok(await page.locator('#app').isHidden(), '조교는 못 봄');
  ok(!calls.some(c => c[0] === '/rest/v1/ai_orders'), '못 보는 사람은 표를 부르지 않음');
  await ctx.close();
  ({ ctx, page } = await open('ops.html', HEEJU));
  await page.waitForSelector('.card'); await sleep(300);
  ok(await page.locator('a.card[href="aioffice.html"]').count() === 0, '조교 운영 메뉴에는 AI 교무실 카드 없음');
  await ctx.close();
  ({ ctx, page } = await open('ops.html', PARK));
  await page.waitForSelector('a.card[href="aioffice.html"]');
  ok((await page.locator('a.card[href="aioffice.html"]').textContent()).includes('AI 교무실'), '대표님(parkeh)에게는 AI 교무실 카드');
  await ctx.close();

  console.log('② 교무실 장면 · 업무판');
  ({ ctx, page } = await open('aioffice.html', BOSS));
  await page.waitForSelector('.col[data-col="확인"] .task');
  ok((await page.locator('#chalk').textContent()).includes('어휘 9주차'), '칠판 = 가장 최근 열린 지시');
  ok((await page.locator('#patrol').textContent()) === '마지막 순찰 오늘 15:00', '마지막 순찰 시각');
  ok((await page.locator('#schedule').textContent()).includes('매시 정각'), '순찰 시각 안내');
  ok((await page.locator('#nOrder').textContent()) === '1' && (await page.locator('#nTask').textContent()) === '2' && (await page.locator('#nRes').textContent()) === '2', '머리 숫자 지시 1 · 할 일 2 · 원장님 확인 2');
  ok((await page.locator('#leadState').textContent()).includes('새 지시 1건'), '팀장 자리 = 새 지시 1건');
  const desk = k => page.locator('.desk[data-role="' + k + '"]');
  ok((await desk('hong').textContent()).includes('일하는 중') && (await desk('hong').textContent()).includes('1장 표지 문구 완성'), '홍보 조교 = 일하는 중 + 지금 하는 일');
  ok((await desk('haeng').textContent()).includes('확인!'), '행정 조교 = 원장님 확인 기다림');
  ok((await desk('gum').textContent()).includes('일하는 중'), '검수 조교 = 검수 중');
  ok((await desk('gyo').textContent()).includes('자리에 있음'), '교재 조교 = 쉬는 중');
  const img = async k => (await page.locator(k === 'lead' ? '#leadImg' : '.desk[data-role="' + k + '"] img.sk').getAttribute('src')).replace('assets/shukong/', '');
  ok(await img('hong') === 'sk-desk.png' && await img('haeng') === 'sk-notice.png' && await img('gyo') === 'sk-school.png' && await img('lead') === 'sk-fly.png', '슈콩 그림 = 일하는 중 책상 · 확인 기다림 확성기 · 쉬는 중 조교 모습 · 팀장은 새 지시가 있으면 날기');
  ok(await page.evaluate(() => [...document.querySelectorAll('img.sk')].every(i => i.complete && i.naturalWidth > 0)), '슈콩 그림 다섯 장 모두 불러옴');
  ok(await page.locator('.desk[data-role="hong"] .slot.hasdesk').count() === 1 && await page.locator('.desk[data-role="gyo"] .slot.hasdesk').count() === 0, '책상 그림 슈콩은 옆 책상 감춤 · 쉬는 슈콩은 옆 책상');
  ok(await page.locator('.desk[data-role="hong"].on').count() === 1, '일하는 자리는 모니터 켜짐');
  ok(/rotate\(/.test(await page.locator('#mh').getAttribute('transform') || ''), '벽시계 바늘');
  ok(await page.locator('.notes .pi').count() === 5, '화이트보드 포스트잇 다섯 단계');
  ok(await col(page, 'in').locator('.task').count() === 2, '접수 = 새 지시 + 가져갔지만 아직 안 나눈 지시');
  ok((await col(page, 'in').textContent()).includes('슈콩이 가져가 나누는 중'), '가져간 지시 표시');
  ok(await col(page, 'in').locator('[data-cancel="3"]').count() === 1 && await col(page, 'in').locator('[data-cancel="5"]').count() === 0, '가져가기 전 지시만 취소 버튼');
  ok(await col(page, '진행').locator('.task').count() === 1 && await col(page, '검수').locator('.task').count() === 1 && await col(page, '확인').locator('.task').count() === 2, '진행 1 · 검수 1 · 확인 2');
  ok((await col(page, 'done').textContent()).includes('수요일 가산'), '완료 칸');
  ok((await card(page, 15).textContent()).includes('질문'), '질문 카드 꼬리표');
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'aioffice-pc.png'), fullPage: true });

  console.log('③ 지시 남기기 · 취소');
  await page.click('#ordGo');
  ok((await page.locator('#ordMsg').textContent()).includes('적어 주십시오'), '빈 지시는 안내만');
  await page.fill('#ordIn', '  중3 문법 형태소 복습지 2장  ');
  await page.selectOption('#ordTo', 'gyo');
  await page.click('#ordGo');
  await page.waitForFunction(() => document.querySelector('#ordMsg').textContent.includes('남겼습니다'));
  const add = calls.filter(c => c[0] === '/rest/v1/rpc/ai_order_add').pop();
  ok(add && add[2].p_body === '중3 문법 형태소 복습지 2장' && add[2].p_role === 'gyo', '지시 저장 본문(앞뒤 공백 정리 · 교재 조교)');
  ok((await page.locator('#ordIn').inputValue()) === '' && (await col(page, 'in').textContent()).includes('형태소 복습지'), '입력칸 비움 · 접수 칸에 새 지시');
  await col(page, 'in').locator('[data-cancel="3"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-cancel="3"]'));
  ok(ORDERS.find(o => o.id === 3).status === '취소', '접수 지시 취소');

  console.log('④ 원장님 확인');
  await card(page, 12).locator('[data-open]').click();
  const t12 = await card(page, 12).textContent();
  ok(t12.includes('10월 수업 회차 기준 초과') && t12.includes('박언호'), '펼치면 지시 원문 · 지시한 사람');
  ok(t12.includes('김민준') && t12.includes('정리 완료'), '결과 · 진행 기록');
  ok(await card(page, 12).locator('a.rlink[href*="pull/999"]').count() === 1, '결과 링크');
  ok(await card(page, 12).locator('[data-copy]').count() === 1, '결과 복사 버튼');
  await card(page, 12).locator('[data-back]').click();
  await card(page, 12).locator('[data-send]').click();
  ok((await card(page, 12).textContent()).includes('무엇을 고칠지'), '다시 고쳐 줘는 의견 필수(서버에 안 보냄)');
  ok(!calls.some(c => c[0] === '/rest/v1/rpc/ai_task_decide'), '의견 없이는 요청 없음');
  await card(page, 12).locator('textarea[data-note]').fill('고2 줄도 넣어 줘');
  await card(page, 12).locator('[data-send]').click();
  await page.waitForFunction(() => document.querySelector('.col[data-col="진행"] .task[data-id="12"]'));
  const dec = calls.filter(c => c[0] === '/rest/v1/rpc/ai_task_decide').pop();
  ok(dec[2].p_ok === false && dec[2].p_note === '고2 줄도 넣어 줘', '다시 고쳐 줘 본문');
  ok((await card(page, 12).textContent()).includes('다시 고치는 중') && (await card(page, 12).textContent()).includes('원장님 의견: 고2 줄도'), '진행 칸으로 · 다시 고치는 중 꼬리표');
  ok((await page.locator('.desk[data-role="haeng"] img.sk').getAttribute('src')).endsWith('sk-study.png'), '다시 고치는 조교 = 불꽃 슈콩');
  TASKS.find(t => t.id === 12).col = '확인';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForSelector('.col[data-col="확인"] .task[data-id="12"] [data-ok]');
  await card(page, 12).locator('[data-ok]').click();
  await page.waitForFunction(() => document.querySelector('.col[data-col="done"] .task[data-id="12"]'));
  ok(calls.filter(c => c[0] === '/rest/v1/rpc/ai_task_decide').pop()[2].p_ok === true, '승인 → 완료 칸');
  await card(page, 15).locator('[data-open]').click();
  ok(await card(page, 15).locator('[data-ok]').count() === 0 && (await card(page, 15).locator('[data-back]').textContent()) === '답하기', '질문 카드는 승인 없이 [답하기]');
  await card(page, 15).locator('[data-back]').click();
  await card(page, 15).locator('textarea').fill('4회가 맞아요');
  await card(page, 15).locator('[data-send]').click();
  await page.waitForFunction(() => document.querySelector('.col[data-col="진행"] .task[data-id="15"]'));
  ok(calls.filter(c => c[0] === '/rest/v1/rpc/ai_task_decide').pop()[2].p_note === '4회가 맞아요', '질문 답이 의견으로 감');
  await card(page, 13).locator('[data-open]').click();
  await card(page, 13).locator('[data-stop]').click();
  await page.waitForFunction(() => document.querySelector('.col[data-col="done"] .task[data-id="13"]'));
  ok((await card(page, 13).textContent()).includes('그만둠'), '그만두기 → 완료 칸 · 그만둠 꼬리표');
  ok((await page.locator('.desk[data-role="haeng"] img.sk').getAttribute('src')).endsWith('sk-cheer.png') || (await page.locator('.desk[data-role="haeng"] img.sk').getAttribute('src')).endsWith('sk-desk.png'), '행정 조교 그림 갱신');

  console.log('⑤ 조교 자리로 거르기');
  await page.locator('.desk[data-role="hong"]').click();
  ok(await page.locator('.task[data-id="12"]').count() === 0 && await page.locator('.task[data-id="11"]').count() === 1, '홍보 조교 일만');
  ok((await page.locator('#filNote').textContent()).includes('홍보 조교의 일만'), '거르는 중 안내');
  TASKS.forEach(t => { if (t.role === 'hong' && t.col === '진행') t.col = '확인'; });
  TASKS.forEach(t => { if (t.role === 'hong') t.updated_at = K('00:01'); });
  TASKS.filter(t => t.role === 'hong').forEach(t => { t.col = '중단'; t.updated_at = '2026-10-20T00:00:00Z'; });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => (document.querySelector('.desk[data-role="hong"] img.sk').getAttribute('src') || '').endsWith('sk-cheer-hearts.png'));
  ok(true, '쉬는 홍보 조교 = 응원 피켓 슈콩');
  await page.click('#filAll');
  ok(await page.locator('.task[data-id="12"]').count() === 1, '모두 보기');
  await ctx.close();

  console.log('⑥ 마이그레이션 전 · 휴대폰');
  seed(); noTable = true;
  ({ ctx, page } = await open('aioffice.html', BOSS, { viewport: { width: 390, height: 844 } }));
  await page.waitForSelector('#warn:not([hidden])');
  ok((await page.locator('#warn').textContent()).includes('202610230001'), '표 없음 안내');
  noTable = false;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForSelector('.col[data-col="확인"] .task');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), '휴대폰 가로 스크롤 없음(업무판은 상자 안에서)');
  ok(await page.locator('.coffee').isHidden() && await page.locator('.wins').isVisible(), '휴대폰은 커피바 숨김 · 창은 보임');
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'aioffice-phone.png'), fullPage: true });
  await ctx.close();

  await browser.close(); server.close();
  console.log(`\n${n - bad} / ${n} 통과`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
