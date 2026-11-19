import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, CircleAlert, Info, Library, Plus, Printer, Sparkles, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
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
import { bankPrompts, buildAvoidPrompts, pickBankItems, registerExamToBank, toDraft, useBankTopics } from './bank'
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
const BANK_LOADING = '문제은행에서 가져오는 중…'
const BANK_EMPTY = '문제은행에 이 주제·난이도 문항이 아직 없어요. AI로 만들어 주세요.'
const BANK_FAILED = '문제은행을 불러오지 못했어요. 다시 시도해 주세요.'
const BANK_REGISTER_FAILED = '확정했지만 문제은행에 넣지 못했어요. 다시 시도해 주세요.'
const bankShortage = (n: number) => `문제은행에 맞는 문항이 ${n}개뿐이에요. 나머지는 AI로 만들어 주세요.`
const registered = (n: number) => (n > 0 ? `확정했어요. 새 문항 ${n}개를 문제은행에 넣었어요.` : '확정했어요.')

type Item = DraftQuestion & { key: string; startEditing?: boolean }
type Snapshot = { title: string; topic: string; difficulty: Difficulty; status: ExamStatus; questions: DraftQuestion[] }
// 확정(또는 확정된 시험 저장) 뒤 은행 등록 결과. 머리 아래 알림 자리에 보인다
type BankNotice = { ok: true; count: number } | { ok: false; examId: string }

let keySeq = 0
const withKey = (q: DraftQuestion, startEditing = false): Item => ({ ...q, key: `k${++keySeq}`, startEditing })
// 은행 출처(bank_item_id)도 남긴다. 불러올 때·저장 스냅샷에서 출처가 사라지면 확정 때 은행에 또 들어간다
const draftOf = ({ prompt, model_answer, rubric, points, bank_item_id }: DraftQuestion): DraftQuestion => ({
  prompt,
  model_answer,
  rubric,
  points,
  bank_item_id: bank_item_id ?? null,
})
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

const PAGE = 'mx-auto grid max-w-[1376px] grid-cols-1 gap-6 p-4 sm:p-6 lg:p-8'

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
      <div aria-hidden="true" className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
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
  const location = useLocation()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const hires = useHires()
  const exams = useExams()
  const bankTopics = useBankTopics()

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
  const [filling, setFilling] = useState(false)
  // 은행 채우기 결과: 부족·없음 안내(info) 또는 불러오기 실패
  const [fillNotice, setFillNotice] = useState<{ text: string; failed: boolean } | null>(null)
  const [registering, setRegistering] = useState(false)
  const [bankNotice, setBankNotice] = useState<BankNotice | null>(
    () => (location.state as { bankNotice?: BankNotice } | null)?.bankNotice ?? null,
  )

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
  const totalPoints = items.reduce((sum, q) => sum + (q.points || 0), 0)
  const empty = items.length === 0
  // 문항 수까지 모자란 개수. 은행 채우기와 부족분 생성이 이만큼만 붙인다
  const need = countValid ? questionCount - items.length : 0
  const busy = generating || saving || regenerating > 0 || filling || registering
  const canGenerate = Boolean(topic.trim()) && need > 0 && !generating && !saving && !filling && !registering
  const canFill = Boolean(topic.trim()) && need > 0 && !busy

  // 편집기의 모든 문항 문장(출처와 무관, 빈 문장 제외)
  const editorPrompts = () => items.map((q) => q.prompt).filter((p) => p.trim())

  async function fillFromBank() {
    setFilling(true)
    setFillNotice(null)
    try {
      const picked = await pickBankItems({
        topic: topic.trim(),
        difficulty,
        count: need,
        exclude: items.flatMap((q) => (q.bank_item_id ? [q.bank_item_id] : [])),
        excludePrompts: editorPrompts(),
        newHireId: hireId || undefined,
      })
      setItems((prev) => [...prev, ...picked.map((b) => withKey(toDraft(b)))])
      if (picked.length === 0) setFillNotice({ text: BANK_EMPTY, failed: false })
      else if (picked.length < need) setFillNotice({ text: bankShortage(picked.length), failed: false })
    } catch (error) {
      if (isAuthError(error)) {
        void supabase.auth.signOut()
        return
      }
      setFillNotice({ text: BANK_FAILED, failed: true })
    } finally {
      setFilling(false)
    }
  }

  // 문항이 없으면 전체 초안(교체), 있으면 부족분만 만들어 뒤에 붙인다
  async function generate() {
    const append = !empty
    setGenerating(true)
    setGenError(null)
    setFillNotice(null)
    try {
      // 은행 문장을 못 불러와도 생성은 막지 않는다. 편집기 문장 회피는 유지한다
      const bank = await bankPrompts(topic.trim(), difficulty).catch(() => [])
      const res = await generateExam({
        topic: topic.trim(),
        difficulty,
        question_count: append ? need : questionCount,
        ...(style.trim() ? { style: style.trim() } : {}),
        ...(hireId ? { new_hire_id: hireId } : {}),
        avoid_prompts: buildAvoidPrompts(editorPrompts(), bank),
      })
      const generated = res.questions.map((q) => withKey(draftOf(q)))
      setItems((prev) => (append ? [...prev, ...generated] : generated))
      if (res.title.trim() && (!append || !title.trim())) setTitle(res.title.trim())
    } catch (error) {
      setGenError(generateError(error))
    } finally {
      setGenerating(false)
    }
  }

  // 확정 시험의 새 문항을 은행에 넣는다. 실패해도 시험은 확정된 채로 두고 다시 시도할 수 있다(중복은 DB가 막는다)
  async function registerToBank(id: string): Promise<BankNotice | null> {
    setRegistering(true)
    setBankNotice(null)
    let notice: BankNotice | null = null
    try {
      notice = { ok: true, count: await registerExamToBank(id) }
      void queryClient.invalidateQueries({ queryKey: ['bank-topics'] })
      void queryClient.invalidateQueries({ queryKey: ['bank'] })
    } catch (error) {
      if (isAuthError(error)) {
        void supabase.auth.signOut()
        return null
      }
      notice = { ok: false, examId: id }
    } finally {
      setRegistering(false)
    }
    setBankNotice(notice)
    return notice
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
      // 내용이 새로 바뀌므로 은행 출처를 비운다
      setItems((prev) => prev.map((q) => (q.key === key ? { ...draftOf(next), bank_item_id: null, key } : q)))
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

  // 저장에 성공하면 시험 id, 실패하면 null. 확정 상태로 저장하면(확정, 확정된 시험 저장) 은행에도 등록한다
  async function persist(nextStatus: ExamStatus): Promise<string | null> {
    const savedId = await saveOnly(nextStatus)
    if (!savedId) return null
    const notice = nextStatus === 'final' ? await registerToBank(savedId) : null
    // 새 시험은 새 주소에서 편집기가 다시 그려지므로 등록 결과를 주소 state로 넘긴다
    if (!examId) navigate(`/team/exams/${savedId}`, { replace: true, state: notice ? { bankNotice: notice } : null })
    return savedId
  }

  async function saveOnly(nextStatus: ExamStatus): Promise<string | null> {
    setSaveError(null)
    setBankNotice(null)
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
      {/* 왼쪽: 뒤로 가기 · 제목 · 상태 배지를 붙여 묶는다. 오른쪽: 인쇄 2 · 저장 · 확정 (시안 S7 머리) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <BackLink />
          <div className="flex min-w-0 items-center gap-2">
            {/* 글자 길이만큼만 넓어진다(field-sizing, 최소 96·최대 576). 비어 있으면 placeholder 길이 */}
            <Input
              aria-label="시험 제목"
              disabled={busy}
              value={title}
              placeholder="시험 제목(비우면 주제로 저장)"
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-auto max-w-xl min-w-24 field-sizing-content border-transparent bg-transparent text-title font-semibold shadow-none hover:border-input md:text-title"
            />
            <Badge variant={status === 'final' ? 'done' : 'todo'}>{EXAM_STATUS_LABEL[status]}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
      {bankNotice?.ok && (
        <Alert variant="success" role="status">
          <Check aria-hidden />
          <AlertDescription>{registered(bankNotice.count)}</AlertDescription>
        </Alert>
      )}
      {bankNotice && !bankNotice.ok && (
        <Alert variant="destructive" role="alert" className="flex flex-wrap items-center gap-2 py-2">
          <CircleAlert aria-hidden />
          <span className="flex-1">{BANK_REGISTER_FAILED}</span>
          <Button type="button" variant="outline" size="sm" className="bg-card" disabled={busy} onClick={() => void registerToBank(bankNotice.examId)}>
            다시 시도
          </Button>
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="grid gap-4">
          <section aria-labelledby="exam-conditions" className="grid gap-4 rounded-[18px] border border-border bg-card p-5">
            <h2 id="exam-conditions" className="font-semibold">출제 조건</h2>
            <div>
              <Label htmlFor="exam-topic" className="mb-1">주제</Label>
              <Input id="exam-topic" list="exam-bank-topics" disabled={busy} value={topic} maxLength={200} placeholder="예: JavaScript 비동기·스코프" onChange={(e) => setTopic(e.target.value)} />
              {/* 팀 문제은행의 기존 주제. 표기가 갈라지지 않게 고르도록 띄운다 */}
              <datalist id="exam-bank-topics">
                {(bankTopics.data ?? []).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
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
            {/* 은행에서 먼저 채우고(한도 없음), 모자라면 AI로 만든다. 둘 다 문항 수까지 모자란 만큼만 붙인다 */}
            <div className="grid gap-2">
              <Button type="button" size="lg" variant="outline" className="bg-card" disabled={!canFill} onClick={() => void fillFromBank()}>
                <Library />
                문제은행에서 채우기
              </Button>
              <Button type="button" size="lg" disabled={!canGenerate} onClick={() => void generate()}>
                <Sparkles />
                {empty ? '초안 만들기' : '부족분 AI로 만들기'}
              </Button>
            </div>
            {filling && <p role="status" className="text-sm text-primary">{BANK_LOADING}</p>}
            {fillNotice?.failed && <p role="alert" className="text-sm text-destructive">{fillNotice.text}</p>}
            {fillNotice && !fillNotice.failed && (
              <Alert variant="info" role="status">
                <Info aria-hidden />
                <AlertDescription>{fillNotice.text}</AlertDescription>
              </Alert>
            )}
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
              <span className="lg:hidden">위에서</span>
              <span className="hidden lg:inline">왼쪽에서</span> 출제 조건을 넣고 "문제은행에서 채우기"나 "초안 만들기"를 누르면 문항이 여기에 나타나요.
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
