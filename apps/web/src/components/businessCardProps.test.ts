import { describe, expect, it } from 'vitest'
import { readFormFields } from '@/lib/formSchema'
import { businessCardProps } from './businessCardProps'

// supabase/migrations/0015_business_card_form.sql의 GA-07 칸 정의(필요한 부분만)
const fields = readFormFields({
  fields: [
    { key: 'english_name', label: '영문 이름', type: 'text', required: true },
    { key: 'job_title', label: '직급', type: 'text', required: true, english: { 사원: 'Associate' } },
    {
      key: 'division',
      label: '부문',
      type: 'select',
      required: true,
      options: [
        { value: '공란', english: '' },
        { value: 'AI 그룹 / AI본부', english: 'Artificial Intelligence Group' },
      ],
    },
    { key: 'email_id', label: '이메일 아이디', type: 'text', required: true, suffix: '@blueward.co.kr', format: 'email_local' },
    { key: 'phone', label: '연락처', type: 'text', required: true, format: 'tel' },
  ],
})
const profile = { full_name: '김하늘', job_title: '사원', team_name: 'AI팀', email: 'newhire@demo.test' }
const filled = { english_name: 'Haneul Kim', job_title: '사원', division: 'AI 그룹 / AI본부', email_id: 'haneul.kim', phone: '010-0000-0000' }

describe('businessCardProps', () => {
  it('새 입력은 입력값과 영문 대응으로 명함을 채운다(한글 이름만 프로필)', () => {
    expect(businessCardProps(fields, filled, profile)).toEqual({
      name: '김하늘',
      jobTitle: '사원',
      englishName: 'Haneul Kim',
      englishTitle: 'Associate',
      division: 'AI 그룹 / AI본부',
      englishDivision: 'Artificial Intelligence Group',
      email: 'haneul.kim@blueward.co.kr',
      phone: '010-0000-0000',
    })
  })

  it('부문이 공란이면 부문 줄이 없다', () => {
    expect(businessCardProps(fields, { ...filled, division: '공란' }, profile)?.division).toBeNull()
  })

  it('이메일 아이디가 비면 메일 줄이 없다', () => {
    expect(businessCardProps(fields, { ...filled, email_id: '' }, profile)?.email).toBeNull()
  })

  it('옛 기록(english_name만)은 직급·팀·메일을 프로필에서 채운다', () => {
    expect(businessCardProps(fields, { english_name: 'KIM HANEUL' }, profile)).toEqual({
      name: '김하늘',
      jobTitle: '사원',
      englishName: 'KIM HANEUL',
      division: 'AI팀',
      email: 'newhire@demo.test',
    })
  })

  it('영문 이름 칸이 없는 입력 과제는 명함이 없다', () => {
    expect(businessCardProps(readFormFields({ fields: [{ key: 'stacks', label: '기술', type: 'text' }] }), {}, profile)).toBeNull()
  })
})
