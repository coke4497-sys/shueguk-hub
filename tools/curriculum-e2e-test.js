#!/usr/bin/env node
/* 슈국 운영 '전체 커리큘럼'(curriculum.html — 2026-10-25 원장님) 검증.
 *   NODE_PATH=$(npm root -g) node tools/curriculum-e2e-test.js
 * 가짜 수파베이스로 이번 주 카드·주 넘기기·학년별 1년 보기·편제표·원장님 고치기(선생님은 못 고침)·표 복사·휴대폰을 확인한다.
 * 시계는 2026-10-26(월) 12:00 한국 — 월요일이라 다가오는 수요일 10/28 주가 '이번 주'. */
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
const W = (grade, week, ga, na = '', note = '') => ({ year: 2026, grade, week, ga, na, note, updated_at: '2026-10-25T00:00:00Z', updated_by_name: '시트 옮김' });
const WEEKS = [
  W('중2', '2026-10-28', '[독서/과학기술] 인간의 면역 체계'),
  W('중2', '2026-10-21', '[독서/사회] 패놉티콘'),
  W('중3', '2026-10-28', '[비문학/예술] 미학 이론'),
  W('고1', '2026-10-28', '기말고사 대비 1주차', '과제집 마무리 검사'),
  W('고2', '2026-10-28', '과제집 마무리 검사', '1. 고전 산문 기출 분석 (3)'),
  W('고3', '2026-10-28', '파이널 10주 독서', '파이널 10주 문학', '정기고사·휴강 병기: 운영 확인'),
  W('고3', '2025-12-24', '기출 슈타트 독서 인문예술', '기출 슈타트 현대소설, 현대시')
];
const BOOKS = [
  { year: 2026, level: '고등', school: '화정고', ord: 2, term: '2-2', subject: '화법과 언어', publisher: '비상(이관규)', note: '' },
  { year: 2026, level: '고등', school: '능곡고', ord: 1, term: '1-1', subject: '공통국어1', publisher: '해냄에듀', note: '26학년도 변경' },
  { year: 2026, level: '고등', school: '능곡고', ord: 1, term: '', subject: '', publisher: '', note: '학교 메모' },
  { year: 2026, level: '중등', school: '화정중', ord: 1, term: '3학년', subject: '국어', publisher: '천재(박영목)', note: '2015개정' }
];
async function run(role){
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
  }).listen(0);
  const PORT = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => { try { sessionStorage.clear(); } catch (e) {} localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({
    access_token: 'tok', refresh_token: 'refresh-tok', expires_at: Math.floor(Date.now() / 1000) + 30 * 86400,
    user: { id: '11111111-1111-1111-1111-111111111111' } })); });
  const calls = [];
  const weeks = JSON.parse(JSON.stringify(WEEKS)), books = JSON.parse(JSON.stringify(BOOKS));
  await ctx.route('**/*', async route => {
    const req = route.request(), url = req.url();
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(obj) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (url.startsWith('http://127.0.0.1:' + PORT)) return route.continue();
    if (!url.startsWith(SB)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    const p = url.slice(SB.length);
    if (p.startsWith('/rest/v1/teacher_accounts')) return json([{ user_id: '11111111-1111-1111-1111-111111111111', login_id: role === 'admin' ? 'admin' : 'eunji', display_name: role === 'admin' ? '이수경' : '이은지', role, active: true }]);
    if (p.startsWith('/rest/v1/curriculum_weeks')) return json(weeks);
    if (p.startsWith('/rest/v1/curriculum_books')) return json(books);
    if (p.startsWith('/rest/v1/rpc/curriculum_set')){
      const b = JSON.parse(req.postData()); calls.push(['set', b]);
      const row = { year: b.p_year, grade: b.p_grade, week: b.p_week, ga: b.p_ga.trim(), na: b.p_na.trim(), note: b.p_note.trim(), updated_by_name: '이수경' };
      return json(row);
    }
    if (p.startsWith('/rest/v1/rpc/curriculum_book_set')){
      const b = JSON.parse(req.postData()); calls.push(['book', b]);
      return json({ year: b.p_year, level: b.p_level, school: b.p_school, ord: 9, term: b.p_term, subject: b.p_subject, publisher: b.p_publisher, note: b.p_note });
    }
    return json([]);
  });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(new Date('2026-10-26T03:00:00Z'));
  let perr = 0; pg.on('pageerror', e => { perr++; console.log('  ✗ pageerror', e.message); });
  await pg.goto('http://127.0.0.1:' + PORT + '/curriculum.html');
  try { await pg.waitForSelector('.gc', { timeout: 8000 }); } catch (e) { console.log('VIEW:', (await pg.content()).slice(0,400), await pg.evaluate(()=>document.documentElement.outerHTML.length)); throw e; }
  return { pg, calls, perr: () => perr, close: async () => { await browser.close(); server.close(); } };
}
(async () => {
  console.log('[선생님 계정]');
  let T = await run('teacher'), pg = T.pg;
  ok(/10\/28 \(수\) 주/.test(await pg.textContent('.wk')), '월요일엔 다가오는 수요일 주가 이번 주');
  ok((await pg.$$('.gc')).length === 5, '학년 카드 다섯(중2~고3, 중1 없음)');
  const g3 = await pg.textContent('.gc:nth-child(5)');
  ok(/파이널 10주 독서/.test(g3) && /파이널 10주 문학/.test(g3) && /운영 확인/.test(g3), '고3 가·나·메모');
  ok(await pg.$eval('.gc:nth-child(3) .part', e => e.classList.contains('exam')), '내신 대비 주는 노란 표시');
  ok(!(await pg.$('[data-wk="0"]')), '이번 주에는 [이번 주로] 없음');
  await pg.click('[data-wk="-7"]');
  ok(/10\/21/.test(await pg.textContent('.wk')) && /패놉티콘/.test(await pg.textContent('.gc:nth-child(1)')), '지난주로 넘기기');
  ok(/이 주에 적힌 커리큘럼이 없습니다/.test(await pg.textContent('.gc:nth-child(2)')), '빈 주 안내');
  await pg.click('[data-wk="0"]');
  ok(/10\/28/.test(await pg.textContent('.wk')), '[이번 주로]');
  ok(/보기 전용/.test(await pg.textContent('#who')), '선생님은 보기 전용 표시');
  await pg.click('#tabs button[data-t=grade]'); await pg.waitForSelector('.month');
  ok((await pg.$$('.month')).length === 13, '학년별 — 2025년 12월 ~ 2026년 12월 13달');
  ok(await pg.$('.row.now[data-w="2026-10-28"]'), '이번 주 줄 강조');
  ok(!(await pg.$('.row.edit')), '선생님 화면은 줄을 눌러 고치기 없음');
  ok(await pg.$('.colh.one'), '중2는 나 수업 열 없음');
  await pg.click('#gseg button[data-g="고3"]');
  ok(!(await pg.$('.colh.one')) && /기출 슈타트 현대소설/.test(await pg.textContent('[data-w="2025-12-24"]')), '고3 — 가·나 두 열, 12/24 줄');
  await pg.click('#btnCopy'); await pg.waitForTimeout(150);
  const clip = await pg.evaluate(() => navigator.clipboard.readText());
  ok(clip.split('\n').length === 3 && /^주\t가 수업\t나 수업\t메모/.test(clip), '표 복사(적힌 2주)');
  await pg.click('#tabs button[data-t=books]'); await pg.waitForSelector('table');
  const sc = await pg.$$eval('td.sc', a => a.map(e => e.childNodes[0].textContent));
  ok(JSON.stringify(sc) === '["능곡고","화정고"]', '편제표 학교 순서: ' + sc);
  ok(/학교 메모/.test(await pg.textContent('td.sc')) && /비상\(이관규\)/.test(await pg.textContent('table')), '학교 메모·출판사');
  ok(!(await pg.$('td.ed')) && !(await pg.$('#btnAddSchool')), '선생님은 편제표 고치기 없음');
  await pg.click('#lseg button[data-l="중등"]');
  ok(/천재\(박영목\)/.test(await pg.textContent('table')) && (await pg.$$('th')).length === 4, '중등 편제표 — 1~3학년');
  await pg.setViewportSize({ width: 390, height: 800 });
  await pg.click('#tabs button[data-t=grade]'); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '휴대폰 가로 넘침 없음');
  ok(T.perr() === 0, '페이지 오류 없음');
  await T.close();

  console.log('[원장님 계정]');
  T = await run('admin'); pg = T.pg;
  ok(/고칠 수 있습니다/.test(await pg.textContent('#who')), '원장님 표시');
  await pg.click('#tabs button[data-t=grade]'); await pg.waitForSelector('.row.edit');
  await pg.click('.row[data-w="2026-11-04"]');
  ok(!(await pg.$eval('#dlgBack', e => e.hidden)) && /중2 · 11\/4 \(수\) 주/.test(await pg.textContent('#dlgTitle')), '줄을 누르면 고치기 창');
  await pg.fill('#f_ga', '[고전시가] 우리의 옛 노래'); await pg.fill('#f_note', '확인');
  await pg.click('#dlgSave'); await pg.waitForTimeout(200);
  const c = T.calls.find(x => x[0] === 'set');
  ok(c && c[1].p_grade === '중2' && c[1].p_week === '2026-11-04' && c[1].p_year === 2026 && c[1].p_ga === '[고전시가] 우리의 옛 노래', 'curriculum_set 본문');
  ok(/우리의 옛 노래/.test(await pg.textContent('[data-w="2026-11-04"]')) && await pg.$eval('#dlgBack', e => e.hidden), '저장 뒤 화면 반영·창 닫힘');
  await pg.click('#tabs button[data-t=books]'); await pg.waitForSelector('td.ed');
  await pg.click('td.ed[data-s="화정고"][data-t="2-2"]');
  await pg.fill('#f_publisher', '비상(이관규) 개정');
  await pg.click('#dlgSave'); await pg.waitForTimeout(200);
  const b = T.calls.find(x => x[0] === 'book');
  ok(b && b[1].p_school === '화정고' && b[1].p_term === '2-2' && b[1].p_subject === '화법과 언어' && b[1].p_publisher === '비상(이관규) 개정', 'curriculum_book_set 본문(과목명 유지)');
  ok(/개정/.test(await pg.textContent('table')), '편제표 저장 뒤 반영');
  await pg.click('#btnAddSchool'); await pg.fill('#f_school', '능곡고'); await pg.click('#dlgSave'); await pg.waitForTimeout(150);
  ok(/이미 있는 학교/.test(await pg.textContent('#status')), '같은 학교는 추가 막음');
  await pg.fill('#f_school', '성사고'); await pg.click('#dlgSave'); await pg.waitForTimeout(200);
  ok(/성사고/.test(await pg.textContent('table')), '학교 추가');
  ok(T.perr() === 0, '페이지 오류 없음');
  await T.close();
  console.log(`\n${pass} 통과 · ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
