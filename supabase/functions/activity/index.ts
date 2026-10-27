// 티쳐스 활동 기록 → 원장님 슈톡 알림 (2026-10-27 원장님 — 섞기: 중요한 일은 즉시, 잦은 일은 묶어서 · 누가 했는지 이름)
// POST { action: 'log', rows: [{ page, what, action, target, detail, author, urgent }] }
//   → activity_log 에 저장. 작성자는 부른 사람이 허브 개인 로그인(teacher_accounts)이면 그 이름(서버가 확인), 공용 교사 계정이면 화면이 보낸 이름.
//   urgent 줄은 바로 슈톡 '활동 알림' 글(activity_say, bot.to = 활성 원장님) + 휴대폰 알림(pushMessage — bot.to 기기에만).
//   그 밖의 줄은 대기 — 가장 오래된 대기 줄이 DIGEST_MIN(120분) 넘게 기다렸으면 그때 묶어서 한 글(digestText).
// POST { action: 'flush' } → 대기 줄 묶음만(슈톡을 열 때 원장님 화면이 부른다 — 마지막 일 뒤 아무 일이 없어도 요약이 오게)
// 호출: 활성 교사 JWT(허브 개인 로그인) 또는 공용 교사 계정 JWT. 비밀값: VAPID_* (msg-push 와 같음).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from 'jsr:@supabase/server@^1'
import { setup, pushMessage } from '../_shared/push.ts'
import { clean, digestDue, digestText, urgentText, MAX_ROWS, type Row } from './lib.ts'

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } })
}

// deno-lint-ignore no-explicit-any
async function admins(admin: any): Promise<string[]> {
  const { data } = await admin.from('teacher_accounts').select('user_id').eq('active', true).eq('role', 'admin')
  return (data || []).map((r: { user_id: string }) => r.user_id)
}
// 슈톡 글 + 알림. 글은 올라갔는데 알림만 못 보냈으면 메시지는 남고 closhu feed 의 repush(pushed_at 없는 클로슈·활동 글)가 다시 보낸다
// deno-lint-ignore no-explicit-any
async function say(admin: any, text: string) {
  const to = await admins(admin)
  const { data, error } = await admin.rpc('activity_say', { p_text: text, p_to: to })
  if (error) throw error
  const push = setup() ? await pushMessage(admin, data.id) : { status: 503, body: { error: 'no_vapid' } }
  return { id: data.id as number, push: push.status }
}
// 대기 줄 묶기 — 한 번에 하나만 묶게 message_id = -1 로 먼저 잡고(두 호출이 겹쳐도 한쪽만), 글을 올린 뒤 번호를 적는다
// deno-lint-ignore no-explicit-any
async function digest(admin: any, force = false) {
  const { data: pend, error } = await admin.from('activity_log').select('id,at,page,what,action,target,detail,author,urgent')
    .is('message_id', null).eq('urgent', false).order('at').limit(500)
  if (error) throw error
  if (!pend?.length) return { digest: 'none' }
  if (!force && !digestDue(pend[0].at)) return { digest: 'wait', pending: pend.length }
  const ids = pend.map((r: Row) => r.id)
  const { data: got, error: ce } = await admin.from('activity_log').update({ message_id: -1 }).in('id', ids).is('message_id', null).select('id')
  if (ce) throw ce
  if (!got?.length) return { digest: 'taken' }
  const mine = new Set(got.map((r: { id: number }) => r.id))
  const rows = pend.filter((r: Row) => mine.has(r.id!))
  try {
    const r = await say(admin, digestText(rows))
    await admin.from('activity_log').update({ message_id: r.id }).in('id', [...mine]).eq('message_id', -1)
    return { digest: 'sent', rows: rows.length, message_id: r.id, push: r.push }
  } catch (e) {
    await admin.from('activity_log').update({ message_id: null }).in('id', [...mine]).eq('message_id', -1)   // 못 올렸으면 자리 되돌림
    throw e
  }
}

const handler = withSupabase({ auth: 'user' }, async (request, context) => {
  if (request.method !== 'POST') return reply(405, { error: 'method' })
  const uid = context.userClaims?.id
  if (!uid) return reply(401, { error: 'login' })
  const admin = context.supabaseAdmin
  const { data: me } = await admin.from('teacher_accounts').select('user_id,display_name,active').eq('user_id', uid).maybeSingle()
  // deno-lint-ignore no-explicit-any
  let input: any = {}
  try { input = await request.json() } catch (_) { /* 빈 본문 */ }
  try {
    if (input.action === 'flush') return reply(200, await digest(admin, input.force === true && !!me?.active))
    if (input.action !== 'log') return reply(400, { error: 'bad_action' })
    const rows = (Array.isArray(input.rows) ? input.rows : [input.row]).map(clean).filter(Boolean) as Row[]
    if (!rows.length) return reply(400, { error: 'no_rows' })
    if (rows.length > MAX_ROWS) return reply(400, { error: 'too_many' })
    const name = me?.active ? String(me.display_name || '').trim() : ''
    for (const r of rows) { if (name) r.author = name; else if (!r.author) r.author = '이름 없음' }
    const { data: ins, error } = await admin.from('activity_log').insert(rows.map((r) => ({ ...r, author_uid: me?.active ? uid : null }))).select('id,urgent')
    if (error) throw error
    const urgent = rows.filter((r) => r.urgent)
    let notified: Record<string, unknown> = {}
    if (urgent.length) {
      const r = await say(admin, urgentText(urgent))
      await admin.from('activity_log').update({ message_id: r.id }).in('id', ins.filter((x: { urgent: boolean }) => x.urgent).map((x: { id: number }) => x.id))
      notified = { message_id: r.id, push: r.push }
    }
    const dg = await digest(admin).catch((e) => ({ digest: 'error', error: String(e?.message || e) }))
    return reply(200, { saved: ins.length, ...notified, ...dg })
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    return reply(503, { error: String((e as any)?.message || e) })
  }
})
Deno.serve(handler)
