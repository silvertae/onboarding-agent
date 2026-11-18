import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/app/AuthProvider'
import { ROW_SELECTED } from '@/components/tableRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDateTime, formatMonthDay } from './format'
import {
  useKnowledge,
  useKnowledgeActions,
  useTeamName,
  useUnanswered,
  type KnowledgeItem,
  type KnowledgeStatus,
  type UnansweredQuestion,
} from './knowledge'
import { KnowledgeForm, type KnowledgeValues } from './KnowledgeForm'
import { EmptyState, ErrorText, LoadingText, PageHeader, Panel, SegmentTabList, SegmentTabPanel, SegmentTabs } from './ui'
import { useGuardedAction } from './useGuardedAction'

type Tab = 'unanswered' | 'knowledge'

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

  const [tab, setTab] = useState<Tab>('unanswered')
  const [search, setSearch] = useState('')
  const [editing, setEditingState] = useState<Editing | null>(null)
  const { clearError } = formAction

  // 다른 항목을 열면 이전 저장 실패 문구를 지운다.
  function setEditing(next: Editing | null) {
    clearError()
    setEditingState(next)
  }

  const unanswered = unansweredQuery.data ?? []
  const keyword = search.trim().toLowerCase()
  const items = (knowledgeQuery.data ?? []).filter(
    (k) => !keyword || k.question.toLowerCase().includes(keyword) || k.answer.toLowerCase().includes(keyword),
  )

  async function submit(values: KnowledgeValues, status: KnowledgeStatus) {
    if (!editing) return
    const ok = await formAction.run(() => {
      if (editing.mode === 'resolve') return resolve(editing.unanswered.id, values)
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

      <div className={cn('grid items-start gap-6', editing && 'lg:grid-cols-[1fr_380px]')}>
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
                <LoadingText />
              ) : unansweredQuery.isError ? (
                <div className="px-6 py-10">
                  <ErrorText>미답변 질문을 불러오지 못했어요. 새로고침해 주세요.</ErrorText>
                </div>
              ) : unanswered.length === 0 ? (
                <EmptyState>미답변 질문이 없어요</EmptyState>
              ) : (
                <table aria-label="미답변 질문" className="w-full text-sm">
                  <thead className="border-b border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]">
                    <tr>
                      <th className={th}>질문</th>
                      <th className={th}>물은 시각</th>
                      <th className={th}>물은 사람의 팀</th>
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
                          <td className="px-4 py-3 font-semibold">{q.question}</td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">{formatDateTime(q.created_at)}</td>
                          <td className="px-4 py-3">{q.team?.name ?? '—'}</td>
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
                <LoadingText />
              ) : knowledgeQuery.isError ? (
                <div className="px-6 py-10">
                  <ErrorText>지식 목록을 불러오지 못했어요. 새로고침해 주세요.</ErrorText>
                </div>
              ) : (
                <table aria-label="지식 목록" className="w-full text-sm">
                  <thead className="border-b border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]">
                    <tr>
                      <th className={th}>질문</th>
                      <th className={th}>답변</th>
                      <th className={th}>분류</th>
                      <th className={th}>범위</th>
                      <th className={th}>상태</th>
                      <th className={th}>수정일</th>
                      <th className="px-4 py-3">
                        <span className="sr-only">처리</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState>{keyword ? '검색 결과가 없어요' : '등록된 지식이 없어요'}</EmptyState>
                        </td>
                      </tr>
                    )}
                    {items.map((k) => (
                      <tr key={k.id} className="border-b border-border align-top last:border-b-0">
                        <td className="max-w-56 px-4 py-3 font-medium">{k.question}</td>
                        <td className="max-w-80 px-4 py-3 text-[var(--text-secondary)]">
                          <p className="line-clamp-2">{k.answer}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{k.category || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{k.scope === 'company' ? '회사 공통' : scopeLabel}</td>
                        <td className="px-4 py-3">
                          <Badge variant={k.status === 'published' ? 'done' : 'blocked'}>{STATUS_TEXT[k.status]}</Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[var(--text-secondary)]">{formatMonthDay(k.updated_at.slice(0, 10))}</td>
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
            onSubmit={(values, status) => void submit(values, status)}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    </main>
  )
}
