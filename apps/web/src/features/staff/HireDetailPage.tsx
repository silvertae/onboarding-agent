import { ArrowLeft, FilePlus2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '@/app/AuthProvider'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus, TableSkeleton } from '@/components/LoadingStatus'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { STAGE_LABEL } from '@/lib/labels'
import { blockedBy, groupByStage, progress, useVisibleTasks, type TaskView } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { AssessmentCard } from './AssessmentCard'
import { formatDateTime, formatKoreanDate, formatMonthDay, hireDayLabel, submittedLabel } from './format'
import { useHires } from './hires'
import { isRecord } from './json'
import { reviewActions } from './reviewActions'
import { SubmittedResult } from './SubmittedResult'
import { TaskReviewPanel } from './TaskReviewPanel'
import { assessmentsOf, initials, isTeamTask } from './teamTasks'
import { EmptyState, Panel } from './ui'

const SURVEY_CODE = 'AI-04'
const SETUP_CODE = 'AI-09'

function dueText(task: TaskView, all: TaskView[]): string {
  if (task.status === 'blocked') {
    const blockers = blockedBy(task, all)
    return blockers.length ? `${blockers.map((t) => t.template.title).join(', ')} 완료 후` : '선행 과제 완료 후'
  }
  if (task.template.kind === 'assessment' && task.scheduled_at) return formatDateTime(task.scheduled_at)
  if (task.submitted_at) return `${formatDateTime(task.submitted_at)} ${submittedLabel(task.template.completion_mode)}`
  return `기한 ${formatMonthDay(task.due_date)}`
}

function ChecklistCard({ task }: { task: TaskView }) {
  const items = Array.isArray(task.template.checklist) ? task.template.checklist.map(String) : []
  // 진행 중 체크 상태는 저장되지 않는다. 제출(완료)되면 result.checked에 전부 담긴다.
  const checkedList = isRecord(task.result) && Array.isArray(task.result.checked) ? task.result.checked.map(String) : []
  const checked = new Set(task.status === 'done' && checkedList.length === 0 ? items : checkedList)
  const count = items.filter((i) => checked.has(i)).length
  const percent = items.length ? Math.round((count / items.length) * 100) : 0

  return (
    <Panel aria-label="BTP 세팅 체크리스트">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-lead font-semibold">BTP 세팅 체크리스트</h2>
        <b className="tabular-nums">
          {count} / {items.length}
        </b>
      </div>
      <div className="px-6 py-5">
        <div className="h-1.5 overflow-hidden rounded-full bg-track">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <ul className="mt-4 flex flex-col gap-2.5 text-sm">
          {items.map((item) => (
            <li key={item} className="flex items-center justify-between">
              <span className={checked.has(item) ? '' : 'text-[var(--text-secondary)]'}>{item}</span>
              <Badge variant={checked.has(item) ? 'done' : 'todo'}>{checked.has(item) ? '완료' : '할 일'}</Badge>
            </li>
          ))}
        </ul>
        {task.status !== 'done' && <p className="mt-3 text-xs text-muted-foreground">신입이 모든 항목을 준비해 제출하면 완료로 바뀌어요.</p>}
      </div>
    </Panel>
  )
}

const PAGE = 'mx-auto flex max-w-[1376px] flex-col gap-6 px-4 py-8 sm:px-8'

function BackLink() {
  return (
    <Link to="/team" className="inline-flex w-fit items-center gap-1 text-sm text-primary">
      <ArrowLeft className="size-4" /> 팀 신입 현황
    </Link>
  )
}

// 로딩: 머리(이니셜·이름·메타·시험 버튼)와 팀 과제 표, 오른쪽 카드 자리
function HireDetailSkeleton() {
  return (
    <LoadingStatus className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-11 w-60 rounded-full" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <Panel className="overflow-hidden">
          <div className="px-6 py-4">
            <Skeleton className="h-6 w-20" />
          </div>
          <TableSkeleton
            rows={6}
            columns={[
              { label: '단계' },
              { label: '과제' },
              { label: '상태', cell: 'badge' },
              { label: '기한·제출' },
              { label: '처리', cell: 'none', className: 'text-right' },
            ]}
          />
        </Panel>
        <Panel className="flex flex-col gap-4 p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-1.5 rounded-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </Panel>
      </div>
    </LoadingStatus>
  )
}

// S6 신입 상세: 한 신입의 팀 과제만 보여 준다(경영지원 과제 제외).
export function HireDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const teamId = profile?.team_id ?? null
  const hiresQuery = useHires()
  const tasksQuery = useVisibleTasks({ newHireId: id })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (hiresQuery.isLoading || tasksQuery.isLoading) {
    return (
      <main className={PAGE}>
        <BackLink />
        <HireDetailSkeleton />
      </main>
    )
  }
  if (hiresQuery.isError || tasksQuery.isError) {
    return (
      <main className={PAGE}>
        <BackLink />
        <LoadError
          retrying={hiresQuery.isFetching || tasksQuery.isFetching}
          onRetry={() => {
            if (hiresQuery.isError) void hiresQuery.refetch()
            if (tasksQuery.isError) void tasksQuery.refetch()
          }}
        >
          신입 정보를 불러오지 못했어요. 다시 시도해 주세요.
        </LoadError>
      </main>
    )
  }

  const hire = (hiresQuery.data ?? []).find((h) => h.id === id && (!teamId || h.team_id === teamId))
  if (!hire) {
    return (
      <main className="mx-auto max-w-[1376px] px-4 py-8 sm:px-8">
        <Link to="/team" className="text-sm text-primary">
          ← 팀 신입 현황
        </Link>
        <Panel className="mt-4">
          <EmptyState>신입을 찾을 수 없어요</EmptyState>
        </Panel>
      </main>
    )
  }

  const teamTasks = (tasksQuery.data ?? []).filter((t) => t.new_hire_id === id && isTeamTask(t, teamId))
  const stages = groupByStage(teamTasks)
  const ordered = [...stages.day1, ...stages.week1, ...stages.month1]
  const { finished, total } = progress(teamTasks)
  const survey = teamTasks.find((t) => t.template.code === SURVEY_CODE)
  const setup = teamTasks.find((t) => t.template.code === SETUP_CODE)
  const assessments = assessmentsOf(teamTasks).sort((a, b) => a.template.sort_order - b.template.sort_order)
  const selected = teamTasks.find((t) => t.id === selectedId) ?? null

  return (
    <main className={PAGE}>
      <BackLink />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-full bg-avatar text-base font-semibold text-primary" aria-hidden>
            {initials(hire.full_name)}
          </span>
          <div>
            <h1 className="text-page font-semibold">{hire.full_name}</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {[
                hire.job_title,
                hire.team?.name,
                hire.hire_date && `입사 ${formatKoreanDate(hire.hire_date)} (${hireDayLabel(hire.hire_date)})`,
                `팀 과제 ${finished} / ${total}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <Button type="button" size="lg" onClick={() => navigate(`/team/exams/new?hire=${encodeURIComponent(hire.id)}`)}>
          <FilePlus2 />이 신입 기준으로 시험 만들기
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4">
              <h2 className="text-lead font-semibold">팀 과제</h2>
              <span className="text-xs text-muted-foreground">경영지원 과제는 표시되지 않아요</span>
            </div>
            <table aria-label="팀 과제" className="w-full text-sm">
              <thead className="border-y border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">단계</th>
                  <th className="px-4 py-3 font-semibold">과제</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold">기한·제출</th>
                  <th className="px-4 py-3 text-right font-semibold">처리</th>
                </tr>
              </thead>
              <tbody>
                {ordered.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState>팀 과제가 없어요</EmptyState>
                    </td>
                  </tr>
                )}
                {ordered.map((task) => {
                  const { canConfirm, canComplete } = reviewActions(task)
                  const muted = task.status === 'blocked'
                  return (
                    <tr key={task.id} className={cn('border-b border-border last:border-b-0', task.id === selectedId && 'bg-accent')}>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{STAGE_LABEL[task.template.stage]}</td>
                      <td className={cn('px-4 py-3', muted ? 'text-[var(--text-secondary)]' : 'font-medium')}>{task.template.title}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={task.status} completionMode={task.template.completion_mode} />
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{dueText(task, teamTasks)}</td>
                      <td className="px-4 py-3 text-right">
                        {(canConfirm || canComplete) && (
                          <Button
                            type="button"
                            size="sm"
                            variant={task.id === selectedId ? 'default' : 'secondary'}
                            aria-pressed={task.id === selectedId}
                            onClick={() => setSelectedId(task.id === selectedId ? null : task.id)}
                          >
                            처리
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Panel>

          {selected && <TaskReviewPanel key={selected.id} task={selected} onClose={() => setSelectedId(null)} />}

          {survey && (
            <Panel aria-label="기술스택·경력 조사 결과">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="text-lead font-semibold">기술스택·경력 조사 결과</h2>
                {survey.submitted_at && (
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(survey.submitted_at)} {submittedLabel(survey.template.completion_mode)}
                  </span>
                )}
              </div>
              <div className="px-6 py-5">
                {survey.result ? <SubmittedResult task={survey} /> : <p className="text-sm text-muted-foreground">아직 제출 전이에요.</p>}
              </div>
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {setup && <ChecklistCard task={setup} />}
          {assessments.map((task) => (
            <AssessmentCard key={task.id} task={task} />
          ))}
        </div>
      </div>
    </main>
  )
}
