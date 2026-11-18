import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OwnerBadge } from './OwnerBadge'

describe('OwnerBadge', () => {
  it('소속 팀 과제는 파란 틴트(own-team 토큰)로 보인다', () => {
    render(<OwnerBadge department={null} teamName="AI팀" />)
    const badge = screen.getByText('AI팀')
    expect(badge.className).toContain('bg-own-team-bg')
    expect(badge.className).toContain('text-own-team-fg')
  })

  it('경영지원 부서 과제는 테두리형으로 보여 팀 과제와 구분된다', () => {
    render(<OwnerBadge department="ga" />)
    const badge = screen.getByText('총무팀')
    expect(badge.className).not.toContain('bg-own-team-bg')
    expect(badge.className).toContain('border-border')
  })

  it('팀 이름을 모르면 "소속 팀"으로 보인다', () => {
    render(<OwnerBadge department={null} />)
    expect(screen.getByText('소속 팀')).toBeInTheDocument()
  })
})
