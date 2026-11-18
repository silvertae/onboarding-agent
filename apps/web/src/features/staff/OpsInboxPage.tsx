import { useMemo, useState } from 'react'
import { useAuth } from '@/app/AuthProvider'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { OWNER_LABEL } from '@/lib/labels'
import { useTaskActions, useVisibleTasks, type TaskView } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { formatDateTime, formatMonthDay, isOverdue } from './format'
import { useHires, type Hire } from './hires'
import { reviewActions } from './reviewActions'
import { TaskReviewPanel } from './TaskReviewPanel'
import { EmptyState, ErrorText, LoadingText, NativeSelect, PageHeader, Panel, SegmentTabList, SegmentTabPanel, SegmentTabs } from './ui'
import { useGuardedAction } from './useGuardedAction'

type Tab = 'submitted' | 'mine' | 'all'

const EMPTY_TEXT: Record<Tab, string> = {
  submitted: '확인 대기 중인 과제가 없어요',
  mine: '지금 처리할 과제가 없어요',
  all: '업무함에 과제가 없어요',
}

const FINISHED = new Set(['done', 'na'])

function inTab(task: TaskView, tab: Tab): boolean {
  if (tab === 'submitted') return task.status === 'submitted'
  if (tab === 'mine') return task.template.completion_mode === 'staff_only' && task.status === 'todo'
  return true
}

function byTab(tab: Tab, hireName: (id: string) => string) {
  return (a: TaskView, b: TaskView) => {
    // 확인 대기는 오래 기다린 것부터, 나머지는 기한 순
    if (tab === 'submitted') return (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '')
    if (tab === 'mine') return (a.due_date ?? '').localeCompare(b.due_date ?? '')
    return hireName(a.new_hire_id).localeCompare(hireName(b.new_hire_id)) || a.template.sort_order - b.template.sort_order
  }
}

function SummaryCard({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <Panel aria-label={label} className="px-6 py-5">
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 text-[28px] font-semibold">{value}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{caption}</p>
    </Panel>
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
    mine: deptTasks.filter((t) => inTab(t, 'mine')).length,
    rework: deptTasks.filter((t) => t.status === 'rework').length,
    activeHires: new Set(deptTasks.filter((t) => !FINISHED.has(t.status)).map((t) => t.new_hire_id)).size,
  }

  const hireOptions = [...new Set(deptTasks.map((t) => t.new_hire_id))]
    .map((id) => ({ id, name: hireName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const rows = deptTasks
    .filter((t) => inTab(t, tab) && (!hireFilter || t.new_hire_id === hireFilter))
    .sort(byTab(tab, hireName))

  const selected = deptTasks.find((t) => t.id === selectedId) ?? null

  if (!department) return null
  const deptLabel = OWNER_LABEL[department]

  return (
    <main className="mx-auto flex max-w-[1376px] flex-col gap-6 px-4 py-8 sm:px-8">
      <PageHeader
        title={`${deptLabel} 업무함`}
        description={`${deptLabel} 담당 온보딩 과제만 보여요. 서류는 받지 않고 제출 여부만 확인합니다.`}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="확인 대기" value={counts.submitted} caption="신입이 제출하고 확인을 기다려요" />
        <SummaryCard label="보완 요청 중" value={counts.rework} caption="신입의 재제출을 기다려요" />
        <SummaryCard label="진행 중 입사자" value={counts.activeHires} caption="우리 부서 과제가 남은 입사자" />
      </div>

      <div className={cn('grid items-start gap-6', selected && 'lg:grid-cols-[1fr_380px]')}>
        <Panel className="overflow-hidden">
          <SegmentTabs value={tab} onChange={setTab}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
              <SegmentTabList
                label="업무함 보기"
                items={[
                  { key: 'submitted', label: '확인 대기', count: counts.submitted },
                  { key: 'mine', label: '내가 처리할 일', count: counts.mine },
                  { key: 'all', label: '전체' },
                ]}
              />
              <div className="flex items-center gap-2">
                <label htmlFor="ops-hire-filter" className="text-sm text-[var(--text-secondary)]">
                  입사자
                </label>
                <NativeSelect id="ops-hire-filter" className="w-40" value={hireFilter} onChange={(e) => setHireFilter(e.target.value)}>
                  <option value="">전체</option>
                  {hireOptions.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            {rowAction.error && (
              <div className="px-6 pb-3">
                <ErrorText>{rowAction.error}</ErrorText>
              </div>
            )}

            <SegmentTabPanel value={tab}>
              {tasksQuery.isLoading ? (
                <LoadingText />
              ) : tasksQuery.isError ? (
                <div className="px-6 py-10">
                  <ErrorText>업무 목록을 불러오지 못했어요. 새로고침해 주세요.</ErrorText>
                </div>
              ) : (
                <table aria-label="업무 목록" className="w-full text-sm">
                  <thead className="border-y border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">입사자</th>
                      <th className="px-4 py-3 font-semibold">과제</th>
                      <th className="px-4 py-3 font-semibold">상태</th>
                      <th className="px-4 py-3 font-semibold">제출 시각</th>
                      <th className="px-4 py-3 font-semibold">기한</th>
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
                            'cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-subtle focus-visible:bg-accent focus-visible:outline-none',
                            task.id === selectedId && 'bg-accent',
                          )}
                        >
                          <td className="px-4 py-3">
                            <b className="block">{hire?.full_name ?? '이름 없음'}</b>
                            <span className="text-xs text-muted-foreground">{hire?.team?.name ?? ''}</span>
                          </td>
                          <td className="px-4 py-3">{task.template.title}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={task.status} completionMode={task.template.completion_mode} />
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">{formatDateTime(task.submitted_at)}</td>
                          <td className={cn('px-4 py-3', overdue && 'font-semibold text-destructive')}>
                            {formatMonthDay(task.due_date)}
                            {overdue && ' 지남'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canComplete && (
                              <Button
                                type="button"
                                variant="outline"
                                className="border-primary px-3 text-primary"
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
