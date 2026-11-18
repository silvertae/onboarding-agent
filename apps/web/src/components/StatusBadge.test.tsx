import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Enums } from '@/lib/database.types'
import { StatusBadge } from './StatusBadge'

const CASES: [Enums<'task_status'>, string][] = [
  ['blocked', '선행 과제 대기'],
  ['todo', '할 일'],
  ['submitted', '확인 대기'],
  ['rework', '보완 요청'],
  ['done', '완료'],
  ['na', '해당 없음'],
]

describe('StatusBadge', () => {
  it.each(CASES)('%s 배지는 화면 명세 문구 "%s"를 쓰고 상태 토큰 색을 쓴다', (status, label) => {
    render(<StatusBadge status={status} />)
    const badge = screen.getByText(label)
    expect(badge).toHaveAttribute('data-variant', status)
    expect(badge.className).toContain(`text-st-${status}-fg`)
    expect(badge.className).not.toMatch(/#[0-9a-f]{6}/i)
  })

  it('staff_only 과제의 할 일은 "담당자 처리 예정"으로 보인다', () => {
    render(<StatusBadge status="todo" completionMode="staff_only" />)
    expect(screen.getByText('담당자 처리 예정')).toBeInTheDocument()
  })

  it.each(['todo', 'submitted', 'rework', 'done'] as const)('%s 배지는 앞에 점을 찍는다(시안 .st::before)', (status) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(/.+/).className).toContain('before:bg-current')
  })

  it.each(['blocked', 'na'] as const)('%s 배지는 점 없이 테두리로 구분한다', (status) => {
    render(<StatusBadge status={status} />)
    const badge = screen.getByText(/.+/)
    expect(badge.className).not.toContain('before:bg-current')
    expect(badge.className).toContain(`border-st-${status}-border`)
  })
})
