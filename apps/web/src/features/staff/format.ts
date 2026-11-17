// 담당자 화면의 날짜 표시. 서비스 기준 시간대는 서울이다.
const TZ = 'Asia/Seoul'

const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const timeParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, weekday: 'short' })

// 서울 기준 오늘 'YYYY-MM-DD'
export function todaySeoul(now: Date = new Date()): string {
  return dateParts.format(now)
}

// 'YYYY-MM-DD' → '11/18'
export function formatMonthDay(date: string | null | undefined): string {
  if (!date) return '—'
  const [, m, d] = date.slice(0, 10).split('-')
  return `${Number(m)}/${Number(d)}`
}

// 'YYYY-MM-DD' → '11월 14일'
export function formatKoreanDate(date: string | null | undefined): string {
  if (!date) return '—'
  const [, m, d] = date.slice(0, 10).split('-')
  return `${Number(m)}월 ${Number(d)}일`
}

// ISO 시각 → '11/17 13:05' (서울)
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const at = new Date(iso)
  return `${formatMonthDay(dateParts.format(at))} ${timeParts.format(at)}`
}

// ISO 시각 → '11/20 (금) 14:00' (서울)
export function formatSchedule(iso: string | null | undefined): string {
  if (!iso) return '일정 미정'
  const at = new Date(iso)
  return `${formatMonthDay(dateParts.format(at))} (${weekday.format(at)}) ${timeParts.format(at)}`
}

function dayIndex(date: string): number {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

// 입사일 기준 표시: 입사 전이면 'D-7', 입사 후면 '4일째'(입사일 = 1일째)
export function hireDayLabel(hireDate: string | null | undefined, today: string = todaySeoul()): string {
  if (!hireDate) return ''
  const diff = dayIndex(today) - dayIndex(hireDate)
  return diff < 0 ? `D${diff}` : `${diff + 1}일째`
}

export function isBeforeHire(hireDate: string | null | undefined, today: string = todaySeoul()): boolean {
  return Boolean(hireDate) && dayIndex(today) < dayIndex(hireDate!)
}

export function isOverdue(dueDate: string | null | undefined, today: string = todaySeoul()): boolean {
  return Boolean(dueDate) && dayIndex(dueDate!) < dayIndex(today)
}

// <input type="datetime-local"> 값('2026-11-20T14:00')을 서울 시각 ISO로
export function localInputToIso(value: string): string | undefined {
  if (!value) return undefined
  return `${value}:00+09:00`
}

// ISO 시각 → <input type="datetime-local"> 값(서울)
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const at = new Date(iso)
  return `${dateParts.format(at)}T${timeParts.format(at)}`
}

// 제출 시각 앞에 붙일 말. 신입이 직접 완료하는 과제(self)는 확인 절차가 없으므로 "완료"라고 쓴다.
export function submittedLabel(completionMode: string): '완료' | '제출' {
  return completionMode === 'self' ? '완료' : '제출'
}
