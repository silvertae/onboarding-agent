import { AlertCircle, ChevronRight, Lock, Paperclip } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { OwnerBadge } from '@/components/OwnerBadge'
import { StatusBadge } from '@/components/StatusBadge'
import type { TaskView } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { formatDateTime, formatDay, isPastDue } from './format'
import { lockedHint } from './locked'

type Props = {
  task: TaskView
  all: TaskView[]
  teamName: string | null
  // 'YYYY-MM-DD'. 기한 지남 판단용
  today: string
  // "지금 할 일" 묶음에서는 보완 요청을 강조하고 사유를 보여 준다.
  highlight?: boolean
  // 이 과제 템플릿에 붙은 서식 수. 0이거나 없으면 표시하지 않는다.
  formCount?: number
}

// 신입이 할 차례인 과제만 기한 지남을 알린다(확인 대기·담당자 처리·잠김은 신입이 할 수 있는 게 없다)
function isHiresTurn(task: TaskView): boolean {
  return (task.status === 'todo' || task.status === 'rework') && task.template.completion_mode !== 'staff_only'
}

function Meta({ task, all, highlight, today }: Pick<Props, 'task' | 'all' | 'highlight' | 'today'>) {
  const locked = lockedHint(task, all)
  if (locked) {
    return (
      <span className="inline-flex items-center gap-1">
        <Lock className="size-3.5" aria-hidden />
        {locked}
      </span>
    )
  }
  if (task.status === 'na' && task.na_reason) return <span>사유: {task.na_reason}</span>

  let when: ReactNode = null
  if (task.template.kind === 'assessment' && task.scheduled_at) {
    when = [formatDateTime(task.scheduled_at), task.location].filter(Boolean).join(' · ')
  } else if (task.due_date && task.status !== 'done') {
    when = (
      <>
        기한 {formatDay(task.due_date)}
        {isHiresTurn(task) && isPastDue(task.due_date, today) && (
          <>
            {' · '}
            <b className="font-semibold text-st-rework-fg">지남</b>
          </>
        )}
      </>
    )
  }
  return (
    <>
      {when && <span>{when}</span>}
      {highlight && task.status === 'rework' && task.rework_reason && (
        <span className="text-st-rework-fg">사유: {task.rework_reason}</span>
      )}
    </>
  )
}

export function TaskRow({ task, all, teamName, today, highlight, formCount }: Props) {
  const rework = highlight && task.status === 'rework'
  return (
    <Link
      to={`/me/tasks/${task.id}`}
      className={cn(
        'flex items-start gap-3 border-t border-border px-4 py-3.5 text-foreground no-underline first:border-t-0 hover:bg-surface-subtle sm:items-center sm:px-6',
        rework && 'bg-alert-err-bg hover:bg-st-rework-bg',
        task.status === 'blocked' && 'text-[var(--text-secondary)]',
      )}
    >
      {highlight && (
        <span className="hidden w-5 shrink-0 sm:block" aria-hidden>
          {rework && <AlertCircle className="size-5 text-st-rework-fg" />}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span data-task-title className="text-row font-medium">
          {task.template.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <OwnerBadge department={task.template.department} teamName={teamName} />
          <Meta task={task} all={all} highlight={highlight} today={today} />
          {formCount ? (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3.5" aria-hidden />
              서식 {formCount}
            </span>
          ) : null}
        </span>
      </div>
      <StatusBadge status={task.status} completionMode={task.template.completion_mode} />
      <ChevronRight className="hidden size-4 shrink-0 text-tertiary sm:block" aria-hidden />
    </Link>
  )
}
