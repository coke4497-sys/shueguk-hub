// clochu 로컬 검사 — deno test supabase/functions/clochu/test.ts
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
  const q = new URLSearchParams(safeQuery('students', 'select=name,phone_parent1,code&name=eq.김민준')!)
  assertEquals(q.get('select'), 'name,school,grade,teacher,enrolled')
  assertEquals(q.get('name'), 'eq.김민준')
  assertEquals(new URLSearchParams(safeQuery('tt_classes', 'limit=99999')!).get('limit'), '1000')
  assertEquals(new URLSearchParams(safeQuery('msg_tasks', '')!).get('limit'), '200')
})
