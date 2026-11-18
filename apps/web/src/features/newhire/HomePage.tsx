import { ChevronDown, ChevronRight, PartyPopper } from 'lucide-react'
import { Collapsible } from 'radix-ui'
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { useAuth } from '@/app/AuthProvider'
import { FilterChips } from '@/components/FilterChips'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus } from '@/components/LoadingStatus'
import { ProgressBar } from '@/components/ProgressBar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { STAGE_LABEL } from '@/lib/labels'
import { groupByStage, progress, useMyTasks, type TaskStage, type TaskView } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { daysSinceHire, formatToday, toDateOnly } from './format'
import { currentStage, STAGES, stageDateLabel, stageSummary } from './stages'
import { TaskRow } from './TaskRow'
import { useTeamName } from './useTeamName'

const STAGE_ORDER: Record<TaskStage, number> = { day1: 0, week1: 1, month1: 2 }
// "지금 할 일"은 처음에 이만큼만 보이고 나머지는 펼친다(시안 S2: 상위 5건 + 펼치기)
const NOW_LIMIT = 5

const GREETING: Record<TaskStage, string> = {
  day1: '입사 첫날이에요',
  week1: '첫 주를 보내고 있어요',
  month1: '첫 달을 보내고 있어요',
}

type OwnerFilter = 'all' | 'ops' | 'team'

// 신입이 할 차례인 과제. staff_only는 담당자가 처리하므로 뺀다. 보완 요청 → 기한 이른 순(기한 없음은 뒤) → 단계 → 순서.
function nowTasks(tasks: TaskView[]): TaskView[] {
  return tasks
    .filter((t) => (t.status === 'todo' || t.status === 'rework') && t.template.completion_mode !== 'staff_only')
    .sort(
      (a, b) =>
        Number(b.status === 'rework') - Number(a.status === 'rework') ||
        compareDue(a.due_date, b.due_date) ||
        STAGE_ORDER[a.template.stage] - STAGE_ORDER[b.template.stage] ||
        a.template.sort_order - b.template.sort_order,
    )
}

function compareDue(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a < b ? -1 : 1
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

const PAGE = 'mx-auto flex w-full max-w-[960px] flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-8 sm:py-8'

// 로딩: 인사·진행률 카드와 "지금 할 일" 5행 자리(시안 S0 "상태")
function HomeSkeleton() {
  return (
    <main className={PAGE}>
      <LoadingStatus className="flex flex-col gap-5 sm:gap-6">
        <Card className="flex flex-wrap items-center justify-between gap-6 p-5 sm:p-7">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-7 w-full max-w-sm sm:h-8" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex min-w-[240px] flex-[0_1_320px] flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-12" />
            </div>
            <Skeleton className="h-2 rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
        </Card>
        <Card>
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <Skeleton className="h-6 w-28" />
          </div>
          <div>
            {Array.from({ length: NOW_LIMIT }, (_, i) => (
              <TaskRowSkeleton key={i} index={i} />
            ))}
          </div>
        </Card>
      </LoadingStatus>
    </main>
  )
}

const ROW_WIDTHS = ['w-3/5', 'w-2/5', 'w-1/2', 'w-2/3', 'w-1/3']

// TaskRow와 같은 여백·높이: 제목, (담당 배지 + 기한), 오른쪽 상태 배지
function TaskRowSkeleton({ index }: { index: number }) {
  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-3.5 first:border-t-0 sm:px-6">
      <span className="hidden w-5 shrink-0 sm:block" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className={cn('h-[18px]', ROW_WIDTHS[index % ROW_WIDTHS.length])} />
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-[22px] w-16 shrink-0 rounded-full" />
    </div>
  )
}

export function HomePage() {
  const { profile } = useAuth()
  const { data: tasks, isPending, isError, isFetching, refetch } = useMyTasks()
  const teamName = useTeamName(profile?.team_id)
  const [filter, setFilter] = useState<OwnerFilter>('all')
  const [today] = useState(() => new Date())
  const todayKey = toDateOnly(today)
  const [nowExpanded, setNowExpanded] = useState(false)
  // 사용자가 직접 접거나 편 단계만 기억한다. 나머지는 진행 중인 단계만 펼친 기본값을 따른다.
  const [stageOpen, setStageOpen] = useState<Partial<Record<TaskStage, boolean>>>({})

  const now = useMemo(() => nowTasks(tasks ?? []), [tasks])
  const stages = useMemo(() => groupByStage((tasks ?? []).filter((t) => matchesOwner(t, filter))), [tasks, filter])
  const activeStage = useMemo(() => currentStage(groupByStage(tasks ?? []), todayKey), [tasks, todayKey])

  if (isPending) return <HomeSkeleton />
  if (isError || !tasks) {
    return (
      <main className={PAGE}>
        <LoadError size="lg" retrying={isFetching} onRetry={() => void refetch()}>
          과제를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </LoadError>
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
  const started = profile?.hire_date ? daysSinceHire(profile.hire_date, today) >= 1 : false
  const greeting = started ? GREETING[activeStage] : '온보딩을 함께 챙길게요'
  const shownNow = nowExpanded ? now : now.slice(0, NOW_LIMIT)
  const hiddenCount = now.length - NOW_LIMIT
  const filters: { value: OwnerFilter; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'ops', label: '경영지원' },
    { value: 'team', label: teamName ?? '소속 팀' },
  ]

  return (
    <main className={PAGE}>
      <Card className="flex flex-wrap items-center justify-between gap-6 p-5 sm:p-7">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">
            {formatToday(today)}
            {profile?.hire_date && ` · 입사 ${daysSinceHire(profile.hire_date, today)}일째`}
          </span>
          <h1 className="text-title font-semibold sm:text-page">
            {profile?.full_name} 님, {greeting}
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
            <b className="text-label">전체 진행률</b>
            <span className="text-title font-semibold tabular-nums">{percent}%</span>
          </div>
          <ProgressBar label="전체 진행률" value={percent} max={100} />
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
              <h2 id="now-heading" className="text-section font-semibold">
                지금 할 일
              </h2>
              <span className="rounded-full bg-foreground px-2 text-xs leading-5 font-semibold text-white tabular-nums">{now.length}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-[7px] rounded-full bg-st-done-fg" aria-hidden />
              담당자 처리 결과가 바로 반영돼요
            </span>
          </div>
          {shownNow.map((task) => (
            <TaskRow key={task.id} task={task} all={tasks} teamName={teamName} today={todayKey} highlight />
          ))}
          {hiddenCount > 0 && (
            <Button
              variant="ghost"
              size="lg"
              aria-expanded={nowExpanded}
              onClick={() => setNowExpanded((v) => !v)}
              className="w-full rounded-none border-t border-border text-label text-[var(--text-secondary)] hover:bg-surface-subtle"
            >
              {nowExpanded ? '접기' : `나머지 ${hiddenCount}건 보기`}
              <ChevronDown className={cn('size-3.5 transition-transform duration-150 ease-out-ui motion-reduce:transition-none', nowExpanded && 'rotate-180')} aria-hidden />
            </Button>
          )}
        </Card>
      )}

      <Card aria-labelledby="all-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <h2 id="all-heading" className="text-section font-semibold">
            전체 과제
          </h2>
          <FilterChips label="담당 필터" items={filters} value={filter} onChange={setFilter} />
        </div>
        {STAGES.map((stage) => (
          <StageSection
            key={stage}
            stage={stage}
            list={stages[stage]}
            open={stageOpen[stage] ?? stage === activeStage}
            onOpenChange={(open) => setStageOpen((prev) => ({ ...prev, [stage]: open }))}
          >
            {stages[stage].map((task) => (
              <TaskRow key={task.id} task={task} all={tasks} teamName={teamName} today={todayKey} />
            ))}
          </StageSection>
        ))}
      </Card>
    </main>
  )
}

// 단계 머리(h3 안의 버튼)를 눌러 접고 편다. 접혀 있어도 날짜·완료 수·남은 일이 보인다.
function StageSection({
  stage,
  list,
  open,
  onOpenChange,
  children,
}: {
  stage: TaskStage
  list: TaskView[]
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const done = list.filter((t) => t.status === 'done' || t.status === 'na').length
  const caption = [stageDateLabel(list), `${list.length}개 중 ${done}개 완료`].filter(Boolean).join(' · ')
  const summary = stageSummary(list)
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className="group/stage border-t border-border first:border-t-0">
      <h3>
        <Collapsible.Trigger className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-0.5 border-border bg-surface-subtle px-4 py-3 text-left group-data-[state=open]/stage:border-b outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-6">
          <ChevronRight
            className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out-ui group-data-[state=open]/stage:rotate-90 motion-reduce:transition-none"
            aria-hidden
          />
          <span className="shrink-0 text-sm font-semibold whitespace-nowrap">{STAGE_LABEL[stage]}</span>
          {/* 좁은 화면: 1줄 = 화살표·단계 이름·남은 일, 2줄 = 날짜·완료 수(단계 이름 아래에 맞춤). sm부터 한 줄 */}
          <span className="order-last basis-full pl-6 text-xs font-normal text-muted-foreground tabular-nums sm:order-none sm:basis-auto sm:pl-0">
            {caption}
          </span>
          {summary && (
            <span className="ml-auto min-w-0 text-right text-xs font-normal text-[var(--text-secondary)] tabular-nums">{summary}</span>
          )}
        </Collapsible.Trigger>
      </h3>
      <Collapsible.Content>
        {list.length === 0 ? (
          <p className="border-t border-border px-4 py-3.5 text-sm text-muted-foreground sm:px-6">해당하는 과제가 없어요</p>
        ) : (
          children
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
