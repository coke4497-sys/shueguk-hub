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
import webpush from 'npm:web-push@3.6.7'

const SUBJECT = 'https://coke4497-sys.github.io/shueguk-hub/messenger.html'
const PAGE = 'https://coke4497-sys.github.io/shueguk-hub/messenger.html'

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function cut(s: string, n: number) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

type Msg = { id: number; author: string | null; author_name: string; body: string; files: { name?: string }[]; deleted_at: string | null; bot?: { to?: string[] } | null }
type Task = { assignee: string | null; text: string }
type Sub = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string; mode: string; fail_count: number }

// 받는 기기마다 보낼 내용 — 순수 함수(시험용으로 따로 내보냄)
// active = 지금 활성 교사 user_id — 퇴사 등으로 비활성이 된 사람의 기기는 받지 않는다(Codex 검토 P1)
export function plan(msg: Msg, tasks: Task[], subs: Sub[], active: Set<string>) {
  const mine = new Map<string, Task>()
  tasks.forEach((t) => { if (t.assignee) mine.set(t.assignee, t) })
  const files = (msg.files || []).length
  const text = cut(msg.body, 140) || (files ? '파일 ' + files + '개를 보냈습니다.' : '')
  // 클로슈 메시지에 받을 사람(bot.to)이 정해져 있으면 그 사람 기기에만(약속 지남 알림 등 — 202610200007)
  const only = msg.bot && Array.isArray(msg.bot.to) ? new Set(msg.bot.to) : null
  return subs
    .filter((s) => s.user_id !== msg.author && active.has(s.user_id))
    .filter((s) => !only || only.has(s.user_id))
    .filter((s) => s.mode !== 'mention' || mine.has(s.user_id))
    .map((s) => {
      const t = mine.get(s.user_id)
      return {
        sub: s,
        payload: {
          title: t ? msg.author_name + ' → 나에게 할 일' : msg.author_name,
          body: t ? cut(t.text, 140) : text,
          url: PAGE + '#m' + msg.id,
          tag: 'msg' + msg.id,
          task: !!t,
        },
      }
    })
}

// 넘겨받은 사람에게 보낼 내용 — 순수 함수(시험용)
type Hand = { id: number; message_id: number; text: string; to: string; status: string }
export function handPlan(t: Hand, byName: string, subs: Sub[], active: Set<string>) {
  if (t.status !== '대기' || !active.has(t.to)) return []
  return subs.filter((s) => s.user_id === t.to).map((s) => ({
    sub: s,
    payload: { title: byName + ' → 나에게 넘긴 일', body: cut(t.text, 140), url: PAGE + '#m' + t.message_id, tag: 'tk' + t.id, task: true },
  }))
}

let ready = false
function setup() {
  if (ready) return true
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return false
  webpush.setVapidDetails(SUBJECT, pub, priv)
  ready = true
  return true
}

// deno-lint-ignore no-explicit-any
async function deliver(admin: any, items: { sub: Sub; payload: Record<string, unknown> }[]) {
  let sent = 0, gone = 0, failed = 0
  await Promise.all(items.map(async ({ sub, payload }) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 6 * 3600, urgency: 'high' },
      )
      sent++
      await admin.from('msg_push_subs').update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq('id', sub.id)
    } catch (e) {
      // deno-lint-ignore no-explicit-any
      const code = (e as any)?.statusCode
      if (code === 404 || code === 410) { gone++; await admin.from('msg_push_subs').delete().eq('id', sub.id) }
      else {
        failed++
        if (sub.fail_count >= 9) await admin.from('msg_push_subs').delete().eq('id', sub.id)
        else await admin.from('msg_push_subs').update({ fail_count: sub.fail_count + 1 }).eq('id', sub.id)
      }
    }
  }))
  return { sent, gone, failed }
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
    // ① 먼저 다 읽는다 — 메시지(아직 안 보냄·안 지움·내가 씀)·할 일·구독·활성 교사.
    //    하나라도 실패하면 아무것도 바꾸지 않고 503 → 화면이 5초 뒤 다시 부른다 (Codex 검토)
    const [m, t, s, a] = await Promise.all([
      admin.from('msg_messages').select('id,author,author_name,body,files,deleted_at,bot')
        .eq('id', id).is('pushed_at', null).is('deleted_at', null).or('author.eq.' + uid + ',and(author.is.null,bot.not.is.null)').maybeSingle(),
      admin.from('msg_tasks').select('assignee,text').eq('message_id', id),
      admin.from('msg_push_subs').select('*'),
      admin.from('teacher_accounts').select('user_id').eq('active', true),
    ])
    if (m.error || t.error || s.error || a.error) return reply(503, { error: 'lookup_failed' })
    if (!m.data) return reply(200, { skipped: true })
    // ② 다 읽은 뒤에만 '보냄' 자리를 잡는다 — 비어 있을 때만 채우므로 두 번 불려도 한 번만 보낸다.
    //    잡기 자체가 실패하면 그대로 503(아무것도 안 바뀜 — 다시 부르면 처음부터).
    //    잡을 때도 '안 지움·내가 씀'을 다시 확인하고, 보낼 내용은 잡는 순간의 줄로 쓴다
    //    (읽은 뒤 그 사이에 지운 메시지의 원문이 나가지 않게 — Codex 검토)
    const at = new Date().toISOString()
    const { data: claimed, error: ce } = await admin.from('msg_messages')
      .update({ pushed_at: at })
      .eq('id', id).is('pushed_at', null).is('deleted_at', null).or('author.eq.' + uid + ',and(author.is.null,bot.not.is.null)')
      .select('id,author,author_name,body,files,deleted_at,bot')
    if (ce) return reply(503, { error: 'claim_failed' })
    if (!claimed || !claimed.length) return reply(200, { skipped: true })
    const msg = claimed[0]
    const tasks = t.data, subs = s.data, act = a.data
    const active = new Set<string>((act || []).map((r: { user_id: string }) => r.user_id))
    const items = plan(msg, tasks || [], subs || [], active)
    const r = await deliver(admin, items)
    // 한 기기에도 못 보냈고 일시적 실패가 있으면 자리를 되돌려 화면이 5초 뒤 다시 부르게 한다 — hand 와 같음 (Codex 검토)
    if (!r.sent && r.failed) {
      await admin.from('msg_messages').update({ pushed_at: null }).eq('id', id).eq('pushed_at', at)
      return reply(503, { error: 'deliver_failed', targets: items.length, ...r })
    }
    return reply(200, { targets: items.length, ...r })
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
    const { data: claimed, error: ce } = await admin.from('msg_tasks').update({ hand_push: null })
      .eq('id', id).eq('hand_by', uid).eq('hand_push', to).select('id,message_id,text,status')
    if (ce) return reply(503, { error: 'claim_failed' })
    if (!claimed || !claimed.length) return reply(200, { skipped: true })
    const active = new Set<string>((a.data || []).map((r: { user_id: string }) => r.user_id))
    const items = handPlan({ ...claimed[0], to }, me.display_name, s.data || [], active)
    const r = await deliver(admin, items)
    // 한 기기에도 못 보냈고 일시적 실패가 있으면 자리를 되돌려 화면이 5초 뒤 다시 부르게 한다 (Codex 검토)
    if (!r.sent && r.failed) {
      await admin.from('msg_tasks').update({ hand_push: to }).eq('id', id).is('hand_push', null)
      return reply(503, { error: 'deliver_failed', targets: items.length, ...r })
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
