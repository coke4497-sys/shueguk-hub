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
    cls('내신', 'w261107a', '토', '4:30', '정리정독 중2', ''),             // 김건 10/24 수업을 11/7로 미룬 자리(다른 주로 옮기기)
    cls('정규', 'w260911a', '금', '4:00', '정리정독 중2', '심지후', '직보'),  // 심지후 10/17 수업의 실제 진행(직보) — 한 번만 센다
    cls('내신', 'w261029c', '목', '1:00', '중2 직보', '김건', '직보')        // 김건 10/30 수업의 실제 진행(사유 '목 1:00')
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

/* 강준서: n1 목 10/8·10/29·11/5(3) + n2 토 10/31(1, 10/10은 주간빼기) + r1 수 10/14(10/12 직보로 진행)·10/21(2) + 보강 10/15(1) + r2 토 10/17(10/25에 진행)·10/24(2) = 9
 * 10/12 직보는 그 주(10/14~10/20) 수업의 진행이라 따로 세지 않는다 — 2026-09-22 규칙. */
const a = by['강준서'];
ok('강준서 합계 9(직보는 그 주 수업의 진행)', a && a.count === 9, a && a.detail);
ok('강준서 내신 4 · 정규 5', a && a.naeshin === 4 && a.regular === 5, a && [a.naeshin, a.regular]);
ok('강준서 내신 진도 3회 날짜', a && dates(a, '고1 화정B(천재수) 목5:30') === '10/8,10/29,11/5', a && a.detail);
ok('주간빼기 10/10은 빠지고 10/31만', a && dates(a, '고1 확인 토3:30') === '10/31');
ok('짝 없는 빼기는 참고에 사유와 함께', a && /10\/10 고1 확인 이 주만 빠짐/.test(a.noteText), a && a.noteText);
ok('직보 10/12은 그 주 수업(10/14)의 진행으로 붙고 따로 안 셈', a && !a.byCls.some(b => b.jb) && a.items.some(it => it.date === '2026-10-14' && it.held === '2026-10-12' && it.heldWhen === '월1:30'), a && a.detail);
ok('보강 복사본(10/15)은 그 주 정규 수업이 아니라 직보에 먹히지 않는다', a && a.items.some(it => it.date === '2026-10-15' && !it.runs.length), a && a.detail);
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
/* 주당 횟수는 '그 달 주차 구성'으로 정한다 — 이소율은 정규 2반·내신 0반이고 10월은 내신 주가 더 많아 주1회(기준 4).
 * 그래서 5회는 기준보다 1회 많음. 정규 주가 더 많은 달이면 주2회가 된다. */
ok('이소율 주1회(정규 2반이지만 내신 주가 우세) → 기준 4 · 5회는 초과', s && s.weekly === 1 && s.threshold === 4 && s.over === true && s.under === false, s && [s.weekly, s.regWeekly, s.naeWeekly]);
ok('이소율 예정 4회(정규 주 2주 × 2반) · 실제 5회', s && s.plan === 4 && s.planDiff === 1, s && [s.plan, s.count]);

/* 양지우: 명단 '양지우A'(r1)·'양지우'(n2) → 한 사람. r1 2 + 보강 1 + n2 10/10·10/31 = 5 */
const y = by['양지우'];
ok('양지우 A 표기 합쳐 5회 (정규 3 · 내신 2)', y && y.count === 5 && y.regular === 3 && y.naeshin === 2 && !by['양지우A'], y && y.detail);
ok('다른 주로 옮기기(추가+빼기 짝): r1 10/21 줄에 10/24 진행, r2 10/24는 따로 안 셈', y && dates(y, '고1 가 수5:30') === '10/14,10/21' && !y.byCls.some(b => b.label === '고1 나 토3:30') && y.items.some(it => it.date === '2026-10-21' && it.held === '2026-10-24'), y && y.detail);

/* 김건(중2, 10/1~10/31): r3 토 정규 주 10/17·10/24(2) + n3 금 내신 주 10/2·10/30(2, 10/9 휴강) = 4 → 주1회 → 기준 4 → 강조 아님 */
const k = by['김건'];
/* 2026-10 중2는 슈국 캘린더가 내신 주여도 전부 정규 수업(GRADE_BOOK 예외) */
ok('김건 합계 4 — 11/7로 미룬 10/24 수업도 10월, 2026-10 중2는 전부 정규', k && k.count === 4 && k.regular === 4 && k.naeshin === 0 && k.forceBook === '정규' && k.items.some(it => it.date === '2026-10-24' && it.held === '2026-11-07'), k && [k.regular, k.naeshin, k.detail]);
ok('중2 10월 수강료 = 정규 단가로만 (4회 × 47,500)', k && k.amtReal === 4 * 47500 && k.rate['정규'] === 47500, k && k.amtReal);
ok('예외는 그 달·그 학년만 — 고1 강준서는 그대로 정규·내신이 나뉜다', a && a.naeshin === 4 && !a.forceBook, a && [a.regular, a.naeshin]);
ok('bookOf: 2026-10 중2 = 정규 · 다른 달 중2 = 없음 · 중3·고3은 늘 정규', CORE.bookOf('2026-10', '중2') === '정규' && CORE.bookOf('2026-11', '중2') === '' && CORE.bookOf('2026-11', '중3') === '정규' && CORE.bookOf('2026-10', '고1') === '');
ok('11월 김건: 11/7 복사본은 따로 안 셈', !(R11.rows.find(r => r.name === '김건') || { items: [] }).items.some(it => it.date === '2026-11-07'));
ok('김건 휴강 참고 표기', k && k.noteText === '10/9 중2 화정A 휴강', k && k.noteText);
ok('김건 중등 범위: 10/2 포함, 11월 제외', k && k.items.some(it => it.date === '2026-10-02') && !k.items.some(it => it.date >= '2026-11-01'));
ok('김건 주1회 → 4회는 강조 아님(5회부터)', k && k.weekly === 1 && k.threshold === 4 && k.over === false);

/* 심지후: 명단에 없음 → 반이름으로 중2, 앞 괄호 학교 구분 뗌 */
const j = by['심지후'];
ok('명단 밖 학생은 반이름으로 학년 추정', j && j.grade === '중2' && j.school === '', j);
ok('짝 없는 빼기 — 당겨서 진행(대체)은 센다(사유의 9/11이 진행일), 추석연휴는 안 센다', j && j.count === 1 && j.items.some(it => it.date === '2026-10-17' && it.held === '2026-09-11' && it.alt === '9/11(금) 4:00 당겨서 진행') && /10\/24 정리정독 중2 이 주만 빠짐\(추석연휴\)/.test(j.noteText) && /10\/17\(9\/11 진행\)/.test(j.detail), j && [j.detail, j.noteText]);
ok('사유의 요일로 진행일: 10/30(금) 빼기 "목 1:00" → 같은 주 목요일 10/29', k && k.items.some(it => it.date === '2026-10-30' && it.held === '2026-10-29' && it.alt) && k.count === 4, k && k.detail);
ok('대체 수업은 한 번만: 10/29 직보(추가 세션)는 10/30 줄로 흡수돼 따로 안 셈', k && !k.items.some(it => it.date === '2026-10-29') && k.items.some(it => it.date === '2026-10-30' && it.heldWhen === '목1:00'), k && k.detail);
const RS = CORE.build(JSON.parse(JSON.stringify(DATA)), 2026, 9);
const j9 = RS.rows.find(r => r.name === '심지후') || { items: [] };
ok('9월 심지후: 9/11 직보는 10/17 수업의 진행이라 9월에 안 셈(9/5·12·19·26 = 4)', j9.count === 4 && !j9.items.some(it => it.date === '2026-09-11'), j9.detail);
ok('9월 범위 밖 주차는 목록에 없다', RS.weeks.every(w => w.wed >= '2026-08-26' && w.wed <= '2026-10-07') && RS.weeks.length === 6, RS.weeks.map(w => w.wed));
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

/* ── 한 수업을 여러 번에 나눠 진행(2026-09-20 사용자 "두 번에 나누어 진행한 것도 원래의 날짜로 — 실행 시간을 각각 기록") ──
 * 9월(고등 9/7~10/6)·10월(10/7~11/6). 수요일 9/2·9/9·9/16·9/23·9/30·10/7·10/14 전부 내신 */
const DATA2 = {
  periods: ['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04'].map(w => ({ week_wednesday: w, book: '내신' })),
  students: [
    { name: '한지민', school: '화정고', grade: '2026 고등 2학년', enrolled: '재원' },
    { name: '남상윤', school: '백양고', grade: '2026 고등 1학년', enrolled: '재원' },
    { name: '김미리내', school: '서정고', grade: '2026 고등 2학년', enrolled: '재원' },
    { name: '김우진', school: '서정중', grade: '2026 중등 2학년', enrolled: '재원' }
  ],
  classes: [
    /* ① 반 전체를 세 번에 나눠: n5 10/8 → 9/3(1/3 보강)·9/10(2/3 보강)·9/17(3/3 이동) */
    cls('내신', 'n5', '목', '8:30', '고2 화정B(비상 화언)', '한지민'),
    cls('내신', 'w260903b', '목', '밤10:00', '고2 화정B(비상 화언)', ''), cls('내신', 'w260910a', '목', '밤10:00', '고2 화정B(비상 화언)', ''), cls('내신', 'w260917a', '목', '밤10:00', '고2 화정B(비상 화언)', ''),
    /* ② 이동 사유의 날짜들: n6 10/9 → 9/4 이동('9/4, 11, 18에 앞당겨 진행') + 9/11·9/18 보강, 9/11 금4:00 '1시간 1회 보충'은 진짜 보충 */
    cls('내신', 'n6', '금', '5:30', '고2 화수B(창비 화언)', '한지민'),
    cls('내신', 'w260904e', '금', '5:00', '고2 화수B(창비 화언)', ''), cls('내신', 'w260911c', '금', '5:00', '고2 화수B(창비 화언)', ''), cls('내신', 'w260918a', '금', '5:00', '고2 화수B(창비 화언)', ''), cls('내신', 'w260911k', '금', '4:00', '고2 화수B(창비 화언)', ''),
    /* ③ 휴강 처리된 원래 수업: n7 10/11 휴강('9/6, 9/13, 9/20에 나눠서 이미 함') + 보강 3개 */
    cls('내신', 'n7', '일', '2:00', '고2 화수D(창비 화언)', '한지민'),
    cls('내신', 'w260906j', '일', '1:30', '고2 화수D(창비 화언)', ''), cls('내신', 'w260913j', '일', '1:30', '고2 화수D(창비 화언)', ''), cls('내신', 'w260920l', '일', '1:30', '고2 화수D(창비 화언)', ''),
    /* ④ 확인 수업을 진도반에서 당겨서: n8 확인 10/8 빼기(사유 없음) + n9 진도반의 보강 9/10·9/17 '10/7~ 주차 확인 당겨서 진행' / 10/1 확인은 같은 날 7:00 직보로 대체 */
    cls('내신', 'n8', '목', '8:30', '고1 확인', '남상윤'), cls('내신', 'n9', '토', '오전9:30', '고1 백양B(비상박 공통국어2)', '남상윤'),
    cls('내신', 'w260910b', '목', '7:00', '고1 백양B(비상박 공통국어2)', ''), cls('내신', 'w260917b', '목', '7:00', '고1 백양B(비상박 공통국어2)', ''),
    cls('내신', 'w261001g', '목', '7:00', '고1 백양B(비상박 공통국어2)', '남상윤', '직보'),
    /* ⑤ 반이름의 1/2·2/2(사유 없음): 9/27 서정B는 9/22 직보로 이동 — 조각 둘이 가장 가까운 옮긴 수업에 붙는다 */
    cls('내신', 'n10', '일', '6:00', '고2 서정B(천재 독작)', '김미리내'),
    cls('내신', 'w260916f', '수', '8:30', '고2 서정B 1/2', '김미리내'), cls('내신', 'w260917d', '목', '6:30', '고2 서정B 2/2', '김미리내'), cls('내신', 'w260922d', '화', '1:00', '고2 서정B(천재 독작)', '', '직보'),
    /* ⑥ 날짜가 딱 맞는 참고(휴강)로 되살리기: 김우진 10/3 중2 확인 휴강, 10/4 정리정독에 '10/3 토 수업 -> 10/4 11시로 1회 이동' */
    cls('내신', 'n11', '토', '1:30', '중2 확인(비상(영))', '김우진'), cls('내신', 'w261004a', '일', '11:00', '정리정독 중2', ''),
    /* 진짜 보충은 그대로 추가 세션 */
    cls('내신', 'w260917e', '목', '8:00', '고2 화정B(비상 화언)', '')
  ],
  logs: [
    { id: 1, at: '2026-09-01T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n5', to_class_id: 'w260903b', apply_date: '2026-09-03', reason: '10/8(목) 수업 앞당겨 진행 1/3' },
    { id: 2, at: '2026-09-01T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n5', to_class_id: 'w260910a', apply_date: '2026-09-10', reason: '10/8(목) 수업 앞당겨 진행 2/3' },
    { id: 3, at: '2026-09-01T03:00:00Z', kind: '주간반이동', student: '', from_class_id: 'n5', to_class_id: 'w260917a', apply_date: '2026-10-08', reason: '10/8(목) 수업 앞당겨 진행 3/3' },
    { id: 4, at: '2026-09-01T03:00:00Z', kind: '주간반이동', student: '', from_class_id: 'n6', to_class_id: 'w260904e', apply_date: '2026-10-09', reason: '9/4, 11, 18에 앞당겨 진행' },
    { id: 5, at: '2026-09-01T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n6', to_class_id: 'w260911c', apply_date: '2026-09-11', reason: '10/9(금) 진도수업 2/3' },
    { id: 6, at: '2026-09-01T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n6', to_class_id: 'w260918a', apply_date: '2026-09-18', reason: '10/9(금) 진도수업 3/3' },
    { id: 7, at: '2026-09-01T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n6', to_class_id: 'w260911k', apply_date: '2026-09-11', reason: '1시간 1회 보충' },
    { id: 8, at: '2026-09-01T03:00:00Z', kind: '주간반휴강', student: '', from_class_id: 'n7', to_class_id: '', apply_date: '2026-10-11', reason: '9/6, 9/13, 9/20에 나눠서 이미 함' },
    { id: 9, at: '2026-09-01T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n7', to_class_id: 'w260906j', apply_date: '2026-09-06', reason: '10/11(일) 수업 앞당겨 진행 1/3' },
    { id: 10, at: '2026-09-01T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n7', to_class_id: 'w260913j', apply_date: '2026-09-13', reason: '10/11(일) 수업 앞당겨 진행 2/3' },
    { id: 11, at: '2026-09-01T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n7', to_class_id: 'w260920l', apply_date: '2026-09-20', reason: '10/11(일) 수업 앞당겨 진행 3/3' },
    { id: 12, at: '2026-09-01T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n9', to_class_id: 'w260910b', apply_date: '2026-09-10', reason: '10/7~ 주차 확인 당겨서 진행' },
    { id: 13, at: '2026-09-01T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n9', to_class_id: 'w260917b', apply_date: '2026-09-17', reason: '10/7~ 주차 확인 당겨서 진행' },
    { id: 14, at: '2026-09-01T03:00:00Z', kind: '주간빼기', student: '남상윤', from_class_id: 'n8', to_class_id: '', apply_date: '2026-10-08', reason: '' },
    { id: 15, at: '2026-09-01T03:00:00Z', kind: '주간빼기', student: '남상윤', from_class_id: 'n8', to_class_id: '', apply_date: '2026-10-01', reason: '목 7:00 국어 직전대비 수업' },
    { id: 16, at: '2026-09-01T03:00:00Z', kind: '주간반이동', student: '', from_class_id: 'n10', to_class_id: 'w260922d', apply_date: '2026-09-27', reason: '' },
    { id: 17, at: '2026-09-01T03:00:00Z', kind: '주간반휴강', student: '', from_class_id: 'n11', to_class_id: '', apply_date: '2026-10-03', reason: '' },
    { id: 18, at: '2026-09-01T03:00:00Z', kind: '주간추가', student: '김우진', from_class_id: '', to_class_id: 'w261004a', apply_date: '2026-10-04', reason: '10/3일 토 수업 -> 10/4일 11시로 1회 이동 (사유: 농구대회)' },
    { id: 19, at: '2026-09-01T03:00:00Z', kind: '주간반보강', student: '', from_class_id: 'n5', to_class_id: 'w260917e', apply_date: '2026-09-17', reason: '진도 보강' }
  ]
};
const S9 = CORE.build(JSON.parse(JSON.stringify(DATA2)), 2026, 9), S10 = CORE.build(JSON.parse(JSON.stringify(DATA2)), 2026, 10);
const f = (R, n) => R.rows.find(r => r.name === n) || { items: [], detail: '', noteText: '' };
const runsOf = (r, d) => { const it = r.items.find(x => x.date === d); return it ? it.runs.map(x => CORE.md(x.date) + ' ' + x.when).join('·') : '(없음)'; };
const h = f(S10, '한지민'), h9 = f(S9, '한지민');
ok('① 세 번에 나눠 한 수업은 원래 날짜(10/8) 한 회 — 진행 9/3·9/10·9/17 각각 시간까지', runsOf(h, '2026-10-08') === '9/3 목밤10:00·9/10 목밤10:00·9/17 목밤10:00' && /10\/8\(9\/3·9\/10·9\/17 진행\)/.test(h.detail), [runsOf(h, '2026-10-08'), h.detail]);
ok('① 조각들은 9월에 따로 세지 않는다(9/10·9/17 목밤10:00 없음, 정규 목8:30만)', !h9.items.some(it => it.when === '목밤10:00') && h9.items.filter(it => /화정B/.test(it.cls) && it.when === '목8:30').length === 4, h9.detail);
ok('② 이동 사유의 날짜(9/4, 11, 18) → 10/9 줄에 진행 셋, 9/11 금4:00 보충은 9월에 그대로', runsOf(h, '2026-10-09') === '9/4 금5:00·9/11 금5:00·9/18 금5:00' && h9.items.some(it => it.date === '2026-09-11' && it.when === '금4:00' && it.extra), [runsOf(h, '2026-10-09'), h9.detail]);
ok('③ 휴강 처리된 10/11 수업도 조각이 있으면 10/11 한 회로 되살린다(참고에서 빠짐)', runsOf(h, '2026-10-11') === '9/6 일1:30·9/13 일1:30·9/20 일1:30' && !/10\/11 .*휴강/.test(h.noteText), [runsOf(h, '2026-10-11'), h.noteText]);
ok('③ 9월에는 그 조각들이 없다(일1:30 없음)', !h9.items.some(it => it.when === '일1:30'), h9.detail);
ok('한지민 10월 = 10/8·10/9·10/11 + 10/15·16·18·22·23·25·29·30·11/1·11/5·11/6 = 14', h.count === 14 && h.items.filter(it => it.runs.length).length === 3, [h.count, h.detail]);
ok('진짜 보충(진도 보강)은 그대로 추가 세션 — 9/17 목8:00', h9.items.some(it => it.date === '2026-09-17' && it.when === '목8:00' && it.extra), h9.detail);
const n = f(S10, '남상윤'), n9 = f(S9, '남상윤');
ok('④ 확인 수업 빼기(사유 없음) + 진도반 보강 "10/7~ 주차 확인 당겨서" → 10/8 확인 줄로 되살려 9/10·9/17 진행', runsOf(n, '2026-10-08') === '9/10 목7:00·9/17 목7:00' && n.items.find(x => x.date === '2026-10-08').cls === '고1 확인' && !/10\/8 .*빠짐/.test(n.noteText), [runsOf(n, '2026-10-08'), n.noteText]);
ok('④ 같은 날 다른 시간 대체: 10/1 확인 → 진행 10/1 목7:00 한 건(직보 세션과 합침), 표기 "10/1(7:00 진행)"', runsOf(n9, '2026-10-01') === '10/1 목7:00' && /10\/1\(7:00 진행\)/.test(n9.detail) && !n9.items.some(it => it.date === '2026-10-01' && it.extra), [runsOf(n9, '2026-10-01'), n9.detail]);
ok('④ 9월 남상윤: 9/10·9/17 목7:00 조각은 9월에 없다', !n9.items.some(it => it.when === '목7:00' && it.date < '2026-10-01'), n9.detail);
const km = f(S9, '김미리내');
ok('⑤ 반이름 1/2·2/2 조각은 가장 가까운 옮긴 수업(9/27, 9/22 직보)에 붙는다 — 진행 9/16·9/17·9/22', runsOf(km, '2026-09-27') === '9/16 수8:30·9/17 목6:30·9/22 화1:00' && km.count === 4, [runsOf(km, '2026-09-27'), km.count, km.detail]);
const u = f(S10, '김우진');
ok('⑥ 날짜가 딱 맞는 휴강 참고는 반이 달라도 그 날 줄로 되살린다 — 10/3(10/4 진행), 10/4 정리정독은 따로 안 셈', /10\/3\(10\/4 진행\)/.test(u.detail) && !u.items.some(it => it.date === '2026-10-04') && !/10\/3 .*휴강/.test(u.noteText) && u.count === 5, [u.detail, u.noteText, u.count]);
ok('datesInReason: 날짜 여러 개·같은 달 뒤따르는 날·k/m 제외', CORE.datesInReason('9/4, 11, 18에 앞당겨 진행 2/3', '2026-10-09').join() === '2026-09-04,2026-09-11,2026-09-18' && CORE.datesInReason('10/8(목) 수업 앞당겨 진행 1/3', '2026-09-03').join() === '2026-10-08' && CORE.datesInReason('9/6, 9/13,  9/20에 나눠서 이미 함', '2026-10-11').length === 3 && CORE.datesInReason('4:15 수업 시작', '2026-10-07').length === 0);
ok('partMark: 1/2·2/3·3/3은 조각, 9/6·10/11은 날짜', CORE.partMark('진도수업 2/3') && CORE.partMark('고2 서정B 1/2') && !CORE.partMark('9/6 앞당겨') && !CORE.partMark('10/11(일)') && !CORE.partMark('1/20'));
const dl = d => d.slice(5).replace('-', '/');
ok('runNote: 나눠 진행·같은 날 대체·앞당겨', /에 나눠 진행$/.test(CORE.runNote(h.items.find(x => x.date === '2026-10-08'), dl)) && CORE.runNote(n9.items.find(x => x.date === '2026-10-01'), dl) === '같은 날 목7:00에 대체 진행 — 목 7:00 국어 직전대비 수업' && CORE.runNote({ date: '2026-10-17', runs: [{ date: '2026-10-25', when: '일3:30' }], alt: '' }, dl) === '10/25 일3:30에 미뤄 진행', [CORE.runNote(h.items.find(x => x.date === '2026-10-08'), dl), CORE.runNote(n9.items.find(x => x.date === '2026-10-01'), dl)]);

/* ── 수강료 기준·예정 회차·미달 (2026-09-21 사용자 "주1회 4회 · 주2회 8회 기준. 그 이상 오거나 그 이하로 등원하면 수강료가 달라진다") ──
 * 중2식(정규 1반 · 내신 2반)·내신 주만 있는 달에 수업이 없는 학생·휴강으로 덜 온 학생을 확인한다. */
const DATA3 = {
  periods: [{ week_wednesday: '2026-10-28', book: '내신' }, { week_wednesday: '2026-11-04', book: '내신' },
            { week_wednesday: '2026-11-11', book: '내신' }, { week_wednesday: '2026-11-18', book: '내신' },
            { week_wednesday: '2026-11-25', book: '내신' }],
  students: [
    { name: '한서윤', school: '화정중', grade: '2026 중등 2학년', enrolled: '재원' },
    { name: '유채아', school: '고양중', grade: '2026 중등 2학년', enrolled: '재원' },
    { name: '오지후', school: '백양중', grade: '2026 중등 2학년', enrolled: '재원' }
  ],
  classes: [
    /* 중2식: 정규는 진도 한 반, 내신은 진도+확인 두 반 → 11월(전부 내신 주)에는 주2회가 기준 */
    cls('정규', 'r1', '토', '4:30', '중2 화정A', '한서윤 오지후'),
    cls('내신', 'n1', '토', '4:30', '중2 화정A(비상)', '한서윤 오지후'),
    cls('내신', 'n2', '일', '2:00', '중2 확인(비상)', '한서윤 오지후'),
    /* 유채아는 내신 반이 없다 — 내신 주만 있는 달에는 수업이 0회 */
    cls('정규', 'r2', '금', '5:00', '정리정독 중2', '유채아'),
    cls('내신', 'w261121a', '토', '7:00', '중2 보충', '')   /* 이 주만 보충 — 예정에는 없고 실제만 늘어난다 */
  ],
  logs: [
    { id: 1, at: '2026-10-20T03:00:00Z', kind: '주간반휴강', student: '', from_class_id: 'n2', to_class_id: '', apply_date: '2026-11-08', reason: '' },
    { id: 2, at: '2026-10-20T03:00:00Z', kind: '주간반휴강', student: '', from_class_id: 'n2', to_class_id: '', apply_date: '2026-11-15', reason: '' },
    { id: 3, at: '2026-10-20T03:00:00Z', kind: '주간추가', student: '오지후', from_class_id: '', to_class_id: 'w261121a', apply_date: '2026-11-21', reason: '보충' }
  ]
};
const S11 = CORE.build(JSON.parse(JSON.stringify(DATA3)), 2026, 11);
const g = n => S11.rows.find(r => r.name === n) || {};
const han = g('한서윤'), yu = g('유채아'), oh = g('오지후');
ok('중2 정규 1반·내신 2반 → 내신 달에는 주2회가 기준(8회)', han.weekly === 2 && han.threshold === 8 && han.regWeekly === 1 && han.naeWeekly === 2, [han.weekly, han.regWeekly, han.naeWeekly]);
ok('예정 회차는 휴강을 빼기 전 시간표대로', han.plan === 9, [han.plan, han.detail]);
ok('휴강 2회로 7회 → 기준 미달(-1)·예정 미달(-2)', han.count === 7 && han.under === true && han.over === false && han.diff === -1 && han.planDiff === -2, [han.count, han.diff, han.planDiff]);
ok('이 주만 보충은 예정에 없고 실제만 늘어난다 — 8회, 기준 맞음', oh.count === 8 && oh.plan === 9 && oh.under === false && oh.over === false && oh.diff === 0 && oh.planDiff === -1, [oh.count, oh.plan, oh.diff, oh.planDiff]);
ok('내신 반이 없는 학생도 목록에 남는다(수업 0회)', !!yu.name && yu.count === 0 && yu.plan === 0 && yu.noClass === true, yu);
ok('그 학생 기준은 정규 주1회로 잡아 미달이 드러난다', yu.weekly === 1 && yu.threshold === 4 && yu.under === true && yu.diff === -4, [yu.weekly, yu.threshold, yu.diff]);
/* 정규 주만 있는 달이면 같은 중2가 주1회 기준 */
const S12 = CORE.build(JSON.parse(JSON.stringify(DATA3)), 2026, 12);
const han12 = S12.rows.find(r => r.name === '한서윤') || {};
ok('정규 주만 있는 달에는 같은 학생이 주1회 기준(4회)', han12.weekly === 1 && han12.threshold === 4, [han12.weekly, han12.plan]);
ok('유채아는 정규 달에는 수업이 있다', (S12.rows.find(r => r.name === '유채아') || {}).plan > 0);
ok('threshold: 주당 횟수 × 4', CORE.threshold(1) === 4 && CORE.threshold(2) === 8 && CORE.threshold(0) === 0);

/* ── 직보 주에는 그 주 수업을 직보로 몰아서 한다 (2026-09-22 사용자 "월요일에 직보를 3시간 한 주간에는 그 주의 수업을 그것으로 대체해서 수업에 오지 않습니다") ──
 * ① [이 주만 반 추가]로 새 직보 반을 만들고 학생을 넣으면 원래 수업(고1 가·고1 나)이 그대로 남아 직보가 덧붙어 세어졌다(10/12 화정B·화정D 15명).
 *    이제 직보를 따로 세지 않고 그 주 수업들의 '진행'으로 붙인다 — 그 주 회차는 원래대로 2회.
 * ② [이 주만 시간 옮기기]로 만든 직보는 원본이 그 날 숨어 이미 1:1이므로 종전 그대로(그 주 다른 수업을 먹지 않는다). */
const DATA4 = {
  periods: [],   /* 미지정 = 전부 정규 */
  students: [
    { name: '서윤우', school: '화정고', grade: '2026 고등 1학년', enrolled: '재원' },
    { name: '한도윤', school: '화수고', grade: '2026 고등 1학년', enrolled: '재원' }
  ],
  classes: [
    cls('정규', 'r1', '목', '5:30', '고1 가', '서윤우'),
    cls('정규', 'r2', '토', '3:30', '고1 나', '서윤우'),
    cls('정규', 'w261012b', '월', '1:30', '고1 화정B(천재수 공통국어2)', '', '직보'),   /* ① 새 반 — 서윤우를 주간추가 */
    cls('정규', 'r3', '목', '7:00', '고1 다', '한도윤'),
    cls('정규', 'r4', '토', '5:00', '고1 라', '한도윤'),
    cls('정규', 'w261012c', '월', '1:00', '고1 다', '', '직보')                        /* ② r3을 10/15 → 10/12로 옮긴 복사본 */
  ],
  logs: [
    { id: 1, at: '2026-10-10T03:00:00Z', kind: '주간추가', student: '서윤우', from_class_id: '', to_class_id: 'w261012b', apply_date: '2026-10-12', reason: '' },
    { id: 2, at: '2026-10-10T03:00:00Z', kind: '주간반이동', student: '', from_class_id: 'r3', to_class_id: 'w261012c', apply_date: '2026-10-15', reason: '시험 대비 직보' }
  ]
};
const J10 = CORE.build(JSON.parse(JSON.stringify(DATA4)), 2026, 10);
const sy = J10.rows.find(r => r.name === '서윤우') || {}, hd = J10.rows.find(r => r.name === '한도윤') || {};
const wk = it => it.date >= '2026-10-14' && it.date <= '2026-10-20';
ok('① 직보 세션은 따로 세지 않는다(10/12 줄 없음)', !sy.items.some(it => it.date === '2026-10-12'), sy.detail);
ok('① 그 주 수업 두 개가 직보 진행으로 남아 2회', sy.items.filter(wk).length === 2 && sy.items.filter(wk).every(it => it.held === '2026-10-12' && it.heldWhen === '월1:30'), sy.detail);
ok('① 비고는 "10/12 월1:30에 직보로 진행"', CORE.runNote(sy.items.filter(wk)[0], dl) === '10/12 월1:30에 직보로 진행', CORE.runNote(sy.items.filter(wk)[0], dl));
ok('① 표기는 10/15(10/12 진행)·10/17(10/12 진행)', /10\/15\(10\/12 진행\)/.test(sy.detail) && /10\/17\(10\/12 진행\)/.test(sy.detail), sy.detail);
ok('① 회차는 늘지 않는다 — 목 5회 + 토 4회 = 9회', sy.count === 9 && sy.regular === 9, [sy.count, sy.detail]);
ok('② 옮겨서 만든 직보는 원래 날짜(10/15) 한 회, 진행 10/12', hd.items.filter(it => it.date === '2026-10-15').length === 1 && hd.items.find(it => it.date === '2026-10-15').held === '2026-10-12', hd.detail);
ok('② 옮긴 직보는 그 주 다른 수업(10/17)을 먹지 않는다', hd.items.some(it => it.date === '2026-10-17' && !it.runs.length) && hd.count === 9, [hd.count, hd.detail]);

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
