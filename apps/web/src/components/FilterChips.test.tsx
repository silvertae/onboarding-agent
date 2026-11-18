import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { FilterChips } from './FilterChips'

function Harness() {
  const [value, setValue] = useState<'all' | 'ops'>('all')
  return (
    <FilterChips
      label="담당 필터"
      items={[
        { value: 'all', label: '전체' },
        { value: 'ops', label: '경영지원' },
      ]}
      value={value}
      onChange={setValue}
    />
  )
}

describe('FilterChips', () => {
  it('누른 칩만 aria-pressed=true', async () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: '담당 필터' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '경영지원' }))
    expect(screen.getByRole('button', { name: '경영지원' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('보이는 높이 36에 위아래 4px씩 누르는 영역을 넓힌다(44, 신입 모바일 화면)', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: '전체' })).toHaveClass('relative', 'h-9', 'after:absolute', 'after:-inset-y-1')
  })
})
