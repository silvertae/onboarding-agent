import { Plus, Search, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '@/app/AuthProvider'
import { FilterChips } from '@/components/FilterChips'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus, TableSkeleton } from '@/components/LoadingStatus'
import { RowMeta, WIDE_CELL } from '@/components/RowMeta'
import { ROW_SELECTED } from '@/components/tableRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { agentMessage, useDocuments } from '@/features/documents/documents'
import { cn } from '@/lib/utils'
import { formatDateTime, formatMonthDay } from './format'
import {
  draftAnswer,
  useKnowledge,
  useKnowledgeActions,
  useKnowledgeSources,
  useKnowledgeSourcesFor,
  useTeamName,
  useUnanswered,
  type DraftClause,
  type KnowledgeItem,
  type KnowledgeStatus,
  type UnansweredQuestion,
} from './knowledge'
import { KnowledgeForm, type KnowledgeValues } from './KnowledgeForm'
import { EmptyState, ErrorText, PageHeader, Panel, SegmentTabList, SegmentTabPanel, SegmentTabs } from './ui'
import { useGuardedAction } from './useGuardedAction'

type Tab = 'unanswered' | 'knowledge'
type ListFilter = 'all' | 'ai'

type Editing =
  | { mode: 'resolve'; key: string; unanswered: UnansweredQuestion }
  | { mode: 'create'; key: string }
  | { mode: 'edit'; key: string; item: KnowledgeItem }

const STATUS_TEXT: Record<KnowledgeStatus, string> = { draft: '초안', published: '게시' }

function initialValues(editing: Editing): KnowledgeValues {
  if (editing.mode === 'resolve') return { question: editing.unanswered.question, answer: '', category: '' }
  if (editing.mode === 'edit') return { question: editing.item.question, answer: editing.item.answer, category: editing.item.category }
  return { question: '', answer: '', category: '' }
}

// AI 초안 필터에서 질문 아래 배지 옆에 둘 조항 번호(label이 없으면 제목).
function captionOf(clauses: DraftClause[] | undefined): string {
  return (clauses ?? []).map((c) => c.label || c.heading).filter(Boolean).join(', ')
}

const th = 'px-4 py-3 font-semibold whitespace-nowrap'

// S10 지식·미답변 관리. 범위는 역할로 고정: 교육 담당자 = 우리 팀 지식, 경영지원 = 회사 공통 지식.
export function KnowledgePage() {
  const { profile } = useAuth()
  const isTrainer = profile?.role === 'team_trainer'
  const teamName = useTeamName(isTrainer ? profile?.team_id : null)
  const scopeLabel = isTrainer ? (teamName ?? '우리 팀') : '회사 공통'

  const knowledgeQuery = useKnowledge()
  const unansweredQuery = useUnanswered()
  const { save, setStatus, resolve } = useKnowledgeActions()
  const formAction = useGuardedAction()
  const listAction = useGuardedAction()

  // 규정 문서 화면의 "지식 관리에서 검토하기" 링크(?tab=knowledge&filter=ai)가 처음 탭과 필터를 정한다. 모르는 값은 무시한다.
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'knowledge' ? 'knowledge' : 'unanswered')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ListFilter>(params.get('filter') === 'ai' ? 'ai' : 'all')
  // 이 폼에서 받은 AI 초안의 근거 조항. 폼이 바뀌면 지운다(origin도 함께 초기화).
  const [draft, setDraft] = useState<{ clauses: DraftClause[] } | null>(null)
  const documentsQuery = useDocuments()
  // 폼을 열 때마다 올린다. 늦게 도착한 초안 응답이 다른 폼에 들어가지 않게 한다.
  const formSeq = useRef(0)
  const [editing, setEditingState] = useState<Editing | null>(null)
  const { clearError } = formAction

  // 다른 항목을 열면 이전 저장 실패 문구를 지운다.
  function setEditing(next: Editing | null) {
    // 이미 열린 폼을 다시 고르면 입력과 AI 출처를 그대로 둔다.
    if (next && editing && next.key === editing.key) return
    clearError()
    setDraft(null)
    formSeq.current += 1
    setEditingState(next)
  }

  const unanswered = unansweredQuery.data ?? []
  const keyword = search.trim().toLowerCase()
  const allItems = knowledgeQuery.data ?? []
  const isAiDraft = (k: KnowledgeItem) => k.origin === 'ai_draft' && k.status === 'draft'
  const aiDraftCount = allItems.filter(isAiDraft).length
  const items = allItems.filter(
    (k) =>
      (filter === 'all' || isAiDraft(k)) &&
      (!keyword || k.question.toLowerCase().includes(keyword) || k.answer.toLowerCase().includes(keyword)),
  )
  const aiRowIds = filter === 'ai' ? items.filter((k) => k.origin === 'ai_draft').map((k) => k.id) : []
  const captions = useKnowledgeSourcesFor(aiRowIds).data
  const editingItemId = editing?.mode === 'edit' ? editing.item.id : null
  const editSources = useKnowledgeSources(editingItemId).data
  // 문서 목록을 불러오는 중이거나 실패했을 때는 막지 않는다(서버가 근거 없음으로 답한다).
  const noDocuments = documentsQuery.data !== undefined && !documentsQuery.data.some((d) => d.status === 'ready')

  async function onDraft(question: string, stillCurrent: () => boolean) {
    const seq = formSeq.current
    try {
      const found = await draftAnswer(question)
      if (found && seq === formSeq.current && stillCurrent()) setDraft({ clauses: found.clauses })
      return found
    } catch (err) {
      throw new Error(agentMessage(err))
    }
  }

  async function submit(values: KnowledgeValues, status: KnowledgeStatus) {
    if (!editing) return
    const ok = await formAction.run(() => {
      if (editing.mode === 'resolve') {
        if (!draft) return resolve(editing.unanswered.id, values)
        return resolve(editing.unanswered.id, values, { clauseIds: draft.clauses.map((c) => c.id), origin: 'ai_draft' })
      }
      return save({ ...(editing.mode === 'edit' ? { id: editing.item.id } : {}), ...values, status })
    })
    if (ok) setEditing(null)
  }

  const description = isTrainer
    ? `${scopeLabel} 지식을 관리해요. 회사 공통 지식은 경영지원 담당자가 관리합니다.`
    : '회사 공통 지식을 관리해요. 팀 지식은 각 팀 교육 담당자가 관리합니다.'

  return (
    <main className="mx-auto flex max-w-[1376px] flex-col gap-6 px-4 py-8 sm:px-8">
      <PageHeader title="지식 관리" description={description} />

      <div className={cn('grid grid-cols-1 items-start gap-6', editing && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
        <Panel className="overflow-hidden">
          <SegmentTabs value={tab} onChange={setTab}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
              <SegmentTabList
                label="지식 관리 보기"
                items={[
                  { key: 'unanswered', label: '미답변 질문', count: unanswered.length },
                  { key: 'knowledge', label: '지식 목록' },
                ]}
              />
              {tab === 'knowledge' && (
                <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                  <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      type="search"
                      aria-label="지식 검색"
                      placeholder="질문·답변 검색"
                      className="pl-9"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Button type="button" onClick={() => setEditing({ mode: 'create', key: `create-${Date.now()}` })}>
                    <Plus />
                    지식 추가
                  </Button>
                </div>
              )}
            </div>
            <SegmentTabPanel value="unanswered">
              {unansweredQuery.isLoading ? (
                <LoadingStatus>
                  <TableSkeleton
                    headClassName="border-b"
                    rows={4}
                    columns={[
                      { label: '질문' },
                      { label: '물은 시각', className: WIDE_CELL },
                      { label: '물은 사람의 팀', className: WIDE_CELL },
                      { label: '', cell: 'button' },
                    ]}
                  />
                </LoadingStatus>
              ) : unansweredQuery.isError ? (
                <div className="p-6">
                  <LoadError retrying={unansweredQuery.isFetching} onRetry={() => void unansweredQuery.refetch()}>
                    미답변 질문을 불러오지 못했어요. 다시 시도해 주세요.
                  </LoadError>
                </div>
              ) : unanswered.length === 0 ? (
                <EmptyState>미답변 질문이 없어요</EmptyState>
              ) : (
                <table aria-label="미답변 질문" className="w-full text-sm">
                  <thead className="border-b border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]">
                    <tr>
                      <th className={th}>질문</th>
                      <th className={cn(th, WIDE_CELL)}>물은 시각</th>
                      <th className={cn(th, WIDE_CELL)}>물은 사람의 팀</th>
                      <th className="px-4 py-3">
                        <span className="sr-only">처리</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {unanswered.map((q) => {
                      const active = editing?.mode === 'resolve' && editing.unanswered.id === q.id
                      return (
                        <tr key={q.id} className={cn('border-b border-border last:border-b-0', active && ROW_SELECTED)}>
                          <td className="px-4 py-3 font-semibold wrap-anywhere">
                            {q.question}
                            <RowMeta items={[formatDateTime(q.created_at), q.team?.name ?? '—']} />
                          </td>
                          <td className={cn('px-4 py-3 text-[var(--text-secondary)]', WIDE_CELL)}>{formatDateTime(q.created_at)}</td>
                          <td className={cn('px-4 py-3', WIDE_CELL)}>{q.team?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant={active ? 'default' : 'outline'}
                              className={cn(!active && 'border-primary text-primary')}
                              onClick={() => setEditing({ mode: 'resolve', key: `resolve-${q.id}`, unanswered: q })}
                            >
                              답 등록
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </SegmentTabPanel>
            <SegmentTabPanel value="knowledge">
              {listAction.error && (
                <div className="px-6 pb-3">
                  <ErrorText>{listAction.error}</ErrorText>
                </div>
              )}
              {knowledgeQuery.isLoading ? (
                <LoadingStatus>
                  <TableSkeleton
                    headClassName="border-b"
                    columns={[
                      { label: '질문' },
                      { label: '답변', className: WIDE_CELL },
                      { label: '분류', className: WIDE_CELL },
                      { label: '범위', className: WIDE_CELL },
                      { label: '상태', cell: 'badge', className: WIDE_CELL },
                      { label: '수정일', className: WIDE_CELL },
                      { label: '', cell: 'button' },
                    ]}
                  />
                </LoadingStatus>
              ) : knowledgeQuery.isError ? (
                <div className="p-6">
                  <LoadError retrying={knowledgeQuery.isFetching} onRetry={() => void knowledgeQuery.refetch()}>
                    지식 목록을 불러오지 못했어요. 다시 시도해 주세요.
                  </LoadError>
                </div>
              ) : (
                <>
                  <div className="border-b border-border px-6 py-3">
                    <FilterChips
                      label="지식 목록 거르기"
                      value={filter}
                      onChange={setFilter}
                      items={[
                        { value: 'all', label: `전체 ${allItems.length}` },
                        { value: 'ai', label: `AI 초안 ${aiDraftCount}` },
                      ]}
                    />
                  </div>
                  <table aria-label="지식 목록" className="w-full text-sm">
                    <thead className="border-b border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]">
                      <tr>
                        <th className={th}>질문</th>
                        <th className={cn(th, WIDE_CELL)}>답변</th>
                        <th className={cn(th, WIDE_CELL)}>분류</th>
                        <th className={cn(th, WIDE_CELL)}>범위</th>
                        <th className={cn(th, WIDE_CELL)}>상태</th>
                        <th className={cn(th, WIDE_CELL)}>수정일</th>
                        <th className="px-4 py-3">
                          <span className="sr-only">처리</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={7}>
                            <EmptyState>{keyword ? '검색 결과가 없어요' : filter === 'ai' ? 'AI 초안이 없어요' : '등록된 지식이 없어요'}</EmptyState>
                          </td>
                        </tr>
                      )}
                      {items.map((k) => (
                        <tr key={k.id} className="border-b border-border align-top last:border-b-0">
                          <td className="px-4 py-3 font-medium wrap-anywhere sm:max-w-56">
                            {k.question}
                            <RowMeta
                              badge={<Badge variant={k.status === 'published' ? 'done' : 'blocked'}>{STATUS_TEXT[k.status]}</Badge>}
                              items={[k.category, k.scope === 'company' ? '회사 공통' : scopeLabel, formatMonthDay(k.updated_at.slice(0, 10))]}
                            />
                            {k.origin === 'ai_draft' && (
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                <Badge variant="secondary">
                                  <Sparkles aria-hidden />
                                  AI 작성
                                </Badge>
                                {filter === 'ai' && captionOf(captions?.[k.id]) && (
                                <span className="text-xs text-muted-foreground">{captionOf(captions?.[k.id])}</span>
                              )}
                              </div>
                            )}
                          </td>
                          <td className={cn('max-w-80 px-4 py-3 text-[var(--text-secondary)]', WIDE_CELL)}>
                            <p className="line-clamp-2">{k.answer}</p>
                          </td>
                          <td className={cn('px-4 py-3 whitespace-nowrap', WIDE_CELL)}>{k.category || '—'}</td>
                          <td className={cn('px-4 py-3 whitespace-nowrap', WIDE_CELL)}>{k.scope === 'company' ? '회사 공통' : scopeLabel}</td>
                          <td className={cn('px-4 py-3', WIDE_CELL)}>
                            <Badge variant={k.status === 'published' ? 'done' : 'blocked'}>{STATUS_TEXT[k.status]}</Badge>
                          </td>
                          <td className={cn('px-4 py-3 whitespace-nowrap text-[var(--text-secondary)]', WIDE_CELL)}>{formatMonthDay(k.updated_at.slice(0, 10))}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditing({ mode: 'edit', key: `edit-${k.id}`, item: k })}
                              >
                                수정
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={listAction.busy}
                                onClick={() => void listAction.run(() => setStatus(k.id, k.status === 'published' ? 'draft' : 'published'))}
                              >
                                {k.status === 'published' ? '게시 취소' : '게시'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </SegmentTabPanel>
          </SegmentTabs>
        </Panel>

        {editing && (
          <KnowledgeForm
            key={editing.key}
            mode={editing.mode}
            initial={initialValues(editing)}
            scopeLabel={scopeLabel}
            busy={formAction.busy}
            error={formAction.error}
            onDraft={editing.mode === 'resolve' ? onDraft : undefined}
            draftDisabledReason={noDocuments ? 'no-documents' : null}
            clauses={editing.mode === 'edit' ? editSources : draft?.clauses}
            aiDraft={editing.mode === 'resolve' && Boolean(draft)}
            onSubmit={(values, status) => void submit(values, status)}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    </main>
  )
}
