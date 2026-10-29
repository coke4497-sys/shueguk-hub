// 티쳐스 활동 기록 → 원장님 알림 (2026-10-27 원장님 — 섞기: 중요한 일은 즉시, 잦은 일은 묶어서 · 누가 했는지 이름)
// 2026-10-29 원장님 '따로 두기': 슈톡 글(activity_say)은 더 올리지 않는다 — 알림 글은 activity_notices 표에 적고 원장님 기기에만 푸시,
//   원장님은 허브 activity.html(슈국 운영 → 티쳐스 활동 기록)에서 알림·기록을 본다(202610290001).
// POST { action: 'log', rows: [{ page, what, action, target, detail, author, urgent }] }
//   → activity_log 에 저장. 작성자는 부른 사람이 허브 개인 로그인(teacher_accounts)이면 그 이름(서버가 확인), 공용 교사 계정이면 화면이 보낸 이름.
//   urgent 줄은 바로 알림 글 한 건(urgentText) + 원장님 휴대폰 푸시(pushActivity).
//   그 밖의 줄은 대기 — 가장 오래된 대기 줄이 DIGEST_MIN(120분) 넘게 기다렸으면 그때 묶어서 한 글(digestText).
// POST { action: 'flush' } → 대기 줄 묶음만(원장님이 슈톡·활동 기록 화면을 열 때 부른다 — 마지막 일 뒤 아무 일이 없어도 요약이 오게)
// 어느 호출이든 못 보낸 알림 글이 있으면 다시 보낸다(repushActivity).
// 호출: 활성 교사 JWT(허브 개인 로그인) 또는 공용 교사 계정 JWT. 비밀값: VAPID_* (msg-push 와 같음).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from 'jsr:@supabase/server@^1'
import { setup, pushActivity, repushActivity } from '../_shared/push.ts'
import { clean, digestDue, digestText, urgentText, MAX_ROWS, type Row } from './lib.ts'

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } })
}

// 알림 글 + 원장님 푸시. 글은 적혔는데 푸시만 못 보냈으면 글은 남고(pushed_at 없음) 다음 호출의 repushActivity 가 다시 보낸다
// deno-lint-ignore no-explicit-any
async function say(admin: any, text: string, kind: '즉시' | '요약') {
  const { data, error } = await admin.from('activity_notices').insert({ kind, text }).select('id').single()
  if (error) throw error
  const push = setup() ? await pushActivity(admin, data.id) : { status: 503, body: { error: 'no_vapid' } }
  return { id: data.id as number, push: push.status }
}
// 대기 줄 묶기 — 한 번에 하나만 묶게 notice_id = -1 로 먼저 잡고(두 호출이 겹쳐도 한쪽만), 글을 적은 뒤 번호를 적는다
// deno-lint-ignore no-explicit-any
async function digest(admin: any, force = false) {
  const { data: pend, error } = await admin.from('activity_log').select('id,at,page,what,action,target,detail,author,urgent')
    .is('notice_id', null).eq('urgent', false).order('at').limit(500)
  if (error) throw error
  if (!pend?.length) return { digest: 'none' }
  if (!force && !digestDue(pend[0].at)) return { digest: 'wait', pending: pend.length }
  const ids = pend.map((r: Row) => r.id)
  const { data: got, error: ce } = await admin.from('activity_log').update({ notice_id: -1 }).in('id', ids).is('notice_id', null).select('id')
  if (ce) throw ce
  if (!got?.length) return { digest: 'taken' }
  const mine = new Set(got.map((r: { id: number }) => r.id))
  const rows = pend.filter((r: Row) => mine.has(r.id!))
  try {
    const r = await say(admin, digestText(rows), '요약')
    await admin.from('activity_log').update({ notice_id: r.id }).in('id', [...mine]).eq('notice_id', -1)
    return { digest: 'sent', rows: rows.length, notice_id: r.id, push: r.push }
  } catch (e) {
    await admin.from('activity_log').update({ notice_id: null }).in('id', [...mine]).eq('notice_id', -1)   // 못 적었으면 자리 되돌림
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
    if (input.action === 'flush') {
      const dg = await digest(admin, input.force === true && !!me?.active)
      const re = await repushActivity(admin).catch(() => ({ tried: 0, failed: 'error' }))
      return reply(200, { ...dg, repush: re })
    }
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
      const r = await say(admin, urgentText(urgent), '즉시')
      await admin.from('activity_log').update({ notice_id: r.id }).in('id', ins.filter((x: { urgent: boolean }) => x.urgent).map((x: { id: number }) => x.id))
      notified = { notice_id: r.id, push: r.push }
    }
    const dg = await digest(admin).catch((e) => ({ digest: 'error', error: String(e?.message || e) }))
    const re = await repushActivity(admin).catch(() => ({ tried: 0, failed: 'error' }))
    return reply(200, { saved: ins.length, ...notified, ...dg, repush: re })
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    return reply(503, { error: String((e as any)?.message || e) })
  }
})
Deno.serve(handler)
