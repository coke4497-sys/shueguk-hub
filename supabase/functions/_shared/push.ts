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
    // 클로슈·카카오채널 글(bot)은 옛 'mention' 범위로 저장된 기기여도 받는다 — 그 글에는 받는 사람 할 일이 없다.
    // bot.to 가 없는 글(오늘 정리 등)은 모두에게 (Codex 검토)
    .filter((s) => !!msg.bot || s.mode !== 'mention' || mine.has(s.user_id))
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
  const failedIds: number[] = []
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
        failedIds.push(sub.id)
        if (sub.fail_count >= 9) await admin.from('msg_push_subs').delete().eq('id', sub.id)
        else await admin.from('msg_push_subs').update({ fail_count: sub.fail_count + 1 }).eq('id', sub.id)
      }
    }
  }))
  return { sent, gone, failed, failedIds }
}

// 다시 보낼 기기만 남긴다 — 이미 받은 기기에는 두 번 보내지 않게 (Codex 검토)
export function onlySubs<T extends { sub: Sub }>(items: T[], ids: unknown): T[] {
  const want = new Set((Array.isArray(ids) ? ids : []).map(Number))
  return items.filter((x) => want.has(Number(x.sub.id)))
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
  const { failedIds, ...cnt } = r
  if (!r.sent && r.failed) {
    await checked(() => admin.from('msg_messages').update({ pushed_at: null }).eq('id', id).eq('pushed_at', at), 'unclaim msg ' + id)
    return { status: 503, body: { error: 'deliver_failed', targets: items.length, ...cnt } }
  }
  // 일부 기기만 실패 — 그 기기만 적어 두고 순찰이 다시 보낸다(retryPush).
  // 적기마저 실패하면 보낼 자리(pushed_at)를 되돌려 전체를 다시 보내게 한다 — 같은 tag 라 받은 기기에는 알림이 겹쳐 쌓이지 않는다 (Codex 검토)
  if (failedIds.length && !(await saveRetry(admin, 'msg_messages', id, { push_retry: failedIds }))) {
    await checked(() => admin.from('msg_messages').update({ pushed_at: null }).eq('id', id).eq('pushed_at', at), 'unclaim msg ' + id)
    return { status: 503, body: { error: 'retry_save_failed', targets: items.length, ...cnt } }
  }
  return { status: 200, body: { targets: items.length, ...cnt } }
}

// 되돌림 같은 마지막 갱신 — 결과를 확인하며 세 번까지, 끝내 안 되면 로그에 남긴다(DB 가 계속 안 되면 더 할 수 있는 일이 없다)
// deno-lint-ignore no-explicit-any
export async function checked(run: () => any, what: string) {
  for (let i = 0; i < 3; i++) {
    const { error } = await run()
    if (!error) return true
    await new Promise((r) => setTimeout(r, 300 * (i + 1)))
  }
  console.error('update failed', what)
  return false
}

// 다시 보낼 목록 적기 — 한 번 더 해 보고 결과를 돌려준다
// deno-lint-ignore no-explicit-any
// same 이 있으면 그 열이 그대로일 때만 적는다(그 사이 다시 넘겼으면 낡은 정보를 적지 않게 — 0줄이어도 성공으로 본다)
export async function saveRetry(admin: any, table: string, id: number, row: Record<string, unknown>, ...same: [string, unknown][]) {
  for (let i = 0; i < 2; i++) {
    let q = admin.from(table).update(row).eq('id', id)
    for (const c of same) q = q.eq(c[0], c[1])
    const { error } = await q
    if (!error) return true
  }
  return false
}

// 일부 실패한 메시지를 그 기기에만 다시 — 적어 둔 목록을 한 문장으로 비우며 옛 값을 받아(동시에 두 번 안 가게), 또 실패한 기기만 다시 적는다 (Codex 검토)
// deno-lint-ignore no-explicit-any
export async function retryPush(admin: any, id: number) {
  const c = await admin.rpc('msg_push_retry_claim', { p_id: id })
  if (c.error) return { status: 503 }
  const ids = c.data
  if (!Array.isArray(ids) || !ids.length) return { status: 200, skipped: true }
  const restore = (v: unknown) => keepRetry(admin, 'msg_messages', id, 'push_retry', v)
  const [m, t, s, a] = await Promise.all([
    admin.from('msg_messages').select('id,author,author_name,body,files,deleted_at,bot').eq('id', id).maybeSingle(),
    admin.from('msg_tasks').select('assignee,text').eq('message_id', id),
    admin.from('msg_push_subs').select('*').in('id', ids),
    admin.from('teacher_accounts').select('user_id').eq('active', true),
  ])
  if (m.error || t.error || s.error || a.error) { await restore(ids); return { status: 503 } }
  if (!m.data || m.data.deleted_at) return { status: 200, skipped: true }
  const active = new Set<string>((a.data || []).map((r: { user_id: string }) => r.user_id))
  const r = await deliver(admin, onlySubs(plan(m.data, t.data || [], s.data || [], active), ids))
  if (r.failedIds.length && !(await restore(r.failedIds))) return { status: 503, lost: r.failedIds }
  return { status: r.failed ? 503 : 200 }
}

// 잡아 비운 목록을 되돌려 적기 — 결과를 확인하며 세 번까지 (Codex 검토). 그 사이 새 목록이 생겼으면 그대로 둔다
// deno-lint-ignore no-explicit-any
async function keepRetry(admin: any, table: string, id: number, col: string, v: unknown, same?: [string, unknown]) {
  for (let i = 0; i < 3; i++) {
    let q = admin.from(table).update({ [col]: v }).eq('id', id).is(col, null)
    if (same) q = q.eq(same[0], same[1])
    const { error } = await q
    if (!error) return true
    await new Promise((r) => setTimeout(r, 300 * (i + 1)))
  }
  console.error('keepRetry failed', table, id)
  return false
}

// 넘김 알림도 같은 방식 — hand_retry = {to, by, subs:[id…]} 의 기기에만 다시 (Codex 검토)
// deno-lint-ignore no-explicit-any
export async function retryHand(admin: any, id: number) {
  const c = await admin.rpc('msg_hand_retry_claim', { p_id: id })
  if (c.error) return { status: 503 }
  const h = c.data as { to?: string; by?: string; by_id?: string; gen?: number; subs?: number[] } | null
  if (!h || !Array.isArray(h.subs) || !h.subs.length || !h.to) return { status: 200, skipped: true }
  // 위임 차례 = 맡은 사람(to) + 넘긴 사람(by_id). B→C→B 로 다시 넘기면 hand_by 가 C 로 바뀌어 갈린다 (Codex 검토)
  // 되돌릴 때도 같은 차례일 때만 — 조회 실패·전송 실패 어느 쪽이든 낡은 정보를 되살리지 않게
  // 세대 번호(hand_gen, 202610200011)가 있으면 그것으로 — 같은 두 사람 사이를 다시 오간 경우도 가린다
  const turn: [string, unknown] | undefined = typeof h.gen === 'number' ? ['hand_gen', h.gen] : h.by_id ? ['hand_by', h.by_id] : undefined
  const restore = (v: unknown) => keepRetry(admin, 'msg_tasks', id, 'hand_retry', v, turn)
  const [t, s, a] = await Promise.all([
    admin.from('msg_tasks').select('id,message_id,text,status,assignee,hand_by,hand_gen,updated_at').eq('id', id).maybeSingle(),
    admin.from('msg_push_subs').select('*').in('id', h.subs),
    admin.from('teacher_accounts').select('user_id').eq('active', true),
  ])
  if (t.error || s.error || a.error) { await restore(h); return { status: 503 } }
  // 그 사이 다른 사람에게 다시 넘겼으면 옛 사람에게는 보내지 않는다
  if (!t.data || t.data.assignee !== h.to || (h.by_id && t.data.hand_by !== h.by_id) || (typeof h.gen === 'number' && t.data.hand_gen !== h.gen)) return { status: 200, skipped: true }
  const active = new Set<string>((a.data || []).map((r: { user_id: string }) => r.user_id))
  const r = await deliver(admin, onlySubs(handPlan({ ...t.data, to: h.to }, h.by || '', s.data || [], active), h.subs))
  // 보내는 사이 다시 넘겼으면(hand_by 가 바뀜) 옛 정보를 되살리지 않는다 (Codex 검토)
  if (r.failedIds.length && !(await restore({ ...h, subs: r.failedIds }))) return { status: 503, lost: r.failedIds }
  return { status: r.failed ? 503 : 200 }
}

// 넘김 알림 처음 보내기 — msg-push hand(넘긴 사람 화면)와 클로슈 순찰(화면이 못 부른 것)이 함께 쓴다 (Codex 검토)
// 다 읽고 → hand_push 를 비우며 잡고 → 보냄. 전체 실패면 자리를 되돌리고, 일부 실패면 그 기기만 hand_retry 에. by 가 있으면 그 사람이 넘긴 일만.
// deno-lint-ignore no-explicit-any
export async function pushHand(admin: any, id: number, by?: string) {
  let tq = admin.from('msg_tasks').select('id,message_id,text,status,hand_push,hand_by,hand_gen').eq('id', id).not('hand_push', 'is', null)
  if (by) tq = tq.eq('hand_by', by)
  const [t, a] = await Promise.all([tq.maybeSingle(), admin.from('teacher_accounts').select('user_id,display_name').eq('active', true)])
  if (t.error || a.error) return { status: 503, body: { error: 'lookup_failed' } }
  if (!t.data) return { status: 200, body: { skipped: true } }
  const to = t.data.hand_push as string
  const byName = ((a.data || []).find((r: { user_id: string }) => r.user_id === t.data.hand_by) || {}).display_name
    || (await admin.from('teacher_accounts').select('display_name').eq('user_id', t.data.hand_by).maybeSingle()).data?.display_name || ''
  const s = await admin.from('msg_push_subs').select('*').eq('user_id', to)
  if (s.error) return { status: 503, body: { error: 'lookup_failed' } }
  // 새 넘김 알림을 잡을 때 앞 넘김의 재시도 정보도 비운다 — A→B→A 처럼 다시 넘겼을 때 낡은 알림이 가지 않게
  // 처음 읽은 위임 차례(맡은 사람·넘긴 사람)가 그대로일 때만 잡는다 — 그 사이 B→C→B 로 다시 넘겼으면 옛 이름으로 보내지 않게 (Codex 검토)
  const cq = admin.from('msg_tasks').update({ hand_push: null, hand_retry: null }).eq('id', id).eq('hand_push', to)
    .eq('hand_by', t.data.hand_by).eq('hand_gen', t.data.hand_gen)
  const { data: claimed, error: ce } = await cq.select('id,message_id,text,status,updated_at')
  if (ce) return { status: 503, body: { error: 'claim_failed' } }
  if (!claimed || !claimed.length) return { status: 200, body: { skipped: true } }
  // 위임 차례 = 맡은 사람 + 넘긴 사람. updated_at 은 확인·미루기·진행 표시에도 바뀌어 차례로 쓰지 않는다 (Codex 검토)
  // 세대 번호(hand_gen)는 맡은 사람이 바뀔 때마다 오른다 — B→C→B 로 쌍이 되돌아와도 갈린다 (Codex 검토)
  const gen = t.data.hand_gen
  const turn: [string, unknown][] = [['assignee', to], ['hand_by', t.data.hand_by], ['hand_gen', gen]]
  const unclaim = () => checked(() => admin.from('msg_tasks').update({ hand_push: to }).eq('id', id).is('hand_push', null).eq('assignee', to).eq('hand_by', t.data.hand_by).eq('hand_gen', gen), 'unclaim hand ' + id)
  const active = new Set<string>((a.data || []).map((r: { user_id: string }) => r.user_id))
  const items = handPlan({ ...claimed[0], to }, byName, s.data || [], active)
  const r = await deliver(admin, items)
  const { failedIds, ...cnt } = r
  // 한 기기에도 못 보냈고 일시적 실패가 있으면 자리를 되돌린다(보내는 사이 다시 넘겼으면 그대로 둠)
  if (!r.sent && r.failed) { await unclaim(); return { status: 503, body: { error: 'deliver_failed', targets: items.length, ...cnt } } }
  // 일부 기기만 실패 — 그 기기만 적어 두고 순찰이 retryHand 로. 적기마저 실패하면 자리를 되돌린다(같은 tag 라 겹쳐 쌓이지 않음)
  if (failedIds.length && !(await saveRetry(admin, 'msg_tasks', id, { hand_retry: { to, by: byName, by_id: t.data.hand_by, gen, subs: failedIds } }, ...turn))) {
    await unclaim()
    return { status: 503, body: { error: 'retry_save_failed', targets: items.length, ...cnt } }
  }
  return { status: 200, body: { targets: items.length, ...cnt } }
}
