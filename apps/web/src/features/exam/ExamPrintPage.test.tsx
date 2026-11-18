import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import type { ExamWithQuestions } from './exams'

const { state } = vi.hoisted(() => ({
  state: { exam: undefined as unknown, isLoading: false, isError: false },
}))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('./exams', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./exams')>()),
  useExam: () => ({ data: state.exam, isLoading: state.isLoading, isError: state.isError }),
}))

import { ExamPrintPage } from './ExamPrintPage'

const QUESTIONS = [
  { prompt: '다음 코드의 출력 순서를 쓰시오.', model_answer: 'A → D → C → B', rubric: '순서 정확 20점', points: 20 },
  { prompt: 'const와 let의 차이를 설명하시오.', model_answer: '둘 다 블록 스코프다', rubric: '블록 스코프 8점', points: 30 },
]

const exam: ExamWithQuestions = {
  id: 'e1', org_id: 'org-1', team_id: 'team-ai', created_by: 'trainer', created_at: '2026-11-17T00:00:00Z',
  title: 'JS 기본기 — 비동기·스코프', topic: 'JavaScript', difficulty: 'beginner', status: 'final',
  questions: QUESTIONS.map((q, i) => ({ ...q, id: `q${i}`, exam_id: 'e1', org_id: 'org-1', position: i, bank_item_id: null })),
}

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/team/exams/e1/print${search}`]}>
      <Routes>
        <Route path="/team/exams/:id/print" element={<ExamPrintPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.exam = exam
  state.isLoading = false
  state.isError = false
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ExamPrintPage', () => {
  it('variant=paper: 모든 문항과 배점을 보이고, 모범 답안·채점 기준 문자열은 DOM에 없다', () => {
    const { container } = renderAt('?variant=paper')
    expect(screen.getByRole('heading', { name: 'JS 기본기 — 비동기·스코프' })).toBeInTheDocument()
    for (const q of QUESTIONS) {
      expect(screen.getByText(q.prompt)).toBeInTheDocument()
      expect(container.innerHTML).not.toContain(q.model_answer)
      expect(container.innerHTML).not.toContain(q.rubric)
    }
    expect(screen.getByText('(20점)')).toBeInTheDocument()
    expect(screen.getByText('(30점)')).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('모범 답안')
    expect(container.innerHTML).not.toContain('채점 기준')
  })

  it('문제는 코드 정렬이 유지되는 고정폭 글꼴이고, 배점은 문제와 다른 블록에 있다(코드 끝에 붙지 않음)', () => {
    renderAt('?variant=paper')
    const prompt = screen.getByText(QUESTIONS[0].prompt)
    expect(prompt.className).toContain('font-mono')
    expect(prompt.className).toContain('whitespace-pre-wrap')
    expect(prompt.closest('p')?.textContent).not.toContain('(20점)')
  })

  it('답안지의 문제도 고정폭 글꼴이다', () => {
    renderAt('?variant=answers')
    expect(screen.getByText(QUESTIONS[0].prompt).className).toContain('font-mono')
  })

  it('variant가 없으면 시험지(paper)로 보인다', () => {
    const { container } = renderAt('')
    expect(screen.getByText(QUESTIONS[0].prompt)).toBeInTheDocument()
    expect(container.innerHTML).not.toContain(QUESTIONS[0].model_answer)
  })

  it('알 수 없는 variant도 답을 숨긴 시험지로 보인다', () => {
    const { container } = renderAt('?variant=whatever')
    expect(container.innerHTML).not.toContain(QUESTIONS[0].model_answer)
    expect(container.innerHTML).not.toContain(QUESTIONS[0].rubric)
  })

  it('시험지에는 이름·날짜 칸이 있다', () => {
    renderAt('?variant=paper')
    expect(screen.getByText('이름')).toBeInTheDocument()
    expect(screen.getByText('날짜')).toBeInTheDocument()
  })

  it('variant=answers: 문제, 모범 답안, 채점 기준, 배점을 모두 보인다', () => {
    renderAt('?variant=answers')
    expect(screen.getByRole('heading', { name: /JS 기본기 — 비동기·스코프 · 답안지/ })).toBeInTheDocument()
    expect(screen.getByText(/신입에게 배포하지 마세요/)).toBeInTheDocument()
    for (const q of QUESTIONS) {
      expect(screen.getByText(q.prompt)).toBeInTheDocument()
      expect(screen.getByText(q.model_answer)).toBeInTheDocument()
      expect(screen.getByText(q.rubric)).toBeInTheDocument()
    }
    expect(screen.getByText('총 50점')).toBeInTheDocument()
  })

  it('"인쇄 / PDF로 저장"을 누르면 window.print를 호출한다', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    renderAt('?variant=paper')
    await userEvent.click(screen.getByRole('button', { name: '인쇄 / PDF로 저장' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('시험지·답안지 전환 링크와 편집기로 돌아가는 링크가 있다', () => {
    renderAt('?variant=paper')
    expect(screen.getByRole('link', { name: '답안지' })).toHaveAttribute('href', '/team/exams/e1/print?variant=answers')
    expect(screen.getByRole('link', { name: '편집기로' })).toHaveAttribute('href', '/team/exams/e1')
  })

  it('불러오지 못하면 오류 안내를 보인다', () => {
    state.exam = undefined
    state.isError = true
    renderAt('?variant=answers')
    expect(screen.getByRole('alert')).toHaveTextContent('시험을 불러오지 못했어요')
  })
})
