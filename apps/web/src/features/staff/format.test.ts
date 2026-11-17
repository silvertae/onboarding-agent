import { describe, expect, it } from 'vitest'
import { submittedLabel } from './format'

describe('submittedLabel', () => {
  it('신입이 직접 완료하는 과제(self)는 "완료"', () => {
    expect(submittedLabel('self')).toBe('완료')
  })

  it('담당자 확인이 필요한 과제는 "제출"', () => {
    expect(submittedLabel('confirm')).toBe('제출')
    expect(submittedLabel('staff_only')).toBe('제출')
  })
})
