import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Plus, Printer, Sparkles, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus } from '@/components/LoadingStatus'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { useHires } from '@/features/staff/hires'
import { AgentError } from '@/lib/agent'
import { isAuthError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  DIFFICULTY_LABEL,
  EXAM_STATUS_LABEL,
  examKeys,
  generateExam,
  regenerateQuestion,
  saveExam,
  useExam,
  useExams,
  type Difficulty,
  type DraftQuestion,
  type ExamStatus,
  type ExamWithQuestions,
} from './exams'
import { QuestionCard } from './QuestionCard'

export const REVIEW_NOTICE = 'AI가 만든 답안은 확정 전 검토가 필요합니다.'
const GENERATE_RETRY_MESSAGE = '시험 초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'
const SAVE_FAILED = '저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
const INVALID_QUESTIONS = '비어 있는 칸이 있어요. 모든 문항에 문제·모범 답안·채점 기준과 1~100점 배점을 넣어 주세요.'

type Item = DraftQuestion & { key: string; startEditing?: boolean }
type Snapshot = { title: string; topic: string; difficulty: Difficulty; status: ExamStatus; questions: DraftQuestion[] }

let keySeq = 0
const withKey = (q: DraftQuestion, startEditing = false): Item => ({ ...q, key: `k${++keySeq}`, startEditing })
const draftOf = ({ prompt, model_answer, rubric, points }: DraftQuestion): DraftQuestion => ({ prompt, model_answer, rubric, points })
const isComplete = (q: DraftQuestion) =>
  Boolean(q.prompt.trim() && q.model_answer.trim() && q.rubric.trim()) && Number.isInteger(q.points) && q.points >= 1 && q.points <= 100

function generateError(error: unknown): { text: string; retry: boolean } {
  if (error instanceof AgentError) {
    if (error.status === 429) return { text: `${error.message}. 내일 다시 이용해 주세요.`, retry: false }
    if (error.status === 401 || error.status === 403) return { text: error.message, retry: false }
    return { text: error.message || GENERATE_RETRY_MESSAGE, retry: true }
  }
  return { text: GENERATE_RETRY_MESSAGE, retry: true }
}

const PAGE = 'mx-auto grid max-w-[1376px] gap-6 p-6 lg:p-8'

function BackLink() {
  return (
    <Link to="/team/exams" className="inline-flex items-center gap-1 text-sm">
      <ChevronLeft className="size-4" />
      시험 목록
    </Link>
  )
}

// 로딩: 머리(제목·동작 버튼), 왼쪽 출제 조건, 오른쪽 문항 카드 자리
function ExamEditorSkeleton() {
  return (
    <main className={PAGE}>
      <div className="flex flex-wrap items-center gap-3">
        <BackLink />
        <div className="flex-1">
          <LoadingStatus className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-[22px] w-12 rounded-full" />
            <div className="ml-auto flex gap-2">
              <Skeleton className="h-9 w-28 rounded-full" />
              <Skeleton className="h-9 w-28 rounded-full" />
              <Skeleton className="h-9 w-16 rounded-full" />
              <Skeleton className="h-9 w-16 rounded-full" />
            </div>
          </LoadingStatus>
        </div>
      </div>
      <div aria-hidden="true" className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        <div className="grid gap-4 rounded-[18px] border border-border bg-card p-5">
          <Skeleton className="h-5 w-20" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="grid gap-2">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-10" />
            </div>
          ))}
          <Skeleton className="h-11 rounded-full" />
        </div>
        <div className="grid gap-4">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="grid gap-3 rounded-[18px] border border-border bg-card p-5">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

export function ExamEditorPage() {
  const { id = 'new' } = useParams()
  const isNew = id === 'new'
  const exam = useExam(id)

  if (!isNew) {
    if (exam.isLoading) return <ExamEditorSkeleton />
    if (exam.isError || !exam.data) {
      return (
        <main className={PAGE}>
          <BackLink />
          <LoadError retrying={exam.isFetching} onRetry={exam.isError ? () => void exam.refetch() : undefined}>
            시험을 불러오지 못했어요.
          </LoadError>
        </main>
      )
    }
  }
  return <ExamEditor key={isNew ? 'new' : id} initial={isNew ? undefined : exam.data} />
}

function ExamEditor({ initial }: { initial?: ExamWithQuestions }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const hires = useHires()
  const exams = useExams()

  const [examId, setExamId] = useState<string | undefined>(initial?.id)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? 'beginner')
  const [status, setStatus] = useState<ExamStatus>(initial?.status ?? 'draft')
  const [count, setCount] = useState('5')
  const [style, setStyle] = useState('')
  const [hireId, setHireId] = useState(params.get('hire') ?? '')
  const [items, setItems] = useState<Item[]>(() => (initial?.questions ?? []).map((q) => withKey(draftOf(q))))

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<{ text: string; retry: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  // 진행 중인 문항 다시 만들기 수. 끝나기 전에 저장·확정·인쇄하면 결과가 사라지므로 막는다
  const [regenerating, setRegenerating] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)

  const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
    title: title.trim() || topic.trim(),
    topic: topic.trim(),
    difficulty,
    status,
    questions: items.map(draftOf),
    ...over,
  })
  // 마지막으로 저장(또는 불러온) 내용. 지금 내용과 다르면 인쇄 전에 저장한다
  const [saved, setSaved] = useState<string | null>(() =>
    initial
      ? JSON.stringify({
          title: initial.title,
          topic: initial.topic,
          difficulty: initial.difficulty,
          status: initial.status,
          questions: initial.questions.map(draftOf),
        } satisfies Snapshot)
      : null,
  )
  const dirty = !examId || JSON.stringify(snapshot()) !== saved

  const questionCount = Number(count)
  const countValid = Number.isInteger(questionCount) && questionCount >= 1 && questionCount <= 10
  const canGenerate = Boolean(topic.trim()) && countValid && !generating && !saving
  const totalPoints = items.reduce((sum, q) => sum + (q.points || 0), 0)
  const empty = items.length === 0
  const busy = generating || saving || regenerating > 0

  async function generate() {
    setGenerating(true)
    setGenError(null)
    try {
      const res = await generateExam({
        topic: topic.trim(),
        difficulty,
        question_count: questionCount,
        ...(style.trim() ? { style: style.trim() } : {}),
        ...(hireId ? { new_hire_id: hireId } : {}),
      })
      setItems(res.questions.map((q) => withKey(draftOf(q))))
      if (res.title.trim()) setTitle(res.title.trim())
    } catch (error) {
      setGenError(generateError(error))
    } finally {
      setGenerating(false)
    }
  }

  async function regenerateAt(key: string, instruction: string) {
    setRegenerating((n) => n + 1)
    try {
      const next = await regenerateQuestion({
        topic: topic.trim() || title.trim(),
        difficulty,
        existing_prompts: items.filter((q) => q.key !== key && q.prompt.trim()).map((q) => q.prompt),
        ...(instruction ? { instruction } : {}),
      })
      setItems((prev) => prev.map((q) => (q.key === key ? { ...draftOf(next), key } : q)))
    } finally {
      setRegenerating((n) => n - 1)
    }
  }

  function update(key: string, next: DraftQuestion) {
    setItems((prev) => prev.map((q) => (q.key === key ? { ...q, ...next } : q)))
  }

  function move(index: number, delta: -1 | 1) {
    setItems((prev) => {
      const target = index + delta
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  // 저장에 성공하면 시험 id, 실패하면 null
  async function persist(nextStatus: ExamStatus): Promise<string | null> {
    setSaveError(null)
    if (!topic.trim()) {
      setSaveError('주제를 입력해 주세요.')
      return null
    }
    if (!items.every(isComplete)) {
      setSaveError(INVALID_QUESTIONS)
      return null
    }
    const snap = snapshot({ status: nextStatus })
    setSaving(true)
    try {
      const savedId = await saveExam({ id: examId, ...snap })
      setSaved(JSON.stringify(snap))
      setExamId(savedId)
      setStatus(nextStatus)
      setTitle(snap.title)
      void queryClient.invalidateQueries({ queryKey: ['exams'] })
      if (!examId) {
        // 새 주소로 옮겨도 편집 중인 내용이 그대로 보이게 캐시를 채운다
        queryClient.setQueryData(examKeys.detail(savedId), {
          ...(initial ?? {}),
          id: savedId,
          title: snap.title,
          topic: snap.topic,
          difficulty: snap.difficulty,
          status: snap.status,
          questions: snap.questions.map((q, position) => ({ ...q, id: `${savedId}-${position}`, exam_id: savedId, position })),
        })
        navigate(`/team/exams/${savedId}`, { replace: true })
      } else {
        void queryClient.invalidateQueries({ queryKey: examKeys.detail(savedId) })
      }
      return savedId
    } catch (error) {
      // saveExam은 useMutation 밖에서 부르므로 전역 MutationCache 대신 여기서 인증 오류를 처리한다.
      // 로그아웃하면 RoleGuard가 /login으로 보내고 편집 중인 시험 내용은 화면에서 사라진다.
      if (isAuthError(error)) {
        void supabase.auth.signOut()
        return null
      }
      setSaveError(SAVE_FAILED)
      return null
    } finally {
      setSaving(false)
    }
  }

  async function print(variant: 'paper' | 'answers') {
    const targetId = dirty ? await persist(status) : examId
    if (targetId) navigate(`/team/exams/${targetId}/print?variant=${variant}`)
  }

  const otherExams = (exams.data ?? []).filter((e) => e.id !== examId).slice(0, 5)

  return (
    <main className={PAGE}>
      <div className="flex flex-wrap items-center gap-3">
        <BackLink />
        <Input
          aria-label="시험 제목"
          disabled={busy}
          value={title}
          placeholder="시험 제목(비우면 주제로 저장)"
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          className="h-10 max-w-md flex-1 border-transparent bg-transparent text-title font-semibold shadow-none hover:border-input md:text-title"
        />
        <Badge variant={status === 'final' ? 'done' : 'todo'}>{EXAM_STATUS_LABEL[status]}</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={empty || busy} onClick={() => void print('paper')}>
            <Printer />
            시험지 인쇄
          </Button>
          <Button type="button" variant="outline" disabled={empty || busy} onClick={() => void print('answers')}>
            <Printer />
            답안지 인쇄
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void persist(status)}>
            저장
          </Button>
          <Button type="button" disabled={empty || busy || status === 'final'} onClick={() => void persist('final')}>
            확정
          </Button>
        </div>
      </div>

      {saving && <p role="status" className="text-sm text-muted-foreground">저장하는 중…</p>}
      {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      {!empty && status === 'draft' && (
        <Alert variant="warning" role="note">
          <TriangleAlert aria-hidden />
          <AlertDescription>{REVIEW_NOTICE}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="grid gap-4">
          <section aria-labelledby="exam-conditions" className="grid gap-4 rounded-[18px] border border-border bg-card p-5">
            <h2 id="exam-conditions" className="font-semibold">출제 조건</h2>
            <div>
              <Label htmlFor="exam-topic" className="mb-1">주제</Label>
              <Input id="exam-topic" disabled={busy} value={topic} maxLength={200} placeholder="예: JavaScript 비동기·스코프" onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="exam-difficulty" className="mb-1">난이도</Label>
                <NativeSelect id="exam-difficulty" disabled={busy} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                  {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                    <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label htmlFor="exam-count" className="mb-1">문항 수</Label>
                <Input id="exam-count" disabled={busy} type="number" inputMode="numeric" min={1} max={10} value={count} onChange={(e) => setCount(e.target.value)} aria-describedby="exam-count-hint" />
                <p id="exam-count-hint" className="mt-1 text-xs text-muted-foreground">1~10</p>
              </div>
            </div>
            <div>
              <Label htmlFor="exam-style" className="mb-1">문항 스타일</Label>
              <Input id="exam-style" disabled={busy} value={style} maxLength={200} placeholder="예: 손으로 푸는 코드 읽기" onChange={(e) => setStyle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="exam-hire" className="mb-1">참고할 신입</Label>
              <NativeSelect id="exam-hire" disabled={busy} value={hireId} onChange={(e) => setHireId(e.target.value)}>
                <option value="">선택 안 함</option>
                {(hires.data ?? []).map((h) => (
                  <option key={h.id} value={h.id}>{h.full_name}</option>
                ))}
                {hireId && !hires.data?.some((h) => h.id === hireId) && <option value={hireId}>선택한 신입</option>}
              </NativeSelect>
              <p className="mt-1 text-xs text-muted-foreground">기술스택·경력 조사 결과를 참고해 난이도와 예시를 맞춰요.</p>
            </div>
            <Button type="button" size="lg" disabled={!canGenerate} onClick={() => void generate()}>
              <Sparkles />
              {empty ? '초안 만들기' : '초안 다시 만들기'}
            </Button>
            {generating && <p role="status" className="text-sm text-primary">초안을 만드는 중이에요. 20초 정도 걸릴 수 있어요.</p>}
            {genError && (
              <Alert variant="destructive" className="gap-2 px-3">
                <p>{genError.text}</p>
                {genError.retry && (
                  <Button type="button" variant="outline" size="sm" className="justify-self-start bg-card" disabled={!canGenerate} onClick={() => void generate()}>
                    다시 시도
                  </Button>
                )}
              </Alert>
            )}
          </section>

          <section aria-labelledby="exam-others" className="grid gap-2 rounded-[18px] border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 id="exam-others" className="font-semibold">만든 시험</h2>
              <Link to="/team/exams" className="text-sm">전체 보기</Link>
            </div>
            {otherExams.length === 0 ? (
              <p className="text-sm text-muted-foreground">다른 시험이 없어요.</p>
            ) : (
              <ul className="grid gap-1">
                {otherExams.map((e) => (
                  <li key={e.id}>
                    <Link to={`/team/exams/${e.id}`} className="block rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-muted">
                      {e.title}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {DIFFICULTY_LABEL[e.difficulty]} · {e.question_count}문항 · {EXAM_STATUS_LABEL[e.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section aria-label="문항" className="grid gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-secondary)] tabular-nums">
              문항 {items.length} · 총 {totalPoints}점
            </p>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setItems((prev) => [...prev, withKey({ prompt: '', model_answer: '', rubric: '', points: 10 }, true)])}>
              <Plus />
              문항 추가
            </Button>
          </div>
          {empty && (
            <p className={cn('rounded-[18px] border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground')}>
              왼쪽에서 출제 조건을 넣고 "초안 만들기"를 누르면 문항 초안이 여기에 나타나요.
            </p>
          )}
          {items.map((q, index) => (
            <QuestionCard
              key={q.key}
              number={index + 1}
              total={items.length}
              question={q}
              startEditing={q.startEditing}
              disabled={busy}
              onChange={(next) => update(q.key, next)}
              onRemove={() => setItems((prev) => prev.filter((x) => x.key !== q.key))}
              onMove={(delta) => move(index, delta)}
              onRegenerate={(instruction) => regenerateAt(q.key, instruction)}
            />
          ))}
        </section>
      </div>
    </main>
  )
}
