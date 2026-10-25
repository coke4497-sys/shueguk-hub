// msg-push 로컬 검사 — deno test supabase/functions/msg-push/test.ts
// ① 받을 기기 고르기(plan) ② 이 런타임(Deno)에서 web-push 암호화가 되는지 — 가짜 구독 키로 만든 요청을
//    그 기기의 비밀 키로 풀어 내용이 같은지 본다(네트워크 없음).
import { plan, cut, handPlan } from './index.ts'
import { workSet, workYmd } from '../_shared/push.ts'
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

Deno.test('클로슈 메시지 — 받을 사람이 정해지면 그 사람 기기에만', () => {
  const bot = { id: 5, author: null, author_name: '클로슈', body: '@이은지 약속 시각이 지났어요', files: [], deleted_at: null, bot: { to: [B] } }
  assertEquals(plan(bot, [], [sub(1, A), sub(2, B), sub(3, C)], new Set([A, B, C])).map((i) => i.sub.id), [2])
  const all = { ...bot, bot: {} }
  assertEquals(plan(all, [], [sub(1, A), sub(2, B)], new Set([A, B])).map((i) => i.sub.id), [1, 2])
  // 옛 'mention' 범위로 저장된 기기도 bot.to 대상이면 받는다
  assertEquals(plan(bot, [], [{ ...sub(2, B), mode: 'mention' }, { ...sub(3, C), mode: 'mention' }], new Set([A, B, C])).map((i) => i.sub.id), [2])
  // 받을 사람이 없는 클로슈 글(오늘 정리)은 옛 'mention' 기기에도 간다 (Codex 검토)
  assertEquals(plan(all, [], [{ ...sub(1, A), mode: 'mention' }, sub(2, B)], new Set([A, B])).map((i) => i.sub.id), [1, 2])
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

Deno.test('일부 실패 다시 보내기는 적어 둔 기기에만 (Codex 검토)', async () => {
  const { onlySubs } = await import('../_shared/push.ts')
  const items = [1, 2, 3].map((id) => ({ sub: { id } as unknown as import('../_shared/push.ts').Sub, payload: {} }))
  assertEquals(onlySubs(items, [2, 3]).map((x) => Number(x.sub.id)), [2, 3])
  assertEquals(onlySubs(items, null).length, 0)
})

Deno.test('출근 날에만 — 쉬는 사람은 빼고, 나에게 할 일·클로슈 지정·근무 중인 사람은 받는다', () => {
  const msg = { id: 8, author: A, author_name: '이수경', body: '내일 시험지 @고희주', files: [], deleted_at: null }
  const D = 'd'
  const subs = [sub(1, B), sub(2, C), sub(3, D)]
  const work = new Set([C])   // C 만 오늘 근무, B 는 쉬지만 할 일을 받음, D 는 쉼
  assertEquals(plan(msg, [{ assignee: B, text: '내일 시험지' }], subs, new Set([A, B, C, D]), work).map((i) => i.sub.id), [1, 2])
  assertEquals(plan(msg, [], subs, new Set([A, B, C, D]), null).map((i) => i.sub.id), [1, 2, 3])   // 못 읽으면 거르지 않음
  const bot = { id: 9, author: null, author_name: '클로슈', body: '약속 시각이 지났어요', files: [], deleted_at: null, bot: { to: [D] } }
  assertEquals(plan(bot, [], subs, new Set([B, C, D]), work).map((i) => i.sub.id), [3])
  const sum = { ...bot, bot: {} }
  assertEquals(plan(sum, [], subs, new Set([B, C, D]), work).map((i) => i.sub.id), [2])
})

Deno.test('오늘 근무 일정 — 근무표·기본 근무표·출근 기록·수업·원장님·대표님', () => {
  const members = [
    { user_id: 'boss', display_name: '이수경', role: 'admin', login_id: 'sk' },
    { user_id: 'ceo', display_name: '박언호', role: 'teacher', login_id: 'parkeh' },
    { user_id: 'as1', display_name: '고희주', role: 'assistant', login_id: 'a1' },
    { user_id: 'as2', display_name: '조수민', role: 'assistant', login_id: 'a2' },
    { user_id: 'as3', display_name: '김영훈', role: 'assistant', login_id: 'a3' },
    { user_id: 'as4', display_name: '최예나', role: 'assistant', login_id: 'a4' },
    { user_id: 't1', display_name: '이은지', role: 'teacher', login_id: 't1' },
    { user_id: 't2', display_name: '김지원', role: 'teacher', login_id: 't2' },
    { user_id: 't3', display_name: '박현정', role: 'teacher', login_id: 't3' },
    { user_id: 't4', display_name: '배선주', role: 'teacher', login_id: 't4' },
    { user_id: 't5', display_name: '이선주', role: 'teacher', login_id: 't5' },
    { user_id: 't6', display_name: '김주혜', role: 'teacher', login_id: 't6' },
  ]
  const set = workSet({
    day: '2026-10-25', members,
    shifts: [{ loc: '본원', slot: 1, user_id: 'as1' }, { loc: '본원', slot: 2, user_id: null }],
    roster: [{ loc: '본원', slot: 1, user_id: 'as2' }, { loc: '본원', slot: 2, user_id: 'as2' }, { loc: '화정센터', slot: 1, user_id: 'as3' }],
    presence: [{ user_id: 'as4' }],
    classes: [
      { book: '정규', class_id: 'r001', name: '고1 가', teacher: '은지', roster: '김민준' },
      { book: '내신', class_id: 'n001', name: '고2 확인', teacher: '지원', roster: '김민준' },   // 기간이 정규라 아님
      { book: '정규', class_id: 'r002', name: '고3파이널A', teacher: '현정', roster: '' },        // 명단 없음
      { book: '정규', class_id: 'r003', name: '정리정독 중3', teacher: '선주', roster: '김민준' }, // 선주가 둘 — 못 가림
      { book: '정규', class_id: 'r004', name: '고2 나', teacher: '주혜', roster: '김민준' },      // 휴강
    ],
    period: { book: '정규', overrides: {} },
    off: ['r004'],
  })
  assertEquals([...set].sort(), ['as1', 'as3', 'as4', 'boss', 'ceo', 't1'])
  // 학년 예외 — 중2만 내신이면 내신 중2 반 담당이 들어온다
  const s2 = workSet({ day: '2026-10-25', members, shifts: [], roster: [], presence: [], off: [],
    classes: [{ book: '내신', class_id: 'n050', name: '정리정독 중2', teacher: '지원', roster: '이하윤' }],
    period: { book: '정규', overrides: { 중2: '내신' } } })
  assertEquals(s2.has('t2'), true)
  // 근무일은 새벽 5시에 바뀐다
  assertEquals(workYmd(Date.parse('2026-10-26T02:00:00+09:00')), '2026-10-25')
  assertEquals(workYmd(Date.parse('2026-10-26T05:00:00+09:00')), '2026-10-26')
})
