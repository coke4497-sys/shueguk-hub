// 슈톡 클로슈 = 진짜 클로드 (2026-10-20 원장님 "몇분마다 이 대화를 읽고 업무 배정이나 진행에 부족한 부분이 있을 때만 알려주고
// 진행하도록 도와주면 돼. 클로슈를 태그해 질문하면 깨어나 답해주고" — 원장님 선택: 수정 요청함처럼 클로드 세션, 하루 종일)
// 클로드 세션(예약 순찰)만 부르는 출입구. 교사 로그인이 아니라 비밀값으로 들어온다(verify_jwt 끔).
//   헤더 x-closhu-token = 함수 비밀값 CLOSHU_TOKEN (클로드 환경의 같은 이름 비밀값) — 저장소·대화에 넣지 않는다.
// POST { action: 'feed' }                       → 지난번 읽은 곳 뒤 새 메시지 + 남은 일·사람·출근·답 안 한 @클로슈·고르기 전 질문
// POST { action: 'get', table, query }          → 읽기 전용 조회(허용 표만, 학생 연락처는 안 나감)
// POST { action: 'say', kind, text, reply_to?, to?, options?, key? } → 클로슈 글 올리기(msg_bot_say) + 휴대폰 알림
// POST { action: 'cursor', id }                 → 여기까지 읽었다고 적기
// 지침: docs/클로슈-지침.md
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { setup, pushMessage, pushHand, retryPush, retryHand } from '../_shared/push.ts'
import { sameToken, safeQuery, TABLES } from './lib.ts'

const URL0 = Deno.env.get('SUPABASE_URL') || ''
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const admin = createClient(URL0, KEY, { auth: { persistSession: false } })
const CURSOR = 'closhu:cursor'

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } })
}
function kst(t = Date.now()) {
  return new Date(t + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 16)
}

async function members() {
  const { data, error } = await admin.from('teacher_accounts').select('user_id,display_name,role').eq('active', true).order('display_name')
  if (error) throw error
  return data || []
}

// 아직 휴대폰 알림을 못 보낸 클로슈 글(이레 안)을 순찰 때마다 다시 보낸다 — 슈톡을 아무도 열지 않아도 빠지지 않게 (Codex 검토)
async function repush() {
  const since = new Date(Date.now() - 7 * 86400e3).toISOString()
  const { data, error } = await admin.from('msg_messages').select('id').not('bot', 'is', null).is('pushed_at', null).is('deleted_at', null).gte('created_at', since).order('id').limit(20)
  if (error || !setup()) return { tried: 0, failed: error ? 'lookup' : 'no_vapid' }
  let failed = 0
  for (const m of data || []) { const r = await pushMessage(admin, m.id); if (r.status !== 200) failed++ }
  // 일부 기기만 못 받은 메시지(사람 글 포함)는 그 기기에만 다시 (Codex 검토)
  const part = await admin.from('msg_messages').select('id').not('push_retry', 'is', null).is('deleted_at', null).gte('created_at', since).order('id').limit(20)
  let retried = 0
  for (const m of part.data || []) { retried++; const r = await retryPush(admin, m.id); if (r.status !== 200) failed++ }
  // 넘긴 사람 화면이 못 부른 첫 넘김 알림(2분 넘게 남은 hand_push)도 순찰이 보낸다 (Codex 검토)
  const firsts = await admin.from('msg_tasks').select('id').not('hand_push', 'is', null).eq('status', '대기')
    .lt('updated_at', new Date(Date.now() - 120e3).toISOString()).order('id').limit(20)
  for (const t of firsts.data || []) { retried++; const r = await pushHand(admin, t.id); if (r.status !== 200) failed++ }
  const hands = await admin.from('msg_tasks').select('id').not('hand_retry', 'is', null).eq('status', '대기').order('id').limit(20)
  for (const t of hands.data || []) { retried++; const r = await retryHand(admin, t.id); if (r.status !== 200) failed++ }
  return { tried: (data || []).length, retried, failed }
}

// 표를 1000줄씩 끝까지 받는다 — 앞쪽 몇백 줄만 보고 판단하지 않게 (Codex 검토)
// deno-lint-ignore no-explicit-any
async function allRows(make: () => any) {
  const out: unknown[] = []
  for (let from = 0; ; from += 1000) {   // 마지막 쪽(1000줄 미만)까지 — 한도를 두지 않는다 (Codex 검토)
    const { data, error } = await make().range(from, from + 999)
    if (error) return { data: null, error }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return { data: out, error: null }
}

async function feed() {
  const run = await admin.from('msg_bot_runs').select('message_id').eq('key', CURSOR).maybeSingle()
  if (run.error) throw run.error
  // 처음 켤 때(읽은 곳 없음)는 지난 대화를 새 글로 보지 않는다 — 최근 문맥만 주고 지금 마지막 번호부터 읽는다 (Codex 검토)
  const first = !run.data
  let cursor = run.data?.message_id || 0
  if (first) {
    const top = await admin.from('msg_messages').select('id').order('id', { ascending: false }).limit(1)
    if (top.error) throw top.error
    cursor = top.data?.[0]?.id || 0
  }
  const sel = 'id,created_at,author_name,body,reply_to,files,bot,deleted_at'
  const dayStart = new Date(Date.parse(kst().slice(0, 10) + 'T00:00:00+09:00')).toISOString()
  const [fresh, before, pend, today, mem, pres, ments, asks] = await Promise.all([
    admin.from('msg_messages').select(sel).gt('id', cursor).order('id').limit(200),
    admin.from('msg_messages').select(sel).lte('id', cursor).is('deleted_at', null).order('id', { ascending: false }).limit(first ? 40 : 20),
    allRows(() => admin.from('msg_tasks').select('id,message_id,assignee_name,requester_name,text,created_at,due_at,due_note,seen_at,ack_only,progress_at,history').eq('status', '대기').order('id')),
    allRows(() => admin.from('msg_tasks').select('id,message_id,assignee_name,text,status,done_by_name,done_at,cancel_reason').neq('status', '대기').gte('done_at', dayStart).order('id')),
    members(),
    admin.from('msg_presence').select('name,loc,is_on,changed_at'),
    // 답할 때까지 남는다 — 서버 함수가 답 안 한 것만 먼저 거른 뒤 50개 (Codex 검토)
    admin.rpc('msg_bot_unanswered', { p_limit: 50 }),
    // 고르기 전 배정 질문은 날짜·개수로 버리지 않는다 — 오래된 것부터 끝까지, 고를 때까지 계속 보인다 (Codex 검토)
    allRows(() => admin.from('msg_messages').select('id,created_at,body,bot,reply_to').eq('bot->>kind', 'ask').is('bot->done', null).is('deleted_at', null).order('id')),
  ])
  for (const r of [fresh, before, pend, today, pres, ments, asks]) if (r.error) throw r.error
  // 새 메시지에 이미 생긴 할 일(상태 상관없이) — 확인 요청이 이미 갔는지 판단할 때 쓴다
  const freshIds = (fresh.data || []).map((m: { id: number }) => m.id)
  const ft = freshIds.length ? await admin.from('msg_tasks').select('id,message_id,assignee_name,status,ack_only').in('message_id', freshIds) : { data: [], error: null }
  if (ft.error) throw ft.error
  // 원글을 지운 배정 질문은 고를 수 없으니(msg_bot_pick 이 거절) 열린 목록에서 뺀다 (Codex 검토)
  type Ask = { id: number; bot: { done?: unknown } | null; reply_to: number | null }
  const askRows = (asks.data || []) as Ask[]
  const askSrc = [...new Set(askRows.map((m) => m.reply_to).filter((x): x is number => !!x))]
  const goneSrc = new Set<number>()
  for (let i = 0; i < askSrc.length; i += 200) {
    const g = await admin.from('msg_messages').select('id').in('id', askSrc.slice(i, i + 200)).not('deleted_at', 'is', null)
    if (g.error) throw g.error
    for (const r of g.data || []) goneSrc.add(r.id)
  }
  const short = (m: Record<string, unknown>) => ({ ...m, files: Array.isArray(m.files) ? (m.files as unknown[]).length : 0 })
  // 고르기 전에 지운 배정 질문의 원글 — 원글은 살아 있고 할 일도, 다른 열린 질문도 없으면 다시 살펴볼 글로 돌려준다.
  // 지운 질문의 열쇠(ask:<원글>)는 msg_bot_say 가 다시 쓸 수 있게 풀어 준다 (Codex 검토)
  const gone = await allRows(() => admin.from('msg_messages').select('reply_to').eq('bot->>kind', 'ask').is('bot->done', null).not('deleted_at', 'is', null).order('id'))
  if (gone.error) throw gone.error
  const openSrc = new Set(askRows.map((m) => m.reply_to))
  const cand = [...new Set((gone.data as { reply_to: number | null }[]).map((m) => m.reply_to).filter((x): x is number => !!x && !openSrc.has(x)))]
  const reopen: unknown[] = []
  for (let i = 0; i < cand.length; i += 200) {
    const ids = cand.slice(i, i + 200)
    const [src, tk] = await Promise.all([
      admin.from('msg_messages').select(sel).in('id', ids).is('deleted_at', null).order('id'),
      admin.from('msg_tasks').select('message_id').in('message_id', ids),
    ])
    if (src.error) throw src.error
    if (tk.error) throw tk.error
    const hasTask = new Set((tk.data || []).map((t: { message_id: number }) => t.message_id))
    for (const m of src.data || []) if (!hasTask.has(m.id)) reopen.push(short(m))
  }
  const today0 = kst().slice(0, 10)
  return {
    now_kst: kst(), cursor, first_run: first,
    last_id: Math.max(cursor, ...((fresh.data || []).map((m: { id: number }) => m.id))),
    // 지운 글은 보지 않는다 — 읽은 곳(last_id)은 지운 글까지 넘긴다 (Codex 검토)
    new_messages: (fresh.data || []).filter((m: { deleted_at: string | null }) => !m.deleted_at).map(short),
    earlier_messages: (before.data || []).reverse().map(short),
    open_tasks: pend.data || [],
    new_message_tasks: ft.data || [],
    closed_today: today.data || [],
    members: mem,
    presence_today: (pres.data || []).filter((p: { is_on: boolean; changed_at: string }) => p.is_on && kst(Date.parse(p.changed_at)).slice(0, 10) === today0),
    unanswered_mentions: (ments.data || []).map((m: { id: number; created_at: string; author_name: string; body: string }) => ({ id: m.id, created_at: m.created_at, author_name: m.author_name, body: m.body })),
    reopen_messages: reopen,
    open_asks: askRows.filter((m) => !m.bot?.done && !(m.reply_to && goneSrc.has(m.reply_to))),
  }
}

// 이름 또는 user_id → user_id (활성 교사, 표시 이름이 정확히 같을 때)
async function uidsOf(list: unknown) {
  if (!Array.isArray(list) || !list.length) return null
  const mem = await members()
  return list.map((x) => {
    const s = String(x || '').trim()
    const hit = mem.find((m: { user_id: string; display_name: string }) => m.user_id === s || m.display_name === s)
    if (!hit) throw Object.assign(new Error('bad_person: ' + s), { code: 'bad_person' })
    return hit.user_id
  })
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'method' })
  const secret = Deno.env.get('CLOSHU_TOKEN') || ''
  if (!sameToken(request.headers.get('x-closhu-token') || '', secret)) return reply(401, { error: 'token' })
  // deno-lint-ignore no-explicit-any
  let input: any = {}
  try { input = await request.json() } catch (_) { /* 빈 본문 */ }
  try {
    if (input.action === 'feed') {
      // 약속 지남 알림을 먼저 만든다 — 슈톡을 아무도 열어 두지 않아도 순찰이 만든다 (Codex 검토). 만든 글은 아래 repush 가 보낸다
      const due = await admin.rpc('msg_bot_due')
      const push_retry = await repush()
      return reply(200, { ...(await feed()), push_retry, due_alerts: due.error ? { error: due.error.message } : (due.data || []).length })
    }
    if (input.action === 'get') {
      const sq = safeQuery(String(input.table || ''), String(input.query || ''))
      if (sq === null) return reply(400, { error: 'bad_table', tables: Object.keys(TABLES) })
      const r = await fetch(URL0 + '/rest/v1/' + sq.table + '?' + sq.qs, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
      const body = await r.text()
      return new Response(body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
    }
    if (input.action === 'say') {
      const opts = Array.isArray(input.options) ? await Promise.all(input.options.map(async (o: { label: string; uid?: string; name?: string }) =>
        ({ label: o.label, uid: (await uidsOf([o.uid || o.name]))![0] }))) : null
      const { data, error } = await admin.rpc('msg_bot_say', {
        p_kind: input.kind, p_text: input.text, p_reply: input.reply_to || null,
        p_to: await uidsOf(input.to), p_options: opts, p_key: input.key || null,
      })
      if (error) return reply(error.message.includes('exists') ? 409 : 400, { error: error.message })
      const push = setup() ? await pushMessage(admin, data.id) : { status: 503, body: { error: 'no_vapid' } }
      // 글은 올라갔으니 200 — 알림만 못 보냈으면 push.status 로 알리고, 다음 순찰의 feed 가 다시 보낸다
      return reply(200, { message: { id: data.id, created_at: data.created_at }, push: { status: push.status, ...push.body } })
    }
    if (input.action === 'task') {
      // 사람의 업무 카드에 할 일 한 줄(메시지 없이) — 원장님이 클로드에게 맡긴 확인 일 등. 알림은 따로 say note 로.
      const to = (await uidsOf([input.to]))![0]
      const { data, error } = await admin.rpc('msg_bot_task', {
        p_to: to, p_text: input.text, p_due: input.due || null, p_note: input.note || '', p_key: input.key || null,
      })
      if (error) return reply(error.message.includes('exists') ? 409 : 400, { error: error.message })
      return reply(200, { task: { id: data.id, assignee_name: data.assignee_name, text: data.text, due_at: data.due_at } })
    }
    if (input.action === 'cursor') {
      const id = Number(input.id)
      if (!Number.isInteger(id) || id < 0) return reply(400, { error: 'bad_id' })
      const { error } = await admin.from('msg_bot_runs').upsert({ key: CURSOR, message_id: id || null, at: new Date().toISOString() })
      if (error) throw error
      return reply(200, { cursor: id })
    }
    return reply(400, { error: 'bad_action' })
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    const err = e as any
    return reply(err?.code === 'bad_person' ? 400 : 503, { error: String(err?.message || err) })
  }
})
