import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'
import { AgentError } from '@/lib/agent'
import { DbError } from '@/lib/errors'
import type { DraftQuestion, ExamWithQuestions } from './exams'

const { agentFetch, saveExam, signOut, state } = vi.hoisted(() => ({
  agentFetch: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  saveExam: vi.fn(async (_e: unknown) => 'e1'),
  state: { exam: undefined as unknown },
}))

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut } } }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({
    profile: { id: 'trainer', org_id: 'org-1', role: 'team_trainer', department: null, team_id: 'team-ai', full_name: '가상 서준' },
    session: { user: { id: 'trainer' } },
    loading: false,
  }),
}))
vi.mock('@/lib/agent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent')>()),
  agentFetch,
}))
vi.mock('@/features/staff/hires', () => ({
  useHires: () => ({
    data: [{ id: 'h1', full_name: '가상 하늘', job_title: '사원', email: 'h1@demo.test', team_id: 'team-ai', hire_date: '2026-11-17', team: { name: 'AI팀' } }],
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('./exams', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./exams')>()),
  useExams: () => ({ data: [], isLoading: false, isError: false }),
  useExam: () => ({ data: state.exam, isLoading: false, isError: false }),
  saveExam,
}))

import { ExamEditorPage } from './ExamEditorPage'

const q = (i: number): DraftQuestion => ({ prompt: `문제 ${i}`, model_answer: `답 ${i}`, rubric: `기준 ${i}`, points: 10 * i })

function examWith(questions: DraftQuestion[]): ExamWithQuestions {
  return {
    id: 'e1', org_id: 'org-1', team_id: 'team-ai', created_by: 'trainer', created_at: '2026-11-17T00:00:00Z',
    title: 'JS 기본기', topic: 'JavaScript 기초', difficulty: 'beginner', status: 'draft',
    questions: questions.map((x, i) => ({ ...x, id: `q${i}`, exam_id: 'e1', org_id: 'org-1', position: i })),
  }
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function Where() {
  const loc = useLocation()
  return <p data-testid="location">{loc.pathname + loc.search}</p>
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/team/exams/:id" element={<><ExamEditorPage /><Where /></>} />
          <Route path="/team/exams/:id/print" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const cards = () => screen.queryAllByRole('article')
const card = (n: number) => screen.getByRole('article', { name: `${n}번 문항` })
function savedQuestions(): DraftQuestion[] {
  const last = saveExam.mock.calls.at(-1)
  if (!last) throw new Error('saveExam이 호출되지 않았습니다')
  return (last[0] as { questions: DraftQuestion[] }).questions
}

beforeEach(() => {
  agentFetch.mockReset()
  saveExam.mockClear()
  signOut.mockClear()
  state.exam = undefined
})

describe('ExamEditorPage', () => {
  it('주제가 비어 있거나 공백이면 "초안 만들기"가 비활성이다', async () => {
    renderAt('/team/exams/new')
    const button = screen.getByRole('button', { name: '초안 만들기' })
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText('주제'), '   ')
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText('주제'), 'JavaScript')
    expect(button).toBeEnabled()
  })

  it('생성에 성공하면 문항 카드 N개와 검토 안내 문구가 보이고, ?hire의 신입이 참고 자료로 전달된다', async () => {
    agentFetch.mockResolvedValueOnce(ok({ title: 'JS 기초 시험', questions: [q(1), q(2), q(3)] }))
    renderAt('/team/exams/new?hire=h1')
    expect(screen.getByLabelText('참고할 신입')).toHaveValue('h1')
    await userEvent.type(screen.getByLabelText('주제'), 'JavaScript 기초')
    await userEvent.clear(screen.getByLabelText('문항 수'))
    await userEvent.type(screen.getByLabelText('문항 수'), '3')
    await userEvent.click(screen.getByRole('button', { name: '초안 만들기' }))

    expect(await screen.findAllByRole('article')).toHaveLength(3)
    expect(screen.getByText('AI가 만든 답안은 확정 전 검토가 필요합니다.')).toBeInTheDocument()
    expect(screen.getByLabelText('시험 제목')).toHaveValue('JS 기초 시험')
    expect(agentFetch).toHaveBeenCalledWith('/exams/generate', {
      topic: 'JavaScript 기초', difficulty: 'beginner', question_count: 3, new_hire_id: 'h1',
    })
  })

  it('생성이 502로 실패하면 오류 안내와 "다시 시도"를 보이고 기존 문항 카드는 그대로 둔다', async () => {
    state.exam = examWith([q(1), q(2)])
    agentFetch.mockRejectedValueOnce(new AgentError(502, '시험 초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'))
    renderAt('/team/exams/e1')
    expect(cards()).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: '초안 다시 만들기' }))
    expect(await screen.findByText('시험 초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
    expect(cards()).toHaveLength(2)
    expect(within(card(1)).getByText('문제 1')).toBeInTheDocument()

    agentFetch.mockResolvedValueOnce(ok({ title: 't', questions: [q(5)] }))
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(agentFetch).toHaveBeenCalledTimes(2)
  })

  it('생성이 429면 한도 안내를 보이고 다시 시도 버튼 없이 기존 문항을 유지한다', async () => {
    state.exam = examWith([q(1), q(2)])
    agentFetch.mockRejectedValueOnce(new AgentError(429, '오늘 사용 한도를 넘었어요'))
    renderAt('/team/exams/e1')
    await userEvent.click(screen.getByRole('button', { name: '초안 다시 만들기' }))
    expect(await screen.findByText(/오늘 사용 한도를 넘었어요/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
    expect(cards()).toHaveLength(2)
  })

  it('문항을 수정하면 저장 시 수정한 값이 saveExam에 전달된다', async () => {
    state.exam = examWith([q(1), q(2)])
    renderAt('/team/exams/e1')
    await userEvent.click(within(card(2)).getByRole('button', { name: '수정' }))
    const prompt = within(card(2)).getByLabelText('문제')
    await userEvent.clear(prompt)
    await userEvent.type(prompt, '고친 문제')
    const points = within(card(2)).getByLabelText('배점')
    await userEvent.clear(points)
    await userEvent.type(points, '35')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(saveExam).toHaveBeenCalledTimes(1))
    expect(saveExam.mock.calls[0][0]).toMatchObject({ id: 'e1', title: 'JS 기본기', topic: 'JavaScript 기초', difficulty: 'beginner', status: 'draft' })
    expect(savedQuestions()).toEqual([q(1), { ...q(2), prompt: '고친 문제', points: 35 }])
  })

  it('"다시 만들기"는 나머지 문항 prompt를 existing_prompts로 보내고 그 카드만 바꾼다', async () => {
    state.exam = examWith([q(1), q(2), q(3)])
    agentFetch.mockResolvedValueOnce(ok(q(9)))
    renderAt('/team/exams/e1')
    await userEvent.click(within(card(2)).getByRole('button', { name: '다시 만들기' }))
    await userEvent.type(within(card(2)).getByLabelText('지시 한 줄'), '배열 위주로')
    await userEvent.click(within(card(2)).getByRole('button', { name: '새 문항 만들기' }))

    await waitFor(() => expect(within(card(2)).getByText('문제 9')).toBeInTheDocument())
    expect(agentFetch).toHaveBeenCalledWith('/exams/regenerate-question', {
      topic: 'JavaScript 기초', difficulty: 'beginner', existing_prompts: ['문제 1', '문제 3'], instruction: '배열 위주로',
    })
    expect(within(card(1)).getByText('문제 1')).toBeInTheDocument()
    expect(within(card(3)).getByText('문제 3')).toBeInTheDocument()
  })

  it('"다시 만들기"가 실패하면 그 카드에 안내를 보이고 기존 문항을 유지한다', async () => {
    state.exam = examWith([q(1), q(2)])
    agentFetch.mockRejectedValueOnce(new AgentError(502, '시험 초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'))
    renderAt('/team/exams/e1')
    await userEvent.click(within(card(1)).getByRole('button', { name: '다시 만들기' }))
    await userEvent.click(within(card(1)).getByRole('button', { name: '새 문항 만들기' }))
    expect(await within(card(1)).findByText('문항을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
    expect(within(card(1)).getByText('문제 1')).toBeInTheDocument()
  })

  it('삭제·순서 변경은 저장 시 순서에 반영된다', async () => {
    state.exam = examWith([q(1), q(2), q(3)])
    renderAt('/team/exams/e1')
    await userEvent.click(within(card(1)).getByRole('button', { name: '삭제' }))
    expect(cards()).toHaveLength(2)
    // 남은 순서: 문제 2, 문제 3 → 문제 3을 위로
    await userEvent.click(within(card(2)).getByRole('button', { name: '위로' }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(saveExam).toHaveBeenCalledTimes(1))
    expect(savedQuestions().map((x) => x.prompt)).toEqual(['문제 3', '문제 2'])
  })

  it('문항 추가는 빈 카드를 편집 상태로 연다', async () => {
    state.exam = examWith([q(1)])
    renderAt('/team/exams/e1')
    await userEvent.click(screen.getByRole('button', { name: '문항 추가' }))
    expect(cards()).toHaveLength(2)
    expect(within(card(2)).getByLabelText('문제')).toHaveValue('')
  })

  it('문항이 0개면 확정·인쇄 버튼이 비활성이다', async () => {
    renderAt('/team/exams/new')
    expect(screen.getByRole('button', { name: '확정' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '시험지 인쇄' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '답안지 인쇄' })).toBeDisabled()
  })

  it('빈 칸이 있는 문항이 있으면 저장하지 않고 안내한다', async () => {
    state.exam = examWith([q(1)])
    renderAt('/team/exams/e1')
    await userEvent.click(screen.getByRole('button', { name: '문항 추가' }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText(/비어 있는 칸이 있어요/)).toBeInTheDocument()
    expect(saveExam).not.toHaveBeenCalled()
  })

  it('확정하면 status final로 저장한다', async () => {
    state.exam = examWith([q(1)])
    renderAt('/team/exams/e1')
    await userEvent.click(screen.getByRole('button', { name: '확정' }))
    await waitFor(() => expect(saveExam).toHaveBeenCalledTimes(1))
    expect(saveExam.mock.calls[0][0]).toMatchObject({ id: 'e1', status: 'final' })
  })

  it('저장하지 않은 변경이 있으면 인쇄 전에 저장하고 인쇄 화면으로 간다', async () => {
    state.exam = examWith([q(1), q(2)])
    renderAt('/team/exams/e1')
    await userEvent.click(within(card(1)).getByRole('button', { name: '삭제' }))
    await userEvent.click(screen.getByRole('button', { name: '답안지 인쇄' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/team/exams/e1/print?variant=answers'))
    expect(saveExam).toHaveBeenCalledTimes(1)
    expect(savedQuestions()).toEqual([q(2)])
  })

  it('변경이 없으면 저장하지 않고 바로 시험지 인쇄 화면으로 간다', async () => {
    state.exam = examWith([q(1)])
    renderAt('/team/exams/e1')
    await userEvent.click(screen.getByRole('button', { name: '시험지 인쇄' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/team/exams/e1/print?variant=paper')
    expect(saveExam).not.toHaveBeenCalled()
  })

  it('새 시험을 처음 저장하면 만든 id의 주소로 바뀐다', async () => {
    agentFetch.mockResolvedValueOnce(ok({ title: 'JS 기초 시험', questions: [q(1)] }))
    saveExam.mockResolvedValueOnce('e-new')
    renderAt('/team/exams/new')
    await userEvent.type(screen.getByLabelText('주제'), 'JavaScript 기초')
    await userEvent.click(screen.getByRole('button', { name: '초안 만들기' }))
    await screen.findAllByRole('article')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/team/exams/e-new'))
    expect(saveExam.mock.calls[0][0]).toMatchObject({ id: undefined, title: 'JS 기초 시험', status: 'draft' })
  })

  it('저장이 인증 오류(401·JWT 만료)로 실패하면 로그아웃한다', async () => {
    state.exam = examWith([q(1)])
    saveExam.mockRejectedValueOnce(new DbError(401, 'JWT expired', 'PGRST301'))
    renderAt('/team/exams/e1')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
  })

  it('저장이 인증 외 오류로 실패하면 안내만 하고 로그아웃하지 않는다', async () => {
    state.exam = examWith([q(1)])
    saveExam.mockRejectedValueOnce(new DbError(500, 'boom'))
    renderAt('/team/exams/e1')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('저장하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('문항을 다시 만드는 동안에는 저장·확정·인쇄를 막는다', async () => {
    state.exam = examWith([q(1), q(2)])
    let finish: (r: Response) => void = () => {}
    agentFetch.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve }))
    renderAt('/team/exams/e1')
    await userEvent.click(within(card(1)).getByRole('button', { name: '다시 만들기' }))
    await userEvent.click(within(card(1)).getByRole('button', { name: '새 문항 만들기' }))
    for (const name of ['저장', '확정', '시험지 인쇄', '답안지 인쇄']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    finish(ok(q(9)))
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled())
    expect(within(card(1)).getByText('문제 9')).toBeInTheDocument()
  })
})
