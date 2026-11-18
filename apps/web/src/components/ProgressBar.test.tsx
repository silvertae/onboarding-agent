import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressBar } from './ProgressBar'

function fill(bar: HTMLElement) {
  return bar.firstElementChild as HTMLElement
}

describe('ProgressBar', () => {
  it('이름과 aria 값을 그대로 노출한다', () => {
    render(<ProgressBar label="팀 과제 진행률" value={2} max={6} />)
    const bar = screen.getByRole('progressbar', { name: '팀 과제 진행률' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '6')
    expect(bar).toHaveAttribute('aria-valuenow', '2')
  })

  it('채움은 width가 아니라 transform으로 그린다', () => {
    render(<ProgressBar label="전체 진행률" value={50} max={100} />)
    const inner = fill(screen.getByRole('progressbar'))
    expect(inner.style.transform).toBe('translateX(-50%)')
    expect(inner.style.width).toBe('')
    expect(inner.className).toContain('transition-transform')
    expect(inner.className).toContain('motion-reduce:transition-none')
  })

  it('max가 0이면 비어 있고, 넘치는 값은 100%에서 멈춘다', () => {
    const { rerender } = render(<ProgressBar label="진행률" value={0} max={0} />)
    expect(fill(screen.getByRole('progressbar')).style.transform).toBe('translateX(-100%)')
    rerender(<ProgressBar label="진행률" value={7} max={4} />)
    expect(fill(screen.getByRole('progressbar')).style.transform).toBe('translateX(-0%)')
  })

  it('size="sm"은 6px, 기본은 8px', () => {
    const { rerender } = render(<ProgressBar label="진행률" value={1} max={4} />)
    expect(screen.getByRole('progressbar')).toHaveClass('h-2')
    rerender(<ProgressBar label="진행률" value={1} max={4} size="sm" />)
    expect(screen.getByRole('progressbar')).toHaveClass('h-1.5')
  })
})
