// 카카오 i 오픈빌더 스킬 서버 — 학원 카카오톡 채널에 학부모님이 보낸 글을 슈톡으로 (2026-10-20 원장님 "1번 챗봇 방식으로 진행")
// 오픈빌더 폴백 블록의 스킬 URL = https://<프로젝트>.supabase.co/functions/v1/kakao-skill?k=<KAKAO_SKILL_TOKEN>
//   비밀값 KAKAO_SKILL_TOKEN 은 함수 비밀값과 오픈빌더 스킬 주소에만(저장소·대화에 넣지 않음). verify_jwt 끔.
// 카카오는 5초 안에 답을 받아야 하므로 슈톡 글만 올리고 바로 답하며, 휴대폰 알림은 뒤에서 보낸다.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { setup, pushMessage } from '../_shared/push.ts'
import { sameToken } from '../closhu/lib.ts'
import { whoOf, reply, THANKS, BUSY } from './lib.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } })

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('method', { status: 405 })
  const secret = Deno.env.get('KAKAO_SKILL_TOKEN') || ''
  if (!sameToken(new URL(request.url).searchParams.get('k') || '', secret)) return new Response('token', { status: 401 })
  // deno-lint-ignore no-explicit-any
  let input: any = {}
  try { input = await request.json() } catch (_) { /* 빈 본문 */ }
  const u = input?.userRequest || {}
  const text = String(u.utterance || '').slice(0, 2000)
  const who = await whoOf(String(u.user?.id || u.user?.properties?.plusfriendUserKey || ''))
  const { data, error } = await admin.rpc('kakao_inbound', { p_who: who, p_text: text })
  if (error) return reply(error.message.includes('too_many') ? BUSY : THANKS)   // 저장 실패도 학부모님께는 같은 안내 — 로그로 확인
  // deno-lint-ignore no-explicit-any
  if (setup()) (globalThis as any).EdgeRuntime?.waitUntil(pushMessage(admin, data.id).catch(() => null))
  return reply(THANKS)
})
