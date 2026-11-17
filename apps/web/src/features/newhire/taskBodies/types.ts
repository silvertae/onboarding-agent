import type { ReactNode } from 'react'
import type { TaskView } from '@/lib/tasks'

// 본문이 모은 제출 값. result가 undefined면 submit(id)만 호출한다.
export type Draft = { result?: unknown; ready: boolean }

export type BodyProps = {
  task: TaskView
  // 할 차례가 아니거나 처리 중이면 입력을 막는다.
  disabled: boolean
  // 본문 아래 행동 영역. 본문이 모은 값으로 제출 버튼을 그린다.
  children: (draft: Draft) => ReactNode
}

export const TEXTAREA_CLASS =
  'min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
