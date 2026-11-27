import { useMemo, useState } from 'react'
import { useAuth } from '@/app/AuthProvider'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus, TableSkeleton } from '@/components/LoadingStatus'
import { ProgressBar } from '@/components/ProgressBar'
import { RowMeta, WIDE_CELL } from '@/components/RowMeta'
import { StatusBadge } from '@/components/StatusBadge'
import { ROW_FOCUS, ROW_HOVER, ROW_SELECTED } from '@/components/tableRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { AddTaskButton } from '@/features/templates/AddTaskDialog'
import { OWNER_LABEL } from '@/lib/labels'
import { progress, useTaskActions, useVisibleTasks, type TaskView } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { daysLate, daysWaiting, formatDateTime, formatKoreanDate, formatMonthDay, isBeforeHire, isOverdue } from './format'
import { useHires, type Hire } from './hires'
import { isOneOff, reviewActions } from './reviewActions'
import { TaskReviewPanel } from './TaskReviewPanel'
import { EmptyState, ErrorText, PageHeader, Panel, SegmentTabList, SegmentTabPanel, SegmentTabs, TaskTitle } from './ui'
import { useGuardedAction } from './useGuardedAction'

// 'hires'(입사자별)는 과제가 아니라 입사자 한 줄씩 보여 주는 탭이라 아래 업무 표 함수들에는 오지 않는다.
type Tab = 'submitted' | 'overdue' | 'mine' | 'hires' | 'all'
type TaskTab = Exclude<Tab, 'hires'>

const TAB_LABEL: Record<Tab, string> = {
  submitted: '확인 대기',
  overdue: '기한 초과',
  mine: '내가 처리할 일',
  hires: '입사자별',
  all: '전체',
}

const EMPTY_TEXT: Record<TaskTab, string> = {
  submitted: '확인 대기 중인 과제가 없어요',
  overdue: '기한이 지난 과제가 없어요',
  mine: '지금 처리할 과제가 없어요',
  all: '업무함에 과제가 없어요',
}

const FINISHED = new Set(['done', 'na'])

// 지금 누가 움직여야 하는지(기한 초과 탭의 "차례" 칸)
function turnLabel(task: TaskView): '신입' | '담당자' | '선행 과제 대기' {
  if (task.status === 'blocked') return '선행 과제 대기'
  if (task.status === 'submitted' || task.template.completion_mode === 'staff_only') return '담당자'
  return '신입'
}

function inTab(task: TaskView, tab: TaskTab): boolean {
  if (tab === 'submitted') return task.status === 'submitted'
  if (tab === 'overdue') return !FINISHED.has(task.status) && isOverdue(task.due_date)
  if (tab === 'mine') return task.template.completion_mode === 'staff_only' && task.status === 'todo'
  return true
}

function byTab(tab: TaskTab, hireName: (id: string) => string) {
  return (a: TaskView, b: TaskView) => {
    // 확인 대기는 오래 기다린 것부터, 나머지는 기한 순
    if (tab === 'submitted') return (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '')
    // 기한 초과는 오래 지난 것부터, 같은 날이면 입사자 이름순
    if (tab === 'overdue') return (a.due_date ?? '').localeCompare(b.due_date ?? '') || hireName(a.new_hire_id).localeCompare(hireName(b.new_hire_id))
    if (tab === 'mine') return (a.due_date ?? '').localeCompare(b.due_date ?? '')
    return hireName(a.new_hire_id).localeCompare(hireName(b.new_hire_id)) || a.template.sort_order - b.template.sort_order
  }
}

// 제출 시각. 확인 대기가 하루 이상이면 대기 일수를 붙이고 3일 이상은 강조한다(보완 요청은 submitted_at이 남아 있어도 붙이지 않는다)
function SubmittedAt({ task }: { task: TaskView }) {
  const waiting = task.status === 'submitted' && task.submitted_at ? daysWaiting(task.submitted_at) : 0
  return (
    <>
      {formatDateTime(task.submitted_at)}
      {waiting >= 1 && (
        <>
          {' · '}
          <span className={cn(waiting >= 3 && 'font-semibold text-destructive')}>{waiting}일 대기</span>
        </>
      )}
    </>
  )
}

function SummaryCard({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <Panel aria-label={label} className="px-6 py-5">
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 text-page font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{caption}</p>
    </Panel>
  )
}

// S9 입사자별 탭: 우리 부서 과제가 있는 신입을 입사일 최신순으로. 줄을 누르면 "전체" 탭을 그 입사자로 거른다.
function HireTable({ hires, tasks, deptLabel, onOpen }: { hires: Hire[]; tasks: TaskView[]; deptLabel: string; onOpen(hireId: string): void }) {
  const progressLabel = `${deptLabel} 과제`
  return (
    <table aria-label="입사자 목록" className="w-full text-sm">
      <thead className="border-y border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]">
        <tr>
          <th className="px-4 py-3 font-semibold">입사자</th>
          <th className={cn('px-4 py-3 font-semibold', WIDE_CELL)}>입사일</th>
          <th className="px-4 py-3 font-semibold whitespace-nowrap sm:w-60">{progressLabel}</th>
          <th className={cn('px-4 py-3 font-semibold', WIDE_CELL)}>확인 대기</th>
          <th className="px-4 py-3">
            <span className="sr-only">동작</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {hires.length === 0 && (
          <tr>
            <td colSpan={5}>
              <EmptyState>업무함에 입사자가 없어요</EmptyState>
            </td>
          </tr>
        )}
        {hires.map((hire) => {
          const mine = tasks.filter((t) => t.new_hire_id === hire.id)
          const { finished, total } = progress(mine)
          const pending = mine.filter((t) => t.status === 'submitted').length
          return (
            <tr
              key={hire.id}
              tabIndex={0}
              onClick={() => onOpen(hire.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onOpen(hire.id)
                }
              }}
              className={cn('cursor-pointer border-b border-border last:border-b-0', ROW_HOVER, ROW_FOCUS)}
            >
              <td className="px-4 py-3">
                <b className="block">{hire.full_name}</b>
                <span className="text-xs text-muted-foreground">{hire.team?.name ?? ''}</span>
                <RowMeta
                  items={[
                    `${formatKoreanDate(hire.hire_date)} 입사${isBeforeHire(hire.hire_date) ? ' 전' : ''}`,
                    pending > 0 && `확인 대기 ${pending}`,
                  ]}
                />
              </td>
              <td className={cn('px-4 py-3', WIDE_CELL)}>
                {formatKoreanDate(hire.hire_date)}
                {isBeforeHire(hire.hire_date) && <span className="ml-1 text-xs text-muted-foreground">입사 전</span>}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="hidden flex-1 sm:block">
                    <ProgressBar label={`${hire.full_name} ${progressLabel} 진행률`} value={finished} max={total} />
                  </div>
                  <b className="text-label whitespace-nowrap tabular-nums">
                    {finished} / {total}
                  </b>
                </div>
              </td>
              <td className={cn('px-4 py-3', WIDE_CELL)}>
                {pending > 0 ? <Badge variant="submitted">{pending}</Badge> : <span className="text-muted-foreground">0</span>}
              </td>
              {/* 대화 상자는 포털이지만 React 이벤트는 포털을 거쳐 이 줄까지 올라온다. 여기서 막아야 대화 상자 안을 눌러도 탭이 바뀌지 않는다 */}
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <div className="flex justify-end">
                  <AddTaskButton hire={hire} allowAssessment={false} compact />
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// S9 부서 업무함: 내 부서 경영지원 과제만 다룬다. RLS가 막지만 화면에서도 부서로 거른다.
export function OpsInboxPage() {
  const { profile } = useAuth()
  const department = profile?.department ?? null
  const tasksQuery = useVisibleTasks()
  const hiresQuery = useHires()
  const { confirm } = useTaskActions()
  const rowAction = useGuardedAction()

  const [tab, setTab] = useState<Tab>('submitted')
  const [hireFilter, setHireFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const hireById = useMemo(() => new Map<string, Hire>((hiresQuery.data ?? []).map((h) => [h.id, h])), [hiresQuery.data])
  const hireName = (id: string) => hireById.get(id)?.full_name ?? '이름 없음'

  const deptTasks = useMemo(
    () => (department ? (tasksQuery.data ?? []).filter((t) => t.template.department === department) : []),
    [tasksQuery.data, department],
  )

  const counts = {
    submitted: deptTasks.filter((t) => inTab(t, 'submitted')).length,
    overdue: deptTasks.filter((t) => inTab(t, 'overdue')).length,
    mine: deptTasks.filter((t) => inTab(t, 'mine')).length,
    rework: deptTasks.filter((t) => t.status === 'rework').length,
    activeHires: new Set(deptTasks.filter((t) => !FINISHED.has(t.status)).map((t) => t.new_hire_id)).size,
  }

  const hireOptions = [...new Set(deptTasks.map((t) => t.new_hire_id))]
    .map((id) => ({ id, name: hireName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // 입사자별 탭: 우리 부서 과제가 있는 신입, 입사일 최신순
  const deptHires = hireOptions
    .map((h) => hireById.get(h.id))
    .filter((h): h is Hire => Boolean(h))
    .sort((a, b) => (b.hire_date ?? '').localeCompare(a.hire_date ?? ''))

  const rows =
    tab === 'hires'
      ? []
      : deptTasks.filter((t) => inTab(t, tab) && (!hireFilter || t.new_hire_id === hireFilter)).sort(byTab(tab, hireName))

  function openHire(hireId: string) {
    setTab('all')
    setHireFilter(hireId)
  }

  const selected = deptTasks.find((t) => t.id === selectedId) ?? null
  // "이 신입에게 과제 추가"는 입사자 필터로 한 명을 고른 상태에서만 보인다
  const filteredHire = hireFilter ? hireById.get(hireFilter) : undefined

  if (!department) return null
  const deptLabel = OWNER_LABEL[department]

  return (
    <main className="mx-auto flex max-w-[1376px] flex-col gap-6 px-4 py-8 sm:px-8">
      <PageHeader
        title={`${deptLabel} 업무함`}
        description={`${deptLabel} 담당 온보딩 과제만 보여요. 서류는 받지 않고 제출 여부만 확인합니다.`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="확인 대기" value={counts.submitted} caption="신입이 제출하고 확인을 기다려요" />
        <SummaryCard label="보완 요청 중" value={counts.rework} caption="신입의 재제출을 기다려요" />
        <SummaryCard label="진행 중 입사자" value={counts.activeHires} caption="우리 부서 과제가 남은 입사자" />
        <SummaryCard label="기한 초과" value={counts.overdue} caption="기한이 지난 우리 부서 과제" />
      </div>

      <div className={cn('grid grid-cols-1 items-start gap-6', selected && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
        <Panel className="overflow-hidden">
          <SegmentTabs value={tab} onChange={setTab}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
              <SegmentTabList
                label="업무함 보기"
                items={[
                  { key: 'submitted', label: TAB_LABEL.submitted, count: counts.submitted },
                  { key: 'overdue', label: TAB_LABEL.overdue, count: counts.overdue },
                  { key: 'mine', label: TAB_LABEL.mine, count: counts.mine },
                  { key: 'hires', label: TAB_LABEL.hires },
                  { key: 'all', label: TAB_LABEL.all },
                ]}
              />
              {/* 입사자별 탭은 표 자체가 입사자 목록이라 거르기가 없다 */}
              {tab !== 'hires' && (
                <div className="flex flex-wrap items-center gap-3">
                  <NativeSelect
                    variant="filter"
                    label="입사자"
                    className="w-48"
                    value={hireFilter}
                    onChange={(e) => setHireFilter(e.target.value)}
                  >
                    <option value="">전체</option>
                    {hireOptions.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </NativeSelect>
                  {/* 입사자를 바꾸면 결과 문구("추가했어요")가 다른 입사자에게 남지 않게 새로 그린다 */}
                  {filteredHire && <AddTaskButton key={filteredHire.id} hire={filteredHire} allowAssessment={false} />}
                </div>
              )}
            </div>

            {rowAction.error && (
              <div className="px-6 pb-3">
                <ErrorText>{rowAction.error}</ErrorText>
              </div>
            )}

            <SegmentTabPanel value={tab}>
              {/* 입사자별 탭은 신입 목록도 와야 그릴 수 있다(아직이면 "입사자가 없어요"로 잘못 보인다) */}
              {tasksQuery.isLoading || (tab === 'hires' && hiresQuery.isLoading) ? (
                <LoadingStatus>
                  <TableSkeleton
                    columns={
                      tab === 'hires'
                        ? [
                            { label: '입사자', cell: 'two-line' },
                            { label: '입사일', className: WIDE_CELL },
                            { label: `${deptLabel} 과제` },
                            { label: '확인 대기', cell: 'badge', className: WIDE_CELL },
                            { label: '', cell: 'none' },
                          ]
                        : [
                            { label: '입사자', cell: 'two-line', className: WIDE_CELL },
                            { label: '과제' },
                            { label: '상태', cell: 'badge', className: WIDE_CELL },
                            { label: tab === 'overdue' ? '차례' : '제출 시각', className: WIDE_CELL },
                            { label: '기한', className: WIDE_CELL },
                            { label: '', cell: 'none' },
                          ]
                    }
                  />
                </LoadingStatus>
              ) : tasksQuery.isError ? (
                <div className="px-6 pb-6">
                  <LoadError retrying={tasksQuery.isFetching} onRetry={() => void tasksQuery.refetch()}>
                    업무 목록을 불러오지 못했어요. 다시 시도해 주세요.
                  </LoadError>
                </div>
              ) : tab === 'hires' && hiresQuery.isError ? (
                <div className="px-6 pb-6">
                  <LoadError retrying={hiresQuery.isFetching} onRetry={() => void hiresQuery.refetch()}>
                    입사자 목록을 불러오지 못했어요. 다시 시도해 주세요.
                  </LoadError>
                </div>
              ) : tab === 'hires' ? (
                <HireTable hires={deptHires} tasks={deptTasks} deptLabel={deptLabel} onOpen={openHire} />
              ) : (
                <table aria-label="업무 목록" className="w-full text-sm">
                  <thead className="border-y border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]">
                    <tr>
                      <th className={cn('px-4 py-3 font-semibold', WIDE_CELL)}>입사자</th>
                      <th className="px-4 py-3 font-semibold">과제</th>
                      <th className={cn('px-4 py-3 font-semibold', WIDE_CELL)}>상태</th>
                      <th className={cn('px-4 py-3 font-semibold', WIDE_CELL)}>{tab === 'overdue' ? '차례' : '제출 시각'}</th>
                      <th className={cn('px-4 py-3 font-semibold', WIDE_CELL)}>기한</th>
                      <th className="px-4 py-3">
                        <span className="sr-only">처리</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <EmptyState>{EMPTY_TEXT[tab]}</EmptyState>
                        </td>
                      </tr>
                    )}
                    {rows.map((task) => {
                      const hire = hireById.get(task.new_hire_id)
                      const overdue = !FINISHED.has(task.status) && isOverdue(task.due_date)
                      const overdueText = overdue && `${formatMonthDay(task.due_date)} · ${daysLate(task.due_date!)}일 지남`
                      const { canComplete } = reviewActions(task)
                      return (
                        <tr
                          key={task.id}
                          tabIndex={0}
                          aria-selected={task.id === selectedId}
                          onClick={() => setSelectedId(task.id)}
                          onKeyDown={(e) => {
                            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault()
                              setSelectedId(task.id)
                            }
                          }}
                          className={cn(
                            'cursor-pointer border-b border-border last:border-b-0',
                            task.id === selectedId ? ROW_SELECTED : cn(ROW_HOVER, ROW_FOCUS),
                          )}
                        >
                          <td className={cn('px-4 py-3', WIDE_CELL)}>
                            <b className="block">{hire?.full_name ?? '이름 없음'}</b>
                            <span className="text-xs text-muted-foreground">{hire?.team?.name ?? ''}</span>
                          </td>
                          <td className="px-4 py-3">
                            <TaskTitle title={task.template.title} oneOff={isOneOff(task)} />
                            <RowMeta
                              badge={<StatusBadge status={task.status} completionMode={task.template.completion_mode} />}
                              items={[
                                hire?.full_name ?? '이름 없음',
                                task.submitted_at && (
                                  <>
                                    제출 <SubmittedAt task={task} />
                                  </>
                                ),
                                task.due_date &&
                                  (overdue ? (
                                    <span className="font-semibold text-destructive">{overdueText}</span>
                                  ) : (
                                    `기한 ${formatMonthDay(task.due_date)}`
                                  )),
                              ]}
                            />
                          </td>
                          <td className={cn('px-4 py-3', WIDE_CELL)}>
                            <StatusBadge status={task.status} completionMode={task.template.completion_mode} />
                          </td>
                          {tab === 'overdue' ? (
                            <td className={cn('px-4 py-3', WIDE_CELL, task.status === 'blocked' && 'text-muted-foreground')}>{turnLabel(task)}</td>
                          ) : (
                            <td className={cn('px-4 py-3 text-[var(--text-secondary)]', WIDE_CELL)}>
                              <SubmittedAt task={task} />
                            </td>
                          )}
                          <td className={cn('px-4 py-3', WIDE_CELL, overdue && 'font-semibold text-destructive')}>
                            {overdueText || formatMonthDay(task.due_date)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canComplete && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-primary text-primary"
                                disabled={rowAction.busy}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void rowAction.run(() => confirm(task.id))
                                }}
                              >
                                완료 처리
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </SegmentTabPanel>
          </SegmentTabs>
        </Panel>

        {selected && (
          <TaskReviewPanel
            key={selected.id}
            task={selected}
            hire={hireById.get(selected.new_hire_id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </main>
  )
}
