// 슈톡 클로슈 = 진짜 클로드 (2026-10-20 원장님 "몇분마다 이 대화를 읽고 업무 배정이나 진행에 부족한 부분이 있을 때만 알려주고
// 진행하도록 도와주면 돼. 클로슈를 태그해 질문하면 깨어나 답해주고" — 원장님 선택: 수정 요청함처럼 클로드 세션, 하루 종일)
// 클로드 세션(예약 순찰)만 부르는 출입구. 교사 로그인이 아니라 비밀값으로 들어온다(verify_jwt 끔).
//   헤더 x-clochu-token = 함수 비밀값 CLOCHU_TOKEN (클로드 환경의 같은 이름 비밀값) — 저장소·대화에 넣지 않는다.
// POST { action: 'feed' }                       → 지난번 읽은 곳 뒤 새 메시지 + 남은 일·사람·출근·답 안 한 @클로슈·고르기 전 질문
// POST { action: 'get', table, query }          → 읽기 전용 조회(허용 표만, 학생 연락처는 안 나감)
// POST { action: 'say', kind, text, reply_to?, to?, options?, key? } → 클로슈 글 올리기(msg_bot_say) + 휴대폰 알림
// POST { action: 'cursor', id }                 → 여기까지 읽었다고 적기
// 지침: docs/클로슈-지침.md
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { setup, pushMessage } from '../_shared/push.ts'
import { sameToken, safeQuery, TABLES } from './lib.ts'

const URL0 = Deno.env.get('SUPABASE_URL') || ''
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const admin = createClient(URL0, KEY, { auth: { persistSession: false } })
const CURSOR = 'clochu:cursor'

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
  return { tried: (data || []).length, failed }
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
    admin.from('msg_tasks').select('id,message_id,assignee_name,requester_name,text,created_at,due_at,due_note,seen_at,ack_only,progress_at,history').eq('status', '대기').order('id').limit(500),
    admin.from('msg_tasks').select('id,message_id,assignee_name,text,status,done_by_name,done_at,cancel_reason').neq('status', '대기').gte('done_at', dayStart).order('id').limit(500),
    members(),
    admin.from('msg_presence').select('name,loc,is_on,changed_at'),
    // 답할 때까지 날짜로 버리지 않는다 — 최근 1000개를 받아 답 안 한 것만 오래된 순으로 50개 (Codex 검토)
    admin.from('msg_messages').select('id,created_at,author_name,body').like('body', '%@클로슈%').is('deleted_at', null).is('bot', null).order('id', { ascending: false }).limit(1000),
    // 고르기 전 배정 질문은 날짜로 버리지 않는다 — 고를 때까지 계속 보인다 (Codex 검토)
    admin.from('msg_messages').select('id,created_at,body,bot,reply_to').eq('bot->>kind', 'ask').is('bot->done', null).is('deleted_at', null).order('id', { ascending: false }).limit(50),
  ])
  for (const r of [fresh, before, pend, today, pres, ments, asks]) if (r.error) throw r.error
  // 이미 답한 @클로슈(그 글에 답장한 클로슈 글이 있으면)는 빼고 준다
  const ids = (ments.data || []).map((m: { id: number }) => m.id)
  let answered = new Set<number>()
  if (ids.length) {
    const a = await admin.from('msg_messages').select('reply_to').in('reply_to', ids).not('bot', 'is', null)
    if (a.error) throw a.error
    answered = new Set((a.data || []).map((x: { reply_to: number }) => x.reply_to))
  }
  const today0 = kst().slice(0, 10)
  const short = (m: Record<string, unknown>) => ({ ...m, files: Array.isArray(m.files) ? (m.files as unknown[]).length : 0 })
  return {
    now_kst: kst(), cursor, first_run: first,
    last_id: Math.max(cursor, ...((fresh.data || []).map((m: { id: number }) => m.id))),
    // 지운 글은 보지 않는다 — 읽은 곳(last_id)은 지운 글까지 넘긴다 (Codex 검토)
    new_messages: (fresh.data || []).filter((m: { deleted_at: string | null }) => !m.deleted_at).map(short),
    earlier_messages: (before.data || []).reverse().map(short),
    open_tasks: pend.data || [],
    closed_today: today.data || [],
    members: mem,
    presence_today: (pres.data || []).filter((p: { is_on: boolean; changed_at: string }) => p.is_on && kst(Date.parse(p.changed_at)).slice(0, 10) === today0),
    unanswered_mentions: (ments.data || []).filter((m: { id: number }) => !answered.has(m.id)).reverse().slice(0, 50),
    open_asks: (asks.data || []).filter((m: { bot: { done?: unknown } }) => !m.bot?.done),
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
  const secret = Deno.env.get('CLOCHU_TOKEN') || ''
  if (!sameToken(request.headers.get('x-clochu-token') || '', secret)) return reply(401, { error: 'token' })
  // deno-lint-ignore no-explicit-any
  let input: any = {}
  try { input = await request.json() } catch (_) { /* 빈 본문 */ }
  try {
    if (input.action === 'feed') { const push_retry = await repush(); return reply(200, { ...(await feed()), push_retry }) }
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
