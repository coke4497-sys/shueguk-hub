// ai-office 로컬 검사 — deno test supabase/functions/ai-office/test.ts
import { sameToken, todoOf } from './lib.ts'
import { assertEquals } from 'jsr:@std/assert@1'

Deno.test('비밀값 비교', () => {
  assertEquals(sameToken('abc', 'abc'), true)
  assertEquals(sameToken('abc', 'abd'), false)
  assertEquals(sameToken('', ''), false)
})

Deno.test('할 지시 고르기', () => {
  const now = Date.parse('2026-10-23T10:00:00Z')
  const orders = [
    { id: 1, status: '접수', picked_at: null },
    { id: 2, status: '진행', picked_at: null },                           // 할 일이 모두 확인 칸 → 기다림
    { id: 3, status: '진행', picked_at: null },                           // 다시 고쳐 줘 → 진행 칸
    { id: 4, status: '진행', picked_at: '2026-10-23T09:40:00Z' },          // 20분 전 다른 순찰이 가져감
    { id: 5, status: '진행', picked_at: '2026-10-23T09:00:00Z' },          // 60분 전 — 멈춘 순찰
    { id: 6, status: '접수', picked_at: '2026-10-23T09:55:00Z' },
  ]
  const tasks = [
    { id: 1, order_id: 2, col: '확인' }, { id: 2, order_id: 3, col: '진행' }, { id: 3, order_id: 3, col: '완료' },
    { id: 4, order_id: 4, col: '진행' }, { id: 5, order_id: 5, col: '검수' },
  ]
  assertEquals(todoOf(orders, tasks, now), [1, 3, 5])
})
