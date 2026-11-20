import { describe, expect, it } from 'vitest'
import { englishOf, formatError, readFormFields, type FormField } from './formSchema'

const jobTitle: FormField = { key: 'job_title', label: '직급', type: 'text', english: { 책임: 'Senior Manager', 사원: 'Associate' } }
const division: FormField = {
  key: 'division',
  label: '부문',
  type: 'select',
  options: [
    { value: '공란', english: '' },
    { value: 'AI 그룹 / AI본부', english: 'Artificial Intelligence Group' },
  ],
}
const phone: FormField = { key: 'phone', label: '연락처', type: 'text', format: 'tel' }
const emailId: FormField = { key: 'email_id', label: '이메일 아이디', type: 'text', format: 'email_local' }

describe('readFormFields', () => {
  it('fields가 배열이 아니면 빈 목록', () => {
    expect(readFormFields(null)).toEqual([])
    expect(readFormFields({ fields: 'x' })).toEqual([])
  })

  it('레코드가 아닌 칸은 버린다', () => {
    expect(readFormFields({ fields: [1, { key: 'a', label: 'A', type: 'text' }] })).toHaveLength(1)
  })
})

describe('englishOf', () => {
  it('직급은 앞뒤 공백을 지우고 대응표에서 찾는다', () => {
    expect(englishOf(jobTitle, ' 책임 ')).toBe('Senior Manager')
  })

  it('대응표에 없는 직급은 빈 값', () => {
    expect(englishOf(jobTitle, '인턴')).toBe('')
  })

  it('부문은 선택지의 영문명', () => {
    expect(englishOf(division, 'AI 그룹 / AI본부')).toBe('Artificial Intelligence Group')
  })

  it('목록에 없는 부문 값은 빈 값(깨지지 않는다)', () => {
    expect(englishOf(division, '없는 부문')).toBe('')
  })

  it('대응표가 없는 칸은 빈 값', () => {
    expect(englishOf(phone, '010-0000-0000')).toBe('')
  })
})

describe('formatError', () => {
  it('빈 값은 검사하지 않는다', () => {
    expect(formatError(phone, '')).toBeNull()
    expect(formatError(emailId, '  ')).toBeNull()
  })

  it('연락처는 숫자와 하이픈만', () => {
    expect(formatError(phone, '010-0000-0000')).toBeNull()
    expect(formatError(phone, '010 공공')).toBe('숫자와 하이픈(-)만 입력해 주세요')
  })

  it('이메일 아이디는 영문·숫자·점·밑줄·하이픈만', () => {
    expect(formatError(emailId, 'haneul.kim')).toBeNull()
    expect(formatError(emailId, 'a@b')).toBe('영문·숫자·점(.)·밑줄(_)·하이픈(-)만 입력해 주세요')
  })

  it('형식이 없는 칸은 검사하지 않는다', () => {
    expect(formatError(jobTitle, '아무 글자')).toBeNull()
  })
})
