// 신입 화면의 날짜 표기. due_date는 'YYYY-MM-DD'(날짜만), scheduled_at은 timestamptz다.

const DAY = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
const TIME = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const TODAY = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

// 'YYYY-MM-DD'를 UTC가 아닌 브라우저 날짜로 읽는다(new Date('2026-11-18')은 UTC 자정이라 하루 밀릴 수 있다).
function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// "11월 18일 (수)"
export function formatDay(value: string): string {
  return DAY.format(parseDateOnly(value))
}

// "11월 20일 (금) 14:00"
export function formatDateTime(value: string): string {
  const date = new Date(value)
  return `${DAY.format(date)} ${TIME.format(date)}`
}

// "2026년 11월 17일 화요일"
export function formatToday(now: Date): string {
  return TODAY.format(now)
}

// 입사일이 1일째
export function daysSinceHire(hireDate: string, now: Date): number {
  const start = parseDateOnly(hireDate)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1
}

const MONTH_DAY = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' })

// 브라우저 날짜 기준 'YYYY-MM-DD'. due_date와 문자열로 비교할 수 있다.
export function toDateOnly(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

// "11월 17일"
export function formatMonthDay(value: string): string {
  return MONTH_DAY.format(parseDateOnly(value))
}

// 기한이 오늘보다 앞이면 지난 것이다. 오늘이 기한이면 아직 지나지 않았다.
export function isPastDue(dueDate: string | null, today: string): boolean {
  return dueDate !== null && dueDate < today
}
