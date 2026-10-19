// 슈톡(Shuetalk) 휴대폰 푸시 알림 (2026-10-19)
// POST { action: 'key' }                 → { key }  VAPID 공개 키 (구독할 때 쓴다)
// POST { action: 'send', message_id }    → 그 메시지 알림을 보낸다 (한 메시지에 한 번만 — msg_messages.pushed_at 으로 잡음)
// POST { action: 'test' }                → 내 기기들에 시험 알림
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

type Msg = { id: number; author: string | null; author_name: string; body: string; files: { name?: string }[]; deleted_at: string | null }
type Task = { assignee: string | null; text: string }
type Sub = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string; mode: string; fail_count: number }

// 받는 기기마다 보낼 내용 — 순수 함수(시험용으로 따로 내보냄)
// active = 지금 활성 교사 user_id — 퇴사 등으로 비활성이 된 사람의 기기는 받지 않는다(Codex 검토 P1)
export function plan(msg: Msg, tasks: Task[], subs: Sub[], active: Set<string>) {
  const mine = new Map<string, Task>()
  tasks.forEach((t) => { if (t.assignee) mine.set(t.assignee, t) })
  const files = (msg.files || []).length
  const text = cut(msg.body, 140) || (files ? '파일 ' + files + '개를 보냈습니다.' : '')
  return subs
    .filter((s) => s.user_id !== msg.author && active.has(s.user_id))
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
    // 한 번만 — 아직 안 보낸 메시지를 잡는다. 이미 보냈거나 지운 메시지·남이 쓴 메시지면 그만.
    const { data: claimed } = await admin.from('msg_messages')
      .update({ pushed_at: new Date().toISOString() })
      .eq('id', id).is('pushed_at', null).is('deleted_at', null).eq('author', uid)
      .select('id,author,author_name,body,files,deleted_at')
    const msg = claimed && claimed[0]
    if (!msg) return reply(200, { skipped: true })
    const [t, s, a] = await Promise.all([
      admin.from('msg_tasks').select('assignee,text').eq('message_id', id),
      admin.from('msg_push_subs').select('*'),
      admin.from('teacher_accounts').select('user_id').eq('active', true),
    ])
    // 조회가 하나라도 실패하면 잡은 자리(pushed_at)를 풀고 실패로 돌려준다 — 화면이 다시 부르면 그때 보낸다
    // (빈 명단으로 보고 '성공'하면 알림이 영영 사라진다 — Codex 검토 P1)
    if (t.error || s.error || a.error) {
      await admin.from('msg_messages').update({ pushed_at: null }).eq('id', id)
      return reply(503, { error: 'lookup_failed' })
    }
    const tasks = t.data, subs = s.data, act = a.data
    const active = new Set<string>((act || []).map((r: { user_id: string }) => r.user_id))
    const items = plan(msg, tasks || [], subs || [], active)
    return reply(200, { targets: items.length, ...(await deliver(admin, items)) })
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
