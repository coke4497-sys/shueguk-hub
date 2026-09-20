#!/usr/bin/env node
/* 월별 수업 회차(sessions.html)의 집계 로직 검증.
 *   node tools/sessions-test.js                      → 가짜 시간표로 규칙 검증
 *   SB_TOKEN=<교사 토큰> node tools/sessions-test.js --live 2026-10
 *                                                    → 실제 표를 받아 그 달 분포를 출력(대조용, 저장 안 함)
 * 화면 파일에서 SESSIONS-CORE 블록만 떼어 실행하므로 로직이 두 벌이 되지 않는다. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'sessions.html'), 'utf8');
const m = /\/\* ==SESSIONS-CORE==[\s\S]*?\n([\s\S]*?)\/\* ==\/SESSIONS-CORE== \*\//.exec(html);
if (!m) { console.error('SESSIONS-CORE 블록을 찾지 못했습니다'); process.exit(1); }
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(m[1] + '\n;globalThis.__core = CORE;', ctx);
const CORE = ctx.__core;

let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) pass++; else { fail++; console.log('  ✗ ' + name + (extra != null ? ' — ' + JSON.stringify(extra) : '')); } }

/* ── 달의 범위·주차 ── */
(function(){
  const w = CORE.windows(2026, 10);
  ok('중등 10월 = 10/1~10/31', w.mid.from === '2026-10-01' && w.mid.to === '2026-10-31', w.mid);
  ok('고등 10월 = 10/7~11/6', w.high.from === '2026-10-07' && w.high.to === '2026-11-06', w.high);
  const d = CORE.windows(2026, 12);
  ok('고등 12월은 해를 넘겨 1/6까지', d.high.to === '2027-01-06', d.high);
  ok('중등 2월은 2/28까지', CORE.windows(2026, 2).mid.to === '2026-02-28');
  const W = s => CORE.ymd(CORE.weekWed(new Date(+s.slice(0,4), +s.slice(5,7)-1, +s.slice(8,10))));
  ok('월요일은 다음 수요일 주', W('2026-10-12') === '2026-10-14');
  ok('화요일도 다음 수요일 주', W('2026-10-13') === '2026-10-14');
  ok('수요일은 자기 주', W('2026-10-14') === '2026-10-14');
  ok('일요일은 지난 수요일 주', W('2026-10-18') === '2026-10-14');
  ok('다음 월요일은 다음 주', W('2026-10-19') === '2026-10-21');
  ok('강조 기준: 주1회 → 4 (5회부터)', CORE.threshold(1) === 4);
  ok('강조 기준: 주2회 → 8 (9회부터)', CORE.threshold(2) === 8);
  ok('주당 횟수 모르면 기준 없음', CORE.threshold(0) === 0);
  ok('이름 괄호 떼기', CORE.plainName('(화정)심지후(8/21부터)') === '심지후');
})();

/* ── 가짜 시간표 (2026년 10월) ──
 * 수요일: 9/30 · 10/7 · 10/14 · 10/21 · 10/28 · 11/4.  기간: 9/30·10/7·10/28·11/4 = 내신, 10/14·10/21 = 미지정(정규) */
function cls(book, id, day, start, name, roster, kind){ return { book, class_id: id, day, start_time: start, end_time: '', teacher: '', name, roster, kind: kind || '' }; }
const DATA = {
  periods: [{ week_wednesday: '2026-09-30', book: '내신' }, { week_wednesday: '2026-10-07', book: '내신' },
            { week_wednesday: '2026-10-28', book: '내신' }, { week_wednesday: '2026-11-04', book: '내신' }],
  students: [
    { name: '강준서', school: '화정고', grade: '2026 고등 1학년', enrolled: '재원' },
    { name: '양지우', school: '백양고', grade: '2026 고등 1학년', enrolled: '재원' },
    { name: '이소율', school: '무원고', grade: '2026 고등 1학년', enrolled: '재원' },
    { name: '김건',   school: '서정중', grade: '2026 중등 2학년', enrolled: '재원' },
    { name: '박민선', school: '성사고', grade: '2026 고등 3학년', enrolled: '재원' }
  ],
  classes: [
    cls('정규', 'r1', '수', '5:30', '고1 가', '강준서 양지우A 이소율'),
    cls('정규', 'r2', '토', '3:30', '고1 나', '강준서 이소율A(10/17부터)'),
    cls('정규', 'r3', '토', '4:30', '정리정독 중2', '김건 (화정)심지후'),
    cls('정규', 'r4', '목', '5:30', '고3파이널A', '박민선'),
    cls('정규', 'w261012b', '월', '1:30', '고1 화정B', '', '직보'),      // 이 주만 반(직전보강) — 주간추가로 강준서
    cls('정규', 'w261015a', '목', '5:30', '고1 가', ''),                 // r1 보강 복사본 (10/15)
    cls('정규', 'w261025a', '일', '3:30', '고1 나', ''),                 // r2 이동 복사본 (10/17 → 10/25)
    cls('내신', 'n1', '목', '5:30', '고1 화정B(천재수)', '강준서'),
    cls('내신', 'n2', '토', '3:30', '고1 확인', '강준서 양지우'),
    cls('내신', 'n3', '금', '5:00', '중2 화정A', '김건'),
    cls('내신', 'n4', '목', '5:30', '고3파이널A', '박민선'),
    cls('내신', 'w261013z', '화', '5:00', '고1 확인', '강준서'),          // 내신 반인데 그 주(10/14)는 정규 → 안 보임
    cls('정규', 'r9', '일', '6:00', '논술B 국어', '박민선'),               // 논술 = 별도 집계 (합계·주당·강조 제외)
    cls('내신', 'n9', '일', '6:00', '논술B 국어', '박민선'),
    cls('내신', 'w261031b', '토', '5:30', '고3파이널A', ''),              // r4 11/12 수업을 10/31로 당겨 진행 → 11월로 센다
    cls('내신', 'w261107a', '토', '4:30', '정리정독 중2', '')              // 김건 10/24 수업을 11/7로 미룬 자리(다른 주로 옮기기)
  ],
  logs: [
    { id: 1, at: '2026-09-20T03:00:00Z', kind: '주간반휴강', student: '', from_class_id: 'n3', to_class_id: '', apply_date: '2026-10-09' },
    { id: 2, at: '2026-09-20T03:00:00Z', kind: '주간반이동', student: '', from_class_id: 'r2', to_class_id: 'w261025a', apply_date: '2026-10-17' },
    { id: 3, at: '2026-09-20T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'r1', to_class_id: 'w261015a', apply_date: '2026-10-14' },
    { id: 4, at: '2026-09-20T03:00:00Z', kind: '주간추가', student: '강준서', from_class_id: '', to_class_id: 'w261012b', apply_date: '2026-10-12' },
    { id: 20, at: '2026-09-20T03:00:00Z', kind: '주간빼기', student: '강준서', from_class_id: 'n2', to_class_id: '', apply_date: '2026-10-10' },   // id 4 추가와 이웃이 아니라 짝이 아님
    { id: 6, at: '2026-09-20T03:00:00Z', kind: '1회', student: '이소율', from_class_id: 'r1', to_class_id: 'r3', apply_date: '2026-10-24', reason: '가족 행사' },   // 10/21(수) 수업을 10/24(토) 다른 반에서
    { id: 7, at: '2026-09-20T03:00:00Z', kind: '영구', student: '강준서', from_class_id: 'r1', to_class_id: 'r2', apply_date: null },  // 무관한 종류는 무시
    { id: 8, at: '2026-09-20T03:00:00Z', kind: '주간반이동', student: '', from_class_id: 'r4', to_class_id: 'w261031b', apply_date: '2026-11-12', reason: '앞당겨 진행' },
    // 학생 한 명 '다른 주로 옮기기' = 같은 순간의 주간추가+주간빼기 짝: 양지우 r1 10/21 → r2 10/24
    { id: 9, at: '2026-09-20T04:00:00Z', kind: '주간추가', student: '양지우A', from_class_id: '', to_class_id: 'r2', apply_date: '2026-10-24', reason: '' },
    { id: 10, at: '2026-09-20T04:00:01Z', kind: '주간빼기', student: '양지우A', from_class_id: 'r1', to_class_id: '', apply_date: '2026-10-21', reason: '' },
    // 김건 10/24(중등 10월) 수업을 11/7로 미룸 → 10월로 센다
    { id: 11, at: '2026-09-20T05:00:00Z', kind: '주간추가', student: '김건', from_class_id: '', to_class_id: 'w261107a', apply_date: '2026-11-07', reason: '' },
    { id: 12, at: '2026-09-20T05:00:03Z', kind: '주간빼기', student: '김건', from_class_id: 'r3', to_class_id: '', apply_date: '2026-10-24', reason: '' },
    // 짝 없는 빼기(사유만) = 수업 없음
    { id: 13, at: '2026-09-21T05:00:00Z', kind: '주간빼기', student: '심지후', from_class_id: 'r3', to_class_id: '', apply_date: '2026-10-17', reason: '9/11(금) 4:00 당겨서 진행' },   // 대체 = 수업 한 것
    { id: 14, at: '2026-09-21T05:00:00Z', kind: '주간빼기', student: '심지후', from_class_id: 'r3', to_class_id: '', apply_date: '2026-10-24', reason: '추석연휴' },                  // 수업 없음
    { id: 15, at: '2026-09-21T05:00:00Z', kind: '주간빼기', student: '김건', from_class_id: 'n3', to_class_id: '', apply_date: '2026-10-30', reason: '목 1:00 국어 직전대비 수업' },   // 요일 → 같은 주 목요일
    // 같은 날짜의 추가+빼기(영구 이동 예약의 '그때까지 원래 반')는 짝이 아니다
    { id: 16, at: '2026-09-21T06:00:00Z', kind: '주간추가', student: '박민선', from_class_id: '', to_class_id: 'r4', apply_date: '2026-10-15', reason: '' },
    { id: 17, at: '2026-09-21T06:00:00Z', kind: '주간빼기', student: '박민선', from_class_id: 'r4', to_class_id: '', apply_date: '2026-10-15', reason: '' }
  ]
};
const R = CORE.build(JSON.parse(JSON.stringify(DATA)), 2026, 10);
const R11 = CORE.build(JSON.parse(JSON.stringify(DATA)), 2026, 11);
const by = {}; R.rows.forEach(r => by[r.name] = r);
const dates = (r, label) => { const b = r.byCls.find(x => x.label === label); return b ? b.dates.map(CORE.md).join(',') : '(없음)'; };

ok('주차 목록 6개, 10/14·10/21은 미지정 정규', R.weeks.length === 6 && R.weeks.filter(w => !w.specified).map(w => w.wed).join() === '2026-10-14,2026-10-21', R.weeks);
ok('순서: 중2(김건·심지후) → 고1(강준서·양지우·이소율) → 고3', R.rows.map(r => r.name).join() === '김건,심지후,강준서,양지우,이소율,박민선', R.rows.map(r => r.grade + r.name));

/* 강준서: n1 목 10/8·10/29·11/5(3) + n2 토 10/31(1, 10/10은 주간빼기) + 직보 10/12(1) + r1 수 10/14·10/21(2) + 보강 10/15(1) + r2 토 10/17(10/25에 진행)·10/24(2) = 10 */
const a = by['강준서'];
ok('강준서 합계 10', a && a.count === 10, a && a.detail);
ok('강준서 내신 4 · 정규 6', a && a.naeshin === 4 && a.regular === 6, a && [a.naeshin, a.regular]);
ok('강준서 내신 진도 3회 날짜', a && dates(a, '고1 화정B(천재수) 목5:30') === '10/8,10/29,11/5', a && a.detail);
ok('주간빼기 10/10은 빠지고 10/31만', a && dates(a, '고1 확인 토3:30') === '10/31');
ok('짝 없는 빼기는 참고에 사유와 함께', a && /10\/10 고1 확인 이 주만 빠짐/.test(a.noteText), a && a.noteText);
ok('주간추가로 직보 10/12 포함(직보 표시)', a && dates(a, '고1 화정B 월1:30(직보)') === '10/12' && a.byCls.some(b => b.jb));
ok('보강 복사본은 원본 명단으로 10/15', a && dates(a, '고1 가 목5:30') === '10/15');
ok('옮긴 수업은 원래 날짜(10/17)로 세고 복사본 날짜(10/25)는 따로 안 셈', a && dates(a, '고1 나 토3:30') === '10/17,10/24' && !a.byCls.some(b => b.label === '고1 나 일3:30'));
ok('옮긴 수업 줄에 실제 진행일 기록', a && a.items.some(it => it.date === '2026-10-17' && it.held === '2026-10-25' && it.heldWhen === '일3:30') && /고1 나 토3:30 2회\(10\/17\(10\/25 진행\), 10\/24\)/.test(a.detail), a && a.detail);
ok('내신 반인데 정규 주(10/13)는 안 셈', a && !a.items.some(it => it.date === '2026-10-13'));
ok('강준서 주2회 → 기준 8 → 10회는 강조', a && a.weekly === 2 && a.threshold === 8 && a.over === true);
ok('고등 범위 밖(10/1 목 n1)은 안 셈', a && !a.items.some(it => it.date < '2026-10-07'));

/* 이소율: r1 10/14 + 10/21(1회 이동으로 10/24 r3에서 진행 — 원래 날짜로 셈) + 보강 10/15 + r2 10/17(10/25에 진행, '10/17부터' 표기 OK)·10/24 = 5 */
const s = by['이소율'];
ok('이소율 한 줄로 합쳐짐(이소율A 표기 흡수)', s && !by['이소율A']);
ok('이소율 합계 5 (정규 5 · 내신 0)', s && s.count === 5 && s.regular === 5 && s.naeshin === 0, s && s.detail);
ok('1회 이동: 원래 반 10/21 줄에 10/24 진행으로 세고 도착 반(r3) 10/24는 따로 안 셈', s && dates(s, '고1 가 수5:30') === '10/14,10/21' && dates(s, '고1 나 토3:30') === '10/17,10/24' && !s.byCls.some(b => /정리정독/.test(b.label)) && s.items.some(it => it.date === '2026-10-21' && it.held === '2026-10-24' && it.heldWhen === '토4:30'), s && s.detail);
ok('이소율 주2회(가+나) → 5회는 강조 아님', s && s.weekly === 2 && s.over === false);

/* 양지우: 명단 '양지우A'(r1)·'양지우'(n2) → 한 사람. r1 2 + 보강 1 + n2 10/10·10/31 = 5 */
const y = by['양지우'];
ok('양지우 A 표기 합쳐 5회 (정규 3 · 내신 2)', y && y.count === 5 && y.regular === 3 && y.naeshin === 2 && !by['양지우A'], y && y.detail);
ok('다른 주로 옮기기(추가+빼기 짝): r1 10/21 줄에 10/24 진행, r2 10/24는 따로 안 셈', y && dates(y, '고1 가 수5:30') === '10/14,10/21' && !y.byCls.some(b => b.label === '고1 나 토3:30') && y.items.some(it => it.date === '2026-10-21' && it.held === '2026-10-24'), y && y.detail);

/* 김건(중2, 10/1~10/31): r3 토 정규 주 10/17·10/24(2) + n3 금 내신 주 10/2·10/30(2, 10/9 휴강) = 4 → 주1회 → 기준 4 → 강조 아님 */
const k = by['김건'];
ok('김건 합계 4 (정규 2 · 내신 2) — 11/7로 미룬 10/24 수업도 10월', k && k.count === 4 && k.regular === 2 && k.naeshin === 2 && k.items.some(it => it.date === '2026-10-24' && it.held === '2026-11-07'), k && k.detail);
ok('11월 김건: 11/7 복사본은 따로 안 셈', !(R11.rows.find(r => r.name === '김건') || { items: [] }).items.some(it => it.date === '2026-11-07'));
ok('김건 휴강 참고 표기', k && k.noteText === '10/9 중2 화정A 휴강', k && k.noteText);
ok('김건 중등 범위: 10/2 포함, 11월 제외', k && k.items.some(it => it.date === '2026-10-02') && !k.items.some(it => it.date >= '2026-11-01'));
ok('김건 주1회 → 4회는 강조 아님(5회부터)', k && k.weekly === 1 && k.threshold === 4 && k.over === false);

/* 심지후: 명단에 없음 → 반이름으로 중2, 앞 괄호 학교 구분 뗌 */
const j = by['심지후'];
ok('명단 밖 학생은 반이름으로 학년 추정', j && j.grade === '중2' && j.school === '', j);
ok('짝 없는 빼기 — 당겨서 진행(대체)은 센다(사유의 9/11이 진행일), 추석연휴는 안 센다', j && j.count === 1 && j.items.some(it => it.date === '2026-10-17' && it.held === '2026-09-11' && it.alt === '9/11(금) 4:00 당겨서 진행') && /10\/24 정리정독 중2 이 주만 빠짐\(추석연휴\)/.test(j.noteText) && /10\/17\(9\/11 진행\)/.test(j.detail), j && [j.detail, j.noteText]);
ok('사유의 요일로 진행일: 10/30(금) 빼기 "목 1:00" → 같은 주 목요일 10/29', k && k.items.some(it => it.date === '2026-10-30' && it.held === '2026-10-29' && it.alt) && k.count === 4, k && k.detail);
ok('heldFromReason: M/D · 요일 · 없음', CORE.heldFromReason('9/20(일) 이동', '2026-10-10') === '2026-09-20' && CORE.heldFromReason('이주 목요일에 직보', '2026-10-07') === '2026-10-08' && CORE.heldFromReason('화 2:00 국어 직전대비 수업', '2026-10-04') === '2026-09-29' && CORE.heldFromReason('직전 보강 대체', '2026-10-03') === '' && CORE.heldFromReason('시험 끝, 직보로 대체 < 9/16(수) 4:00', '2026-09-19') === '2026-09-16');

/* 박민선(고3 주1회): r4/n4 목 5:30 — 10/8(내신) 10/15·10/22(정규) 10/29·11/5(내신) = 5 → 5회부터 강조 */
const p = by['박민선'];
ok('박민선(고3) 5회 — 내신 주 수업도 전부 정규(정규 5 · 내신 0) → 주1회 5회부터 강조', p && p.count === 5 && p.naeshin === 0 && p.regular === 5 && p.weekly === 1 && p.over === true, p && [p.count, p.naeshin, p.regular, p.weekly]);
ok('같은 날짜의 추가+빼기는 짝이 아니라 그대로 1회', p && p.items.filter(it => it.date === '2026-10-15').length === 1 && p.count === 5);
ok('11/12 수업을 10/31에 당겨 해도 10월에는 안 센다(복사본 제외)', p && !p.items.some(it => it.date === '2026-10-31' || it.held === '2026-10-31'));
ok('중3·고3 내내 정규 — 날짜별 구분도 정규', p && p.items.every(it => it.book === '정규') && CORE.ALL_REGULAR['중3'] && CORE.ALL_REGULAR['고3'] && !CORE.ALL_REGULAR['고1']);
ok('고1은 그대로 정규·내신 나뉨', a && a.naeshin === 4);
ok('논술은 별도: 일요일 10/11·18·25·11/1 = 4회, 합계·주당 횟수에 안 들어감', p && p.nonsul === 4 && p.weekly === 1 && p.count === 5, p && [p.nonsul, p.weekly, p.count]);
ok('논술 상세는 따로, 본 상세에는 없음', p && /논술B 국어 일6:00 4회\(10\/11, 10\/18, 10\/25, 11\/1\)/.test(p.nonsulDetail) && !/논술/.test(p.detail), p && [p.detail, p.nonsulDetail]);
ok('논술 판정은 반이름', CORE.isNonsul('논술B 수학') && !CORE.isNonsul('고1 가'));
ok('논술 없는 학생은 0', a && a.nonsul === 0 && a.nonsulDetail === '');

/* 다른 달·다른 규칙 */
const a11 = R11.rows.find(r => r.name === '강준서') || {};
ok('11월(11/7~12/6): 11/7 내신 확인 1 + 미지정 정규 4주 × 가·나 = 9', a11.count === 9 && a11.naeshin === 1 && a11.regular === 8, a11.detail);
const p11 = R11.rows.find(r => r.name === '박민선') || {};
ok('11월 박민선: 10/31에 당겨 한 11/12 수업이 11/12 줄로 들어감(10/31 진행)', p11.items && p11.items.some(it => it.date === '2026-11-12' && it.held === '2026-10-31' && it.heldWhen === '토5:30') && /11\/12\(10\/31 진행\)/.test(p11.detail), p11.detail);
const R9 = CORE.build(JSON.parse(JSON.stringify(DATA)), 2026, 10, { midStart: 1, highStart: 1, perWeek: 3 });
ok('규칙 바꾸면(고등도 1일 시작·3배) 강준서 10/1 포함·기준 6', (R9.rows.find(r => r.name === '강준서') || {}).items.some(it => it.date === '2026-10-01') && R9.rows.find(r => r.name === '강준서').threshold === 6);

console.log(`\n${pass + fail}건 중 ${pass}건 통과` + (fail ? `, ${fail}건 실패` : ''));
if (fail) process.exit(1);

/* ── 실제 데이터 대조(선택) ── */
if (process.argv.includes('--live')){
  const tok = process.env.SB_TOKEN; if (!tok){ console.error('SB_TOKEN이 필요합니다'); process.exit(1); }
  const ym = /^(\d{4})-(\d{1,2})$/.exec(process.argv[process.argv.indexOf('--live') + 1] || '') || [null, 2026, 10];
  const SB = 'https://bangdbhqpphqqdwcledg.supabase.co/rest/v1', KEY = 'sb_publishable_dE9d1KIbpgYaQkaS2MSrlg_-7SiRJuT';
  const get = async p => { const out = []; for (let off = 0;; off += 1000){ const r = await fetch(SB + p + '&limit=1000&offset=' + off, { headers: { apikey: KEY, Authorization: 'Bearer ' + tok } }); if (!r.ok) throw new Error('sb ' + r.status + ' ' + p); const rows = await r.json(); rows.forEach(x => out.push(x)); if (rows.length < 1000) return out; } };
  (async () => {
    const [classes, periods, logs, students] = await Promise.all([
      get('/tt_classes?select=book,class_id,day,start_time,name,roster,kind&order=id'), get('/tt_period?select=week_wednesday,book&order=week_wednesday'),
      get('/tt_log?select=id,at,kind,student,from_class_id,to_class_id,apply_date&kind=in.(1회,주간추가,주간빼기,주간반이동,주간반보강,주간반휴강)&order=id'),
      get('/students?select=name,school,grade,enrolled&order=seq')]);
    const R = CORE.build({ classes, periods, logs, students }, +ym[1], +ym[2]);
    const dist = {}; R.rows.forEach(r => dist[r.count] = (dist[r.count] || 0) + 1);
    console.log(`${ym[1]}년 ${ym[2]}월: ${R.rows.length}명, 강조 ${R.rows.filter(r => r.over).length}명, 분포`, dist);
    console.log(R.weeks.map(w => w.wed + ' ' + w.book + (w.specified ? '' : '(미지정)')).join(' · '));
  })().catch(e => { console.error(e); process.exit(1); });
}
