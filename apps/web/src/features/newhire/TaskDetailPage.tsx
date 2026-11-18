import { AlertCircle, ArrowLeft, CalendarDays, Lock, MessageSquare } from 'lucide-react'
import { useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus } from '@/components/LoadingStatus'
import { TaskFormsSection } from '@/features/forms/TaskFormsSection'
import { OwnerBadge } from '@/components/OwnerBadge'
import { StatusBadge } from '@/components/StatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Enums } from '@/lib/database.types'
import { OWNER_LABEL, STAGE_LABEL } from '@/lib/labels'
import { useMyTasks, useTaskActions, type TaskView } from '@/lib/tasks'
import { formatDay } from './format'
import { lockedHint } from './locked'
import { NaDialog } from './NaDialog'
import { AssessmentBody } from './taskBodies/AssessmentBody'
import { ChecklistBody } from './taskBodies/ChecklistBody'
import { FormBody } from './taskBodies/FormBody'
import { GuideBody } from './taskBodies/GuideBody'
import type { BodyProps, Draft } from './taskBodies/types'
import { useTeamName } from './useTeamName'

const BODY_BY_KIND: Record<Enums<'task_kind'>, ComponentType<BodyProps>> = {
  ops: GuideBody,
  practice: GuideBody,
  read: GuideBody,
  input: FormBody,
  setup: ChecklistBody,
  assessment: AssessmentBody,
}

const MODE_TEXT: Record<Enums<'completion_mode'>, string> = {
  self: '직접 완료',
  confirm: '담당자 확인 필요',
  staff_only: '담당자 처리',
}

const STATUS_NOTE: Partial<Record<Enums<'task_status'>, string>> = {
  submitted: '제출했어요. 담당자 확인을 기다리고 있어요.',
  done: '완료한 과제예요.',
}

function submitLabel(task: TaskView): string {
  if (task.status === 'rework') return '다시 제출'
  const { kind, completion_mode } = task.template
  if (kind === 'read') return '읽었어요'
  if (kind === 'input') return '제출'
  if (kind === 'setup') return '완료'
  return completion_mode === 'self' ? '완료' : '제출'
}

// Task 13의 채팅 패널이 이 이벤트를 받아 질문을 미리 채운다.
function askAboutTask(title: string) {
  window.dispatchEvent(new CustomEvent('chat:ask', { detail: { text: `"${title}" 과제에 대해 알려 줘` } }))
}

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 py-6 sm:px-8 sm:py-8">
      <Link to="/me" className="inline-flex items-center gap-1.5 self-start text-sm text-primary hover:text-[var(--primary-pressed)]">
        <ArrowLeft className="size-4" aria-hidden />
        타임라인으로
      </Link>
      {children}
    </main>
  )
}

// 로딩: 과제 카드(배지 줄·제목·메타 / 안내 / 동작 줄)와 같은 자리
function TaskDetailSkeleton() {
  return (
    <LoadingStatus className="overflow-hidden rounded-[18px] border border-border bg-card">
      <div className="flex flex-col gap-4 px-5 pt-6 pb-5 sm:px-7 sm:pt-7">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-[22px] w-16 rounded-full" />
        </div>
        <Skeleton className="h-7 w-full max-w-md sm:h-8" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-3 border-t border-border px-5 py-6 sm:px-7">
        <Skeleton className="h-5 w-10" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-5 sm:px-7">
        <Skeleton className="h-11 w-52 rounded-full" />
        <Skeleton className="h-11 w-24 rounded-full" />
      </div>
    </LoadingStatus>
  )
}

export function TaskDetailPage() {
  const { id } = useParams()
  const { data: tasks, isPending, isError, isFetching, refetch } = useMyTasks()
  const actions = useTaskActions()
  const task = tasks?.find((t) => t.id === id)
  const teamName = useTeamName(task?.template.team_id)

  // 연타 방지: 상태 갱신 전 두 번째 클릭도 막도록 ref로 한 번 더 지킨다.
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [naOpen, setNaOpen] = useState(false)

  async function run(call: () => Promise<void>, after?: () => void) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(null)
    try {
      await call()
      after?.()
    } catch {
      setError('처리하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  if (isPending) {
    return (
      <Page>
        <TaskDetailSkeleton />
      </Page>
    )
  }
  if (isError) {
    return (
      <Page>
        <LoadError size="lg" retrying={isFetching} onRetry={() => void refetch()}>
          과제를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </LoadError>
      </Page>
    )
  }
  if (!task || !tasks) {
    return (
      <Page>
        <p className="text-base">과제를 찾을 수 없어요</p>
      </Page>
    )
  }

  const t = task.template
  const ownerName = t.department ? OWNER_LABEL[t.department] : (teamName ?? '소속 팀')
  const actionable = (task.status === 'todo' || task.status === 'rework') && t.completion_mode !== 'staff_only'
  const prereqTitles = t.prerequisite_codes.map((code) => tasks.find((x) => x.template.code === code)?.template.title ?? code)
  const locked = lockedHint(task, tasks)
  const Body = BODY_BY_KIND[t.kind]

  function renderActions({ result, ready }: Draft) {
    return (
      <div className="flex flex-col gap-3 border-t border-border px-5 py-5 sm:px-7">
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {t.completion_mode === 'staff_only' && t.kind !== 'assessment' && (
          <p className="rounded-lg bg-accent px-3.5 py-2.5 text-label text-accent-foreground">담당자가 처리하면 완료됩니다</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" size="lg" onClick={() => askAboutTask(t.title)}>
            <MessageSquare aria-hidden />이 과제에 대해 물어보기
          </Button>
          {actionable ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {t.completion_mode === 'confirm' && (
                <span className="text-xs text-muted-foreground">제출하면 {ownerName}이 확인해요</span>
              )}
              {t.allow_na && !naOpen && (
                <Button variant="ghost" size="lg" onClick={() => setNaOpen(true)}>
                  해당 없음
                </Button>
              )}
              <Button
                size="lg"
                disabled={!ready || pending}
                onClick={() => void run(() => (result === undefined ? actions.submit(task!.id) : actions.submit(task!.id, result)))}
              >
                {submitLabel(task!)}
              </Button>
            </div>
          ) : (
            STATUS_NOTE[task!.status] && <span className="text-sm text-muted-foreground">{STATUS_NOTE[task!.status]}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <Page>
      <section className="overflow-hidden rounded-[18px] border border-border bg-card">
        <div className="flex flex-col gap-4 px-5 pt-6 pb-5 sm:px-7 sm:pt-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">{STAGE_LABEL[t.stage]}</span>
            <OwnerBadge department={t.department} teamName={teamName} />
            <StatusBadge status={task.status} completionMode={t.completion_mode} />
          </div>
          <h1 className="text-title font-semibold sm:text-page">{t.title}</h1>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-label text-[var(--text-secondary)]">
            {task.due_date && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden />
                기한 {formatDay(task.due_date)}
              </span>
            )}
            <span>{prereqTitles.length ? `선행 과제: ${prereqTitles.join(', ')}` : '선행 과제 없음'}</span>
            <span>{MODE_TEXT[t.completion_mode]}</span>
          </div>
          {locked && (
            <p className="inline-flex items-center gap-1.5 rounded-lg bg-st-blocked-bg px-3.5 py-2.5 text-sm text-st-blocked-fg">
              <Lock className="size-4" aria-hidden />
              {locked}
            </p>
          )}
          {task.status === 'rework' && task.rework_reason && (
            <Alert variant="destructive" role="note">
              <AlertCircle aria-hidden />
              <AlertTitle className="font-semibold">{ownerName}이 보완을 요청했어요</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">{task.rework_reason}</AlertDescription>
            </Alert>
          )}
          {task.status === 'na' && task.na_reason && (
            <p className="rounded-lg border border-dashed border-input px-3.5 py-2.5 text-sm text-muted-foreground">
              해당 없음 사유: {task.na_reason}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-border px-5 py-6 sm:px-7">
          <h3 className="text-row font-semibold">안내</h3>
          <p className="text-row leading-[23px] whitespace-pre-wrap text-[var(--text-secondary)]">{t.description}</p>
        </div>
        <TaskFormsSection templateId={t.id} />
        <Body key={`${task.id}-${task.status}`} task={task} disabled={!actionable || pending}>
          {renderActions}
        </Body>
        {actionable && t.allow_na && naOpen && (
          <NaDialog
            pending={pending}
            onCancel={() => setNaOpen(false)}
            onConfirm={(reason) => void run(() => actions.markNa(task.id, reason), () => setNaOpen(false))}
          />
        )}
      </section>
    </Page>
  )
}
