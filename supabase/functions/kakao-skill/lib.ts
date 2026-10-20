// kakao-skill 의 순수 함수 — 시험용으로 따로 둔다
export const THANKS = '메시지를 학원에 전달했습니다. 확인한 뒤 연락드리겠습니다.'
export const BUSY = '오늘은 메시지를 더 받을 수 없습니다. 급한 일은 학원으로 전화해 주세요.'
// 카카오 사용자 키는 그대로 두지 않고 짧은 구분 글자(6자)만 — 같은 분이 보낸 글끼리 묶어 보려는 용도
export async function whoOf(key: string) {
  if (!key) return '------'
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('shueguk:' + key)))
  return Array.from(d.slice(0, 3)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
// 오픈빌더 스킬 응답 2.0 — 글 한 줄
export function reply(text: string) {
  return new Response(JSON.stringify({ version: '2.0', template: { outputs: [{ simpleText: { text } }] } }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
