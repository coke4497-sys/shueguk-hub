import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from 'jsr:@supabase/server@^1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function randomChar(chars: string) {
  const value = crypto.getRandomValues(new Uint8Array(1))[0]
  return chars[value % chars.length]
}

function createTemporaryPassword() {
  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%',
  ]
  const all = groups.join('')
  const password = groups.map(randomChar)
  while (password.length < 16) password.push(randomChar(all))
  for (let index = password.length - 1; index > 0; index -= 1) {
    const value = crypto.getRandomValues(new Uint8Array(1))[0]
    const swap = value % (index + 1)
    ;[password[index], password[swap]] = [password[swap], password[index]]
  }
  return password.join('')
}

const createTeacher = withSupabase({ auth: 'user' }, async (request, context) => {
  if (request.method !== 'POST') return reply(405, { error: '허용되지 않은 요청입니다.' })

  const actorId = context.userClaims?.id
  if (!actorId) return reply(401, { error: '로그인이 필요합니다.' })

  const { data: actorProfile, error: profileError } = await context.supabaseAdmin
    .from('teacher_accounts')
    .select('active,role')
    .eq('user_id', actorId)
    .maybeSingle()
  if (profileError || !actorProfile?.active || actorProfile.role !== 'admin') {
    return reply(403, { error: '계정을 발급할 관리자 권한이 없습니다.' })
  }

  let input: { loginId?: unknown; displayName?: unknown; accountType?: unknown }
  try {
    input = await request.json()
  } catch (_) {
    return reply(400, { error: '요청 내용을 확인하십시오.' })
  }

  const loginId = String(input.loginId || '').trim().toLowerCase()
  const displayName = String(input.displayName || '').trim()
  const accountType = String(input.accountType || 'teacher')
  if (!/^[a-z0-9][a-z0-9._-]{1,39}$/.test(loginId)) {
    return reply(400, { error: '아이디는 영문 소문자·숫자·점·밑줄·하이픈 2~40자로 입력하십시오.' })
  }
  if (displayName.length < 1 || displayName.length > 40) {
    return reply(400, { error: '표시 이름은 1~40자로 입력하십시오.' })
  }
  if (accountType !== 'teacher' && accountType !== 'assistant') {
    return reply(400, { error: '계정 구분을 확인하십시오.' })
  }

  const password = createTemporaryPassword()
  const email = `${loginId}@shueguk.internal`
  const { data: created, error: createError } = await context.supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, account_type: accountType },
  })
  if (createError || !created.user) {
    const duplicate = createError?.message?.toLowerCase().includes('already')
    return reply(duplicate ? 409 : 400, {
      error: duplicate ? '이미 사용 중인 아이디입니다.' : '교사 계정을 만들지 못했습니다.',
    })
  }

  const { error: insertError } = await context.supabaseAdmin.from('teacher_accounts').insert({
    user_id: created.user.id,
    login_id: loginId,
    display_name: displayName,
    role: accountType,
    active: true,
    created_by: actorId,
  })
  if (insertError) {
    await context.supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return reply(500, { error: '교사 권한을 저장하지 못해 계정 생성을 취소했습니다.' })
  }

  return reply(201, {
    account: { loginId, displayName, accountType, temporaryPassword: password },
  })
})

export default {
  async fetch(request: Request) {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    const response = await createTeacher(request)
    const headers = new Headers(response.headers)
    Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value))
    return new Response(response.body, { status: response.status, headers })
  },
}
