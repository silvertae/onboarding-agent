/**
 * 아바타에 넣을 두 글자.
 * - 실명형 이름은 뒤 두 글자(이름): "강민재" → "민재"
 * - 띄어쓰기가 있는 이름이나 관리자 계정은 첫 단어 앞 두 글자: "심사 신입" → "심사", "관리자" → "관리"
 */
export function initials(name: string, role?: string): string {
  const trimmed = name.trim()
  const chars = (s: string) => Array.from(s)
  if (role === 'admin' || /\s/.test(trimmed)) {
    return chars(trimmed.split(/\s+/)[0]).slice(0, 2).join('')
  }
  return chars(trimmed).slice(-2).join('')
}
