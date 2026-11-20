import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SubmittedResult } from './SubmittedResult'
import { HIRES, makeTask } from './testFixtures'

// supabase/migrations/0015_business_card_form.sql의 GA-07 칸 정의(직급표·부문은 일부만)
const ga07Form = {
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
}

function card(result: Record<string, string>) {
  return makeTask({
    id: 'ga-07',
    new_hire_id: 'h1',
    status: 'submitted',
    result,
    template: { code: 'GA-07', title: '명함 신청', kind: 'input', form_schema: ga07Form },
  })
}

function valueOf(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling
}

describe('SubmittedResult: 명함(GA-07)', () => {
  it('새 제출: 5칸 표(메일은 도메인을 붙여)와 입력값 미리보기', () => {
    render(
      <SubmittedResult
        task={card({ english_name: 'Haneul Kim', job_title: '사원', division: 'AI 그룹 / AI본부', email_id: 'haneul.kim', phone: '010-0000-0000' })}
        hire={HIRES[0]}
      />,
    )
    expect(valueOf('부문')).toHaveTextContent('AI 그룹 / AI본부')
    expect(valueOf('이메일 아이디')).toHaveTextContent('haneul.kim@blueward.co.kr')
    const preview = screen.getByRole('figure', { name: '명함 미리보기' })
    expect(within(preview).getByText('Associate')).toBeInTheDocument()
    expect(within(preview).getByText('Artificial Intelligence Group')).toBeInTheDocument()
  })

  it('옛 제출(english_name만): 새 칸은 "—", 미리보기는 프로필 직급·팀·메일', () => {
    render(<SubmittedResult task={card({ english_name: 'KIM HANEUL' })} hire={HIRES[0]} />)
    expect(valueOf('부문')).toHaveTextContent('—')
    expect(valueOf('이메일 아이디')).toHaveTextContent('—')
    const preview = screen.getByRole('figure', { name: '명함 미리보기' })
    expect(within(preview).getByText('KIM HANEUL')).toBeInTheDocument()
    expect(within(preview).getByText('AI팀')).toBeInTheDocument()
    expect(within(preview).getByText('newhire@demo.test')).toBeInTheDocument()
  })
})
