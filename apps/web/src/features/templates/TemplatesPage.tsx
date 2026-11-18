import { Archive, Check, Lock, Plus, RotateCcw } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '@/app/AuthProvider'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus } from '@/components/LoadingStatus'
import { PageHeader } from '@/components/PageHeader'
import { SegmentedRadio } from '@/components/SegmentedRadio'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTeamName } from '@/features/newhire/useTeamName'
import { EmptyState, ErrorText } from '@/features/staff/ui'
import { useGuardedAction } from '@/features/staff/useGuardedAction'
import { OWNER_LABEL, STAGE_LABEL } from '@/lib/labels'
import type { TaskStage, TaskTemplate } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { TemplateForm } from './TemplateForm'
import {
  cleanInput,
  inputFromTemplate,
  isTemplateInputValid,
  NEW_TEMPLATE_INPUT,
  prerequisiteCandidates,
} from './templateInput'
import { isLocked, useManagedTemplates, useTemplateActions, useTemplateUsage, type TemplateInput } from './templates'

type View = 'active' | 'archived'

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: 'active', label: '사용 중' },
  { value: 'archived', label: '보관' },
]
const STAGES = Object.keys(STAGE_LABEL) as TaskStage[]

// 문구는 docs/screens.md S12 표 그대로
const FROM_NEXT_HIRES = '새로 만든 과제는 이후 온보딩을 시작하는 신입부터 들어가요.'
const LOAD_FAILED = '과제를 불러오지 못했어요. 다시 시도해 주세요.'
const EMPTY = '아직 과제가 없어요. "과제 추가"로 첫 과제를 만들어 보세요.'
const ARCHIVED_EMPTY = '보관한 과제가 없어요.'
const CREATED = '과제를 추가했어요. 이후 온보딩을 시작하는 신입부터 들어가요.'
const SAVED = '저장했어요'
const SAVE_FAILED = '저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
const ARCHIVE_FAILED = '보관하지 못했어요. 잠시 후 다시 시도해 주세요.'
const RESTORE_FAILED = '다시 사용하지 못했어요. 잠시 후 다시 시도해 주세요.'
const ARCHIVED = '보관했어요'
const RESTORED = '다시 사용해요. 이후 온보딩을 시작하는 신입부터 들어가요.'
const ARCHIVE_DESCRIPTION = '이후 온보딩을 시작하는 신입에게 들어가지 않아요. 진행 중인 신입의 과제는 그대로예요.'
const lockNotice = (n: number) =>
  `신입 ${n}명이 진행 중이라 제목과 안내문만 고칠 수 있어요. 다른 칸을 바꾸려면 보관하고 새로 만들어 주세요.`

// 실패 문구는 화면 문구로 바꾼다(DB 메시지를 그대로 보이지 않는다). 원래 오류는 cause로 남긴다.
// 인증 오류(401) 로그아웃은 useTemplateActions가 먼저 처리한다.
function orFail<T>(call: Promise<T>, message: string): Promise<T> {
  return call.catch((err: unknown) => {
    throw new Error(message, { cause: err })
  })
}

// 사용 중이면 제목·안내문 외 칸은 저장된 값을 보이고 그대로 보낸다(DB 잠금과 같은 기준)
function lockedValue(template: TaskTemplate, value: TemplateInput): TemplateInput {
  return { ...inputFromTemplate(template), title: value.title, description: value.description }
}

// S12 온보딩 과제. 범위는 역할로 고정: 교육 담당자 = 우리 팀 과제, 경영지원 = 우리 부서 과제.
export function TemplatesPage() {
  const { profile } = useAuth()
  const isTrainer = profile?.role === 'team_trainer'
  const teamName = useTeamName(isTrainer ? profile?.team_id : null)
  const scopeName = isTrainer ? (teamName ?? '우리 팀') : profile?.department ? OWNER_LABEL[profile.department] : ''
  const description = isTrainer
    ? `${scopeName} 신입에게 들어갈 온보딩 과제를 관리해요. ${FROM_NEXT_HIRES}`
    : `모든 신입에게 들어갈 ${scopeName} 과제를 관리해요. ${FROM_NEXT_HIRES}`

  const [view, setView] = useState<View>('active')
  const templates = useManagedTemplates(view)
  // 선행 과제 후보는 보기와 관계없이 사용 중인 기본 과제다. 순환 검사는 보관한 과제의 선행도 따라간다.
  const activeTemplates = useManagedTemplates('active')
  const archivedTemplates = useManagedTemplates('archived')
  const usage = useTemplateUsage()

  const [searchParams, setSearchParams] = useSearchParams()
  const code = searchParams.get('template')
  // 고른 과제 코드. 주소(?template)와 맞추되, 주소 변경은 전환(startTransition)이라 늦게 반영되므로
  // 화면에서 바꾼 선택은 이 값에 먼저 적고 아래 효과가 주소에 옮긴다(그 사이 첫 과제로 잘못 넘어가지 않게).
  const [selectedCode, setSelectedCode] = useState(code)
  const [urlCode, setUrlCode] = useState(code)
  if (code !== urlCode) {
    // 링크·뒤로 가기·위 효과로 주소가 바뀌었다
    setUrlCode(code)
    setSelectedCode(code)
  }
  // "과제 추가"를 누를 때마다 1씩 늘린다. 새 과제 패널의 key라서 다시 누르면 빈 칸으로 돌아간다.
  const [creating, setCreating] = useState(0)
  // 보관·다시 사용 결과: 그 과제가 지금 보기에서 빠지므로 페이지 머리 아래에 둔다
  const [notice, setNotice] = useState<string | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  // 저장 결과: 그 과제의 패널 동작 줄에 둔다
  const [saved, setSaved] = useState<{ id: string; text: string } | null>(null)
  // 새 과제를 저장하면 그 과제 패널의 제목(머리)으로 포커스를 옮긴다
  const [focusHeading, setFocusHeading] = useState(false)

  const loading = templates.isLoading || usage.isLoading
  const failed = templates.isError || usage.isError
  const rows = loading || failed ? [] : (templates.data ?? [])
  const usageOf = (t: TaskTemplate) => usage.data?.get(t.id) ?? 0
  // 고른 과제가 없거나 지금 보기에 없으면 첫 과제를 보여 주고, 그 과제를 선택(과 주소)에 적는다.
  // 저장 뒤 단계가 바뀌어 순서가 달라져도 패널이 다른 과제로 넘어가지 않는다.
  const selected = creating > 0 ? null : (rows.find((t) => t.code === selectedCode) ?? rows[0] ?? null)
  if (creating === 0 && selected && selected.code !== selectedCode) setSelectedCode(selected.code)

  // 선택을 주소에 옮긴다(기록을 쌓지 않게 replace)
  useEffect(() => {
    if (selectedCode === code) return
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        if (selectedCode === null) next.delete('template')
        else next.set('template', selectedCode)
        return next
      },
      { replace: true },
    )
  }, [selectedCode, code, setSearchParams])

  // 보관·다시 사용 뒤에는 그 패널이 사라지므로 결과 알림으로 포커스를 옮긴다
  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  function resetResults() {
    setNotice(null)
    setSaved(null)
  }

  function startCreate() {
    resetResults()
    setView('active')
    setCreating((n) => n + 1)
    setSelectedCode(null)
  }

  function changeView(next: View) {
    resetResults()
    setView(next)
    setCreating(0)
    setSelectedCode(null)
  }

  function onSaved(template: TaskTemplate, created: boolean) {
    setCreating(0)
    setNotice(null)
    setSaved({ id: template.id, text: created ? CREATED : SAVED })
    setFocusHeading(created)
    setSelectedCode(template.code)
  }

  function onMoved(text: string) {
    setSaved(null)
    setNotice(text)
    setSelectedCode(null)
  }

  const groups = STAGES.map((stage) => ({ stage, items: rows.filter((t) => t.stage === stage) })).filter((g) => g.items.length > 0)

  return (
    <main className="mx-auto flex max-w-[1376px] flex-col gap-6 px-4 py-8 sm:px-8">
      <PageHeader
        title="온보딩 과제"
        description={description}
        actions={
          <Button type="button" className="w-full sm:w-auto" onClick={startCreate}>
            <Plus aria-hidden />
            과제 추가
          </Button>
        }
      />

      {notice && (
        <Alert ref={noticeRef} tabIndex={-1} variant="success" role="status" className="outline-none">
          <Check aria-hidden />
          <p className="self-center">{notice}</p>
        </Alert>
      )}

      <div className="grid items-start gap-6 md:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <section aria-label={`${scopeName} 온보딩 과제`} className="overflow-hidden rounded-[18px] border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <SegmentedRadio name="template-view" label="과제 보기" options={VIEW_OPTIONS} value={view} onChange={changeView} />
          </div>
          {loading ? (
            <ListSkeleton />
          ) : failed ? (
            <div className="p-5">
              <LoadError
                retrying={templates.isFetching || usage.isFetching}
                onRetry={() => {
                  void templates.refetch()
                  void usage.refetch()
                }}
              >
                {LOAD_FAILED}
              </LoadError>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState>{view === 'archived' ? ARCHIVED_EMPTY : EMPTY}</EmptyState>
          ) : (
            <div className="divide-y divide-border">
              {groups.map(({ stage, items }) => (
                <div key={stage}>
                  <h3 className="border-b border-border bg-surface-subtle px-5 py-3.5 text-sm font-semibold">{STAGE_LABEL[stage]}</h3>
                  <ul className="divide-y divide-border">
                    {items.map((t) => {
                      const current = selected?.id === t.id
                      const n = usageOf(t)
                      return (
                        <li key={t.id}>
                          <Link
                            to={`?template=${encodeURIComponent(t.code)}`}
                            aria-current={current ? 'true' : undefined}
                            onClick={() => {
                              resetResults()
                              setCreating(0)
                              // 주소 변경(전환)보다 먼저 선택을 바꾼다
                              setSelectedCode(t.code)
                            }}
                            className={cn(
                              'flex items-center justify-between gap-3 px-5 py-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                              current ? 'bg-accent font-semibold' : 'hover:bg-surface-subtle',
                            )}
                          >
                            <span className="flex min-w-0 items-baseline gap-2.5">
                              <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{t.code}</span>{' '}
                              <span className="min-w-0">{t.title}</span>
                            </span>{' '}
                            <span
                              className={cn(
                                'shrink-0 text-xs font-normal whitespace-nowrap tabular-nums',
                                n > 0 ? 'text-[var(--text-secondary)]' : 'text-tertiary',
                              )}
                            >
                              {`진행 중 ${n}명`}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {(creating > 0 || selected) && (
          <TemplatePanel
            key={selected?.id ?? `new-${creating}`}
            template={selected}
            archived={view === 'archived'}
            usage={selected ? usageOf(selected) : 0}
            allowAssessment={isTrainer}
            prerequisiteOptions={prerequisiteCandidates(selected, activeTemplates.data ?? [], archivedTemplates.data ?? [])}
            result={selected && saved?.id === selected.id ? saved.text : null}
            focusHeading={focusHeading}
            onFocused={() => setFocusHeading(false)}
            onEdit={() => setSaved(null)}
            onSaved={onSaved}
            onArchived={() => onMoved(ARCHIVED)}
            onRestored={() => onMoved(RESTORED)}
          />
        )}
      </div>
    </main>
  )
}

// 목록 불러오는 중: 단계 머리 + 행 모양
function ListSkeleton() {
  return (
    <LoadingStatus>
      <div className="flex h-12 items-center border-b border-border bg-surface-subtle px-5">
        <Skeleton className="h-4 w-12" />
      </div>
      {['w-7/12', 'w-5/12', 'w-8/12', 'w-1/2'].map((width) => (
        <div key={width} className="flex h-11 items-center justify-between gap-3 border-b border-border px-5 last:border-b-0">
          <span className="flex flex-1 items-center gap-2.5">
            <Skeleton className="h-4 w-9" />
            <Skeleton className={cn('h-4', width)} />
          </span>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </LoadingStatus>
  )
}

type PanelProps = {
  // null이면 "과제 추가"로 연 새 과제
  template: TaskTemplate | null
  archived: boolean
  usage: number
  allowAssessment: boolean
  prerequisiteOptions: TaskTemplate[]
  result: string | null
  // true면 패널 머리(제목)로 포커스를 옮기고 onFocused를 부른다
  focusHeading: boolean
  onFocused: () => void
  onEdit: () => void
  onSaved: (template: TaskTemplate, created: boolean) => void
  onArchived: () => void
  onRestored: () => void
  // 편집 칸 아래 서식 영역 자리(과제 서식 기능이 채운다)
  filesSlot?: ReactNode
}

// 오른쪽 편집 패널. 사용 중이면 제목·안내문만, 보관 보기면 모든 칸이 읽기 전용이다.
function TemplatePanel({
  template,
  archived,
  usage,
  allowAssessment,
  prerequisiteOptions,
  result,
  focusHeading,
  onFocused,
  onEdit,
  onSaved,
  onArchived,
  onRestored,
  filesSlot,
}: PanelProps) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const bodyRef = useRef<HTMLFieldSetElement>(null)
  const [value, setValue] = useState<TemplateInput>(() => (template ? inputFromTemplate(template) : NEW_TEMPLATE_INPUT))
  const [confirming, setConfirming] = useState(false)
  const { save, archive, restore } = useTemplateActions()
  const action = useGuardedAction()
  // 사용 수는 저장 실패 뒤 다시 읽으므로, 열어 둔 사이에 신입이 들어오면 여기서 잠긴다
  const locked = !archived && template !== null && isLocked(usage)
  const formValue = locked && template ? lockedValue(template, value) : value

  // "과제 추가"로 열면 제목 칸에서 바로 쓰기 시작한다(좁은 화면에서는 패널까지 스크롤된다). 첫 입력 칸이 제목이다.
  // 새 과제 패널은 "과제 추가"를 누를 때마다 새로 그려지므로(key) 열릴 때 한 번만 실행된다.
  const isNew = template === null
  useEffect(() => {
    if (isNew) bodyRef.current?.querySelector('input')?.focus()
  }, [isNew])

  useEffect(() => {
    if (!focusHeading) return
    headingRef.current?.focus()
    onFocused()
  }, [focusHeading, onFocused])

  function change(next: TemplateInput) {
    setValue(next)
    action.clearError()
    onEdit()
  }

  async function submit() {
    const input = cleanInput(formValue)
    await action.run(async () => {
      const saved = await orFail(save(template?.id ?? null, input), SAVE_FAILED)
      onSaved(saved, template === null)
    })
  }

  async function runArchive() {
    if (!template) return
    if (await action.run(() => orFail(archive(template.id), ARCHIVE_FAILED))) onArchived()
  }

  async function runRestore() {
    if (!template) return
    if (await action.run(() => orFail(restore(template.id), RESTORE_FAILED))) onRestored()
  }

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-[18px] border border-border bg-card">
      <div className="border-b border-border px-5 py-5 sm:px-6">
        {template ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-background px-2 py-0.5 text-xs text-[var(--text-secondary)] tabular-nums">{template.code}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{`진행 중 ${usage}명`}</span>
            </div>
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-lead font-semibold outline-none">
              {template.title}
            </h2>
          </div>
        ) : (
          <h2 id={headingId} className="text-lead font-semibold">
            과제 추가
          </h2>
        )}
      </div>

      {/* 보관한 과제는 모든 칸을 막는다(fieldset disabled). 칸은 흐리지 않고 읽기 전용 모양으로 남는다 */}
      <fieldset ref={bodyRef} disabled={archived} className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
        {locked && (
          <Alert variant="info" role="note">
            <Lock aria-hidden />
            <AlertDescription>{lockNotice(usage)}</AlertDescription>
          </Alert>
        )}
        <TemplateForm
          value={formValue}
          onChange={change}
          lockedFields={locked || archived}
          allowAssessment={allowAssessment}
          showPrerequisites
          prerequisiteOptions={prerequisiteOptions}
        />
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">
        {action.error ? (
          <div className="mr-auto">
            <ErrorText>{action.error}</ErrorText>
          </div>
        ) : (
          result && (
            <p role="status" className="mr-auto text-sm text-st-done-fg">
              {result}
            </p>
          )
        )}
        {archived ? (
          <Button type="button" disabled={action.busy} onClick={() => void runRestore()}>
            <RotateCcw aria-hidden />
            다시 사용
          </Button>
        ) : (
          <>
            {template && (
              <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="ghost" disabled={action.busy}>
                    <Archive aria-hidden />
                    보관
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-lead font-semibold">{`'${template.title}' 과제를 보관할까요?`}</AlertDialogTitle>
                    <AlertDialogDescription>{ARCHIVE_DESCRIPTION}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel variant="ghost">취소</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void runArchive()}>보관</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button type="button" disabled={action.busy || !isTemplateInputValid(formValue)} onClick={() => void submit()}>
              저장
            </Button>
          </>
        )}
      </div>

      {filesSlot}
    </section>
  )
}
