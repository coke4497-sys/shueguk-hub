// 슈국 AI 교무실 — 클로드 순찰(예약 실행 세션)만 부르는 출입구 (2026-10-23 원장님)
// 교사 로그인이 아니라 비밀값으로 들어온다(verify_jwt 끔). 헤더 x-closhu-token = 함수 비밀값 CLOSHU_TOKEN(클로슈와 같은 값).
// POST { action: 'feed' }      → 열린 지시와 할 일 + 이번에 할 지시(todo). 마지막 순찰 시각을 적는다
// POST { action: 'claim', order } → 지시를 가져간다(겹친 순찰은 못 가져감 — 50분 넘게 멈추면 다시 가져갈 수 있음)
// POST { action: 'task', id?, order?, role?, title?, col?, stage?, last?, result?, result_url?, log? } → 할 일 만들기·고치기
// POST { action: 'release', order } → 가져간 표시를 푼다
// 완료로 옮기는 것은 원장님 화면(ai_task_decide)만 한다. 지침: docs/AI교무실-지침.md
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sameToken, todoOf } from './lib.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } })

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } })
}
const kst = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 16)
const n = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v))
const s = (v: unknown) => (v === undefined || v === null ? null : String(v))

async function feed() {
  const [ord, done] = await Promise.all([
    admin.from('ai_orders').select('id,body,to_role,author_name,status,picked_at,created_at').in('status', ['접수', '진행']).order('id'),
    admin.from('ai_tasks').select('id,order_id,role,title,col,last,decided_at').in('col', ['완료', '중단']).order('updated_at', { ascending: false }).limit(10),
  ])
  if (ord.error) throw ord.error
  if (done.error) throw done.error
  const ids = (ord.data || []).map((o) => o.id)
  const tk = ids.length ? await admin.from('ai_tasks').select('*').in('order_id', ids).order('id') : { data: [], error: null }
  if (tk.error) throw tk.error
  await admin.rpc('ai_bot_release', { p_order: null })
  const tasks = tk.data || []
  const todo = todoOf(ord.data || [], tasks, Date.now())
  return {
    now_kst: kst(), todo,
    orders: (ord.data || []).map((o) => ({ ...o, tasks: tasks.filter((t) => t.order_id === o.id) })),
    recent_closed: done.data || [],
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'method' })
  if (!sameToken(request.headers.get('x-closhu-token') || '', Deno.env.get('CLOSHU_TOKEN') || '')) return reply(401, { error: 'token' })
  // deno-lint-ignore no-explicit-any
  let input: any = {}
  try { input = await request.json() } catch (_) { /* 빈 본문 */ }
  try {
    if (input.action === 'feed') return reply(200, await feed())
    if (input.action === 'claim') {
      const { data, error } = await admin.rpc('ai_bot_claim', { p_order: n(input.order) })
      if (error) return reply(400, { error: error.message })
      return data && data.id ? reply(200, { claimed: true, order: data }) : reply(409, { claimed: false, error: 'busy_or_closed' })
    }
    if (input.action === 'task') {
      const { data, error } = await admin.rpc('ai_bot_task', {
        p_id: n(input.id), p_order: n(input.order), p_role: s(input.role), p_title: s(input.title), p_col: s(input.col),
        p_stage: n(input.stage), p_last: s(input.last), p_result: s(input.result), p_result_url: s(input.result_url), p_log: s(input.log),
      })
      if (error) return reply(400, { error: error.message })
      return reply(200, { task: data })
    }
    if (input.action === 'release') {
      const { error } = await admin.rpc('ai_bot_release', { p_order: n(input.order) })
      if (error) return reply(400, { error: error.message })
      return reply(200, { released: true })
    }
    return reply(400, { error: 'bad_action' })
  } catch (e) {
    return reply(503, { error: String((e as Error)?.message || e) })
  }
})
