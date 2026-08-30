#!/usr/bin/env node
/* 모의고사 회차 분석(omr_analysis.html)의 집계 로직 검증.
 *   node tools/omr-analysis-test.js            → 가짜 데이터로 규칙 검증
 *   SB_TOKEN=<교사 토큰> node tools/... --live  → 실제 회차로 채점 결과 대조
 *     (저장된 점수·등급 = 다시 채점한 점수·등급 인지 확인. 토큰은 저장하지 않는다.)
 * 화면 파일에서 ANALYSIS-CORE 블록만 떼어 실행하므로 로직이 두 벌이 되지 않는다. */
const fs = require('fs'), path = require('path'), vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'omr_analysis.html'), 'utf8');
const m = /\/\* ==ANALYSIS-CORE==[\s\S]*?\n([\s\S]*?)\/\* ==\/ANALYSIS-CORE== \*\//.exec(html);
if (!m) { console.error('ANALYSIS-CORE 블록을 찾지 못했습니다'); process.exit(1); }
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(m[1] + '\n;globalThis.__core = CORE;', ctx);
const CORE = ctx.__core;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function near(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 0.05 : eps); }

/* ── 가짜 회차 만들기 ───────────────────────────────────────── */
function mkExam(subject, cuts, opts) {
  opts = opts || {};
  const answers = {}, points = {}, areas = [];
  const THREE = [3, 6, 12, 18, 21, 27, 33, 36, 39, 42];   // 3점 10문항 + 2점 35문항 = 100점
  for (let q = 1; q <= 45; q++) { answers[q] = ((q % 5) + 1); points[q] = THREE.includes(q) ? 3 : 2; }
  if (opts.selAnswers) for (let q = 35; q <= 45; q++) answers[q] = opts.selAnswers[q - 35];
  areas.push({ cat: '독서', name: '독서론', qs: [1, 2, 3] });
  areas.push({ cat: '독서', name: '인문예술', qs: [4, 5, 6, 7, 8, 9] });
  const rest = []; for (let q = 10; q <= 34; q++) rest.push(q);
  areas.push({ cat: '문학', name: '문학전체', qs: rest });
  if (subject !== '공통') {
    const sel = []; for (let q = 35; q <= 45; q++) sel.push(q);
    areas.push({ cat: '선택과목', name: subject, qs: sel });
  } else {
    const sel = []; for (let q = 35; q <= 45; q++) sel.push(q);
    areas.push({ cat: '화작', name: '작문', qs: sel });
  }
  return { code: 'T', date: '2026-08-29', subject, cuts, answers, points, areas };
}
const PACK_G3 = {
  '화법과작문': mkExam('화법과작문', [88, 80, 71, 61]),
  '언어와매체': mkExam('언어와매체', [85, 78, 69, 58], { selAnswers: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] })
};
const PACK_INT = { mode: '통합', '통합': mkExam('공통', [90, 80, 70, 60]) };

// 정답을 그대로 쓴 답안에서 wrongQs 만 다른 번호로 바꾼다
function mkAnswers(pack, subject, wrongQs, blankQs) {
  const exam = CORE.packOf(pack, subject), a = {};
  for (let q = 1; q <= 45; q++) a[q] = String(exam.answers[q]);
  (wrongQs || []).forEach(q => { a[q] = String((Number(exam.answers[q]) % 5) + 1); });
  (blankQs || []).forEach(q => { delete a[q]; });
  return a;
}
let idSeq = 1;
function row(pack, subject, name, school, wrongQs, blankQs, at) {
  return {
    id: idSeq++, submitted_at: at || ('2026-08-29T0' + (idSeq % 9) + ':00:00+00:00'),
    exam: 'T', exam_date: '8월 29일', name, school, grade: '3', subject,
    answers: mkAnswers(pack, subject, wrongQs, blankQs)
  };
}
function fullScore(pack, subject) {
  const e = CORE.packOf(pack, subject); let t = 0;
  for (let q = 1; q <= 45; q++) t += Number(e.points[q]);
  return t;
}

/* ── 1. 구조 판별 ───────────────────────────────────────────── */
console.log('1. 회차 구조');
ok('고3형 과목 두 개', JSON.stringify(CORE.subjectsOf(PACK_G3)) === '["화법과작문","언어와매체"]');
ok('통합형 과목은 공통 하나', JSON.stringify(CORE.subjectsOf(PACK_INT)) === '["공통"]');
ok('고3형 공통 문항 = 1~34', CORE.commonQs(PACK_G3).length === 34 && CORE.commonQs(PACK_G3)[33] === 34);
ok('통합형 공통 문항 = 1~45', CORE.commonQs(PACK_INT).length === 45);
ok('통합형은 선택과목 응답도 통합 정답으로 채점',
  CORE.packOf(PACK_INT, '화법과작문') === PACK_INT['통합']);

/* ── 2. 채점·등급 ───────────────────────────────────────────── */
console.log('2. 채점과 등급');
{
  const total = fullScore(PACK_G3, '화법과작문');
  ok('배점 합계 100', total === 100, '합계 ' + total);
  const A = CORE.analyze(PACK_G3, [
    row(PACK_G3, '화법과작문', '가만점', '화정고', []),
    row(PACK_G3, '화법과작문', '나오답', '화정고', [1, 2, 3]),          // -2-2-3 = 93
    row(PACK_G3, '언어와매체', '다무응답', '능곡고', [], [1, 2, 3])      // 무응답도 오답
  ], {});
  const s = {}; A.students.forEach(x => s[x.name] = x);
  ok('만점 100점 1등급', s['가만점'].got === 100 && s['가만점'].level === '1');
  ok('3문항 오답 = 93점', s['나오답'].got === 93, '점수 ' + s['나오답'].got);
  ok('무응답도 오답 처리', s['다무응답'].got === 93, '점수 ' + s['다무응답'].got);
  ok('과목별 등급컷이 각각 적용', s['다무응답'].level === '1');   // 언매 컷 85
  ok('평균 = 95.3', near(A.avg, 95.3), '평균 ' + A.avg);
  ok('최고/최저', A.max === 100 && A.min === 93);
}
{
  // 등급컷 경계: 컷 값과 같으면 그 등급 (omr_score_build_ 와 동일)
  const cuts = [88, 80, 71, 61];
  ok('컷과 같으면 그 등급', CORE.gradeOf(88, cuts) === '1' && CORE.gradeOf(80, cuts) === '2');
  ok('4등급 컷 미만은 등급외', CORE.gradeOf(60, cuts) === '등급외' && CORE.gradeOf(61, cuts) === '4');
}

/* ── 3. 과목별 인원·평균, 등급별 명단 ───────────────────────── */
console.log('3. 과목별 집계와 등급별 명단');
{
  const rows = [
    row(PACK_G3, '화법과작문', '학생1', 'A고', []),                    // 100
    row(PACK_G3, '화법과작문', '학생2', 'A고', [1, 2]),                // 96
    row(PACK_G3, '언어와매체', '학생3', 'B고', [3, 6, 9, 12, 15]),      // 100-3-2-3-3-2=87 → 언매 1등급(85)
    row(PACK_G3, '언어와매체', '학생4', 'B고', Array.from({length: 20}, (_, i) => i + 1))
  ];
  const A = CORE.analyze(PACK_G3, rows, {});
  const hwa = A.bySubject.find(s => s.subject === '화법과작문');
  const eon = A.bySubject.find(s => s.subject === '언어와매체');
  ok('화작 응시 2명', hwa.n === 2);
  ok('언매 응시 2명', eon.n === 2);
  ok('화작 평균 98', near(hwa.avg, 98), '평균 ' + hwa.avg);
  ok('과목별 등급컷 표시', JSON.stringify(hwa.cuts) === '[88,80,71,61]');
  const lv1 = A.byLevel.find(l => l.level === '1');
  ok('1등급 명단 3명', lv1.n === 3, lv1.students.map(s => s.name).join(','));
  ok('명단은 점수 내림차순', lv1.students[0].got >= lv1.students[1].got);
  ok('등급 비율 합계 100%', near(A.byLevel.reduce((t, l) => t + l.pct, 0), 100, 0.2));
  ok('명단에 학교·과목이 함께 담김', lv1.students[0].school === 'A고' && !!lv1.students[0].subject);
}

/* ── 4. 중복 제출·테스트 제출 제외 ──────────────────────────── */
console.log('4. 중복·테스트 제출 처리');
{
  const rows = [
    row(PACK_G3, '화법과작문', '홍길동', 'A고', [1, 2, 3, 4, 5], null, '2026-08-29T01:00:00+00:00'),
    row(PACK_G3, '화법과작문', '홍길동', 'A고', [], null, '2026-08-29T03:00:00+00:00'),   // 나중 제출 = 만점
    row(PACK_G3, '화법과작문', '테스트', '테스트', [], null, '2026-08-29T02:00:00+00:00')
  ];
  const raw = CORE.analyze(PACK_G3, rows, {});
  ok('옵션 없으면 전부 집계', raw.n === 3);
  const A = CORE.analyze(PACK_G3, rows, { dedupe: true, dropTest: true });
  ok('중복은 최근 것만', A.n === 1 && A.students[0].got === 100, '인원 ' + A.n);
  ok('제외 건수 보고', A.dropped.dup === 1 && A.dropped.test === 1,
    JSON.stringify(A.dropped));
  const B = CORE.analyze(PACK_G3, rows, { dropTest: true });
  ok('테스트만 제외하면 2건', B.n === 2);
  ok('이름이 테스트인 행 판정', CORE.isTestRow({ name: '테스트', school: 'A고' }) === true
    && CORE.isTestRow({ name: '김테스트', school: 'A고' }) === false);
}

/* ── 5. 공통 오답률 TOP 10 과 선지 선택률 ───────────────────── */
console.log('5. 오답률 TOP 10 · 선지 선택률');
{
  // 4명: 1번은 3명 오답(75%), 2번은 2명 오답(50%), 나머지는 전원 정답
  const rows = [
    row(PACK_G3, '화법과작문', 'ㄱ', 'A고', [1, 2]),
    row(PACK_G3, '화법과작문', 'ㄴ', 'A고', [1, 2]),
    row(PACK_G3, '언어와매체', 'ㄷ', 'B고', [1]),
    row(PACK_G3, '언어와매체', 'ㄹ', 'B고', [])
  ];
  const A = CORE.analyze(PACK_G3, rows, {});
  ok('공통 문항 34개 집계', A.commonStats.length === 34);
  ok('TOP 10은 10개', A.top10.length === 10);
  const t1 = A.top10[0], t2 = A.top10[1];
  ok('1위 = 1번 문항 오답률 75%', t1.q === 1 && near(t1.wrongPct, 75), t1.q + '/' + t1.wrongPct);
  ok('2위 = 2번 문항 오답률 50%', t2.q === 2 && near(t2.wrongPct, 50), t2.q + '/' + t2.wrongPct);
  ok('오답률 내림차순', A.top10.every((s, i) => i === 0 || A.top10[i - 1].wrongPct >= s.wrongPct));
  ok('정답 수 표기', t1.right === 1 && t1.n === 4);
  const exam = CORE.packOf(PACK_G3, '화법과작문');
  const ansOf1 = String(exam.answers[1]);
  ok('선지 선택률 합계 100%',
    near(['1','2','3','4','5'].reduce((t, c) => t + t1.pickPct[c], 0) + t1.blankPct, 100, 0.2));
  ok('정답 선택률 = 25%', near(t1.pickPct[ansOf1], 25), JSON.stringify(t1.pickPct));
  ok('가장 많이 고른 오답 표시', t1.topWrong && t1.topWrong !== ansOf1 && near(t1.topWrongPct, 75),
    t1.topWrong + '/' + t1.topWrongPct);
  ok('선택과목 문항은 공통에서 빠짐', A.commonStats.every(s => s.q <= 34));
  const hwaQ = A.bySubjectQs.find(x => x.subject === '화법과작문');
  ok('선택과목 문항은 그 과목 응시자 기준', hwaQ.stats.length === 11 && hwaQ.stats[0].n === 2,
    hwaQ.stats[0].n + '명');
}
{
  // 무응답만 있는 문항: 오답률 100%, 무응답률 100%
  const rows = [row(PACK_INT, '공통', 'ㅁ', 'A고', [], [7])];
  const A = CORE.analyze(PACK_INT, rows, {});
  const q7 = A.commonStats.find(s => s.q === 7);
  ok('무응답 = 오답률 100%', near(q7.wrongPct, 100) && near(q7.blankPct, 100));
  ok('무응답이면 고른 오답 없음', q7.topWrong === null);
  ok('통합형은 문항 45개', A.commonStats.length === 45);
}

/* ── 6. 영역별 평균 성취도 ──────────────────────────────────── */
console.log('6. 영역별 평균 성취도');
{
  const rows = [
    row(PACK_G3, '화법과작문', 'ㄱ', 'A고', [1, 2, 3]),   // 독서론(1~3) 전부 오답
    row(PACK_G3, '언어와매체', 'ㄴ', 'B고', [])
  ];
  const A = CORE.analyze(PACK_G3, rows, {});
  const dok = A.areas.find(a => a.name === '독서론');
  ok('독서론 배점 7점(2+2+3)', dok.full === 7, '배점 ' + dok.full);
  ok('독서론 평균 3.5점', near(dok.avg, 3.5), '평균 ' + dok.avg);
  ok('독서론 성취도 50%', near(dok.rate, 50), '성취도 ' + dok.rate);
  ok('공통 영역은 전원 대상', dok.n === 2);
  const sel = A.areas.filter(a => a.cat === '선택과목');
  ok('선택 영역은 과목별로 따로', sel.length === 2 && sel.every(a => a.n === 1),
    sel.map(a => a.name + ':' + a.n).join(','));
  ok('공통 영역이 중복되지 않음',
    A.areas.filter(a => a.name === '독서론').length === 1);
  // 영역 이름이 과목명 그대로면(띄어쓰기만 달라도) 과목을 덧붙이지 않는다
  const spaced = {
    '화법과작문': mkExam('화법과작문', [88, 80, 71, 61]),
    '언어와매체': (function(){ const e = mkExam('언어와매체', [85, 78, 69, 58]);
      e.areas[e.areas.length - 1].name = '언어와 매체'; return e; })()
  };
  const S = CORE.analyze(spaced, [row(PACK_G3, '언어와매체', 'ㄷ', 'B고', [])], {});
  ok('선택과목 영역 이름이 겹쳐 적히지 않음',
    S.areas.some(a => a.name === '언어와 매체') && !S.areas.some(a => /\(/.test(a.name)),
    S.areas.map(a => a.name).join(','));
}

/* ── 7. 정답 없는 옛 회차 처리 ──────────────────────────────── */
console.log('7. 예외 처리');
{
  const half = { '화법과작문': mkExam('화법과작문', [88, 80, 71, 61]) };   // 언매 정답 없음
  const A = CORE.analyze(half, [
    row(PACK_G3, '화법과작문', 'ㄱ', 'A고', []),
    row(PACK_G3, '언어와매체', 'ㄴ', 'B고', [])
  ], {});
  ok('정답 없는 과목은 제외', A.n === 1 && A.dropped.nokey === 1);
}

/* ── 8. (선택) 실제 데이터 대조 ─────────────────────────────── */
/* 기준은 저장된 점수가 아니라 성적 관리가 쓰는 재채점 함수(omr_report_by_id)다 —
   출제 뒤 정답을 고친 회차는 저장값이 옛 점수 그대로라 서로 다를 수 있다(정상).
   그런 건은 '저장값과 다른 건'으로 알려만 준다. */
async function live() {
  const SB = 'https://bangdbhqpphqqdwcledg.supabase.co/rest/v1';
  const KEY = 'sb_publishable_dE9d1KIbpgYaQkaS2MSrlg_-7SiRJuT';
  const tok = process.env.SB_TOKEN;
  const h = { apikey: KEY, Authorization: 'Bearer ' + tok };
  const get = async p => { const r = await fetch(SB + p, { headers: h }); if (!r.ok) throw new Error('sb ' + r.status); return r.json(); };
  const rpc = async (fn, args) => {
    const r = await fetch(SB + '/rpc/' + fn, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify(args) });
    if (!r.ok) throw new Error('sb rpc ' + r.status); return r.json();
  };
  console.log('8. 실제 회차 대조 (성적 관리 재채점 함수와 같은 점수·등급인가)');
  const exams = await get('/omr_exams?select=name,data,mode&order=seq.desc');
  for (const ex of exams) {
    let pack = null; try { pack = JSON.parse(ex.data); } catch (e) { }
    if (!pack) continue;
    const rows = await get('/omr_responses?select=id,submitted_at,exam,exam_date,name,school,grade,subject,answers,got,level&exam='
      + 'eq.' + encodeURIComponent(ex.name) + '&limit=5000');
    if (!rows.length) continue;
    const A = CORE.analyze(pack, rows, {});
    const stored = {}; rows.forEach(r => stored[r.id] = r);

    // 표본(최대 5명)을 성적 관리와 같은 함수로 다시 채점해 대조
    const sample = A.students.filter((_, i) => i % Math.max(1, Math.ceil(A.students.length / 5)) === 0).slice(0, 5);
    let bad = 0;
    for (const s of sample) {
      const rep = await rpc('omr_report_by_id', { p: { id: s.id } });
      if (!rep || !rep.ok) { bad++; continue; }
      const got = Number(rep.result.got), lv = String(rep.result.grade);
      if (got !== s.got || lv !== s.level) {
        bad++;
        console.log('    · ' + s.name + ' 성적관리 ' + got + '/' + lv + ' vs 이 화면 ' + s.got + '/' + s.level);
      }
      // 문항 정오까지 같은지
      for (let q = 1; q <= 45; q++) {
        if (!!rep.result.detail[q].ok !== !!s.marks[q].ok) { bad++; console.log('    · ' + s.name + ' ' + q + '번 정오 불일치'); break; }
      }
    }
    ok('[' + ex.name + '] 표본 ' + sample.length + '명 성적 관리와 일치', bad === 0, bad + '건 불일치');

    const stale = A.students.filter(s => String(s.got) !== String(Number(stored[s.id].got)) || s.level !== String(stored[s.id].level));
    const subj = A.bySubject.map(s => s.subject + ' ' + s.n + '명 평균 ' + s.avg).join(' · ');
    console.log('    ' + ex.name + ' — ' + subj
      + (A.top10.length ? ' · 최고 오답률 ' + A.top10[0].q + '번 ' + A.top10[0].wrongPct + '%' : '')
      + (stale.length ? ' · 제출 당시 저장값과 다른 건 ' + stale.length + '명(정답 수정 뒤 재채점)' : ''));
  }
}

(async () => {
  if (process.argv.includes('--live')) {
    if (!process.env.SB_TOKEN) { console.log('8. 실제 대조 건너뜀 (SB_TOKEN 없음)'); }
    else await live();
  }
  console.log('\n통과 ' + pass + ' · 실패 ' + fail);
  process.exit(fail ? 1 : 0);
})();
