// activity 의 순수 함수 — 알림 글 만들기(시험용으로 따로)
export type Row = { id?: number; at: string; page: string; what: string; action: string; target: string; detail: string; author: string; urgent: boolean }

export const DIGEST_MIN = 120   // 잦은 일은 첫 건이 생긴 뒤 이만큼 지나면 묶어서 한 번
export const MAX_ROWS = 50      // 한 번에 받는 줄 수
const LIM: Record<string, number> = { page: 60, what: 30, action: 40, target: 120, detail: 300, author: 40 }

export function clean(r: unknown): Row | null {
  if (!r || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  const s = (k: string) => String(o[k] == null ? '' : o[k]).replace(/\s+/g, ' ').trim().slice(0, LIM[k] || 100)
  const what = s('what')
  if (!what) return null
  return { at: new Date().toISOString(), page: s('page'), what, action: s('action'), target: s('target'), detail: s('detail'), author: s('author'), urgent: !!o.urgent }
}

export function hm(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3)
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}
function md(iso: string) { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() }

// 즉시 알림 한 글 — '[시험 범위] 김현지 · 저장 (입력 완료) · 고1 화정 26-2-기말' + 내용 줄
export function urgentText(rows: Row[]) {
  return rows.map((r) => {
    const who = r.author || '이름 없음'
    const head = '[' + r.what + '] ' + who + ' · ' + (r.action || '변경') + (r.target ? ' · ' + r.target : '')
    return head + (r.detail ? '\n' + r.detail : '')
  }).join('\n\n')
}

// 묶음 알림 — 종류·동작별 건수와 한 사람씩 몇 건, 대상은 세 개까지
export function digestText(rows: Row[]) {
  if (!rows.length) return ''
  const at = rows.map((r) => r.at).sort()
  const first = at[0], last = at[at.length - 1]
  const g = new Map<string, Row[]>()
  for (const r of rows) { const k = r.what + '|' + r.action; if (!g.has(k)) g.set(k, []); g.get(k)!.push(r) }
  const lines = [...g.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, list]) => {
    const [what, action] = k.split('|')
    const by = new Map<string, number>()
    for (const r of list) by.set(r.author || '이름 없음', (by.get(r.author || '이름 없음') || 0) + 1)
    const who = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => n + (list.length > 1 ? ' ' + c : '')).join(', ')
    const tg = [...new Set(list.map((r) => r.target).filter(Boolean))]
    const tgs = tg.length ? ' — ' + tg.slice(0, 3).join(', ') + (tg.length > 3 ? ' 외 ' + (tg.length - 3) : '') : ''
    return '· ' + what + (action ? ' ' + action : '') + ' ' + list.length + '건 (' + who + ')' + tgs
  })
  const span = md(first) === md(last) ? md(first) + ' ' + hm(first) + '~' + hm(last) : md(first) + ' ' + hm(first) + ' ~ ' + md(last) + ' ' + hm(last)
  return '티쳐스 활동 요약 · ' + span + ' · ' + rows.length + '건\n' + lines.join('\n')
}

// 묶을 때가 됐나 — 가장 오래된 대기 줄이 DIGEST_MIN 분 넘게 기다렸으면
export function digestDue(oldestAt: string | null, now = Date.now()) {
  return !!oldestAt && now - new Date(oldestAt).getTime() >= DIGEST_MIN * 60e3
}
