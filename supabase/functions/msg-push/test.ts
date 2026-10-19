// msg-push 로컬 검사 — deno test supabase/functions/msg-push/test.ts
// ① 받을 기기 고르기(plan) ② 이 런타임(Deno)에서 web-push 암호화가 되는지 — 가짜 구독 키로 만든 요청을
//    그 기기의 비밀 키로 풀어 내용이 같은지 본다(네트워크 없음).
import { plan, cut, handPlan } from './index.ts'
import webpush from 'npm:web-push@3.6.7'
import ece from 'npm:http_ece@1.2.0'
import crypto from 'node:crypto'
import { assertEquals } from 'jsr:@std/assert@1'

const A = 'a', B = 'b', C = 'c'
const sub = (id: number, user: string, mode = 'all') => ({ id, user_id: user, endpoint: 'https://push/' + id, p256dh: 'x'.repeat(30), auth: 'y'.repeat(10), mode, fail_count: 0 })

Deno.test('작성자 빼고 모두, mention 기기는 자기 할 일만', () => {
  const msg = { id: 7, author: A, author_name: '이수경', body: '고1 시험지 확인 @고희주', files: [], deleted_at: null }
  const items = plan(msg, [{ assignee: B, text: '고1 시험지 확인' }], [sub(1, A), sub(2, B), sub(3, C), sub(4, C, 'mention'), sub(5, B, 'mention')], new Set([A, B, C]))
  assertEquals(items.map((i) => i.sub.id), [2, 3, 5])
  const b = items.find((i) => i.sub.id === 2)!.payload
  assertEquals(b.title, '이수경 → 나에게 할 일')
  assertEquals(b.body, '고1 시험지 확인')
  assertEquals(b.url.endsWith('messenger.html#m7'), true)
  const c = items.find((i) => i.sub.id === 3)!.payload
  assertEquals(c.title, '이수경')
  assertEquals(c.body, '고1 시험지 확인 @고희주')
})

Deno.test('파일만 보낸 메시지·긴 글', () => {
  const items = plan({ id: 1, author: A, author_name: '이수경', body: '', files: [{ name: 'a.pdf' }, { name: 'b.pdf' }], deleted_at: null }, [], [sub(1, B)], new Set([A, B]))
  assertEquals(items[0].payload.body, '파일 2개를 보냈습니다.')
  assertEquals(cut('가'.repeat(200), 140).length, 140)
})

Deno.test('비활성(퇴사) 교사의 기기는 받지 않는다', () => {
  const msg = { id: 3, author: A, author_name: '이수경', body: '공지 @고희주', files: [], deleted_at: null }
  const items = plan(msg, [{ assignee: C, text: '공지' }], [sub(1, B), sub(2, C)], new Set([A, B]))
  assertEquals(items.map((i) => i.sub.id), [1])
})

Deno.test('넘겨받은 사람 기기에만, 대기 중·활성일 때만', () => {
  const t = { id: 9, message_id: 4, text: '교재 주문', to: B, status: '대기' }
  const items = handPlan(t, '고희주', [sub(1, A), sub(2, B), sub(3, B)], new Set([A, B]))
  assertEquals(items.map((i) => i.sub.id), [2, 3])
  assertEquals(items[0].payload.title, '고희주 → 나에게 넘긴 일')
  assertEquals(items[0].payload.url.endsWith('#m4'), true)
  assertEquals(handPlan({ ...t, status: '취소' }, 'x', [sub(2, B)], new Set([B])).length, 0)
  assertEquals(handPlan(t, 'x', [sub(2, B)], new Set([A])).length, 0)
})

Deno.test('Deno에서 web-push 암호화가 되고 받는 기기가 풀 수 있다', () => {
  const vapid = webpush.generateVAPIDKeys()
  webpush.setVapidDetails('https://coke4497-sys.github.io/shueguk-hub/messenger.html', vapid.publicKey, vapid.privateKey)
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys()
  const authSecret = crypto.randomBytes(16)
  const s = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: ua.getPublicKey('base64url'), auth: authSecret.toString('base64url') } }
  const body = JSON.stringify({ title: '이은지 → 나에게 할 일', body: '결석 알림톡 보내기' })
  const req = webpush.generateRequestDetails(s, body, { TTL: 60, urgency: 'high' })
  assertEquals(req.method, 'POST')
  assertEquals(req.headers['Content-Encoding'], 'aes128gcm')
  assertEquals(String(req.headers['Authorization']).startsWith('vapid t='), true)
  const plain = ece.decrypt(req.body, { version: 'aes128gcm', privateKey: ua, authSecret })
  assertEquals(new TextDecoder().decode(plain), body)
})
