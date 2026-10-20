// 슈톡 휴대폰 푸시 공용 — msg-push · closhu 가 함께 쓴다 (2026-10-20 클로슈 = 진짜 클로드)
import webpush from 'npm:web-push@3.6.7'

export const SUBJECT = 'https://coke4497-sys.github.io/shueguk-hub/messenger.html'
export const PAGE = 'https://coke4497-sys.github.io/shueguk-hub/messenger.html'

export function cut(s: string, n: number) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

export type Msg = { id: number; author: string | null; author_name: string; body: string; files: { name?: string }[]; deleted_at: string | null; bot?: { to?: string[] } | null }
export type Task = { assignee: string | null; text: string }
export type Sub = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string; mode: string; fail_count: number }

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
    // bot.to 로 정한 사람은 옛 'mention' 범위로 저장된 기기여도 받는다 — 클로슈 글에는 그 사람 할 일이 없다 (Codex 검토)
    .filter((s) => !!only || s.mode !== 'mention' || mine.has(s.user_id))
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
export type Hand = { id: number; message_id: number; text: string; to: string; status: string }
export function handPlan(t: Hand, byName: string, subs: Sub[], active: Set<string>) {
  if (t.status !== '대기' || !active.has(t.to)) return []
  return subs.filter((s) => s.user_id === t.to).map((s) => ({
    sub: s,
    payload: { title: byName + ' → 나에게 넘긴 일', body: cut(t.text, 140), url: PAGE + '#m' + t.message_id, tag: 'tk' + t.id, task: true },
  }))
}

let ready = false
export function setup() {
  if (ready) return true
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return false
  webpush.setVapidDetails(SUBJECT, pub, priv)
  ready = true
  return true
}

// deno-lint-ignore no-explicit-any
export async function deliver(admin: any, items: { sub: Sub; payload: Record<string, unknown> }[]) {
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

// 메시지 한 건 알림 — 아직 안 보냈고 안 지운 메시지만, 보낼 자리(pushed_at)를 잡고 보낸다.
// 한 기기에도 못 보냈고 일시적 실패가 있으면 자리를 되돌린다(다시 부르면 다시 보냄). extra 는 잡을 때 더할 조건.
// deno-lint-ignore no-explicit-any
export async function pushMessage(admin: any, id: number, extra?: (q: any) => any) {
  const [t, s, a] = await Promise.all([
    admin.from('msg_tasks').select('assignee,text').eq('message_id', id),
    admin.from('msg_push_subs').select('*'),
    admin.from('teacher_accounts').select('user_id').eq('active', true),
  ])
  if (t.error || s.error || a.error) return { status: 503, body: { error: 'lookup_failed' } }
  const at = new Date().toISOString()
  let q = admin.from('msg_messages').update({ pushed_at: at }).eq('id', id).is('pushed_at', null).is('deleted_at', null)
  if (extra) q = extra(q)
  const { data: claimed, error: ce } = await q.select('id,author,author_name,body,files,deleted_at,bot')
  if (ce) return { status: 503, body: { error: 'claim_failed' } }
  if (!claimed || !claimed.length) return { status: 200, body: { skipped: true } }
  const active = new Set<string>((a.data || []).map((r: { user_id: string }) => r.user_id))
  const items = plan(claimed[0], t.data || [], s.data || [], active)
  const r = await deliver(admin, items)
  if (!r.sent && r.failed) {
    await admin.from('msg_messages').update({ pushed_at: null }).eq('id', id).eq('pushed_at', at)
    return { status: 503, body: { error: 'deliver_failed', targets: items.length, ...r } }
  }
  return { status: 200, body: { targets: items.length, ...r } }
}
