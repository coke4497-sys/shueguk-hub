// ai-office 의 순수 함수 — 시험용으로 따로 둔다
// 같은 길이일 때 끝까지 비교 — 비밀값을 한 글자씩 맞혀 보지 못하게 (closhu/lib.ts 와 같은 함수)
export function sameToken(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export type Order = { id: number; status: string; picked_at: string | null }
export type Task = { id: number; order_id: number; col: string }
export const STALE_MS = 50 * 60e3   // DB ai_bot_claim 의 50분과 같게

// 이번 순찰이 할 지시 — 새 지시(접수) 또는 진행 중인데 진행·검수 칸 할 일이 남은 지시(원장님이 다시 고쳐 달라고 한 것 포함),
// 다른 순찰이 50분 안에 가져간 것은 뺀다. 할 일이 모두 원장님 확인 칸에 있으면 기다리는 중이라 할 것이 없다.
export function todoOf(orders: Order[], tasks: Task[], now: number) {
  const busy = new Set(tasks.filter((t) => t.col === '진행' || t.col === '검수').map((t) => t.order_id))
  return orders.filter((o) => {
    if (o.picked_at && now - Date.parse(o.picked_at) < STALE_MS) return false
    if (o.status === '접수') return true
    return o.status === '진행' && busy.has(o.id)
  }).map((o) => o.id)
}
