import { whoOf, reply, THANKS } from './lib.ts'
import { assertEquals, assertMatch, assertNotEquals } from 'jsr:@std/assert@1'

Deno.test('보낸 사람 구분은 6자 · 같은 키는 같은 값 · 키 원문은 안 남김', async () => {
  const a = await whoOf('kakao-user-1'), b = await whoOf('kakao-user-1'), c = await whoOf('kakao-user-2')
  assertMatch(a, /^[0-9a-f]{6}$/)
  assertEquals(a, b); assertNotEquals(a, c)
  assertEquals(await whoOf(''), '------')
})
Deno.test('오픈빌더 응답 2.0 형식', async () => {
  const j = await reply(THANKS).json()
  assertEquals(j.version, '2.0')
  assertEquals(j.template.outputs[0].simpleText.text, THANKS)
})
