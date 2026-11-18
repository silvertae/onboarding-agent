import { PartyPopper } from 'lucide-react'
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { useAuth } from '@/app/AuthProvider'
import { FilterChips } from '@/components/FilterChips'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { STAGE_LABEL } from '@/lib/labels'
import { groupByStage, progress, useMyTasks, type TaskStage, type TaskView } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { daysSinceHire, formatToday } from './format'
import { TaskRow } from './TaskRow'
import { useTeamName } from './useTeamName'

const STAGES: TaskStage[] = ['day1', 'week1', 'month1']
const STAGE_ORDER: Record<TaskStage, number> = { day1: 0, week1: 1, month1: 2 }

type OwnerFilter = 'all' | 'ops' | 'team'

// 신입이 할 차례인 과제. staff_only는 담당자가 처리하므로 뺀다. 보완 요청이 먼저.
function nowTasks(tasks: TaskView[]): TaskView[] {
  return tasks
    .filter((t) => (t.status === 'todo' || t.status === 'rework') && t.template.completion_mode !== 'staff_only')
    .sort(
      (a, b) =>
        Number(b.status === 'rework') - Number(a.status === 'rework') ||
        STAGE_ORDER[a.template.stage] - STAGE_ORDER[b.template.stage] ||
        a.template.sort_order - b.template.sort_order,
    )
}

function matchesOwner(task: TaskView, filter: OwnerFilter): boolean {
  if (filter === 'ops') return task.template.department !== null
  if (filter === 'team') return task.template.team_id !== null
  return true
}

function Card({ className, children, ...props }: ComponentProps<'section'>) {
  return (
    <section className={cn('overflow-hidden rounded-[18px] border border-border bg-card', className)} {...props}>
      {children}
    </section>
  )
}

function CenterMessage({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[960px] px-4 py-10 text-center text-muted-foreground sm:px-8">{children}</main>
}

export function HomePage() {
  const { profile } = useAuth()
  const { data: tasks, isPending, isError } = useMyTasks()
  const teamName = useTeamName(profile?.team_id)
  const [filter, setFilter] = useState<OwnerFilter>('all')
  const [today] = useState(() => new Date())

  const now = useMemo(() => nowTasks(tasks ?? []), [tasks])
  const stages = useMemo(() => groupByStage((tasks ?? []).filter((t) => matchesOwner(t, filter))), [tasks, filter])

  if (isPending) return <CenterMessage><p role="status">불러오는 중…</p></CenterMessage>
  if (isError || !tasks) {
    return (
      <main className="mx-auto max-w-[960px] px-4 py-10 sm:px-8">
        <Alert variant="destructive">
          <AlertDescription>과제를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</AlertDescription>
        </Alert>
      </main>
    )
  }
  if (tasks.length === 0) {
    return (
      <CenterMessage>
        <p className="text-base text-foreground">아직 배정된 과제가 없어요</p>
        <p className="mt-1 text-sm">입사일이 등록되면 온보딩 과제가 여기에 나타나요.</p>
      </CenterMessage>
    )
  }

  const { finished, total } = progress(tasks)
  const percent = Math.round((finished / total) * 100)
  const doneCount = tasks.filter((t) => t.status === 'done').length
  const reworkCount = now.filter((t) => t.status === 'rework').length
  const allDone = finished === total
  const filters: { value: OwnerFilter; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'ops', label: '경영지원' },
    { value: 'team', label: teamName ?? '소속 팀' },
  ]

  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-8 sm:py-8">
      <Card className="flex flex-wrap items-center justify-between gap-6 p-5 sm:p-7">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">
            {formatToday(today)}
            {profile?.hire_date && ` · 입사 ${daysSinceHire(profile.hire_date, today)}일째`}
          </span>
          <h1 className="text-[22px] leading-7 font-semibold sm:text-[28px] sm:leading-9">
            {profile?.full_name} 님, 온보딩을 함께 챙길게요
          </h1>
          {allDone ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-st-done-fg">
              <PartyPopper className="size-4" aria-hidden />
              축하해요! 온보딩 과제를 모두 마쳤어요.
            </p>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              지금 할 일 {now.length}건{reworkCount > 0 && `, 보완 요청 ${reworkCount}건`}이 있어요.
            </p>
          )}
        </div>
        <div className="flex min-w-[240px] flex-[0_1_320px] flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <b className="text-[13px]">전체 진행률</b>
            <span className="text-[22px] font-semibold">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="전체 진행률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 overflow-hidden rounded-full bg-track"
          >
            <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <span className="flex justify-between text-xs text-muted-foreground">
            <span>
              완료 {doneCount} + 해당 없음 {finished - doneCount}
            </span>
            <span>{`${finished} / ${total}`}</span>
          </span>
        </div>
      </Card>

      {now.length > 0 && (
        <Card aria-labelledby="now-heading">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <h2 id="now-heading" className="text-lg font-semibold">
                지금 할 일
              </h2>
              <span className="rounded-full bg-primary px-2 text-xs leading-5 font-semibold text-white">{now.length}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-[7px] rounded-full bg-st-done-fg" aria-hidden />
              담당자 처리 결과가 바로 반영돼요
            </span>
          </div>
          {now.map((task) => (
            <TaskRow key={task.id} task={task} all={tasks} teamName={teamName} highlight />
          ))}
        </Card>
      )}

      <Card aria-labelledby="all-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <h2 id="all-heading" className="text-lg font-semibold">
            전체 과제
          </h2>
          <FilterChips label="담당 필터" items={filters} value={filter} onChange={setFilter} />
        </div>
        {STAGES.map((stage) => {
          const list = stages[stage]
          const stageDone = list.filter((t) => t.status === 'done' || t.status === 'na').length
          return (
            <div key={stage}>
              <div className="flex items-baseline justify-between gap-2 border-t border-border bg-surface-subtle px-4 py-2.5 first:border-t-0 sm:px-6">
                <h3 className="text-sm font-semibold">{STAGE_LABEL[stage]}</h3>
                <span className="text-xs text-muted-foreground">
                  {list.length}개 중 {stageDone}개 완료
                </span>
              </div>
              {list.length === 0 ? (
                <p className="border-t border-border px-4 py-3.5 text-sm text-muted-foreground sm:px-6">해당하는 과제가 없어요</p>
              ) : (
                list.map((task) => <TaskRow key={task.id} task={task} all={tasks} teamName={teamName} />)
              )}
            </div>
          )
        })}
      </Card>
    </main>
  )
}
