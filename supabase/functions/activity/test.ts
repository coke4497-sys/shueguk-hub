import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1'
import { clean, digestDue, digestText, urgentText } from './lib.ts'
import { activityPlan, ACT_PAGE } from '../_shared/push.ts'

const T = '2026-10-27T05:12:00Z'   // 14:12 KST
Deno.test('줄 다듬기 — what 없으면 버림, 길이 제한·공백 정리', () => {
  assertEquals(clean({ action: 'x' }), null)
  const r = clean({ page: 'timetable', what: ' 시험  범위 ', action: '저장', target: 'a'.repeat(200), detail: 'd', author: '김현지', urgent: 'yes' })!
  assertEquals(r.what, '시험 범위'); assertEquals(r.target.length, 120); assertEquals(r.urgent, true)
})
Deno.test('즉시 글 — [종류] 이름 · 동작 · 대상 + 내용', () => {
  const t = urgentText([{ at: T, page: 'timetable', what: '시험 범위', action: '저장 (입력 완료)', target: '고1 화정 · 26-2-기말', detail: '교과서: 천재수 공통국어2', author: '김현지', urgent: true }])
  assertEquals(t, '[시험 범위] 김현지 · 저장 (입력 완료) · 고1 화정 · 26-2-기말\n교과서: 천재수 공통국어2')
  assertMatch(urgentText([{ at: T, page: '', what: '시간표', action: '', target: '', detail: '', author: '', urgent: true }]), /\[시간표\] 이름 없음 · 변경$/)
})
Deno.test('묶음 글 — 종류·동작별 건수, 사람별 건수, 대상 셋까지, 시간 범위', () => {
  const rows = [
    { at: '2026-10-27T05:00:00Z', page: 'timetable', what: '출석', action: '출석', target: '고1 가 10/27', detail: '', author: '김상우', urgent: false },
    { at: '2026-10-27T05:10:00Z', page: 'timetable', what: '출석', action: '출석', target: '고1 가 10/27', detail: '', author: '김상우', urgent: false },
    { at: '2026-10-27T06:00:00Z', page: 'timetable', what: '출석', action: '출석', target: '고2 나 10/27', detail: '', author: '최예나', urgent: false },
    { at: '2026-10-27T06:30:00Z', page: 'timetable', what: '수업 기록', action: '리포트 생성', target: '고3파이널A 10/27', detail: '', author: '이수경', urgent: false },
  ]
  const t = digestText(rows)
  assertEquals(t.split('\n')[0], '티쳐스 활동 요약 · 10/27 14:00~15:30 · 4건')
  assertEquals(t.split('\n')[1], '· 출석 출석 3건 (김상우 2, 최예나 1) — 고1 가 10/27, 고2 나 10/27')
  assertEquals(t.split('\n')[2], '· 수업 기록 리포트 생성 1건 (이수경) — 고3파이널A 10/27')
  assertEquals(digestText([]), '')
})
Deno.test('묶을 때 — 가장 오래된 대기 줄이 120분 넘게 기다렸을 때만', () => {
  const now = Date.parse(T)
  assert(!digestDue(null, now))
  assert(!digestDue(new Date(now - 119 * 60e3).toISOString(), now))
  assert(digestDue(new Date(now - 121 * 60e3).toISOString(), now))
})
Deno.test('원장님 푸시 — 활성 admin 기기만, 제목 = 첫 줄, 본문 = 나머지, 활동 기록 화면 주소, 슈톡 숫자 안 올림 (202610290001)', () => {
  const sub = (id: number, user_id: string, mode = 'all') => ({ id, user_id, endpoint: 'e' + id, p256dh: 'p', auth: 'a', mode, fail_count: 0 })
  const subs = [sub(1, 'boss'), sub(2, 'boss', 'mention'), sub(3, 'teacher'), sub(4, 'old-boss')]
  const items = activityPlan({ id: 7, kind: '즉시', text: '[시험 범위] 김현지 · 저장 (입력 완료) · 고1 화정 · 26-2-기말\n교과서: 천재수 공통국어2' }, subs, new Set(['boss']))
  assertEquals(items.map((x) => x.sub.id), [1, 2])
  assertEquals(items[0].payload, { title: '[시험 범위] 김현지 · 저장 (입력 완료) · 고1 화정 · 26-2-기말', body: '교과서: 천재수 공통국어2', url: ACT_PAGE + '#n7', tag: 'act7', task: false, badge: false })
  const one = activityPlan({ id: 8, kind: '요약', text: '티쳐스 활동 요약 · 10/27 14:00~15:30 · 4건\n· 출석 출석 3건 (김상우 2, 최예나 1)\n· 수업 기록 1건 (이수경)' }, subs, new Set(['boss']))
  assertEquals(one[0].payload.body, '출석 출석 3건 (김상우 2, 최예나 1) · 수업 기록 1건 (이수경)')
  assertEquals(activityPlan({ id: 9, kind: '즉시', text: '한 줄뿐' }, subs, new Set(['boss']))[0].payload.body, '한 줄뿐')
  assertEquals(activityPlan({ id: 9, kind: '즉시', text: 'x' }, subs, new Set()).length, 0)
})
