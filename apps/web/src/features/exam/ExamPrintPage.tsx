import { ChevronLeft, Printer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import logoUrl from '@/assets/blueward-logo.png'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DIFFICULTY_LABEL, useExam, type ExamWithQuestions } from './exams'
import './print.css'

type Variant = 'paper' | 'answers'

// 시험지(paper)는 신입에게 배포한다. 모범 답안·채점 기준은 화면은 물론 DOM에도 넣지 않는다.
// 알 수 없는 값은 답이 없는 시험지로 본다.
function variantOf(value: string | null): Variant {
  return value === 'answers' ? 'answers' : 'paper'
}

const FOOTER = 'Blueward · 가상 데이터 데모'

export function ExamPrintPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const variant = variantOf(params.get('variant'))
  const exam = useExam(id)

  return (
    <main className="exam-print grid justify-items-center gap-4 bg-background px-4 py-6">
      <div className="no-print flex w-full max-w-[210mm] flex-wrap items-center gap-3">
        <Link to={`/team/exams/${id}`} className="inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4" />
          편집기로
        </Link>
        <nav aria-label="인쇄 종류" className="ml-auto inline-flex rounded-xl bg-secondary p-1">
          {(['paper', 'answers'] as const).map((v) => (
            <Link
              key={v}
              to={`/team/exams/${id}/print?variant=${v}`}
              aria-current={v === variant ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-sm text-[var(--text-secondary)] no-underline',
                v === variant && 'bg-white font-semibold text-foreground shadow-sm',
              )}
            >
              {v === 'paper' ? '시험지' : '답안지'}
            </Link>
          ))}
        </nav>
        <Button type="button" size="lg" className="px-4" disabled={!exam.data} onClick={() => window.print()}>
          <Printer />
          인쇄 / PDF로 저장
        </Button>
      </div>

      {exam.isLoading ? (
        <p role="status" className="py-12 text-sm text-muted-foreground">불러오는 중…</p>
      ) : exam.isError || !exam.data ? (
        <p role="alert" className="py-12 text-sm text-destructive">시험을 불러오지 못했어요.</p>
      ) : variant === 'paper' ? (
        <PaperSheet exam={exam.data} />
      ) : (
        <AnswerSheet exam={exam.data} />
      )}
    </main>
  )
}

function Sheet({ children }: { children: ReactNode }) {
  return (
    <article className="exam-sheet flex flex-col gap-5 border border-border bg-white text-[#1d1d1f] shadow-sm">
      {children}
    </article>
  )
}

const totalOf = (exam: ExamWithQuestions) => exam.questions.reduce((sum, q) => sum + q.points, 0)

function PaperSheet({ exam }: { exam: ExamWithQuestions }) {
  return (
    <Sheet>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#1d1d1f] pb-3">
        <div className="grid gap-1.5">
          <img src={logoUrl} alt="Blueward" className="h-4 w-auto justify-self-start" />
          <h1 className="text-[22px] leading-7 font-bold">{exam.title}</h1>
          <p className="text-[10pt] text-[#515154]">
            {DIFFICULTY_LABEL[exam.difficulty]} · {exam.questions.length}문항 · {totalOf(exam)}점
          </p>
        </div>
        <dl className="grid grid-cols-[auto_44mm] items-end gap-x-2 gap-y-3 text-[10pt]">
          <dt>이름</dt>
          <dd className="h-6 border-b border-[#1d1d1f]" />
          <dt>날짜</dt>
          <dd className="h-6 border-b border-[#1d1d1f]" />
        </dl>
      </header>

      <ol className="grid gap-6">
        {exam.questions.map((q, i) => (
          // 시험지에는 prompt와 배점만 넣는다(model_answer·rubric 없음)
          <li key={q.id} className="exam-question grid gap-2">
            {/* 문제에는 코드가 섞이므로 고정폭 글꼴과 줄바꿈 유지. 배점은 코드 끝에 붙지 않게 오른쪽 칸에 둔다 */}
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-semibold">{i + 1}.</span>
              <p className="min-w-0 flex-1 font-mono text-[10.5pt] leading-[1.6] whitespace-pre-wrap">{q.prompt}</p>
              <span className="shrink-0 text-[10pt] text-[#515154]">({q.points}점)</span>
            </div>
            <div aria-hidden className="min-h-[38mm] rounded-md border border-dashed border-[#d2d2d7]" />
          </li>
        ))}
      </ol>

      <footer className="mt-auto border-t border-[#e3e3e8] pt-2 text-[9pt] text-[#6e6e73]">{FOOTER}</footer>
    </Sheet>
  )
}

function AnswerSheet({ exam }: { exam: ExamWithQuestions }) {
  return (
    <Sheet>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#1d1d1f] pb-3">
        <div className="grid gap-1.5">
          <img src={logoUrl} alt="Blueward" className="h-4 w-auto justify-self-start" />
          <h1 className="text-[22px] leading-7 font-bold">{exam.title} · 답안지</h1>
          <p className="text-[10pt] font-semibold text-st-rework-fg">채점자용 · 신입에게 배포하지 마세요</p>
        </div>
        <p className="text-[11pt] font-semibold">총 {totalOf(exam)}점</p>
      </header>

      <ol className="grid gap-5">
        {exam.questions.map((q, i) => (
          <li key={q.id} className="exam-question grid grid-cols-[28px_1fr] gap-3 border-b border-[#e3e3e8] pb-4">
            <span className="grid size-7 place-items-center rounded-full bg-[#e7eef8] text-[10pt] font-bold text-[#06479a]">{i + 1}</span>
            <div className="grid gap-2">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-mono text-[10.5pt] leading-[1.6] whitespace-pre-wrap">{q.prompt}</p>
                <span className="shrink-0 text-[10pt] text-[#515154]">{q.points}점</span>
              </div>
              <div className="grid gap-1 rounded-md bg-[#f5f5f7] p-3 text-[11pt]">
                <span className="text-[9pt] font-semibold text-[#515154]">모범 답안</span>
                <p className="font-mono text-[10.5pt] whitespace-pre-wrap">{q.model_answer}</p>
              </div>
              <div className="grid gap-1 text-[10.5pt]">
                <span className="text-[9pt] font-semibold text-[#515154]">채점 기준</span>
                <p className="whitespace-pre-wrap">{q.rubric}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <footer className="mt-auto border-t border-[#e3e3e8] pt-2 text-[9pt] text-[#6e6e73]">
        {FOOTER} · AI가 만든 답안은 확정 전 검토가 필요합니다
      </footer>
    </Sheet>
  )
}
