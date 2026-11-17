// H WORK 학생 질문 → 담당 선생님 휴대폰 알림 (2026-11-17 원장님 "새 질문이 도착하면 슈톡에서 알려줘 업무진행에도 추가", 리포트 072)
// POST { task_id } — 학생 화면(공개, 로그인 없음)이 질문을 올린 뒤 hwork_qa_post 응답의 push 번호로 부른다. verify_jwt 끔.
//   'H WORK 질문' 할 일(requester_name)만, hand_push 가 남아 있을 때만 보낸다(공용 pushHand — 비우며 잡아 한 번만).
//   이 함수가 못 보내면(학생 화면이 닫힘 등) 클로슈 순찰이 2분 넘게 남은 hand_push 를 보낸다.
//   누구나 부를 수 있지만 할 수 있는 일은 '이미 만들어진 그 알림을 한 번 보내기'뿐이다.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { setup, pushHand } from '../_shared/push.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } })
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization' }
function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return reply(405, { error: 'method' })
  // deno-lint-ignore no-explicit-any
  let input: any = {}
  try { input = JSON.parse(await request.text()) } catch (_) { /* 빈 본문 */ }
  const id = Number(input.task_id)
  if (!Number.isInteger(id) || id <= 0) return reply(400, { error: 'bad_id' })
  if (!setup()) return reply(503, { error: 'no_vapid' })
  const { data: t, error } = await admin.from('msg_tasks').select('id,requester_name,hand_push').eq('id', id).maybeSingle()
  if (error) return reply(503, { error: 'lookup_failed' })
  if (!t || t.requester_name !== 'H WORK 질문' || !t.hand_push) return reply(200, { skipped: true })
  const r = await pushHand(admin, id)
  return reply(r.status, r.body)
})
