#!/usr/bin/env node
/* 2027 예상 고1 시간표(plan_g1.html — 2026-10-24 슈국 스케쥴 [27 예상]에서 옮김, 052·053)
 *   NODE_PATH=$(npm root -g) node tools/plan-g1-e2e-test.js
 * ① 반 고정 배치: 선생님마다 가 7 + 나 7, 요일마다 선생님별 가·나 둘 다, 같은 시간 강의실 3실 이하
 * ② 원장님(role admin)에게만 탭이 보이고, 다른 선생님은 숨김(새로고침으로 p27이 남아 있으면 오늘로)
 * ③ 지금 중3 명단(정규, 괄호 뗀 이름)이 미배치 학생으로 뜨고, 저장된 배치가 반 카드에 놓인다
 * ④ 학생 → 반 클릭 = 가/나 자리에 놓고 tt_plan_students upsert(작성자 포함), 옮기기·빼기·계획에서 빼기·되돌리기
 * ⑤ 경고(선생님 다름 점, 정원 초과), 선생님 거르기, 이름 찾기(입력 중 다시 그리지 않음), 신입 넣기, 052 전 안내 */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : 'text/html') + ';charset=utf-8' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const port = srv.address().port;
const kst = new Date(Date.now() + 9 * 3600e3);
const todayDay = ['일','월','화','수','목','금','토'][kst.getUTCDay()];
const CLASSES = [
  { class_id: 'r01', book: '정규', day: todayDay, start_time: '5:30', end_time: '7:00', location: '본원', teacher: '현정', name: '고2 가', roster: '가나', kind: '' },
  { class_id: 'r040', book: '정규', day: '토', start_time: '11:00', end_time: '1:00', location: '본원', teacher: '승연', name: '정리정독 중3', roster: '김하나 (화정)박둘 이셋(1/3부터)', kind: '' },
  { class_id: 'r047', book: '정규', day: '일', start_time: '11:00', end_time: '1:00', location: '본원', teacher: '선주', name: '정리정독 중3', roster: '최넷 정다섯A', kind: '' }
];
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  // ① 고정 배치 검사 — 페이지 스크립트에서 상수만 떼어 계산
  const src = fs.readFileSync(path.join(ROOT, 'plan_g1.html'), 'utf8');
  const blk = src.slice(src.indexOf('var P27_PLAN'), src.indexOf('var p27Admin'));
  const ctx0 = {}; new Function('ctx', blk + '; ctx.C = P27_CLASSES; ctx.S = P27_SLOTS;')(ctx0);
  const C = ctx0.C;
  ok('① 반 36개', C.length === 36, C.length);
  ['승연','지원','사명'].forEach(t => {
    const mine = C.filter(c => c.teacher === t);
    ok('① ' + t + ' 가 6 + 나 6', mine.filter(c => c.part === '가').length === 6 && mine.filter(c => c.part === '나').length === 6);
    ['수','목','금','토','일'].forEach(d => {
      const p = mine.filter(c => c.day === d).map(c => c.part);
      if (p.length) ok('① ' + t + ' ' + d + ' 가·나 둘 다', p.includes('가') && p.includes('나'), p.join(''));
    });
  });
  ['수','목','금'].forEach(d => {
    const p = C.filter(c => c.day === d);
    ok('① ' + d + ' 가 2 + 나 2', p.filter(c => c.part === '가').length === 2 && p.filter(c => c.part === '나').length === 2);
    [...new Set(p.map(c => c.start))].forEach(st => {
      const q = p.filter(c => c.start === st).map(c => c.part);
      ok('① ' + d + st + ' 가·나 섞임', q.includes('가') && q.includes('나'), q.join(''));
    });
  });
  ok('① 토 4:30 가 둘(승연·지원)', C.filter(c => c.day === '토' && c.start === '4:30' && c.part === '가').map(c => c.teacher).join() === '지원,승연');
  ok('① 쉬는 선생님 수 승연·목 사명·금 지원', !C.some(c => (c.day === '수' && c.teacher === '승연') || (c.day === '목' && c.teacher === '사명') || (c.day === '금' && c.teacher === '지원')));
  const slotN = {}; C.forEach(c => { const k = c.day + c.start; slotN[k] = (slotN[k] || 0) + 1; });
  ok('① 같은 시간 3실 이하', Object.values(slotN).every(n => n <= 3));
  const sat = C.filter(c => c.day === '토'), sun = C.filter(c => c.day === '일');
  ok('① 토·일 같은 시간 가·나 뒤집기', sat.every(a => sun.find(b => b.start === a.start && b.teacher === a.teacher).part !== a.part));
  ok('① 주말 시간 11:00·1:30·4:30·7:00', JSON.stringify([...new Set(sat.map(c => c.start))]) === '["11:00","1:30","4:30","7:00"]');

  const b = await chromium.launch();
  async function open(opts){
    opts = opts || {};
    const ups = [], cfgs = [];
    const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, timezoneId: 'Asia/Seoul' });
    await ctx.route(/fonts\.g/, r => r.abort());
    await ctx.route(/script\.google\.com|googleusercontent/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"result":"success"}' }));
    await ctx.route(/supabase\.co/, r => {
      const req = r.request(), u = req.url(), m = req.method();
      const json = (x, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: typeof x === 'string' ? x : JSON.stringify(x) });
      if (/\/auth\/v1\/token/.test(u)) return json({ access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u' } });
      if (/teacher_accounts/.test(u)) return json([{ user_id: 'u1', display_name: opts.dn || '이수경', login_id: opts.login || 'shue', role: opts.role || 'admin', active: true }]);
      if (/usage_tick/.test(u)) return json(true);
      if (/tt_plan_students/.test(u)){
        if (opts.missing) return json({ code: 'PGRST205', message: "Could not find the table 'public.tt_plan_students'" }, 404);
        if (m === 'POST'){ ups.push({ url: u, method: 'POST', prefer: req.headers()['prefer'], body: JSON.parse(req.postData()) }); return json('', opts.saveFail ? 500 : 201); }
        if (m === 'PATCH'){ ups.push({ url: u, method: 'PATCH', prefer: req.headers()['prefer'], body: [JSON.parse(req.postData())] }); return json('', opts.saveFail ? 500 : 204); }
        return json(opts.plan || []);
      }
      if (/tt_plan_config/.test(u)){
        if (opts.cfgMissing) return json({ code: 'PGRST205' }, 404);
        if (m === 'POST'){ cfgs.push({ url: u, prefer: req.headers()['prefer'], body: JSON.parse(req.postData()) }); return json('', 201); }
        return json(opts.cfg ? [opts.cfg] : []);
      }
      if (/tt_plan_log/.test(u)) return json(opts.log || []);
      if (m !== 'GET') return json('[]', 201);
      if (/\/tt_classes/.test(u)) return json(/class_id=not\.like/.test(u) && /roster/.test(u) && /select=class_id,day/.test(u) ? CLASSES.filter(c => c.book === '정규') : CLASSES);
      if (/\/students/.test(u)) return json([{ name: '김하나', school: '화정중', grade: '중3' }, { name: '박둘', school: '화정중', grade: '중3' }, { name: '정다섯', school: '화수중', grade: '중3' }]);
      return json([]);
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => { fail++; console.log('  ✗ 페이지 오류 ' + e.message); });
    await page.addInitScript(m => {
      localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
    }, opts.mode || 'today');
    await page.goto('http://127.0.0.1:' + port + '/plan_g1.html');
    await page.waitForTimeout(1500);
    return { page, ctx, ups, cfgs };
  }

  // ② 다른 선생님 — 막힘
  let { page, ctx } = await open({ role: 'teacher' });
  ok('② 선생님 계정은 볼 수 없음', /원장님·대표님 계정에서만/.test(await page.$eval('#host', e => e.textContent)) && !(await page.$('.p27-ov')));
  await ctx.close();

  ({ page, ctx } = await open({ role: 'teacher', login: 'parkeh', dn: '박언호' }));
  await page.waitForSelector('.p27-ov');
  ok('② 박언호 대표님(선생님 역할)은 보임', !!(await page.$('.p27-ov')));
  ok('② 제목 = 2027 예상 고1 시간표', /2027 예상 고1 시간표/.test(await page.$eval('.p27-title', e => e.textContent)));
  await ctx.close();
  // ③ 원장님
  let o = await open({ plan: [{ student: '최넷', school: '백양중', src: '', ga: '수5:30-사명', na: '', excluded: false }] });
  page = o.page; ctx = o.ctx;
  await page.waitForSelector('.p27-ov');
  ok('③ 반 카드 36개', (await page.$$('.p27-card')).length === 36);
  ok('③ 요일 열 5개', (await page.$$eval('.p27-dayh', e => e.map(x => x.textContent))).join('') === '수목금토일');
  const trayText = await page.$eval('.p27-trays', e => e.textContent);
  ok('③ 괄호 뗀 이름으로 미배치', /김하나/.test(trayText) && /박둘/.test(trayText) && /이셋/.test(trayText) && !/\(/.test(trayText.replace(/\([^)]*\)/g, m => /부터|화정/.test(m) ? m : '')), trayText.slice(0, 200));
  ok('③ 지금 반 묶음 표기', /토 11:00 승연T/.test(trayText));
  ok('③ 저장된 가 배치가 카드에', await page.$eval('[data-p27c="수5:30-사명"]', e => /최넷/.test(e.textContent) && /1\/9/.test(e.textContent)));
  { const ts = await page.$$eval('.p27-tcard', e => e.map(x => x.textContent.replace(/\s+/g, ' ')));
    ok('⑥ 선생님별 인원 카드 셋(지원·승연·사명 순)', ts.length === 3 && /김지원T/.test(ts[0]) && /이승연T/.test(ts[1]) && /김사명T/.test(ts[2]), JSON.stringify(ts));
    ok('⑥ 사명T 가 1명(최넷)·나 0명', /가1명 반 1\/6/.test(ts[2]) && /나0명/.test(ts[2]) && /합계 1명/.test(ts[2]), ts[2]); }
  ok('③ 요약: 대상 5명', /5명 대상/.test(await page.$eval('.p27-sum', e => e.textContent)));

  // ④ 배치
  await page.click('.p27-tray [data-p27s="김하나"]');
  ok('④ 선택 띠', /김하나/.test(await page.$eval('.p27-selbar', e => e.textContent)));
  ok('④ 반 카드가 놓을 자리로', (await page.$$('.p27-card.target')).length === 36);
  await page.click('[data-p27c="토11:00-승연"]'); await page.waitForTimeout(200);
  ok('④ 가 반에 놓임', await page.$eval('[data-p27c="토11:00-승연"]', e => /김하나/.test(e.textContent)));
  const u1 = o.ups[o.ups.length - 1];
  ok('④ upsert 본문', u1 && /on_conflict=plan,student/.test(u1.url) && /merge-duplicates/.test(u1.prefer) && u1.body[0].plan === '2027' && u1.body[0].student === '김하나' && u1.body[0].ga === '토11:00-승연' && u1.body[0].na === '' && u1.body[0].school === '화정중' && u1.body[0].src === '토 11:00 승연T', JSON.stringify(u1));
  ok('④ 작성자 실림', u1 && u1.body[0].author === '이수경', u1 && u1.body[0].author);
  // 나 반 — 다른 선생님 → 점
  await page.click('.p27-card [data-p27s="김하나"]');
  await page.click('[data-p27c="토11:00-지원"]'); await page.waitForTimeout(200);
  { const L = o.ups[o.ups.length - 1];
    ok('④ 나 반에 놓임 — 저장된 줄은 바꾼 칸만 PATCH(가는 안 보냄)', L.method === 'PATCH' && /plan=eq\.2027&student=eq\./.test(L.url) && L.body[0].na === '토11:00-지원' && !('ga' in L.body[0]) && L.body[0].author === '이수경', JSON.stringify(L)); }
  ok('⑤ 가·나 선생님 다름 점', await page.$eval('[data-p27c="토11:00-지원"] [data-p27s="김하나"]', e => !!e.querySelector('.p27-dot')));
  // 옮기기
  await page.click('[data-p27c="토11:00-승연"] [data-p27s="김하나"]');
  await page.click('[data-p27c="수5:30-사명"]'); await page.waitForTimeout(200);
  ok('④ 다른 가 반으로 옮김', await page.$eval('[data-p27c="수5:30-사명"]', e => /김하나/.test(e.textContent)) && !(await page.$eval('[data-p27c="토11:00-승연"]', e => /김하나/.test(e.textContent))));
  // 빼기
  await page.click('[data-p27c="수5:30-사명"] [data-p27s="김하나"]');
  await page.click('[data-p27x="na"]'); await page.waitForTimeout(200);
  ok('④ 나에서 빼기', o.ups[o.ups.length - 1].body[0].na === '' && /김하나/.test(await page.$eval('.p27-trays', e => e.textContent)));
  // 계획에서 빼기 / 되돌리기
  await page.click('.p27-tray [data-p27s="박둘"]');
  await page.click('[data-p27x="out"]'); await page.waitForTimeout(200);
  ok('④ 계획에서 빼기', o.ups[o.ups.length - 1].body[0].excluded === true && !/박둘/.test(await page.$eval('.p27-trays', e => e.textContent)));
  await page.click('#p27-outtog'); await page.click('[data-p27r="박둘"]'); await page.waitForTimeout(200);
  ok('④ 되돌리기', o.ups[o.ups.length - 1].body[0].excluded === false && /박둘/.test(await page.$eval('.p27-trays', e => e.textContent)));
  // ⑤ 거르기·찾기
  await page.click('[data-p27t="사명"]');
  ok('⑤ 선생님 거르기 12반', (await page.$$('.p27-card')).length === 12);
  await page.click('[data-p27t="all"]');
  await page.fill('#p27-q', '정다');
  { const hs = await page.$$eval('.p27-chip.hit', e => e.map(x => x.textContent)); ok('⑤ 이름 찾기 강조', hs.length >= 1 && hs.every(x => /정다섯A/.test(x)), JSON.stringify(hs)); }
  const same = await page.evaluate(() => { const i = document.getElementById('p27-q'); i.dataset.k = '1'; i.dispatchEvent(new Event('input')); return document.getElementById('p27-q').dataset.k === '1'; });
  ok('⑤ 입력 중 입력칸을 다시 만들지 않음', same);
  // 정원 초과
  await page.evaluate(() => { for (let i = 0; i < 9; i++) P27.st['가짜' + i] = { name: '가짜' + i, school: '', src: '신입', ga: '목5:30-지원', na: '', excluded: false }; render(); });
  ok('⑤ 정원 초과 표시', await page.$eval('[data-p27c="목5:30-지원"] .p27-cnt', e => e.classList.contains('over') && e.textContent === '9/9') === false
     && await page.$eval('[data-p27c="목5:30-지원"] .p27-cnt', e => e.textContent) === '9/9');
  await page.evaluate(() => { P27.st['가짜9'] = { name: '가짜9', school: '', src: '신입', ga: '목5:30-지원', na: '', excluded: false }; render(); });
  ok('⑤ 10명이면 빨강', await page.$eval('[data-p27c="목5:30-지원"] .p27-cnt', e => e.classList.contains('over')));
  ok('⑤ 요약 정원 넘은 반 1', /정원\(9명\) 넘은 반 1/.test(await page.$eval('.p27-sum', e => e.textContent)));
  // 신입 넣기
  await page.fill('#p27-add-n', '한신입'); await page.fill('#p27-add-s', '지도중'); await page.click('#p27-add button');
  await page.waitForTimeout(200);
  const ln = o.ups[o.ups.length - 1].body[0];
  ok('⑤ 신입 넣기 저장 + 선택', ln.student === '한신입' && ln.school === '지도중' && ln.src === '신입' && /한신입/.test(await page.$eval('.p27-selbar', e => e.textContent)), JSON.stringify(ln));
  // 휴대폰 폭 — 가로 스크롤 없음
  await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(300);
  ok('⑤ 휴대폰 가로 넘침 없음', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await ctx.close();

  // ⑦ 학생 반 신청(053) — 열기·마감·기록
  o = await open({ mode: 'p27', log: [{ at: '2026-10-17T09:05:00Z', student: '김하나', part: '나', from_cls: '', to_cls: '토1:30-승연', by: '학생 신청' }] });
  await o.page.waitForSelector('.p27-ov');
  ok('⑦ 처음엔 닫힘', /닫힘/.test(await o.page.$eval('.p27-sign', e => e.textContent)) && /학생 신청 받기 시작/.test(await o.page.$eval('[data-p27open]', e => e.textContent)));
  o.page.once('dialog', d => d.accept());
  await o.page.click('[data-p27open="1"]'); await o.page.waitForTimeout(300);
  { const c = o.cfgs[o.cfgs.length - 1];
    ok('⑦ 열기 저장 — 반 36개·정원 9·작성자', c && /on_conflict=plan/.test(c.url) && c.body[0].open === true && c.body[0].cap === 9 && c.body[0].classes.length === 36
       && c.body[0].classes.some(x => x.id === '토4:30-지원' && x.part === '가' && x.m === 990 && x.day === '토') && c.body[0].author === '이수경', c && JSON.stringify(c.body[0]).slice(0, 200)); }
  ok('⑦ 받는 중 표시·마감 버튼', /받는 중/.test(await o.page.$eval('.p27-sign', e => e.textContent)) && /신청 마감/.test(await o.page.$eval('[data-p27open]', e => e.textContent)));
  o.page.once('dialog', d => d.dismiss());
  await o.page.click('[data-p27open="0"]'); await o.page.waitForTimeout(200);
  ok('⑦ 마감 확인 창 취소면 저장 안 함', o.cfgs.length === 1);
  await o.page.click('#p27-logtog');
  ok('⑦ 최근 학생 신청 기록', /김하나/.test(await o.page.$eval('.p27-log', e => e.textContent)) && /10\/17 18:05/.test(await o.page.$eval('.p27-log', e => e.textContent)) && /토 1:30 이승연T 나/.test(await o.page.$eval('.p27-log', e => e.textContent)));
  await o.ctx.close();
  o = await open({ mode: 'p27', cfgMissing: true });
  await o.page.waitForSelector('.p27-ov');
  ok('⑦ 053 전 안내', /053/.test(await o.page.$eval('.p27-sign', e => e.textContent)) && !(await o.page.$('[data-p27open]')));
  await o.ctx.close();

  // 052 전
  o = await open({ missing: true, mode: 'p27' });
  await o.page.waitForSelector('.p27-ov');
  ok('⑤ 052 전 안내', /052/.test(await o.page.$eval('.p27-warn', e => e.textContent)));
  await o.page.click('.p27-tray [data-p27s="김하나"]'); await o.page.click('[data-p27c="수5:30-사명"]'); await o.page.waitForTimeout(200);
  ok('⑤ 052 전 저장 안 함 안내', /052/.test(await o.page.$eval('#status', e => e.textContent)));
  await o.ctx.close();
  // 저장 실패 → 되돌림
  o = await open({ saveFail: true, mode: 'p27' });
  await o.page.waitForSelector('.p27-ov');
  await o.page.click('.p27-tray [data-p27s="김하나"]'); await o.page.click('[data-p27c="수5:30-사명"]'); await o.page.waitForTimeout(400);
  ok('⑤ 저장 실패면 되돌림', !(await o.page.$eval('[data-p27c="수5:30-사명"]', e => /김하나/.test(e.textContent))) && /저장하지 못했/.test(await o.page.$eval('#status', e => e.textContent)));
  await o.ctx.close();

  await b.close(); srv.close();
  console.log((fail ? '실패 ' + fail + ' / ' : '') + '통과 ' + pass);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
