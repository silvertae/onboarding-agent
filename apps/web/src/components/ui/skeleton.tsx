import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// 로딩 자리 표시(시안 .skel). 데이터가 올 자리와 같은 크기로 그리고, 움직임 줄이기 설정이면 멈춘다.
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-secondary motion-reduce:animate-none', className)}
      {...props}
    />
  )
}

export { Skeleton }
