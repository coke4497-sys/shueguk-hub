// clochu 의 순수 함수 — 시험용으로 따로 둔다
// 같은 길이일 때 끝까지 비교 — 비밀값을 한 글자씩 맞혀 보지 못하게
export function sameToken(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
// 읽을 수 있는 표 — 학생은 이름·학교·학년·담당·재원만(연락처·접근코드는 안 나감)
export const TABLES: Record<string, string | null> = {
  students: 'name,school,grade,teacher,enrolled',
  tt_classes: null, tt_period: null, tt_log: null, class_notes: null,
  msg_messages: null, msg_tasks: null, msg_presence: null, msg_presence_log: null,
}
export function safeQuery(table: string, query: string) {
  if (!(table in TABLES)) return null
  const q = new URLSearchParams(query || '')
  const forced = TABLES[table]
  if (forced) q.set('select', forced)
  const lim = Number(q.get('limit') || '200')
  q.set('limit', String(Math.min(Math.max(1, lim || 200), 1000)))
  return q.toString()
}
