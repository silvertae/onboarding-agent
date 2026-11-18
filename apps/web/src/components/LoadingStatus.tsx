import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// 로딩 상태: 스켈레톤은 화면 읽기 프로그램에서 숨기고 "불러오는 중…"만 알린다.
// className은 스켈레톤을 감싼 상자(실제 화면과 같은 배치)에 붙는다.
export function LoadingStatus({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div role="status">
      <span className="sr-only">불러오는 중…</span>
      <div aria-hidden="true" className={className}>
        {children}
      </div>
    </div>
  )
}

// 표 칸 모양: 글자 한 줄, 두 줄(이름 + 소속), 긴 글 두 줄(문항 미리보기), 상태 배지, 행 버튼, 빈 칸
type Cell = 'line' | 'two-line' | 'paragraph' | 'badge' | 'button' | 'none'
export type SkeletonColumn = { label: string; cell?: Cell; className?: string }

// 줄마다 길이를 조금씩 달리해 실제 목록처럼 보이게 한다
const WIDTHS = ['w-24', 'w-32', 'w-20', 'w-28', 'w-16']

function SkeletonCell({ cell, row, col }: { cell: Cell; row: number; col: number }) {
  const width = WIDTHS[(row + col) % WIDTHS.length]
  if (cell === 'none') return null
  if (cell === 'badge') return <Skeleton className="h-[22px] w-16 rounded-full" />
  if (cell === 'button') return <Skeleton className="ml-auto h-8 w-20 rounded-full" />
  if (cell === 'paragraph') {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className={cn('h-4', row % 2 ? 'w-10/12' : 'w-11/12')} />
        <Skeleton className={cn('h-4', row % 2 ? 'w-5/12' : 'w-7/12')} />
      </div>
    )
  }
  if (cell === 'two-line') {
    return (
      <div className="flex flex-col gap-1.5">
        <Skeleton className={cn('h-4', WIDTHS[(row + 2) % WIDTHS.length], 'max-w-20')} />
        <Skeleton className="h-3 w-12" />
      </div>
    )
  }
  return <Skeleton className={cn('h-4', width)} />
}

// 표 스켈레톤: 머리는 실제 표와 같은 글자, 행은 칸 모양대로. 머리 테두리는 화면마다 달라 headClassName으로 받는다.
export function TableSkeleton({
  columns,
  rows = 5,
  headClassName = 'border-y',
}: {
  columns: SkeletonColumn[]
  rows?: number
  headClassName?: string
}) {
  return (
    <table className="w-full text-sm">
      <thead className={cn('border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]', headClassName)}>
        <tr>
          {columns.map((c, i) => (
            <th key={i} className={cn('px-4 py-3 font-semibold', c.className)}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r} className="border-b border-border last:border-b-0">
            {columns.map((c, i) => (
              <td key={i} className={cn('h-[53px] px-4 py-3', c.className)}>
                <SkeletonCell cell={c.cell ?? 'line'} row={r} col={i} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
