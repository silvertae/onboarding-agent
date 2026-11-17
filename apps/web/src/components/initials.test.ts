import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('실명형 이름은 뒤 두 글자(이름)를 쓴다', () => {
    expect(initials('강민재')).toBe('민재')
    expect(initials('김하늘')).toBe('하늘')
  })

  it('띄어쓰기가 있는 이름은 첫 단어 앞 두 글자를 쓴다', () => {
    expect(initials('심사 신입')).toBe('심사')
    expect(initials('리허설 신입')).toBe('리허')
    expect(initials('  발표 신입  ')).toBe('발표')
  })

  it('관리자 계정은 첫 단어 앞 두 글자를 쓴다', () => {
    expect(initials('관리자', 'admin')).toBe('관리')
  })

  it('두 글자 이하 이름은 그대로 쓴다', () => {
    expect(initials('하늘')).toBe('하늘')
    expect(initials('김')).toBe('김')
    expect(initials('')).toBe('')
  })
})
