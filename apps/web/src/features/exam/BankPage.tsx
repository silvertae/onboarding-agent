import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Eye, EyeOff, Plus } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { FilterChips } from '@/components/FilterChips'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus, TableSkeleton } from '@/components/LoadingStatus'
import { PageHeader } from '@/components/PageHeader'
import { SegmentedRadio } from '@/components/SegmentedRadio'
import { ROW_HOVER, ROW_SELECTED } from '@/components/tableRow'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import {
  addBankItem, BANK_SOURCE_LABEL, bankKeys, isDuplicate, topicKey, updateBankItem, useBankItems, useBankTopics,
  type BankItem, type BankStatus,
} from './bank'
import { DIFFICULTY_LABEL, type Difficulty, type DraftQuestion } from './exams'
import { QuestionCard } from './QuestionCard'

const EMPTY = '아직 문항이 없어요. 시험을 확정하면 문항이 여기에 쌓여요.'
const LOAD_FAILED = '문제은행을 불러오지 못했어요. 다시 시도해 주세요.'
const SAVED = '저장했어요'
const HIDDEN = '숨겼어요. 시험 채우기에 더 나오지 않아요.'
const REPUBLISHED = '다시 게시했어요'
const DUPLICATE = '같은 문제가 이미 문제은행에 있어요.'
const SAVE_FAILED = '저장하지 못했어요. 잠시 후 다시 시도해 주세요.'

// 펼친 편집 행. id가 NEW면 목록 맨 위의 새 문항 행이다.
const NEW = 'new'
type Draft = DraftQuestion & { topic: string; difficulty: Difficulty }
type RowResult = { kind: 'saved' } | { kind: 'error'; text: string }
type Open = { id: string; draft: Draft; result: RowResult | null }

// done: 목록을 다시 읽은 뒤 결과를 놓는다(저장된 문항 id를 받는다)
type Write = (
  | { kind: 'add'; draft: Draft }
  | { kind: 'update'; id: string; patch: Parameters<typeof updateBankItem>[1] }
) & { done: (id: string) => void }

const DIFFICULTY_FILTERS: { value: Difficulty | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'beginner', label: DIFFICULTY_LABEL.beginner },
  { value: 'intermediate', label: DIFFICULTY_LABEL.intermediate },
]
const STATUS_OPTIONS: { value: BankStatus; label: string }[] = [
  { value: 'active', label: '게시' },
  { value: 'hidden', label: '숨김' },
]
const COLUMNS = [
  { label: '문제' },
  { label: '주제', className: 'hidden sm:table-cell' },
  { label: '난이도', className: 'hidden sm:table-cell' },
  { label: '배점', className: 'hidden sm:table-cell' },
  { label: '출처' },
]

const toDraftRow = (item: BankItem): Draft => ({
  topic: item.topic.trim(),
  difficulty: item.difficulty,
  prompt: item.prompt,
  model_answer: item.model_answer,
  rubric: item.rubric,
  points: item.points,
})

const isComplete = (d: Draft) =>
  Boolean(d.topic.trim() && d.prompt.trim() && d.model_answer.trim() && d.rubric.trim()) && d.points >= 1 && d.points <= 100

// 미리보기: 첫 줄은 문장, 나머지(대개 코드)는 고정폭으로 이어 붙인다. 두 줄에서 자른다.
function Preview({ prompt }: { prompt: string }) {
  const [first, ...rest] = prompt.trim().split('\n')
  const code = rest.join(' ').replace(/\s+/g, ' ').trim()
  return (
    <span className="line-clamp-2 leading-5">
      {first}
      {code && (
        <>
          <br />
          <span className="font-mono text-label text-[var(--text-secondary)]">{code}</span>
        </>
      )}
    </span>
  )
}

function Head() {
  return (
    <thead className="border-b border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]">
      <tr>
        {COLUMNS.map((c) => (
          <th key={c.label} className={cn('px-4 py-3 font-semibold whitespace-nowrap', c.className)}>
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export function BankPage() {
  const queryClient = useQueryClient()
  const topics = useBankTopics()
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')
  const [status, setStatus] = useState<BankStatus>('active')
  const items = useBankItems({ topic: topic || undefined, difficulty: difficulty === 'all' ? undefined : difficulty, status })
  const [open, setOpen] = useState<Open | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // 문항 추가로 연 빈 행은 문제 칸에서 바로 쓰기 시작한다
  const addingNew = open?.id === NEW
  useEffect(() => {
    if (addingNew) document.getElementById('bank-new-prompt')?.focus()
  }, [addingNew])

  // 저장 → 목록 다시 읽기 → 결과 놓기를 한 동작으로 묶는다. 다 끝날 때까지 isPending이라 그 사이 입력·문항 추가를 막고,
  // 다시 읽기가 끝난 뒤 결과가 그 사이 바뀐 입력을 덮어쓰지 않는다.
  const write = useMutation({
    mutationFn: async (w: Write) => {
      const id = w.kind === 'add' ? await addBankItem(w.draft) : await updateBankItem(w.id, w.patch).then(() => w.id)
      await refresh()
      w.done(id)
      return id
    },
  })
  const busy = write.isPending

  const topicOptions = topics.data ?? []
  // 고른 주제가 목록에서 빠져도(모두 숨김 등) 선택이 풀리지 않게 남긴다
  const options = topic && !topicOptions.some((t) => topicKey(t) === topicKey(topic)) ? [topic, ...topicOptions] : topicOptions

  function changeFilter(apply: () => void) {
    apply()
    setOpen(null)
    setNotice(null)
  }

  function toggle(item: BankItem) {
    setNotice(null)
    setOpen((cur) => (cur?.id === item.id ? null : { id: item.id, draft: toDraftRow(item), result: null }))
  }

  function startAdd() {
    setNotice(null)
    setOpen({
      id: NEW,
      draft: { topic, difficulty: difficulty === 'all' ? 'beginner' : difficulty, prompt: '', model_answer: '', rubric: '', points: 0 },
      result: null,
    })
  }

  function editDraft(draft: Draft) {
    setOpen((cur) => cur && { ...cur, draft, result: null })
  }

  function rowResult(id: string, result: RowResult) {
    setOpen((cur) => (cur?.id === id ? { ...cur, result } : cur))
  }

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [bankKeys.list()[0]] }),
      queryClient.invalidateQueries({ queryKey: [bankKeys.topics()[0]] }),
    ])

  // 지금 필터에 보이는 문항인지. 새 문항은 게시 상태로 들어가고, 고친 문항은 지금 보기의 상태 그대로다
  const visibleWith = (d: Draft, itemStatus: BankStatus) =>
    status === itemStatus && (!topic || topicKey(topic) === topicKey(d.topic)) && (difficulty === 'all' || difficulty === d.difficulty)

  // 저장한 행이 필터에서 빠지면 행 안 결과도 함께 사라지므로 표 위에 알린다
  function savedOutside() {
    setOpen(null)
    setNotice(SAVED)
  }

  async function save() {
    if (!open) return
    const { id, draft } = open
    const clean = { ...draft, topic: draft.topic.trim() }
    try {
      if (id === NEW) {
        await write.mutateAsync({
          kind: 'add',
          draft: clean,
          done: (newId) => (visibleWith(clean, 'active') ? setOpen({ id: newId, draft: clean, result: { kind: 'saved' } }) : savedOutside()),
        })
      } else {
        const { topic: t, difficulty: d, prompt, model_answer, rubric, points } = clean
        await write.mutateAsync({
          kind: 'update',
          id,
          patch: { prompt, model_answer, rubric, points, topic: t, difficulty: d },
          done: () => (visibleWith(clean, status) ? rowResult(id, { kind: 'saved' }) : savedOutside()),
        })
      }
    } catch (error) {
      rowResult(id, { kind: 'error', text: isDuplicate(error) ? DUPLICATE : SAVE_FAILED })
    }
  }

  // 숨기기·다시 게시: 행이 지금 보기에서 빠지므로 결과는 표 위에 둔다
  async function setItemStatus(id: string, next: BankStatus) {
    try {
      await write.mutateAsync({
        kind: 'update',
        id,
        patch: { status: next },
        done: () => {
          setOpen(null)
          setNotice(next === 'hidden' ? HIDDEN : REPUBLISHED)
        },
      })
    } catch {
      rowResult(id, { kind: 'error', text: SAVE_FAILED })
    }
  }

  function editor(o: Open) {
    const prefix = o.id === NEW ? 'bank-new' : `bank-${o.id}-edit`
    return (
      <div className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:p-5">
        <QuestionCard
          mode="bank"
          idPrefix={prefix}
          question={o.draft}
          disabled={busy}
          onChange={(q) => editDraft({ ...o.draft, ...q })}
          metaFields={
            <>
              <div className="min-w-48 flex-1">
                <Label htmlFor={`${prefix}-topic`} className="mb-1">주제</Label>
                <Input
                  id={`${prefix}-topic`}
                  list="bank-topic-options"
                  disabled={busy}
                  value={o.draft.topic}
                  maxLength={200}
                  onChange={(e) => editDraft({ ...o.draft, topic: e.target.value })}
                />
              </div>
              <div className="w-36 flex-none">
                <Label htmlFor={`${prefix}-difficulty`} className="mb-1">난이도</Label>
                <NativeSelect
                  id={`${prefix}-difficulty`}
                  disabled={busy}
                  value={o.draft.difficulty}
                  onChange={(e) => editDraft({ ...o.draft, difficulty: e.target.value as Difficulty })}
                >
                  <option value="beginner">{DIFFICULTY_LABEL.beginner}</option>
                  <option value="intermediate">{DIFFICULTY_LABEL.intermediate}</option>
                </NativeSelect>
              </div>
            </>
          }
        />
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {o.result?.kind === 'saved' && (
            <p role="status" className="mr-auto text-sm text-st-done-fg">
              {SAVED}
            </p>
          )}
          {o.result?.kind === 'error' && (
            <p role="alert" className="mr-auto text-sm text-destructive">
              {o.result.text}
            </p>
          )}
          {o.id === NEW ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(null)}>
              취소
            </Button>
          ) : status === 'active' ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void setItemStatus(o.id, 'hidden')}>
              <EyeOff aria-hidden />
              숨기기
            </Button>
          ) : (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void setItemStatus(o.id, 'active')}>
              <Eye aria-hidden />
              다시 게시
            </Button>
          )}
          <Button type="button" disabled={busy || !isComplete(o.draft)} onClick={() => void save()}>
            저장
          </Button>
        </div>
      </div>
    )
  }

  const rows = items.data ?? []

  return (
    <main className="mx-auto grid max-w-[1376px] gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="문제은행"
        description="우리 팀 시험 문항을 모아 둔 곳이에요. 시험을 만들 때 여기서 먼저 채워요."
        actions={
          <Button type="button" className="w-full sm:w-auto" disabled={busy} onClick={startAdd}>
            <Plus aria-hidden />
            문항 추가
          </Button>
        }
      />

      <section aria-label="문항 목록" className="overflow-hidden rounded-[18px] border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border p-4 sm:px-6">
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <NativeSelect
              aria-label="주제 필터"
              className="w-full sm:w-50"
              value={topic}
              onChange={(e) => changeFilter(() => setTopic(e.target.value))}
            >
              <option value="">모든 주제</option>
              {options.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
            <FilterChips
              label="난이도 필터"
              items={DIFFICULTY_FILTERS}
              value={difficulty}
              onChange={(v) => changeFilter(() => setDifficulty(v))}
            />
          </div>
          <SegmentedRadio
            name="bank-status"
            label="게시 상태"
            className="w-full sm:w-40"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(v) => changeFilter(() => setStatus(v))}
          />
        </div>

        {notice && (
          <div className="p-4 sm:px-6">
            <Alert variant="success" role="status">
              <Check aria-hidden />
              <p className="self-center">{notice}</p>
            </Alert>
          </div>
        )}

        {items.isLoading ? (
          <LoadingStatus>
            <TableSkeleton
              headClassName="border-b"
              rows={4}
              columns={[
                { label: '문제', cell: 'paragraph', className: 'w-full' },
                { label: '주제', className: 'hidden sm:table-cell' },
                { label: '난이도', className: 'hidden sm:table-cell' },
                { label: '배점', className: 'hidden sm:table-cell' },
                { label: '출처', cell: 'badge' },
              ]}
            />
          </LoadingStatus>
        ) : items.isError ? (
          <div className="p-4 sm:p-6">
            <LoadError retrying={items.isFetching} onRetry={() => void items.refetch()}>
              {LOAD_FAILED}
            </LoadError>
          </div>
        ) : (
          <>
            {(rows.length > 0 || open?.id === NEW) && (
              <div className="overflow-x-auto">
                <table aria-label="문제은행 문항" className="w-full text-sm">
                  <Head />
                  <tbody>
                    {open?.id === NEW && (
                      <tr className={cn('border-b border-border', ROW_SELECTED)}>
                        <td colSpan={COLUMNS.length} className="px-3 py-4 sm:px-6 sm:pb-6">
                          {editor(open)}
                        </td>
                      </tr>
                    )}
                    {rows.map((item) => {
                      const isOpen = open?.id === item.id
                      const editId = `bank-${item.id}`
                      return (
                        <Fragment key={item.id}>
                          <tr className={cn('border-b border-border last:border-b-0', isOpen ? cn(ROW_SELECTED, 'border-b-0') : ROW_HOVER)}>
                            <td className="w-full px-4 py-3.5 sm:min-w-80">
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={isOpen ? editId : undefined}
                                onClick={() => toggle(item)}
                                className="flex w-full items-start gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight
                                  aria-hidden
                                  className={cn(
                                    'mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out-ui motion-reduce:transition-none',
                                    isOpen && 'rotate-90',
                                  )}
                                />
                                <Preview prompt={item.prompt} />
                              </button>
                              <span className="mt-1.5 ml-6 block text-xs text-muted-foreground sm:hidden">
                                {item.topic.trim()} · {DIFFICULTY_LABEL[item.difficulty]} · {item.points}점
                              </span>
                            </td>
                            <td className="hidden px-4 py-3.5 whitespace-nowrap text-[var(--text-secondary)] sm:table-cell">{item.topic.trim()}</td>
                            <td className="hidden px-4 py-3.5 whitespace-nowrap text-[var(--text-secondary)] sm:table-cell">
                              {DIFFICULTY_LABEL[item.difficulty]}
                            </td>
                            <td className="hidden px-4 py-3.5 whitespace-nowrap text-[var(--text-secondary)] tabular-nums sm:table-cell">{item.points}점</td>
                            <td className="px-4 py-3.5">
                              <Badge variant="secondary">{BANK_SOURCE_LABEL[item.source]}</Badge>
                            </td>
                          </tr>
                          {isOpen && open && (
                            <tr id={editId} className={cn('border-b border-border last:border-b-0', ROW_SELECTED)}>
                              <td colSpan={COLUMNS.length} className="px-3 pb-4 sm:px-6 sm:pb-6">
                                {editor(open)}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length === 0 && open?.id !== NEW && <p className="px-6 py-12 text-center text-sm text-muted-foreground">{EMPTY}</p>}
          </>
        )}
      </section>

      <datalist id="bank-topic-options">
        {topicOptions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </main>
  )
}
