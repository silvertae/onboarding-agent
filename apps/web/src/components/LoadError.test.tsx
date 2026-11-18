import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoadError } from './LoadError'
import { LoadingStatus } from './LoadingStatus'
import { Skeleton } from './ui/skeleton'

describe('LoadError', () => {
  it('오류 알림에 문구와 "다시 불러오기" 버튼을 보이고, 누르면 onRetry를 부른다', async () => {
    const onRetry = vi.fn()
    render(<LoadError onRetry={onRetry}>업무 목록을 불러오지 못했어요.</LoadError>)
    expect(screen.getByRole('alert')).toHaveTextContent('업무 목록을 불러오지 못했어요.')
    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('onRetry가 없으면 버튼을 그리지 않는다', () => {
    render(<LoadError>시험을 불러오지 못했어요.</LoadError>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('다시 불러오는 중에는 버튼을 막는다', () => {
    render(
      <LoadError onRetry={() => {}} retrying>
        실패
      </LoadError>,
    )
    expect(screen.getByRole('button', { name: /다시 불러오/ })).toBeDisabled()
  })
})

describe('LoadingStatus·Skeleton', () => {
  it('스켈레톤은 화면 읽기 프로그램에서 숨기고 "불러오는 중…"만 알린다', () => {
    render(
      <LoadingStatus>
        <Skeleton className="h-4 w-20" data-testid="bar" />
      </LoadingStatus>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중…')
    expect(screen.getByTestId('bar').closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('스켈레톤은 pulse 하고, 움직임 줄이기 설정이면 멈춘다', () => {
    render(<Skeleton data-testid="bar" />)
    expect(screen.getByTestId('bar')).toHaveClass('animate-pulse', 'motion-reduce:animate-none', 'bg-secondary')
  })
})
