import { MessageSquare } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/app/AuthProvider'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus } from '@/components/LoadingStatus'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { progress, useVisibleTasks, type TaskView } from '@/lib/tasks'
import { formatKoreanDate, formatSchedule, hireDayLabel, isBeforeHire } from './format'
import { useHires, type Hire } from './hires'
import { useUnanswered } from './knowledge'
import { ASSESSMENT_LABEL, assessmentsOf, initials, isTeamTask } from './teamTasks'
import { EmptyState, PageHeader, Panel } from './ui'

function HireCard({ hire, tasks }: { hire: Hire; tasks: TaskView[] }) {
  const { finished, total } = progress(tasks)
  const percent = total ? Math.round((finished / total) * 100) : 0
  const pending = tasks.filter((t) => t.status === 'submitted').length
  const assessments = assessmentsOf(tasks)

  return (
    <Link
      to={`/team/hires/${hire.id}`}
      className="flex flex-col gap-5 rounded-[18px] border border-border bg-card p-6 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-avatar text-sm font-semibold text-primary" aria-hidden>
          {initials(hire.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lead font-semibold">{hire.full_name}</p>
          <p className="text-xs text-muted-foreground">
            {[hire.job_title, hire.hire_date && `입사 ${formatKoreanDate(hire.hire_date)}`, hireDayLabel(hire.hire_date)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {pending > 0 ? (
          <Badge variant="submitted">확인 대기 {pending}</Badge>
        ) : isBeforeHire(hire.hire_date) ? (
          <Badge variant="blocked">입사 전</Badge>
        ) : (
          // 0건도 보이되 강조하지 않는다(S5 명세의 '확인 대기 수')
          <span className="shrink-0 text-xs text-muted-foreground">확인 대기 0</span>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-secondary)]">팀 과제 진행률</span>
          <b className="tabular-nums">
            {finished} / {total} · {percent}%
          </b>
        </div>
        <div
          role="progressbar"
          aria-label="팀 과제 진행률"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={finished}
          className="mt-2 h-2 overflow-hidden rounded-full bg-track"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {assessments.length > 0 && (
        <div className="border-t border-border pt-4">
          <p id={`assess-${hire.id}`} className="text-xs text-muted-foreground">
            예정된 평가
          </p>
          <ul aria-labelledby={`assess-${hire.id}`} className="mt-2 flex flex-col gap-1.5 text-sm">
            {assessments.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <span className={t.scheduled_at || t.assessment_result ? '' : 'text-muted-foreground'}>{t.template.title}</span>
                {t.assessment_result ? (
                  <Badge variant={t.assessment_result === 'pass' ? 'done' : 'rework'}>{ASSESSMENT_LABEL[t.assessment_result]}</Badge>
                ) : (
                  <span className={t.scheduled_at ? '' : 'text-muted-foreground'}>{formatSchedule(t.scheduled_at)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Link>
  )
}

const CARD_GRID = 'grid gap-5 md:grid-cols-2 xl:grid-cols-3'

// 로딩: HireCard와 같은 자리(이니셜·이름·메타 / 진행률 막대) 3장
function HireCardsSkeleton() {
  return (
    <LoadingStatus className={CARD_GRID}>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex flex-col gap-5 rounded-[18px] border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2 pt-0.5">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-[22px] w-20 rounded-full" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-2 rounded-full" />
          </div>
        </div>
      ))}
    </LoadingStatus>
  )
}

// 에이전트가 답하지 못한 우리 팀 질문 수 → S10
function UnansweredBanner({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[18px] border border-alert-warn-border bg-alert-warn-bg px-6 py-5">
      <span className="grid size-10 place-items-center rounded-xl bg-st-submitted-bg text-st-submitted-fg" aria-hidden>
        <MessageSquare className="size-5" />
      </span>
      <div className="flex-1">
        <p className="font-semibold">미답변 질문 {count}건</p>
        <p className="text-sm text-[var(--text-secondary)]">에이전트가 답하지 못한 우리 팀 질문이에요. 답을 등록하면 다음부터 바로 답해요.</p>
      </div>
      <Link
        to="/knowledge"
        className="rounded-full border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-accent"
      >
        답 등록하기
      </Link>
    </div>
  )
}

// S5 팀 신입 현황: 우리 팀 신입 카드. 진행률은 팀 과제 기준이다.
export function TeamOverviewPage() {
  const { profile } = useAuth()
  const teamId = profile?.team_id ?? null
  const tasksQuery = useVisibleTasks()
  const hiresQuery = useHires()
  const unanswered = useUnanswered()
  const unansweredCount = unanswered.data?.length ?? 0

  const hires = (hiresQuery.data ?? []).filter((h) => !teamId || h.team_id === teamId)
  const teamName = hires.find((h) => h.team)?.team?.name ?? '우리 팀'
  const teamTasks = (tasksQuery.data ?? []).filter((t) => isTeamTask(t, teamId))

  return (
    <main className="mx-auto flex max-w-[1376px] flex-col gap-6 px-4 py-8 sm:px-8">
      <PageHeader title={`${teamName} 신입 현황`} description="팀 과제 기준 진행률이에요. 경영지원 과제는 각 부서가 관리합니다." />

      {unansweredCount > 0 ? (
        <UnansweredBanner count={unansweredCount} />
      ) : (
        // 조회에 성공한 빈 목록일 때만 '없음'을 보인다(실패·로딩 중에는 아무것도 보이지 않음)
        unanswered.isSuccess && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="size-4" aria-hidden />
            미답변 질문 없음
          </p>
        )
      )}

      {tasksQuery.isLoading || hiresQuery.isLoading ? (
        <HireCardsSkeleton />
      ) : tasksQuery.isError || hiresQuery.isError ? (
        <LoadError
          retrying={tasksQuery.isFetching || hiresQuery.isFetching}
          onRetry={() => {
            if (tasksQuery.isError) void tasksQuery.refetch()
            if (hiresQuery.isError) void hiresQuery.refetch()
          }}
        >
          신입 현황을 불러오지 못했어요. 다시 시도해 주세요.
        </LoadError>
      ) : hires.length === 0 ? (
        <Panel>
          <EmptyState>아직 우리 팀 신입이 없어요.</EmptyState>
        </Panel>
      ) : (
        <div className={CARD_GRID}>
          {hires.map((hire) => (
            <HireCard key={hire.id} hire={hire} tasks={teamTasks.filter((t) => t.new_hire_id === hire.id)} />
          ))}
        </div>
      )}
    </main>
  )
}
