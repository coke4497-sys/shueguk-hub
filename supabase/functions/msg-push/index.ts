// 슈톡(Shuetalk) 휴대폰 푸시 알림 (2026-10-19)
// POST { action: 'key' }                 → { key }  VAPID 공개 키 (구독할 때 쓴다)
// POST { action: 'send', message_id }    → 그 메시지 알림을 보낸다 (한 메시지에 한 번만 — msg_messages.pushed_at 으로 잡음)
//                                          내 메시지 또는 클로슈 메시지(bot — 아무 활성 교사나 불러도 한 번만 나감)
// POST { action: 'test' }                → 내 기기들에 시험 알림
// POST { action: 'hand', task_id }       → 내가 넘긴 할 일을 받은 사람 기기에 알림 (msg_tasks.hand_push 로 한 번만 — 202610200002)
// 호출하는 사람은 활성 교사(teacher_accounts)여야 한다. 받는 사람: 작성자 빼고 구독한 모든 기기
//   (mode='mention' 기기는 그 메시지에서 자기에게 할 일이 생겼을 때만).
// 비밀값: VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY (supabase secrets set) — 저장소에 넣지 않는다.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from 'jsr:@supabase/server@^1'

import { PAGE, cut, plan, handPlan, setup, deliver, pushMessage, pushHand, type Sub } from '../_shared/push.ts'
export { cut, plan, handPlan }

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' },
  })
}

const handler = withSupabase({ auth: 'user' }, async (request, context) => {
  if (request.method !== 'POST') return reply(405, { error: 'method' })
  const uid = context.userClaims?.id
  if (!uid) return reply(401, { error: 'login' })
  const admin = context.supabaseAdmin
  const { data: me } = await admin.from('teacher_accounts').select('user_id,display_name,active').eq('user_id', uid).maybeSingle()
  if (!me?.active) return reply(403, { error: 'not_teacher' })

  // deno-lint-ignore no-explicit-any
  let input: any = {}
  try { input = await request.json() } catch (_) { /* 빈 본문 */ }

  if (input.action === 'key') {
    const key = Deno.env.get('VAPID_PUBLIC_KEY')
    return key ? reply(200, { key }) : reply(503, { error: 'no_vapid' })
  }
  if (!setup()) return reply(503, { error: 'no_vapid' })

  if (input.action === 'test') {
    const { data: subs } = await admin.from('msg_push_subs').select('*').eq('user_id', uid)
    const items = (subs || []).map((s: Sub) => ({ sub: s, payload: { title: '슈톡', body: me.display_name + '님, 알림이 잘 옵니다.', url: PAGE, tag: 'msgtest', task: false } }))
    return reply(200, { devices: items.length, ...(await deliver(admin, items)) })
  }

  if (input.action === 'send') {
    const id = Number(input.message_id)
    if (!Number.isInteger(id) || id <= 0) return reply(400, { error: 'bad_id' })
    // 다 읽고 → 아직 안 보냈고·안 지웠고·내가 쓴(또는 클로슈) 메시지일 때만 자리를 잡아 한 번만 보낸다.
    // 읽기·잡기가 실패하거나 한 기기에도 못 보냈으면 503 → 화면이 5초 뒤 다시 부른다 (Codex 검토 — 공용 pushMessage)
    const r = await pushMessage(admin, id, (q) => q.or('author.eq.' + uid + ',and(author.is.null,bot.not.is.null)'))
    return reply(r.status, r.body)
  }
  if (input.action === 'hand') {
    const id = Number(input.task_id)
    if (!Number.isInteger(id) || id <= 0) return reply(400, { error: 'bad_id' })
    // 다 읽고 → hand_push 를 비우며 잡고 → 보냄(공용 pushHand — 클로슈 순찰도 같은 함수로 화면이 못 부른 것을 보낸다)
    const r = await pushHand(admin, id, uid)
    return reply(r.status, r.body)
  }
  return reply(400, { error: 'bad_action' })
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export default {
  async fetch(request: Request) {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const response = await handler(request)
    const headers = new Headers(response.headers)
    Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value))
    return new Response(response.body, { status: response.status, headers })
  },
}
