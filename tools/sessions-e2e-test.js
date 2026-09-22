#!/usr/bin/env node
/* 월별 수업 회차(sessions.html) 브라우저 E2E (2026-09-20)
 * 가짜 수파베이스(교사 인증·표 응답)로 실제 페이지를 띄워 교사 헤더·타일·표(정규/내신/합계/강조)·
 * 보기 전환(전체/학년/학교/개인)·강조만 보기·표 복사(TSV)·CSV·달 이동·kind 열 없는 DB 폴백을 검사한다.
 *   실행: NODE_PATH=$(npm root -g) node tools/sessions-e2e-test.js
 * 원격 수파베이스에는 아무것도 보내지 않는다. 집계 규칙 자체는 tools/sessions-test.js 가 검사한다. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), PORT = 8941, SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let n = 0, bad = 0;
function ok(cond, label){ n++; if (!cond){ bad++; console.error('  ✗', label); } else console.log('  ✓', label); }

function cls(book, id, day, start, name, roster, kind){ return { book, class_id: id, day, start_time: start, end_time: '', teacher: '', name, roster, kind: kind || '' }; }
const DB = {
  tt_period: [{ week_wednesday: '2026-09-30', book: '내신' }, { week_wednesday: '2026-10-07', book: '내신' }, { week_wednesday: '2026-10-28', book: '내신' }, { week_wednesday: '2026-11-04', book: '내신' }],
  students: [
    { name: '강준서', school: '화정고', grade: '2026 고등 1학년', enrolled: '재원' },
    { name: '이소율', school: '무원고', grade: '2026 고등 1학년', enrolled: '재원' },
    { name: '김건', school: '서정중', grade: '2026 중등 2학년', enrolled: '재원' },
    { name: '유채아', school: '고양중', grade: '2026 중등 2학년', enrolled: '재원' },
    { name: '박민선', school: '성사고', grade: '2026 고등 3학년', enrolled: '재원' }
  ],
  tt_classes: [
    cls('정규', 'r1', '수', '5:30', '고1 가', '강준서 이소율'), cls('정규', 'r2', '토', '3:30', '고1 나', '강준서 이소율'),
    cls('정규', 'r3', '토', '4:30', '정리정독 중2', '김건 유채아'), cls('정규', 'r4', '목', '5:30', '고3파이널A', '박민선'),
    cls('정규', 'w261012b', '월', '1:30', '고1 화정B', '', '직보'),
    cls('내신', 'n1', '목', '5:30', '고1 화정B(천재수)', '강준서'), cls('내신', 'n2', '토', '3:30', '고1 확인', '강준서 이소율'),
    cls('내신', 'n3', '금', '5:00', '중2 화정A', '김건'), cls('내신', 'n4', '목', '5:30', '고3파이널A', '박민선'),
    cls('정규', 'r9', '일', '6:00', '논술B 국어', '박민선'), cls('내신', 'n9', '일', '6:00', '논술B 국어', '박민선'),
    cls('정규', 'w261025a', '일', '3:30', '고1 나', ''),  // r2 10/17 수업을 10/25(일)로 옮긴 복사본
    cls('내신', 'w261029b', '목', '7:00', '고1 직보', '이소율', '직보'),   // 이소율 10/31 확인의 실제 진행(직보) — 한 번만
    cls('정규', 'w261016a', '금', '7:00', '중2 화정A', ''), cls('정규', 'w261023b', '금', '7:00', '중2 화정A', ''),   // 김건 n3 10/30 수업을 10/16·10/23 두 번에 나눠 진행
    cls('정규', 'w261012d', '월', '2:00', '고3파이널A', '', '직보')   // 박민선 r4 10/15 수업을 옮겨 만든 직보 — 원본이 숨어 1:1(칩이 남는다)
  ],
  tt_log: [
    { id: 1, at: '2026-09-20T03:00:00Z', kind: '주간반휴강', student: '', from_class_id: 'n3', to_class_id: '', reason: '', apply_date: '2026-10-09' },
    { id: 2, at: '2026-09-20T03:00:00Z', kind: '주간추가', student: '강준서', from_class_id: '', to_class_id: 'w261012b', reason: '', apply_date: '2026-10-12' },
    { id: 3, at: '2026-09-20T03:00:00Z', kind: '주간반이동', student: '', from_class_id: 'r2', to_class_id: 'w261025a', reason: '', apply_date: '2026-10-17' },
    { id: 4, at: '2026-09-20T04:00:00Z', kind: '주간추가', student: '이소율', from_class_id: '', to_class_id: 'r2', reason: '', apply_date: '2026-10-24' },   // 다른 주로 옮기기 짝
    { id: 5, at: '2026-09-20T04:00:01Z', kind: '주간빼기', student: '이소율', from_class_id: 'r1', to_class_id: '', reason: '', apply_date: '2026-10-21' },
    { id: 9, at: '2026-09-20T05:00:00Z', kind: '주간빼기', student: '이소율', from_class_id: 'n2', to_class_id: '', reason: '직전 보강 대체', apply_date: '2026-10-31' },   // 짝 없는 빼기(이웃 id 아님)
    { id: 11, at: '2026-09-20T06:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n3', to_class_id: 'w261016a', reason: '10/30(금) 수업 앞당겨 진행 1/2', apply_date: '2026-10-16' },
    { id: 12, at: '2026-09-20T06:00:00Z', kind: '주간반이동', student: '', from_class_id: 'n3', to_class_id: 'w261023b', reason: '10/30(금) 수업 앞당겨 진행 2/2', apply_date: '2026-10-30' },
    { id: 13, at: '2026-09-20T06:00:00Z', kind: '주간반이동', student: '', from_class_id: 'r4', to_class_id: 'w261012d', reason: '시험 대비 직보', apply_date: '2026-10-15' }
  ]
};
/* 강준서(고1 주2회, 10/7~11/6): n1 10/8·10/29·11/5(3) + n2 10/10·10/31(2) + r1 10/14·10/21 + r2 10/17·10/24 = 9
 * 10/12 직보(주간추가로 만든 새 반)는 그 주(10/14~10/20) 수업의 진행이라 따로 세지 않는다 — 2026-09-22 규칙 / 이소율 = 6 */

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
    if (!fs.existsSync(f)){ res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: 'ko-KR' });
  const reqs = [], authHdrs = [];
  let kindCol = true;
  await ctx.route('**/*', async route => {
    const req = route.request(), url = req.url();
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' }, body: JSON.stringify(obj) });
    if (url.startsWith(SB + '/auth/v1/token')) return json({ access_token: 'TEACHER_TOKEN', expires_in: 3600 });
    if (url.startsWith(SB + '/rest/v1/')){
      reqs.push(url); authHdrs.push(req.headers()['authorization']);
      const u = new URL(url), tbl = u.pathname.replace('/rest/v1/', ''), sel = u.searchParams.get('select') || '';
      const off = +(u.searchParams.get('offset') || 0), lim = +(u.searchParams.get('limit') || 1000);
      if (tbl === 'tt_classes' && !kindCol && /,kind/.test(sel)) return json({ code: '42703', message: 'column tt_classes.kind does not exist' }, 400);
      let rows = DB[tbl] || [];
      if (tbl === 'tt_log'){ const k = /kind=in\.\(([^)]*)\)/.exec(decodeURIComponent(u.search)); if (k){ const ks = k[1].split(','); rows = rows.filter(r => ks.includes(r.kind)); } }
      return json(rows.slice(off, off + lim));
    }
    if (url.includes('fonts.g')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.continue();
  });
  const pg = await ctx.newPage();
  const errors = []; pg.on('pageerror', e => errors.push(String(e)));
  await pg.goto(`http://localhost:${PORT}/sessions.html?m=2026-10`);
  await pg.waitForSelector('table.t');

  console.log('① 첫 화면');
  ok(authHdrs.length && authHdrs.every(h => h === 'Bearer TEACHER_TOKEN'), '수파베이스 요청에 교사 토큰이 붙는다');
  ok(reqs.some(u => /tt_classes/.test(u)) && reqs.some(u => /tt_period/.test(u)) && reqs.some(u => /tt_log/.test(u)) && reqs.some(u => /students/.test(u)), '네 표를 읽는다');
  ok(reqs.some(u => /tt_log.*kind=in\./.test(u)), '이동 기록은 종류를 골라 받는다');
  ok((await pg.textContent('#mLabel')) === '2026년 10월', '달 표시 2026년 10월');
  ok((await pg.textContent('#winLabel')).includes('중등 10/1~10/31') && (await pg.textContent('#winLabel')).includes('고등 10/7~11/6'), '중등·고등 기준 기간 표시');
  const tiles = await pg.$$eval('.tile .v', els => els.map(e => e.textContent));
  ok(tiles[0] === '5명', '대상 학생 타일 5명 — ' + tiles.join(' | '));
  ok(tiles[3] === '중등 10/1~10/31\n고등 10/7~11/6' && (await pg.$eval('.tile .v.v2', el => getComputedStyle(el).fontSize)) === '16.5px', '기준 기간 타일: 중등·고등 두 줄 같은 크기');
  /* 청구 합계 = 강준서 281,250 + 이소율 187,500 + 김건 190,000 + 유채아 95,000 + 박민선 312,500 */
  ok(tiles[1] === '1,066,250원', '청구 합계 타일 — ' + tiles[1]);
  const weeks = await pg.$$eval('.weeks span', els => els.map(e => e.textContent));
  ok(weeks.length === 6 && weeks.some(w => w.includes('10/14주 정규(미지정)')), '주차 띠: 미지정 주는 정규(미지정) — ' + weeks.join(' · '));
  const heads = await pg.$$eval('section:not(.nonsul) h2', els => els.map(e => e.textContent.trim().replace(/\s+/g, ' ')));
  ok(heads.length === 3 && heads[0].startsWith('중2') && heads[1].startsWith('고1') && heads[2].startsWith('고3'), '학년 순서 중2→고1→고3 — ' + heads.join(' / '));
  const rowOf = async name => pg.$eval(`tr.r[data-key$="|${name}"]`, tr => ({ cells: [...tr.cells].map(c => c.textContent.trim()), over: tr.classList.contains('over'), under: tr.classList.contains('under') }));
  const a = await rowOf('강준서');
  ok(a.cells[3] === '4125,000' && a.cells[4] === '5156,250' && a.cells[6] === '281,250',
     '강준서 정규 4회 125,000 · 내신 5회 156,250 · 청구 281,250(직보는 그 주 수업의 진행) — ' + a.cells.slice(3, 7).join(' / '));
  const heads8 = await pg.$$eval('table.t thead th', els => els.slice(0, 8).map(e => e.textContent.trim()));
  ok(heads8.join('|') === 'No|이름|학교|정규|내신|논술|청구 금액(원)|수업(반 · 회차)', '열은 회차·금액·청구 금액만 — ' + heads8.join('|'));
  ok((await pg.$eval('tr.r[data-key$="|강준서"] td.cls', el => el.textContent)).indexOf('고1 나') >= 0, '강준서 표 칩');
  const s = await rowOf('이소율');
  ok(s.cells[3] === '4125,000' && s.cells[4] === '262,500' && s.cells[6] === '187,500', '이소율 정규 4 · 내신 2 · 청구 187,500 — ' + s.cells.slice(3, 7).join(' / '));
  await pg.click('tr.r[data-key$="|이소율"]');
  await pg.waitForSelector('tr.d');
  const sdet = await pg.textContent('tr.d');
  /* 펼친 줄 = 주차별 상세 (2026-09-21) */
  ok((await pg.textContent('.dt-sum')).replace(/\s+/g, ' ').includes('정규 4회 · 내신 2회 · 합계 6회'), '상세 요약: 정규·내신·합계');
  const pay = (await pg.textContent('tr.d .dt-pay')).replace(/\s+/g, ' ');
  ok(pay.includes('정규 4회 × 31,250 = 125,000') && pay.includes('내신 2회 × 31,250 = 62,500') && pay.includes('청구 187,500원'),
     '상세 수강료 줄: 회차 × 단가 = 금액 · 청구 — ' + pay.slice(0, 160));
  ok((await pg.$$eval('tr.d table.dt-t', els => els.length)) === 1, '주차별 상세는 표 하나');
  ok((await pg.$$eval('tr.d table.dt-t thead th', els => els.map(e => e.textContent.trim()))).join('|') === '날짜|시간|구분 · 반|비고', '상세 표 머리글');
  const wkh = await pg.$$eval('tr.d tr.wkr', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(wkh.length === 5 && wkh[0].startsWith('10/7~10/13 내신') && wkh[1].startsWith('10/14~10/20 정규(미지정)'), '주차 구분 줄 — ' + wkh.join(' / '));
  const rows1 = await pg.$$eval('tr.d table.dt-t tbody tr:not(.wkr):not(.offr)', els => els.map(e => [...e.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim())));
  ok(rows1.length === 6 && rows1[0][0] === '10/10 (토)' && rows1[0][1] === '토3:30' && rows1[0][2] === '내신 고1 확인', '수업 줄: 날짜(요일)·시간·구분+반 — ' + rows1[0].join(' | '));
  ok(rows1.some(c => c[2] === '정규 고1 가' && c[1] === '수5:30'), '정규 주 수업도 구분 배지와 함께');
  ok(rows1.some(c => c[3] && c[3].includes('진행')), '옮겨 진행한 수업은 비고에 진행 날짜·시간');
  const dtRows = () => pg.$$eval('tr.d table.dt-t tbody tr:not(.wkr):not(.offr)', els => els.map(e => [...e.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  const sr = await dtRows();
  ok(sr.includes('10/21 (수) | 수5:30 | 정규 고1 가 | 10/24 (토) 토3:30에 미뤄 진행')
     && sr.includes('10/31 (토) | 토3:30 | 내신 고1 확인 | 10/29 (목) 목7:00에 앞당겨 진행 — 직전 보강 대체')
     && !sdet.includes('고1 직보') && !sdet.includes('빠짐'),
     '학생 옮기기·직보 대체는 원래 날짜 줄에 진행 날짜·시간으로 — ' + sr.join(' / ').slice(0, 200));
  await pg.click('tr.r[data-key$="|이소율"]');
  /* 직보로 몰아서 한 주: 비고는 좁은 화면에서 밀려 안 보이므로 주차 줄에도 적는다 (2026-09-22) */
  await pg.click('tr.r[data-key$="|강준서"]');
  await pg.waitForSelector('tr.d');
  const awk = await pg.$$eval('tr.d tr.wkr', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(awk.some(t => t.startsWith('10/14~10/20 정규(미지정)2회') && t.includes('10/12 직보로 진행')), '직보 주차 줄: 2회 + 10/12 직보로 진행 — ' + awk.join(' / '));
  const adt = await pg.$$eval('tr.d table.dt-t tbody tr:not(.wkr):not(.offr)', els => els.map(e => [...e.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  ok(!adt.some(t => t.startsWith('10/12')) && adt.some(t => t === '10/14 (수) | 수5:30 | 정규 고1 가 | 10/12 (월) 월1:30에 직보로 진행'), '직보 줄은 없고 그 주 수업 비고에 직보 진행 — ' + adt.slice(2, 4).join(' / '));
  ok(adt.some(t => t === '10/17 (토) | 토3:30 | 정규 고1 나 | 10/25 (일) 일3:30에 미뤄 진행'), '이미 옮긴 수업은 직보가 덮어쓰지 않는다');
  await pg.click('tr.r[data-key$="|강준서"]');
  const p = await rowOf('박민선');
  ok(p.cells[3] === '5312,500' && p.cells[4] === '0' && p.cells[6] === '312,500', '고3 박민선 정규 5회 × 62,500 = 312,500 · 내신 0 — ' + p.cells.slice(3, 7).join(' / '));
  const k = await rowOf('김건');
  /* 수강료 (2026-09-21 사용자 단가: 중2 정규 47,500·내신 31,250 / 중3 47,500 / 고1·고2 31,250 / 고3 62,500)
   * 2026-10 중2는 내신 주에도 전부 정규 수업(GRADE_BOOK 예외)이라 정규 단가로만 계산된다 */
  ok(k.cells[3] === '4190,000' && k.cells[4] === '0' && k.cells[6] === '190,000',
     '김건(중2 10월) 정규 4회 × 47,500 = 190,000 · 내신 0 — ' + k.cells.slice(3, 7).join(' / '));
  const y = await rowOf('유채아');
  ok(y.cells[3] === '295,000' && y.cells[4] === '0' && y.cells[6] === '95,000',
     '내신 반이 없는 학생도 정규 2회 = 95,000으로 청구 — ' + y.cells.slice(3, 7).join(' / '));
  ok(!(await pg.$('tr.r.over')) && !(await pg.$('tr.r.under')), '기준 초과·미달 강조는 없앴다');
  ok((await pg.$$eval('.cc.jb', els => els.length)) === 1, '직전보강 칩 표시');
  ok(p.cells[5] === '4' && a.cells[5] === '', '논술 열: 박민선 4, 없는 학생은 빈칸');
  ok(tiles[2] === '1명' && (await pg.$$eval('.tile .s', els => els[2].textContent)) === '논술 수업 4회 · 단가 없음', '논술 타일(별도) 1명 · 4회');
  const nsSec = await pg.$eval('section.nonsul', el => el.textContent.replace(/\s+/g, ' '));
  ok(/논술 수강생.*1명/.test(nsSec) && nsSec.includes('박민선') && nsSec.includes('논술B 국어 일6:00 4'), '논술 수강생 별도 표 — ' + nsSec.slice(0, 80));
  ok((await pg.$$eval('table.t', els => els.length)) === 4, '학년 표 3개 + 논술 표 1개');

  console.log('② 펼치기·거르기');
  await pg.click('tr.r[data-key$="|강준서"]');
  await pg.waitForSelector('tr.d');
  ok((await dtRows()).includes('10/17 (토) | 토3:30 | 정규 고1 나 | 10/25 (일) 일3:30에 미뤄 진행'), '옮긴 수업은 원래 날짜 줄에 실제 진행일·시간');
  await pg.click('tr.r[data-key$="|강준서"]');
  await pg.click('tr.r[data-key$="|김건"]');
  await pg.waitForSelector('tr.d');
  const kr = await dtRows(), kh = await pg.$$eval('tr.d tr.wkr', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  const koff = await pg.$$eval('tr.d tr.offr', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(kr.includes('10/17 (토) | 토4:30 | 정규 정리정독 중2 | ') && kr.includes('10/24 (토) | 토4:30 | 정규 정리정독 중2 | ')
     && kr.includes('10/30 (금) | 금5:00 | 정규 중2 화정A | 10/16 (금) 금7:00 · 10/23 (금) 금7:00에 나눠 진행')
     && kh.every(x => x.indexOf('내신') < 0) && kh.some(x => x.indexOf('10/7~10/13') === 0 && x.indexOf('수업 없음') > 0)
     && koff.some(x => x.includes('휴강 10/9 중2 화정A')),
     '주차별 상세: 수업 줄·나눠 진행·수업 없는 주의 휴강 참고 — ' + kr.join(' / ').slice(0, 180));
  ok((await pg.$eval('tr.d tr.offr td', el => getComputedStyle(el).fontSize)) === '10.5px', '진행하지 않은 휴강은 작게 표시');
  ok(!(await pg.$('#flagSel')) && !(await pg.$('#onlyOver')), '기준·예정 거르기 드롭다운은 없앴다');
  ok((await pg.$$eval('section:not(.nonsul) tr.r td.nm', els => els.map(e => e.textContent))).join() === '김건,유채아,강준서,이소율,박민선', '전체 학생이 그대로 보인다');

  console.log('③ 보기 전환');
  await pg.click('#vseg button[data-v="grade"]');
  await pg.waitForSelector('#selGrade:not([hidden])');
  const gopts = await pg.$$eval('#selGrade option', els => els.map(e => e.textContent));
  ok(gopts.join('|') === '중2 (2명)|고1 (2명)|고3 (1명)', '학년 드롭다운 — ' + gopts.join('|'));
  await pg.selectOption('#selGrade', '고1');
  await pg.waitForFunction(() => document.querySelectorAll('tr.r').length === 2);
  ok((await pg.$$eval('section:not(.nonsul) h2', els => els.length)) === 1 && (await pg.$$eval('.tile .v', els => els[0].textContent)) === '2명', '학년 보기: 고1 2명, 타일도 그 학년만');
  await pg.click('#vseg button[data-v="school"]');
  await pg.waitForSelector('#selSchool:not([hidden])');
  const sopts = await pg.$$eval('#selSchool option', els => els.map(e => e.textContent));
  ok(sopts.join('|') === '고양중 (1명)|무원고 (1명)|서정중 (1명)|성사고 (1명)|화정고 (1명)', '학교 드롭다운 가나다순 — ' + sopts.join('|'));
  await pg.selectOption('#selSchool', '무원고');
  await pg.waitForFunction(() => document.querySelectorAll('tr.r').length === 1);
  ok((await pg.textContent('tr.r td.nm')) === '이소율', '학교 보기: 무원고 = 이소율');
  await pg.click('#vseg button[data-v="person"]');
  await pg.waitForSelector('#q:not([hidden])');
  ok((await pg.textContent('#view')).includes('이름을 넣으면'), '개인 보기 안내');
  await pg.fill('#q', '강준서');
  await pg.waitForSelector('.person');
  const person = await pg.textContent('.person');
  ok(person.includes('정규 4회') && person.includes('내신 5회') && person.includes('합계 9회') && person.includes('청구 281,250원')
     && person.includes('정규 4회 × 31,250 = 125,000'), '개인 카드 요약 — 정규·내신·합계·청구 금액');
  ok((await pg.$$eval('.person table.p tbody tr', els => els.length)) === 9, '개인 카드 날짜 줄 9개(직보 줄 없음)');
  ok((await pg.$$eval('.person table.p td.hd', els => els.map(e => e.textContent).filter(Boolean))).join() === '10/12 (월) 월1:30에 직보로 진행,10/25 (일) 일3:30에 미뤄 진행', '개인 카드 비고: 직보로 진행·옮겨 진행한 날짜');
  await pg.fill('#q', '박민선');
  await pg.waitForFunction(() => document.querySelector('.person') && document.querySelector('.person').textContent.includes('박민선'));
  ok((await pg.textContent('.person .sum')).includes('논술 4회 (별도)') && (await pg.$$eval('.person table.p td.ns', els => els.length)) === 4, '개인 카드: 논술 4회(별도)·논술 줄 구분색');
  ok((await pg.textContent('.person .sum')).includes('정규 5회') && (await pg.textContent('.person .sum')).includes('내신 0회') && (await pg.$$eval('.person table.p td.n', els => els.length)) === 0, '고3은 내신 주 수업도 정규로 — 정규 5 · 내신 0, 내신 구분색 없음');
  ok((await pg.textContent('.person')).includes('(직보)') && (await pg.textContent('.person')).includes('10/12 (월) 월2:00에 앞당겨 진행'), '옮겨서 만든 직보는 원래 날짜 줄에 직보 표시 + 진행일');
  await pg.fill('#q', '김건');
  await pg.waitForFunction(() => document.querySelector('.person') && document.querySelector('.person').textContent.includes('김건'));
  ok((await pg.$$eval('.person table.p td.hd', els => els.map(e => e.textContent).filter(Boolean))).join() === '10/16 (금) 금7:00 · 10/23 (금) 금7:00에 나눠 진행' && (await pg.$$eval('.person table.p tbody tr', els => els.length)) === 4, '개인 카드 비고: 나눠 진행한 실행 시간 각각, 조각은 따로 세지 않음(4줄)');
  await pg.fill('#q', '강준서');
  await pg.waitForFunction(() => document.querySelector('.person') && document.querySelector('.person').textContent.includes('강준서'));
  ok((await pg.$$eval('.person table.p td.n', els => els.length)) === 5, '내신 날짜 5줄은 구분 색');
  ok(person.includes('10/8 (목)') && !person.includes('(직보)'), '날짜에 요일 표시, 흡수된 직보는 줄이 없다');
  await pg.fill('#q', '없는이름');
  await pg.waitForFunction(() => document.querySelector('#view').textContent.includes('시간표에 없어요'));
  ok(true, '없는 이름 안내');

  console.log('④ 내보내기·달 이동');
  await pg.click('#vseg button[data-v="all"]');
  await pg.waitForSelector('table.t');
  const tsv = await pg.evaluate(() => tsvText());
  const lines = tsv.split('\n');
  ok(lines[0].split('\t').join('|') === '학년|이름|학교|10월 정규 회차|정규 금액|10월 내신 회차|내신 금액|합계 회차|청구 금액|논술(별도)|기준 기간|수업 상세(반 · 날짜)|논술 상세|휴강·옮긴 수업(참고)', 'TSV 머리글 — ' + lines[0]);
  ok(lines.length === 6 && lines[3].startsWith('고1\t강준서\t화정고\t4\t125000\t5\t156250\t9\t281250\t\t10/7~11/6\t'), 'TSV 줄: 강준서 — ' + lines[3].slice(0, 80));
  ok(lines[1].startsWith('중2\t김건\t서정중\t4\t190000\t0\t0\t4\t190000\t\t10/1~10/31'), 'TSV 줄: 김건(10월 중2는 전부 정규) — ' + lines[1].slice(0, 70));
  ok(lines[2].startsWith('중2\t유채아\t고양중\t2\t95000\t0\t0\t2\t95000\t\t10/1~10/31'), 'TSV 줄: 유채아(내신 0회) — ' + lines[2].slice(0, 70));
  ok(lines[5].split('\t')[9] === '4' && lines[5].split('\t')[12].startsWith('논술B 국어 일6:00 4회('), 'TSV 줄: 박민선 논술 4·논술 상세');
  const csv = await pg.evaluate(() => csvText());
  ok(csv.charCodeAt(0) === 0xFEFF && csv.split('\r\n').length === 6 && csv.includes('"강준서","화정고","4","125000","5","156250","9","281250"'), 'CSV(BOM·따옴표)');
  await pg.click('#mNext');
  await pg.waitForFunction(() => document.getElementById('mLabel').textContent === '2026년 11월');
  ok((await pg.textContent('#winLabel')).includes('고등 11/7~12/6') && pg.url().includes('m=2026-11'), '다음 달 → 11/7~12/6, 주소 ?m=2026-11');
  await pg.waitForSelector('table.t');
  const a11 = await rowOf('강준서');
  ok(a11.cells[3].indexOf('8') === 0 && a11.cells[4].indexOf('1') === 0 && a11.cells[6] === '281,250', '11월 강준서 정규 8 · 내신 1 · 청구 281,250 — ' + a11.cells.slice(3, 7).join(' / '));

  console.log('⑤ kind 열이 없는 DB');
  kindCol = false; reqs.length = 0;
  await pg.goto(`http://localhost:${PORT}/sessions.html?m=2026-10`);
  await pg.waitForSelector('table.t');
  ok(reqs.filter(u => /tt_classes/.test(u)).length === 2 && reqs.some(u => /tt_classes/.test(u) && !/kind/.test(u)), 'kind 400이면 옛 열로 다시 읽는다');
  ok((await rowOf('강준서')).cells[6] === '281,250', '폴백 뒤에도 같은 결과');
  ok(!errors.length, '페이지 오류 없음' + (errors.length ? ' — ' + errors.join(' | ') : ''));

  await browser.close(); server.close();
  console.log(`\n${n}건 중 ${n - bad}건 통과` + (bad ? `, ${bad}건 실패` : ''));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
