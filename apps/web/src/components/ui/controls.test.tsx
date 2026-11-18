import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { Input } from './input'
import { NativeSelect } from './native-select'
import { Textarea } from './textarea'

// system.md "버튼·입력 크기": 입력 40, 로그인·신입 양식은 44. 모든 입력은 카드 흰 바탕.
describe('폼 컨트롤 크기', () => {
  it('Input은 기본 40px, size="lg"면 44px', () => {
    render(
      <>
        <Input aria-label="기본" />
        <Input aria-label="큰" size="lg" />
      </>,
    )
    expect(screen.getByLabelText('기본')).toHaveClass('h-10', 'bg-card')
    expect(screen.getByLabelText('큰')).toHaveClass('h-11')
    expect(screen.getByLabelText('큰')).not.toHaveClass('h-10')
  })

  it('NativeSelect는 Input과 같은 높이·바탕에 화살표 아이콘을 그린다', () => {
    const { container } = render(
      <NativeSelect aria-label="입사자" className="w-40">
        <option value="">전체</option>
      </NativeSelect>,
    )
    const select = screen.getByRole('combobox', { name: '입사자' })
    expect(select).toHaveClass('h-10', 'bg-card', 'appearance-none')
    expect(select.parentElement).toHaveClass('w-40')
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('NativeSelect size="lg"는 44px', () => {
    render(
      <NativeSelect aria-label="팀" size="lg">
        <option>AI팀</option>
      </NativeSelect>,
    )
    expect(screen.getByRole('combobox', { name: '팀' })).toHaveClass('h-11')
  })

  it('Textarea는 흰 바탕에 세로로만 늘린다', () => {
    render(<Textarea aria-label="사유" />)
    expect(screen.getByLabelText('사유')).toHaveClass('bg-card', 'resize-y')
  })

  it('Checkbox는 라벨로 이름이 붙고 눌러서 켠다', async () => {
    render(
      <label>
        <Checkbox /> SAP 계정
      </label>,
    )
    const box = screen.getByRole('checkbox', { name: 'SAP 계정' })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(box).toBeChecked()
  })

  it('비활성 주 버튼은 흐린 파랑이 아니라 회색이다(시안 .btn[disabled])', () => {
    render(<Button disabled>완료</Button>)
    expect(screen.getByRole('button', { name: '완료' })).toHaveClass('disabled:bg-track', 'disabled:text-disabled-foreground')
  })
})
