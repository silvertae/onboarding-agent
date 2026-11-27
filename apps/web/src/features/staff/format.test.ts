import { describe, expect, it } from 'vitest'
import { daysLate, daysWaiting, submittedLabel } from './format'

describe('submittedLabel', () => {
  it('신입이 직접 완료하는 과제(self)는 "완료"', () => {
    expect(submittedLabel('self')).toBe('완료')
  })

  it('담당자 확인이 필요한 과제는 "제출"', () => {
    expect(submittedLabel('confirm')).toBe('제출')
    expect(submittedLabel('staff_only')).toBe('제출')
  })
})

describe('daysLate', () => {
  it('기한 다음 날이 1', () => {
    expect(daysLate('2026-11-20', '2026-11-27')).toBe(7)
  })
})

describe('daysWaiting', () => {
  it('제출 시각을 서울 날짜로 바꿔 센다', () => {
    // 11/24 23:00 서울
    expect(daysWaiting('2026-11-24T14:00:00Z', '2026-11-27')).toBe(3)
    // 11/27 00:30 서울
    expect(daysWaiting('2026-11-26T15:30:00Z', '2026-11-27')).toBe(0)
  })
})
