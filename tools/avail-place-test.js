#!/usr/bin/env node
/* 시간표 조사 자동 배치 추천(avail.html PLACE-CORE) 검사 — 블록만 떼어 실행한다.
 *   node tools/avail-place-test.js */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'avail.html'), 'utf8');
const a = src.indexOf('  const PLACE = (function(){'), b = src.indexOf('  })();', a) + 7;
const minsSrc = src.slice(src.indexOf('  function mins(t){'), src.indexOf('  function fmt12('));
const PLACE = new Function(`const DAYS = { '월':1,'화':2,'수':3,'목':4,'금':5,'토':6,'일':7 };
${minsSrc}
function slotSort(a, b){ return (DAYS[a.day] - DAYS[b.day]) || (mins(a.start) - mins(b.start)); }
${src.slice(a, b)}
return PLACE;`)();
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m + (x !== undefined ? ' ' + JSON.stringify(x) : ''))); };
const sl = (day, start) => ({ id: day + '-' + start, day, start, end: '' });
const SL = [sl('수', '5:30'), sl('수', '8:00'), sl('토', '11:00'), sl('토', '1:30')];
const st = (name, no) => ({ code: name, name, school: '화정고', grade: '2026 고등 1학년', no });

// ① 주 1회 — 모두 들어가는 두 칸 조합
let r = PLACE.plan(SL, [st('가', ['수-8:00', '토-11:00', '토-1:30']), st('나', ['수-5:30', '수-8:00', '토-1:30']), st('다', ['수-5:30', '수-8:00', '토-11:00']), st('라', [])], 2, 1, 9);
let p = r.plans[0];
ok(p.full === 3 && p.left.length === 1, '주 1회 두 칸: 세 명만 되는 칸이 각각 달라 3명', p.classes.map(c => c.slot.id));
r = PLACE.plan(SL, [st('가', ['수-8:00', '토-11:00', '토-1:30']), st('나', ['수-5:30', '수-8:00', '토-1:30']), st('라', [])], 2, 1, 9);
ok(r.plans[0].full === 3 && JSON.stringify(r.plans[0].classes.map(c => c.slot.id)) === JSON.stringify(['수-5:30', '토-11:00']), '가→수5:30, 나→토11:00 조합이 1안');
ok(r.plans.length === 3 && r.combos === 6, '세 안·조합 6개');
ok(r.plans[1].full < 3, '1안이 가장 많이 넣음');
ok(r.plans[0].full >= r.plans[1].full && r.plans[1].full >= r.plans[2].full, '안 순서(배정 많은 순)');

// ② 정원 — 한 칸에 4명 가능하지만 정원 2
r = PLACE.plan([sl('수', '5:30')], ['A', 'B', 'C', 'D'].map(n => st(n, [])), 1, 1, 2);
p = r.plans[0];
ok(p.full === 2 && p.left.length === 2 && p.left.every(x => x.why === '정원이 참'), '정원 넘친 학생은 정원이 참');

// ③ 주 2회 — 같은 요일 두 칸만 되는 학생은 못 들어감
r = PLACE.plan(SL, [st('수만', ['토-11:00', '토-1:30']), st('모두', [])], 4, 2, 9);
p = r.plans[0];
ok(p.full === 1 && p.left.length + p.half.length === 1, '같은 요일만 되면 주 2회 불가');
ok(p.half.concat(p.left)[0].why === '가능한 칸 없음', '이유: 가능한 칸 없음');
const two = p.classes.filter(c => c.stus.some(x => x.name === '모두')).map(c => c.slot.day);
ok(two.length === 2 && two[0] !== two[1], '주 2회 학생은 서로 다른 요일 두 반', two);

// ④ 고르게 — 4명 모두 두 칸 다 가능하면 2:2
r = PLACE.plan([sl('수', '5:30'), sl('목', '5:30')], ['A', 'B', 'C', 'D'].map(n => st(n, [])), 2, 1, 9);
ok(r.plans[0].classes.map(c => c.stus.length).join() === '2,2', '인원 고르게 2:2');

// ⑤ 요일 하나뿐인 주 2회 · 칸 수 잘못
ok(/요일이 둘 이상/.test(PLACE.plan([sl('수', '5:30'), sl('수', '8:00')], [st('A', [])], 2, 2, 9).note), '주 2회 요일 하나 안내');
ok(/칸 수/.test(PLACE.plan(SL, [st('A', [])], 9, 1, 9).note), '칸 수 넘침 안내');

// ⑥ 무작위 작은 문제 — 모든 배정을 직접 따져 본 최댓값과 같다(주 1회·주 2회)
function brute(slots, stus, n, f, cap){
  let best = 0; const m = slots.length;
  const pick = [];
  const choose = s0 => {
    if (pick.length === n){
      const load = pick.map(() => 0);
      const opts = stus.map(x => { const ok = pick.map((j, k) => k).filter(k => x.no.indexOf(slots[pick[k]].id) < 0);
        const out = [[]]; if (f === 1) ok.forEach(k => out.push([k]));
        else ok.forEach((k1, i1) => ok.slice(i1 + 1).forEach(k2 => { if (slots[pick[k1]].day !== slots[pick[k2]].day) out.push([k1, k2]); }));
        return out; });
      const go = (i, full) => { if (full + (stus.length - i) <= best) return; if (i === stus.length){ best = Math.max(best, full); return; }
        for (const o of opts[i]){ if (o.some(k => load[k] >= cap)) continue; o.forEach(k => load[k]++); go(i + 1, full + (o.length ? 1 : 0)); o.forEach(k => load[k]--); } };
      go(0, 0); return;
    }
    for (let j = s0; j < m; j++){ pick.push(j); choose(j + 1); pick.pop(); }
  };
  choose(0); return best;
}
var MISS = 0; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const POOL = [sl('수', '5:30'), sl('수', '8:00'), sl('목', '5:30'), sl('토', '11:00'), sl('토', '1:30')];
let same = 0, runs = 0, bad = null;
for (let t = 0; t < 200; t++){
  const f = t % 2 ? 2 : 1, n = 2 + (t % 3), cap = 1 + (t % 3);
  const stus = Array.from({ length: 4 + (t % 4) }, (_, i) => st('s' + i, POOL.filter(() => rnd() < 0.4).map(x => x.id)));
  const got = PLACE.plan(POOL, stus, n, f, cap).plans[0].full, want = brute(POOL, stus, n, f, cap);
  runs++; if (got === want) same++; else { if (!bad) bad = { t, f, n, cap, got, want, stus: stus.map(x => x.no.join("/")) }; MISS = (MISS||0)+1; }
}
console.log('miss', MISS); ok(same === runs, '무작위 ' + runs + '문제: 직접 따진 최댓값과 같음', bad);

// ⑦ 큰 문제(조합 10만 넘음) — 빔 탐색으로 빨리 끝남
const BIG = [];
['수', '목', '금'].forEach(d => ['5:30', '6:00', '6:30', '7:00', '7:30', '8:00'].forEach(t => BIG.push(sl(d, t))));
['토', '일'].forEach(d => ['11:00', '1:30', '4:30', '7:00', '9:00 '].forEach(t => BIG.push(sl(d, t.trim()))));
const many = Array.from({ length: 120 }, (_, i) => st('b' + i, BIG.filter(() => rnd() < 0.3).map(x => x.id)));
const t0 = Date.now(); r = PLACE.plan(BIG, many, 8, 2, 20); const ms = Date.now() - t0;
ok(r.beam && r.plans.length && ms < 8000, '큰 문제 빔 탐색 ' + ms + 'ms · ' + r.plans[0].full + '/120명');
const t1 = Date.now(); r = PLACE.plan(BIG.slice(0, 18), many, 4, 1, 40); const ms1 = Date.now() - t1;
ok(!r.beam && ms1 < 8000, '조합 ' + r.combos + '개 모두 따짐 ' + ms1 + 'ms');

console.log('\n' + pass + '건 통과, ' + fail + '건 실패');
process.exit(fail ? 1 : 0);
