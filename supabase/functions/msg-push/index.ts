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

import { PAGE, cut, plan, handPlan, setup, deliver, pushMessage, saveRetry, checked, type Sub } from '../_shared/push.ts'
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
    // send 와 같은 순서 — 다 읽고, 성공했을 때만 알림 자리(hand_push)를 비워 한 번만 보낸다
    const [t, a] = await Promise.all([
      admin.from('msg_tasks').select('id,message_id,text,status,hand_push').eq('id', id).eq('hand_by', uid).not('hand_push', 'is', null).maybeSingle(),
      admin.from('teacher_accounts').select('user_id').eq('active', true),
    ])
    if (t.error || a.error) return reply(503, { error: 'lookup_failed' })
    if (!t.data) return reply(200, { skipped: true })
    const to = t.data.hand_push as string
    const s = await admin.from('msg_push_subs').select('*').eq('user_id', to)
    if (s.error) return reply(503, { error: 'lookup_failed' })
    // 새 넘김 알림을 잡을 때 앞 넘김의 재시도 정보도 비운다 — A→B→A 처럼 다시 넘겼을 때 낡은 알림이 가지 않게 (Codex 검토)
    const { data: claimed, error: ce } = await admin.from('msg_tasks').update({ hand_push: null, hand_retry: null })
      .eq('id', id).eq('hand_by', uid).eq('hand_push', to).select('id,message_id,text,status,updated_at')
    if (ce) return reply(503, { error: 'claim_failed' })
    if (!claimed || !claimed.length) return reply(200, { skipped: true })
    const active = new Set<string>((a.data || []).map((r: { user_id: string }) => r.user_id))
    const items = handPlan({ ...claimed[0], to }, me.display_name, s.data || [], active)
    const r = await deliver(admin, items)
    // 한 기기에도 못 보냈고 일시적 실패가 있으면 자리를 되돌려 화면이 5초 뒤 다시 부르게 한다 (Codex 검토)
    if (!r.sent && r.failed) {
      await checked(() => admin.from('msg_tasks').update({ hand_push: to }).eq('id', id).is('hand_push', null).eq('updated_at', claimed[0].updated_at), 'unclaim hand ' + id)
      return reply(503, { error: 'deliver_failed', targets: items.length, ...r })
    }
    // 일부 기기만 실패 — 그 기기만 적어 두고 클로슈 순찰(closhu feed)이 retryHand 로 다시 보낸다 (Codex 검토)
    // 되돌림·재시도 정보 모두 잡은 뒤 그대로일 때만 — 보내는 사이 다시 넘겼으면 옛 사람을 되살리지 않는다 (Codex 검토)
    // 잡은 뒤 그대로일 때만 적는다 — 보내는 사이 다시 넘겼으면(updated_at 이 바뀜) 낡은 재시도 정보를 남기지 않는다 (Codex 검토)
    // 적기마저 실패하면 알림 자리(hand_push)를 되돌려 화면이 다시 부르게 한다 — 같은 tag 라 받은 기기에는 겹쳐 쌓이지 않는다 (Codex 검토)
    if (r.failedIds.length && !(await saveRetry(admin, 'msg_tasks', id, { hand_retry: { to, by: me.display_name, subs: r.failedIds } }, ['updated_at', claimed[0].updated_at]))) {
      await checked(() => admin.from('msg_tasks').update({ hand_push: to }).eq('id', id).is('hand_push', null).eq('updated_at', claimed[0].updated_at), 'unclaim hand ' + id)
      return reply(503, { error: 'retry_save_failed', targets: items.length, ...r })
    }
    return reply(200, { targets: items.length, ...r })
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
