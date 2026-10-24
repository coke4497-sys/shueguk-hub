/* 27 예상 고3 시간표(plan_g3.html) 브라우저 E2E (2026-10-24)
 * 가짜 수파베이스(표를 메모리에 둠)로 실제 페이지를 띄워
 *   보는 사람 제한 · 운영 메뉴 카드 · 내신 시간표로 1안 만들기(고2 진도·확인만, w* 제외, 학교·이름 괄호) · 점검 숫자 ·
 *   학생 옮기기(진도/확인 구분) · 빼기 · 시간 겹침 · 반 추가·고치기·지우기 · 안 복사(2안)와 비교 · 메모 · 다른 화면에서 바뀜(CAS) · 안 지우기 · 휴대폰
 * 을 검사한다. 원격에는 아무것도 보내지 않는다.
 *   실행: NODE_PATH=$(npm root -g) node tools/plan-g3-e2e-test.js   (SHOT=폴더 면 화면을 찍어 둔다)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8961;
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let n = 0, bad = 0;
function ok(cond, label){ n++; if (!cond){ bad++; console.error('  ✗', label); } else console.log('  ✓', label); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BOSS = '33333333-3333-3333-3333-333333333333', PARK = '99999999-9999-9999-9999-999999999999', JUHYE = '44444444-4444-4444-4444-444444444444';
const ACC = {
  [BOSS]: { user_id: BOSS, login_id: 'admin', display_name: '이수경', role: 'admin', active: true },
  [PARK]: { user_id: PARK, login_id: 'parkeh', display_name: '박언호', role: 'teacher', active: true },
  [JUHYE]: { user_id: JUHYE, login_id: 'juhye', display_name: '남주혜', role: 'teacher', active: true },
};
const TT = [
  { class_id: 'n006', day: '수', start_time: '5:30', end_time: '7:00', location: '민트초코', teacher: '현정', name: '고2 화수A(창비 화언)', roster: '가나 다라(8/30부터) 한윤서(화수)' },
  { class_id: 'n031', day: '금', start_time: '5:30', end_time: '7:00', location: '민트초코', teacher: '주혜', name: '고2 화정B(비상 화언)', roster: '마바 사아' },
  { class_id: 'n004', day: '수', start_time: '5:30', end_time: '7:00', location: '민트초코', teacher: '주혜', name: '고2 확인', roster: '가나(화수) 마바(화정)' },
  { class_id: 'n017', day: '목', start_time: '5:30', end_time: '7:00', location: '민트초코', teacher: '현정', name: '고2 확인', roster: '다라 사아' },
  { class_id: 'n048', day: '토', start_time: '11:00', end_time: '12:30', location: '민트초코', teacher: '연주', name: '고2 확인', roster: '한윤서' },
  { class_id: 'n050', day: '토', start_time: '11:00', end_time: '12:30', location: '민트초코', teacher: '연주', name: '고1 확인', roster: '딴학년' },
  { class_id: 'w261025a', day: '토', start_time: '2:00', end_time: '3:30', location: '민트초코', teacher: '연주', name: '고2 확인 직보', roster: '가나' },
];
let CFG = [], STU = [], sid = 1, stamp = 0;
const calls = [];
function ts(){ stamp++; return new Date(Date.parse('2026-10-24T01:00:00Z') + stamp * 1000).toISOString().replace('Z', '+00:00'); }
function val(v){ return decodeURIComponent(v).replace(/^eq\./, ''); }
function match(row, sp){
  for (const [k, raw] of sp){
    if (k === 'select' || k === 'order' || k === 'limit') continue;
    const v = decodeURIComponent(raw);
    if (v.startsWith('like.')){ const pre = v.slice(5).replace(/\*$/, ''); if (!String(row[k]).startsWith(pre)) return false; }
    else if (v.startsWith('eq.')){ if (String(row[k]) !== v.slice(3)) return false; }
  }
  return true;
}

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
    await ctx.addInitScript(id => localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id } })), who);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:' + PORT });
    ctx.setDefaultTimeout(8000);
    await ctx.route('**/*', async route => {
      const req = route.request(), url = req.url();
      const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: obj === undefined ? '' : JSON.stringify(obj) });
      if (req.method() === 'OPTIONS') return json({}, 204);
      if (url.includes('fonts.g')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (!url.startsWith(SB)) return route.continue();
      const u = new URL(url), p = u.pathname, m = req.method(), sp = [...u.searchParams.entries()].map(([k, v]) => [k, encodeURIComponent(v)]);
      calls.push([m, p, u.search, req.postData()]);
      if (p === '/rest/v1/teacher_accounts') return json([ACC[who]]);
      if (p === '/rest/v1/rpc/usage_tick') return json(true);
      if (p === '/rest/v1/tt_classes'){
        ok(u.searchParams.get('book') === 'eq.내신' && u.searchParams.get('class_id') === 'not.like.w*', '내신 시간표·w* 제외로 읽음');
        return json(TT.filter(x => !/^w/.test(x.class_id)));
      }
      const tbl = p === '/rest/v1/tt_plan_config' ? 'C' : p === '/rest/v1/tt_plan_students' ? 'S' : '';
      if (!tbl) return json({ message: 'unexpected ' + p }, 400);
      let arr = tbl === 'C' ? CFG : STU;
      if (m === 'GET') return json(arr.filter(r => match(r, sp)));
      if (m === 'POST'){
        const b = JSON.parse(req.postData()); (Array.isArray(b) ? b : [b]).forEach(r => { r.id = sid++; r.updated_at = r.updated_at || ts(); arr.push(r); });
        return json(undefined, 201);
      }
      if (m === 'PATCH'){
        const b = JSON.parse(req.postData()), hit = arr.filter(r => match(r, sp));
        hit.forEach(r => { Object.assign(r, b); if (tbl === 'C') r.updated_at = ts(); });
        return json(JSON.parse(JSON.stringify(hit)));
      }
      if (m === 'DELETE'){
        const keep = arr.filter(r => !match(r, sp));
        if (tbl === 'C') CFG = keep; else STU = keep;
        return json(undefined, 204);
      }
      return json({ message: 'unexpected' }, 400);
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => { bad++; console.error('  ✗ 페이지 오류', e.message); });
    page.on('dialog', d => d.accept());
    await page.goto(`http://127.0.0.1:${PORT}/${file}`);
    return { ctx, page };
  }
  const txt = async (page, sel) => (await page.locator(sel).textContent()) || '';
  const cls = (page, id) => page.locator('[data-cls="' + id + '"]');
  const until = async (f, ms = 5000) => { const t = Date.now(); while (!f()){ if (Date.now() - t > ms) return false; await sleep(60); } return true; };
  const zday = async (page, d) => { await page.click('[data-zday="' + d + '"]'); await page.waitForSelector(d ? '.zg, .wk-zoom .empty' : '.wk-ov'); };

  console.log('① 보는 사람 · 메뉴 카드');
  let { ctx, page } = await open('plan_g3.html', JUHYE);
  await page.waitForSelector('#deny:not([hidden])');
  ok(await page.locator('#app').isHidden(), '선생님은 못 봄');
  await ctx.close();
  ({ ctx, page } = await open('ops.html', JUHYE));
  await page.waitForSelector('.card'); await sleep(300);
  ok(!(await txt(page, '#list')).includes('27 예상 고3'), '선생님 운영 메뉴에는 카드 없음');
  await ctx.close();
  ({ ctx, page } = await open('ops.html', PARK));
  await page.waitForFunction(() => document.querySelector('#list').textContent.includes('27 예상 고3'));
  ok(await page.locator('a.card[href="plan_g3.html"]').count() === 1, '대표님(parkeh)에게는 카드');
  await ctx.close();

  console.log('② 1안 만들기');
  ({ ctx, page } = await open('plan_g3.html', BOSS));
  await page.waitForSelector('#firstBtn');
  await page.click('#firstBtn');
  await page.waitForSelector('.wk-mini');
  ok(CFG.length === 1 && CFG[0].plan === '27고3-1' && CFG[0].open === false, '설정 한 줄 27고3-1 · 신청 닫힘');
  const cl = CFG[0].classes.filter(c => c.id !== '__meta');
  ok(cl.length === 5 && cl.filter(c => c.part === '진도').length === 2 && cl.filter(c => c.part === '확인').length === 3, '고2 반만 5개(진도 2·확인 3, 고1·w* 제외)');
  ok(cl.every(c => c.name.startsWith('고3')) && cl.some(c => c.from === 'n006'), '이름은 고3으로 · 원래 반 ID 기억');
  ok(STU.length === 5 && STU.every(s => s.plan === '27고3-1'), '학생 5명(괄호 뗀 이름)');
  const g = STU.find(s => s.student === '가나'), h = STU.find(s => s.student === '한윤서'), d = STU.find(s => s.student === '다라');
  ok(g.ga === 'n006' && g.na === 'n004' && g.school === '화수고', '가나 = 진도 n006 · 확인 n004 · 화수고');
  ok(h.ga === 'n006' && h.na === 'n048' && h.school === '화수고', '한윤서 앞 괄호 학교 읽음');
  ok(d.school === '화수고' && d.na === 'n017', "'8/30부터' 괄호는 학교로 안 봄(진도 반 이름에서)");
  ok(CFG[0].author === '이수경', '고친 사람 = 로그인 이름');
  const tiles = await txt(page, '#tiles');
  ok(tiles.includes('5학생') && tiles.includes('2진도 반') && tiles.includes('3확인 반'), '점검 숫자 (' + tiles + ')');
  ok(tiles.includes('1진도·확인 시간 겹침'), '가나는 수 5:30 진도·확인이 겹침');
  ok((await txt(page, '#tsum')).includes('주혜T') && (await txt(page, '#tsum')).includes('진도 1반 · 2명'), '선생님별 카드');
  console.log('②-2 주차별 개요 · 요일 확대');
  const heads = await page.locator('.wk-ov .wk-dayh').allTextContents();
  ok(heads.length === 5 && heads[0].startsWith('수') && heads[4].startsWith('일') && heads[4].includes('수업 없음'), '개요 = 수~일 5열(월·화 없음, 빈 요일도) ' + heads.join('/'));
  const mini = page.locator('.wk-mini[data-cls="n006"]');
  ok((await mini.textContent()).includes('현정T 고3 화수A') && (await mini.textContent()).includes('5:30~7:00') && (await mini.textContent()).includes('3명'), '개요 카드 = 담당T·반·시간·인원');
  const y6 = (await mini.boundingBox()).y, y31 = (await page.locator('.wk-mini[data-cls="n031"]').boundingBox()).y, y17 = (await page.locator('.wk-mini[data-cls="n017"]').boundingBox()).y, y48 = (await page.locator('.wk-mini[data-cls="n048"]').boundingBox()).y;
  ok(Math.abs(y6 - y31) < 2 && Math.abs(y6 - y17) < 2, '같은 시작 시간(5:30)은 요일이 달라도 같은 가로줄');
  ok(y48 + 20 < y6, '오전 11:00 줄이 오후 5:30 줄보다 위(시작 시간 순)');
  ok((await page.locator('.wk-ov .wk-tl').allTextContents()).filter(Boolean).join(',') === '11:00,5:30', '왼쪽 시간 눈금 = 시작 시간들');
  ok(await page.locator('.wk-ov .chip').count() === 0, '개요에는 학생 이름 없음');
  await page.click('.wk-mini[data-cls="n004"]');
  await page.waitForSelector('.zg');
  ok((await txt(page, '.wk-dayh.bigh')).startsWith('수요일'), '카드를 누르면 그 요일 확대');
  ok(await page.locator('.zg-col').count() === 3 && (await txt(page, '.zg')).includes('현정T') && (await txt(page, '.zg')).includes('연주T'), '확대 = 선생님 열(그 요일 수업 없는 선생님도)');
  const top6 = (await page.locator('.zg-card[data-cls="n006"]').boundingBox()).y, top4 = (await page.locator('.zg-card[data-cls="n004"]').boundingBox()).y;
  ok(Math.abs(top6 - top4) < 2, '같은 시간 반은 같은 높이에 나란히');
  ok(await page.locator('.chip.bad[data-st="가나"]').count() === 2, '겹친 학생 칩 붉게');
  const card = page.locator('.zg-card[data-cls="n006"]'), cb = await card.boundingBox(), inner = await card.evaluate(e => e.scrollHeight);
  ok(cb.height + 2 >= inner, '카드가 잘리지 않음(칸 높이 자동)');

  console.log('③ 학생 옮기기');
  await page.click('.cls[data-cls="n006"] .chip[data-st="가나"]');
  await page.waitForSelector('#selbar:not([hidden])');
  ok((await txt(page, '#selbar')).includes('가나') && (await txt(page, '#selbar')).includes('화수고'), '선택 띠');
  ok(await page.locator('.zg-card.mine').count() === 2, '내 반 표시');
  await zday(page, '');
  ok(!(await page.locator('#selbar').isHidden()) && await page.locator('.wk-mini.target').count() === 3 && await page.locator('.wk-mini.mine').count() === 2, '개요로 가도 선택 유지 · 옮길 곳 표시');
  await cls(page, 'n017').click();
  await page.waitForFunction(() => !document.querySelector('#tiles').textContent.includes('1진도·확인'));
  ok(STU.find(s => s.student === '가나').na === 'n017' && STU.find(s => s.student === '가나').ga === 'n006', '확인 반을 누르면 확인만 바뀜');
  ok(calls.some(c => c[0] === 'PATCH' && c[1] === '/rest/v1/tt_plan_students' && decodeURIComponent(c[2]).includes('student=eq.가나')), '그 학생 줄만 PATCH');
  await cls(page, 'n031').click();
  ok(await until(() => STU.find(s => s.student === '가나').ga === 'n031'), '저장 기다림');
  await page.waitForFunction(() => document.querySelector('[data-cls="n031"]').textContent.includes('3명'));
  ok(STU.find(s => s.student === '가나').ga === 'n031', '진도 반을 누르면 진도가 바뀜');
  await page.click('[data-unset="ga"]');
  await page.waitForFunction(() => document.querySelector('#unp').textContent.includes('진도 반에 아직'));
  ok(STU.find(s => s.student === '가나').ga === '' && (await txt(page, '#tiles')).includes('1진도 미배치'), '진도에서 빼기 → 미배치');
  await page.click('[data-unsel]');
  ok(await page.locator('#selbar').isHidden(), '선택 풀기');
  await page.fill('#q', '사아');
  await zday(page, '목');
  ok(await page.locator('.chip.hit').count() === 1 && (await txt(page, '#qnote')).includes('1명'), '이름 찾기 = 노란 칩');
  await page.fill('#q', '');

  console.log('④ 반 추가·고치기·지우기');
  await page.click('#addCls');
  await page.fill('#dName', '고3 확인 합반'); await page.selectOption('#dDay', '일'); await page.fill('#dStart', '2:00'); await page.fill('#dEnd', '3:30'); await page.fill('#dT', '주혜T');
  await page.click('#dOk');
  await zday(page, '');
  await page.waitForFunction(() => document.querySelectorAll('.wk-ov .wk-dayh')[4].textContent.includes('확인 1'));
  const nc = CFG[0].classes.find(c => c.name === '고3 확인 합반');
  ok(nc && nc.part === '확인' && nc.teacher === '주혜' && nc.day === '일' && /^c/.test(nc.id), '반 추가(담당 T 떼고 저장)');
  ok(CFG[0].classes.some(c => c.id === '__meta'), '메타 칸 유지');
  await zday(page, '토');
  await page.click('[data-edit="n048"]');
  await page.fill('#dStart', '12:30'); await page.fill('#dEnd', '2:00');
  await page.click('#dOk');
  await page.waitForFunction(() => document.querySelector('[data-cls="n048"]').textContent.includes('12:30~2:00'));
  ok(CFG[0].classes.find(c => c.id === 'n048').start === '12:30', '반 시간 고치기');
  await page.click('[data-edit="n048"]');
  await page.click('[data-dpart="진도"]'); await page.click('#dOk');
  await sleep(300);
  ok(CFG[0].classes.find(c => c.id === 'n048').part === '확인', '학생 있는 반은 진도·확인 못 바꿈');
  await page.click('#dCancel');
  await page.click('[data-edit="n048"]'); await page.click('#dDel');
  await page.waitForFunction(() => !document.querySelector('[data-cls="n048"]'));
  ok(STU.find(s => s.student === '한윤서').na === '' && !CFG[0].classes.some(c => c.id === 'n048'), '반 지우면 학생은 미배치');

  console.log('⑤ 메모 · 2안 · 비교');
  await page.fill('#memo', '확인은 주혜T 한 분'); await page.dispatchEvent('#memo', 'change');
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('메모'));
  ok(CFG[0].classes.find(c => c.id === '__meta').memo === '확인은 주혜T 한 분', '메모 저장');
  await page.click('#newBtn'); await page.click('#newCopy');
  await page.waitForFunction(() => document.querySelectorAll('#plans .pill').length === 2);
  ok(CFG.length === 2 && STU.filter(s => s.plan === '27고3-2').length === 5, '2안 = 1안 그대로 복사');
  ok(STU.find(s => s.plan === '27고3-2' && s.student === '가나').na === 'n017', '배치도 복사');
  ok((await txt(page, '#plans .pill.on')) === '2안' && !(await page.locator('#cmpCard').isHidden()), '2안으로 옮겨 가고 비교표가 보임');
  await zday(page, '목');
  await page.click('[data-cls="n017"] .chip[data-st="사아"]'); await zday(page, ''); await cls(page, 'n004').click();
  ok(await until(() => STU.find(s => s.plan === '27고3-2' && s.student === '사아').na === 'n004'), '2안에서 사아 확인 반 옮김');
  ok(STU.find(s => s.plan === '27고3-1' && s.student === '사아').na === 'n017', '2안을 바꿔도 1안은 그대로');
  ok((await txt(page, '#cmp')).includes('확인은 주혜T 한 분'), '비교표에 메모');
  await page.click('#cmp tr[data-plan="27고3-1"]');
  ok((await txt(page, '#plans .pill.on')) === '1안', '비교표 줄로 안 바꾸기');

  console.log('⑥ 다른 화면에서 바뀜');
  CFG[0].updated_at = ts();
  await zday(page, '목');
  await page.click('[data-edit="n017"]'); await page.fill('#dEnd', '7:30'); await page.click('#dOk');
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('다른 화면'));
  ok(CFG[0].classes.find(c => c.id === 'n017').end === '7:00', '옛 값으로 덮어쓰지 않음');
  await page.click('#dCancel');

  console.log('⑦ 표 복사 · 안 지우기 · 휴대폰');
  await page.click('#copyTbl');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip.split('\n')[0].startsWith('안\t구분') && clip.includes('1안\t확인\t목\t5:30~7:00\t현정T'), '표 복사(탭 구분)');
  await page.click('#plans [data-plan="27고3-2"]');
  await page.click('#delPlan');
  await page.waitForFunction(() => document.querySelectorAll('#plans .pill').length === 1);
  ok(CFG.length === 1 && !STU.some(s => s.plan === '27고3-2'), '2안 지우기(학생 줄도)');
  await ctx.close();
  ({ ctx, page } = await open('plan_g3.html', PARK, { viewport: { width: 390, height: 844 } }));
  await page.waitForSelector('.wk-mini');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), '휴대폰 가로 스크롤 없음(요일 칸은 상자 안에서)');
  if (process.env.SHOT){ await page.screenshot({ path: path.join(process.env.SHOT, 'plan-g3-phone.png'), fullPage: true }); }
  await ctx.close();
  ({ ctx, page } = await open('plan_g3.html', BOSS));
  await page.waitForSelector('.wk-mini');
  if (process.env.SHOT){ await page.screenshot({ path: path.join(process.env.SHOT, 'plan-g3-pc.png'), fullPage: true }); }
  await ctx.close();

  await browser.close(); server.close();
  console.log(bad ? `실패 ${bad} / ${n}` : `모두 통과 ${n}건`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
