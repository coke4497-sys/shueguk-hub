// clochu 의 순수 함수 — 시험용으로 따로 둔다
// 같은 길이일 때 끝까지 비교 — 비밀값을 한 글자씩 맞혀 보지 못하게
export function sameToken(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
// 읽을 수 있는 표 — { 실제 표, 강제 select, 강제 조건 }. 학생은 이름·학교·학년·담당·재원만(연락처·접근코드는 안 나감).
// 시간표는 기본 반(tt_classes — '이 주만' w 반 제외)과 이 주만 반(tt_week_classes — w 반만)을 따로 읽는다 (Codex 검토)
type T = { table: string; select?: string; where?: [string, string] }
export const TABLES: Record<string, T> = {
  students: { table: 'students', select: 'name,school,grade,teacher,enrolled' },
  tt_classes: { table: 'tt_classes', where: ['class_id', 'not.like.w*'] },
  tt_week_classes: { table: 'tt_classes', where: ['class_id', 'like.w*'] },
  tt_period: { table: 'tt_period' }, tt_log: { table: 'tt_log' }, class_notes: { table: 'class_notes' },
  msg_messages: { table: 'msg_messages' }, msg_tasks: { table: 'msg_tasks' },
  msg_presence: { table: 'msg_presence' }, msg_presence_log: { table: 'msg_presence_log' },
}
export function safeQuery(name: string, query: string) {
  const t = TABLES[name]
  if (!t) return null
  const q = new URLSearchParams(query || '')
  if (t.select) q.set('select', t.select)
  if (t.where) q.append(t.where[0], t.where[1])
  const lim = Number(q.get('limit') || '200')
  q.set('limit', String(Math.min(Math.max(1, lim || 200), 1000)))
  return { table: t.table, qs: q.toString() }
}
