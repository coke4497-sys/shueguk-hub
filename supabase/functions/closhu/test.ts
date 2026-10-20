// closhu 로컬 검사 — deno test supabase/functions/closhu/test.ts
import { sameToken, safeQuery } from './lib.ts'
import { assertEquals } from 'jsr:@std/assert@1'

Deno.test('비밀값 비교', () => {
  assertEquals(sameToken('abc', 'abc'), true)
  assertEquals(sameToken('abc', 'abd'), false)
  assertEquals(sameToken('', ''), false)
  assertEquals(sameToken('ab', 'abc'), false)
})

Deno.test('읽기 조회 — 허용 표만, 학생은 연락처 없이, 1000줄까지', () => {
  assertEquals(safeQuery('teacher_accounts', ''), null)
  assertEquals(safeQuery('msg_push_subs', ''), null)
  const q = new URLSearchParams(safeQuery('students', 'select=name,phone_parent1,code&name=eq.김민준')!.qs)
  assertEquals(q.get('select'), 'name,school,grade,teacher,enrolled')
  assertEquals(q.get('name'), 'eq.김민준')
  assertEquals(new URLSearchParams(safeQuery('tt_classes', 'limit=99999')!.qs).get('limit'), '1000')
  assertEquals(new URLSearchParams(safeQuery('msg_tasks', '')!.qs).get('limit'), '200')
})

Deno.test('시간표 — 기본 반과 이 주만 반을 서버가 갈라 준다', () => {
  const a = safeQuery('tt_classes', 'day=eq.수')!
  assertEquals(a.table, 'tt_classes')
  assertEquals(new URLSearchParams(a.qs).getAll('class_id'), ['not.like.w*'])
  const w = safeQuery('tt_week_classes', 'class_id=like.w2610*')!
  assertEquals(w.table, 'tt_classes')
  assertEquals(new URLSearchParams(w.qs).getAll('class_id'), ['like.w2610*', 'like.w*'])
})

Deno.test('학생 조회는 숨긴 열을 조건·정렬에 못 쓴다 (Codex 검토)', () => {
  const r = safeQuery('students', 'name=eq.김민준&phone_parent1=like.0101*&code=eq.x&or=(code.eq.x)&order=code.asc&limit=5')!
  const q = new URLSearchParams(r.qs)
  assertEquals(q.get('name'), 'eq.김민준')
  assertEquals(q.get('phone_parent1'), null)
  assertEquals(q.get('code'), null)
  assertEquals(q.get('or'), null)
  assertEquals(q.get('order'), null)
  assertEquals(q.get('limit'), '5')
  assertEquals(new URLSearchParams(safeQuery('students', 'order=name.asc')!.qs).get('order'), 'name.asc')
})
