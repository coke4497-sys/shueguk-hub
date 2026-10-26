#!/usr/bin/env node
/* 슈국 운영 '전체 커리큘럼'(curriculum.html — 2026-10-25 원장님, 2026-10-26 디자인 개선안) 검증.
 *   NODE_PATH=$(npm root -g) node tools/curriculum-e2e-test.js
 * 가짜 수파베이스로 이번 주 비교 표·주 넘기기·수업 글 줄 나누기·휴대폰 두 보기, 학년별 위치 상자·57주 띠·내신 대비 묶음,
 * 편제표(지금 학기·휴대폰 학교 고르기), 원장님 고치기 창(내신 대비 주·저장 본문·닫기 확인), 선생님 보기 전용,
 * exam 열이 없는 DB(202610260001 전)의 짐작 표시를 확인한다. 시계는 2026-10-26(월) 12:00 한국 — 이번 주 = 10/28(48주차). */
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
const W = (grade, week, ga, na = '', note = '', exam = '') => ({ year: 2026, grade, week, ga, na, note, exam, updated_at: '2026-10-25T00:00:00Z', updated_by_name: '시트 옮김' });
const WEEKS = [
  W('중2', '2026-10-28', '[독서/과학기술] 비행기는 어떻게 날까'),
  W('중2', '2026-10-21', '[독서/사회] 패놉티콘'),
  W('중3', '2026-10-28', '문법-국어사 테스트와 풀이', '독서-이기적 유전자'),
  W('고1', '2026-10-28', '과제집 마무리 검사', '과제집 마무리 검사', '능곡고 기말 범위 공지 나오면 바로 반영'),
  W('고1', '2026-11-04', '기말고사 대비 1주차', '', '', '2학기 기말'),
  W('고1', '2026-11-11', '기말고사 대비 2주차', '', '', '2학기 기말'),
  W('고1', '2026-09-02', '중간고사 대비 2주차', '', '', '2학기 중간'),
  W('고2', '2026-10-28', '사회 지문 분석', '1. 고전 산문 기출 분석\n2024학년도 6월 모평: 미상, 상사동기\n2. 고전 소설 서술 방식 정리'),
  W('고3', '2026-10-28', '파이널 10주 독서', '파이널 10주 문학', '', '2학기 기말'),
  W('고3', '2025-12-24', '기출 슈타트 독서 인문예술', '기출 슈타트 현대소설, 현대시')
];
const BOOKS = [
  { year: 2026, level: '고등', school: '화정고', ord: 2, term: '2-2', subject: '화법과 언어', publisher: '비상(이관규)', note: '' },
  { year: 2026, level: '고등', school: '능곡고', ord: 1, term: '1-1', subject: '공통국어1', publisher: '해냄에듀', note: '26학년도 변경' },
  { year: 2026, level: '고등', school: '능곡고', ord: 1, term: '', subject: '', publisher: '', note: '학교 메모' },
  { year: 2026, level: '중등', school: '화정중', ord: 1, term: '3학년', subject: '국어', publisher: '천재(박영목)', note: '2015개정' }
];
async function run(role, opt = {}){
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
  }).listen(0);
  const PORT = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: opt.w || 1180, height: 900 } });
  await ctx.addInitScript(() => { try { sessionStorage.clear(); localStorage.removeItem('cur_mmode'); } catch (e) {} localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({
    access_token: 'tok', refresh_token: 'refresh-tok', expires_at: Math.floor(Date.now() / 1000) + 30 * 86400,
    user: { id: '11111111-1111-1111-1111-111111111111' } })); });
  const calls = [];
  let weeks = JSON.parse(JSON.stringify(WEEKS));
  if (opt.noExam) weeks = weeks.map(r => { const o = Object.assign({}, r); delete o.exam; return o; });
  const books = JSON.parse(JSON.stringify(BOOKS));
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
      if (opt.failSave) return json({ message: 'boom' }, 500);
      return json({ year: b.p_year, grade: b.p_grade, week: b.p_week, ga: b.p_ga.trim(), na: b.p_na.trim(), note: b.p_note.trim(), exam: b.p_exam != null ? b.p_exam : '', updated_by_name: '이수경' });
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
  await pg.waitForSelector('.wnav');
  return { pg, calls, perr: () => perr, close: async () => { await browser.close(); server.close(); } };
}
const txt = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();
(async () => {
  console.log('[선생님 계정 · 컴퓨터]');
  let T = await run('teacher'), pg = T.pg;
  ok(await txt(pg, '.wd') === '10월 28일 (수)', '월요일엔 다가오는 수요일 주 — 10월 28일 (수)');
  ok(/48주차 \/ 57주/.test(await txt(pg, '.wnav')), '48주차 / 57주');
  ok(await txt(pg, '.rel') === '이번 주' && await pg.$('.nowb.off'), '이번 주 꼬리표 · [이번 주로]는 눌리지 않는 상태');
  ok((await pg.$$('.cmp .gh')).length === 5, '비교 표 학년 머리 다섯(중1 없음)');
  ok(/가 독서 · 나 문학/.test(await txt(pg, '.cmp')) && /가 수업만/.test(await txt(pg, '.cmp')), '과목 안내');
  ok((await pg.$$('.cmp .xt')).length === 1 && /2학기 기말 대비/.test(await txt(pg, '.cmp .xt')), '그 주가 내신 대비인 학년만 분홍 꼬리표');
  ok(/나 수업 없음/.test(await txt(pg, '.cmp')), '중2 나 수업 없음');
  ok((await pg.$$('.cmp .ls .it')).length === 2 && (await pg.$$('.cmp .ls .ex')).length === 1, '1. 2.는 항목, 그 아래 줄은 설명');
  ok(/능곡고 기말 범위/.test(await txt(pg, '.cmp')), '메모 줄');
  const rowsSame = await pg.$$eval('.cmp > div', a => { const t = a.slice(6, 12).map(e => e.getBoundingClientRect().height); return t.every(h => Math.abs(h - t[0]) < 1); });
  ok(rowsSame, '같은 줄 칸은 같은 높이');
  await pg.click('[data-wk="-7"]');
  ok(/10월 21일/.test(await txt(pg, '.wd')) && await txt(pg, '.rel') === '지난 주' && !(await pg.$('.nowb.off')), '지난주로 — 지난 주 꼬리표·[이번 주로] 켜짐');
  await pg.click('[data-wk="0"]');
  ok(/10월 28일/.test(await txt(pg, '.wd')), '[이번 주로]');
  await pg.evaluate(() => { for (let i = 0; i < 60; i++) document.querySelector('[data-wk="-7"]') && !document.querySelector('[data-wk="-7"]').disabled && document.querySelector('[data-wk="-7"]').click(); });
  ok(/12월 3일/.test(await txt(pg, '.wd')) && await pg.$eval('[data-wk="-7"]', e => e.disabled), '맨 앞 주에서 더 넘어가지 않음');
  await pg.click('[data-wk="0"]');
  await pg.click('#tabs button[data-t=grade]'); await pg.waitForSelector('.pos');
  ok(await txt(pg, '.pos .big') === '48' && /\/ 57주/.test(await txt(pg, '.pos')), '위치 상자 48 / 57주');
  ok(/2학기 기말고사 대비까지 1주 남았어요 · 11.4부터/.test(await txt(pg, '.pos .msg')), '다음 내신 대비까지 남은 주');
  ok((await pg.$$('.strip button')).length === 57 && (await pg.$$('.strip button.now')).length === 1, '57주 띠 · 이번 주 칸 하나');
  ok((await pg.$$('.strip button.fx')).length === 2 && (await pg.$$('.strip button.px')).length === 1, '앞으로 내신 2칸 · 지난 내신 1칸');
  ok(/2학기 중간 9.2 – 9.2끝남/.test(await txt(pg, '.flow')) && /2학기 기말 11.4 – 11.11.*1주 뒤/.test(await txt(pg, '.flow')), '시험 흐름 꼬리표');
  ok(await pg.$('.yr.now[data-w="2026-10-28"] .ntag') && await pg.$('.yr.past[data-w="2026-10-21"]'), '이번 주 줄·지난 주 줄');
  ok(/2학기 기말고사 대비\s*11.4 – 11.11 · 2주/.test((await pg.$$eval('.exh', a => a.map(e => e.textContent))).join('|')) && await pg.$('.yr.ex.last[data-w="2026-11-11"]'), '내신 대비 묶음 머리 띠·마지막 줄');
  const top = await pg.$eval('#ylist', b => { const r = document.getElementById('w2026-10-28').getBoundingClientRect(), br = b.getBoundingClientRect(); return r.top - br.top; });
  ok(top > 60 && top < 260, '처음 열면 이번 주가 목록 위쪽(' + Math.round(top) + 'px)');
  ok(!(await pg.$('.yr.ed')) && !(await pg.$('.pen')) && !(await pg.$('.ahint')), '선생님은 고치기 없음');
  await pg.click('#gpills button[data-g="중2"]');
  ok(await pg.$('.ch.cols3') && !/나 수업/.test(await txt(pg, '.ch')), '중2는 나 수업 열 없음');
  await pg.click('#tabs button[data-t=books]'); await pg.waitForSelector('.bt');
  const sc = await pg.$$eval('.bt .sn', a => a.map(e => e.childNodes[0].textContent));
  ok(JSON.stringify(sc) === '["능곡고","화정고"]', '편제표 학교 순서: ' + sc);
  ok((await pg.$$('.bt .now-t')).length === 3, '2학기 열 셋에 지금 꼬리표');
  ok(/학교 메모/.test(await txt(pg, '.bt .sn')) && await pg.$('.bt .pb') && /26학년도 변경/.test(await txt(pg, '.bt')), '학교 메모·출판사 꼬리표·특이사항');
  ok(!(await pg.$('.bt .ed')) && !(await pg.$('#btnAddSchool')), '선생님은 편제표 고치기 없음');
  await pg.click('#lpills button[data-l="중등"]');
  ok(/천재\(박영목\)/.test(await txt(pg, '.bt')) && /12개교|1개교/.test(await txt(pg, '#lpills')), '중등 편제표');
  ok(T.perr() === 0, '페이지 오류 없음');
  await T.close();

  console.log('[선생님 계정 · 휴대폰]');
  T = await run('teacher', { w: 390 }); pg = T.pg;
  ok(await pg.$('.mtog') && (await pg.$$('.mc')).length === 5, '학년 묶음 카드 다섯');
  await pg.click('#mtog button[data-m="수업"]');
  ok((await pg.$$('.mc')).length === 3 && /가 수업/.test(await txt(pg, '.mc')), '수업 묶음(가·나·메모)');
  ok(await pg.evaluate(() => localStorage.getItem('cur_mmode')) === '수업', '마지막 보기 기억');
  await pg.click('#tabs button[data-t=grade]'); await pg.waitForSelector('.ycards');
  ok(await pg.$('.yc.now') && (await pg.$$('.exm')).length >= 1, '주 카드·내신 묶음 띠');
  await pg.click('#tabs button[data-t=books]'); await pg.waitForSelector('#spills');
  await pg.click('#spills button[data-s="화정고"]');
  ok(/화정고/.test(await txt(pg, '.scard .st')) && (await pg.$$('.srow')).length === 6, '학교 알약 → 학기 여섯 줄');
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '휴대폰 가로 넘침 없음');
  ok(T.perr() === 0, '페이지 오류 없음');
  await T.close();

  console.log('[원장님 계정]');
  T = await run('admin'); pg = T.pg;
  await pg.click('#tabs button[data-t=grade]'); await pg.waitForSelector('.yr.ed');
  ok(await pg.$('.ahint') && await pg.$('.yr .pen'), '원장님 안내·연필');
  await pg.click('.yr[data-w="2026-11-18"]');
  ok(!(await pg.$eval('#dlgBack', e => e.hidden)) && /11월 18일 \(수\) 수업 고치기/.test(await txt(pg, '#dlgTitle')) && /고1 · 51주차/.test(await txt(pg, '#dlgSub')), '고치기 창 머리');
  ok((await pg.$$('#xp button')).length === 5 && await txt(pg, '#xp button.on') === '없음', '내신 대비 주 알약 다섯(지금 없음)');
  await pg.click('#xp button[data-x="2학기 기말"]');
  await pg.fill('#f_ga', '1. 교과서 본문 정리\n학교별 기출'); await pg.fill('#f_note', '확인');
  pg.once('dialog', d => d.dismiss());
  await pg.click('#dlgCancel');
  ok(!(await pg.$eval('#dlgBack', e => e.hidden)), '고친 내용이 있으면 닫기 전에 묻고, 취소하면 그대로');
  await pg.click('#dlgSave'); await pg.waitForTimeout(200);
  const c = T.calls.find(x => x[0] === 'set');
  ok(c && c[1].p_week === '2026-11-18' && c[1].p_grade === '고1' && c[1].p_exam === '2학기 기말' && /교과서 본문/.test(c[1].p_ga), 'curriculum_set 본문(p_exam 포함)');
  ok(await pg.$eval('#dlgBack', e => e.hidden) && await pg.$('.yr.ex[data-w="2026-11-18"]') && /11.4 – 11.18 · 3주/.test((await pg.$$eval('.exh', a => a.map(e => e.textContent))).join('|')), '저장 뒤 내신 묶음이 3주로');
  await pg.click('#tabs button[data-t=books]'); await pg.waitForSelector('.bt .ed');
  await pg.click('.bt .ed[data-s="화정고"][data-t="2-2"]');
  await pg.fill('#f_publisher', '비상(이관규) 개정'); await pg.click('#dlgSave'); await pg.waitForTimeout(200);
  const b = T.calls.find(x => x[0] === 'book');
  ok(b && b[1].p_school === '화정고' && b[1].p_term === '2-2' && b[1].p_subject === '화법과 언어', 'curriculum_book_set 본문(과목명 유지)');
  ok(/개정/.test(await txt(pg, '.bt')), '편제표 저장 뒤 반영');
  await pg.click('#btnAddSchool'); await pg.fill('#f_school', '능곡고'); await pg.click('#dlgSave'); await pg.waitForTimeout(150);
  ok(/이미 있는 학교/.test(await txt(pg, '#dlgErr')), '같은 학교는 창 안에 오류');
  await pg.fill('#f_school', '성사고'); await pg.click('#dlgSave'); await pg.waitForTimeout(200);
  ok(/성사고/.test(await txt(pg, '.bt')), '학교 추가');
  ok(T.perr() === 0, '페이지 오류 없음');
  await T.close();

  console.log('[저장 실패 · exam 열 없는 DB]');
  T = await run('admin', { failSave: true }); pg = T.pg;
  await pg.click('#tabs button[data-t=grade]'); await pg.waitForSelector('.yr.ed');
  await pg.click('.yr[data-w="2026-11-25"]'); await pg.fill('#f_ga', 'x'); await pg.click('#dlgSave'); await pg.waitForTimeout(200);
  ok(!(await pg.$eval('#dlgBack', e => e.hidden)) && /저장하지 못했습니다/.test(await txt(pg, '#dlgErr')) && await txt(pg, '#dlgSave') === '저장', '실패하면 창은 그대로·오류 표시');
  await T.close();
  T = await run('admin', { noExam: true }); pg = T.pg;
  ok((await pg.$$('.cmp .xt')).length === 0, 'exam 열이 없으면 글로 짐작 — 이번 주 글에는 고사 대비가 없어 꼬리표 없음');
  await pg.click('#tabs button[data-t=grade]'); await pg.waitForSelector('.yr.ed');
  ok(await pg.$('.yr.ex[data-w="2026-11-04"]') && await pg.$('.yr.ex[data-w="2026-09-02"]'), '‘기말고사 대비’ 글로 내신 묶음');
  await pg.click('.yr[data-w="2026-11-25"]');
  ok(!(await pg.$('#xp')), 'exam 열이 없으면 내신 대비 알약 숨김');
  await pg.fill('#f_ga', 'y'); await pg.click('#dlgSave'); await pg.waitForTimeout(200);
  ok(!('p_exam' in T.calls.find(x => x[0] === 'set')[1]), 'p_exam 없이 저장');
  ok(T.perr() === 0, '페이지 오류 없음');
  await T.close();
  console.log(`\n${pass} 통과 · ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
