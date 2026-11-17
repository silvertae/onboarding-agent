import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { TaskView } from '@/lib/tasks'
import { HIRES, makeTask, TEAM_ID } from './testFixtures'

const { state } = vi.hoisted(() => ({
  state: { tasks: [] as unknown[], unanswered: [] as unknown[] | undefined, unansweredStatus: 'success' as 'success' | 'error' | 'pending' },
}))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({
    profile: { id: 'trainer', role: 'team_trainer', department: null, team_id: 'team-ai', full_name: '가상 서준' },
    session: { user: { id: 'trainer' } },
    loading: false,
  }),
}))
vi.mock('@/lib/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tasks')>()),
  useVisibleTasks: () => ({ data: state.tasks, isLoading: false, isError: false }),
  useTaskActions: () => ({}),
}))
vi.mock('./hires', () => ({ useHires: () => ({ data: HIRES, isLoading: false, isError: false }) }))
vi.mock('./knowledge', () => ({
  useUnanswered: () => ({
    data: state.unanswered,
    isLoading: state.unansweredStatus === 'pending',
    isError: state.unansweredStatus === 'error',
    isSuccess: state.unansweredStatus === 'success',
  }),
}))

import { TeamOverviewPage } from './TeamOverviewPage'

const team = (overrides: Parameters<typeof makeTask>[0]) =>
  makeTask({ ...overrides, template: { department: null, team_id: TEAM_ID, ...overrides?.template } })

const tasks: TaskView[] = [
  team({ new_hire_id: 'h1', status: 'done' }),
  team({ new_hire_id: 'h1', status: 'na' }),
  team({ new_hire_id: 'h1', status: 'submitted' }),
  team({ new_hire_id: 'h1', status: 'todo' }),
  team({
    new_hire_id: 'h1',
    status: 'todo',
    scheduled_at: '2026-11-25T01:00:00Z',
    template: { title: 'JS 자습 후 기본기 테스트', kind: 'assessment', completion_mode: 'staff_only', sort_order: 400 },
  }),
  team({
    new_hire_id: 'h1',
    status: 'todo',
    scheduled_at: '2026-11-20T05:00:00Z',
    template: { title: '간단 코딩테스트', kind: 'assessment', completion_mode: 'staff_only', sort_order: 350 },
  }),
  // 경영지원 과제는 진행률·확인 대기에서 빠진다.
  makeTask({ new_hire_id: 'h1', status: 'submitted', template: { department: 'ga', title: '명함 신청' } }),
  team({ new_hire_id: 'h2', status: 'done', template: { title: '간단 코딩테스트', kind: 'assessment', completion_mode: 'staff_only' }, assessment_result: 'pass' }),
]

function renderPage(unanswered: unknown[] | undefined = [], unansweredStatus: 'success' | 'error' | 'pending' = 'success') {
  state.tasks = tasks
  state.unanswered = unanswered
  state.unansweredStatus = unansweredStatus
  return render(
    <MemoryRouter>
      <TeamOverviewPage />
    </MemoryRouter>,
  )
}

describe('TeamOverviewPage (S5)', () => {
  it('신입 카드에 팀 과제 진행률과 확인 대기 수를 보여 준다', () => {
    renderPage()
    const card = screen.getByRole('link', { name: /김하늘/ })
    expect(within(card).getByText(/2 \/ 6/)).toBeInTheDocument()
    expect(within(card).getByText('확인 대기 1')).toBeInTheDocument()
    expect(card).not.toHaveTextContent('명함 신청')
  })

  it('예정된 평가를 가까운 일정 순으로 보여 준다', () => {
    renderPage()
    const card = screen.getByRole('link', { name: /김하늘/ })
    const items = within(within(card).getByRole('list', { name: '예정된 평가' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('간단 코딩테스트')
    expect(items[0]).toHaveTextContent('11/20 (금) 14:00')
    expect(items[1]).toHaveTextContent('JS 자습 후 기본기 테스트')
  })

  it('평가 결과가 있으면 결과를 보여 주고, 카드는 신입 상세로 연결된다', () => {
    renderPage()
    const card = screen.getByRole('link', { name: /정민서/ })
    expect(within(card).getByText('통과')).toBeInTheDocument()
    expect(card).toHaveAttribute('href', '/team/hires/h2')
  })

  it('미답변 질문이 있으면 상단에 수를 보여 주고 지식 관리로 연결한다', () => {
    renderPage([{ id: 'u1' }, { id: 'u2' }])
    expect(screen.getByText('미답변 질문 2건')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '답 등록하기' })).toHaveAttribute('href', '/knowledge')
  })

  it('미답변 질문이 없으면 강조 배너 대신 "미답변 질문 없음"을 흐리게 보인다', () => {
    renderPage([])
    expect(screen.getByText('미답변 질문 없음')).toBeInTheDocument()
    expect(screen.queryByText(/미답변 질문 \d+건/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '답 등록하기' })).not.toBeInTheDocument()
  })

  it('미답변 조회가 실패하거나 진행 중이면 "미답변 질문 없음"이라고 잘못 안내하지 않는다', () => {
    renderPage(undefined, 'error')
    expect(screen.queryByText('미답변 질문 없음')).not.toBeInTheDocument()
  })

  it('미답변 조회가 진행 중이면 빈 상태 문구를 보이지 않는다', () => {
    renderPage(undefined, 'pending')
    expect(screen.queryByText('미답변 질문 없음')).not.toBeInTheDocument()
  })

  it('확인 대기가 없는 신입 카드에도 "확인 대기 0"을 흐리게 보인다', () => {
    renderPage()
    const card = screen.getByRole('link', { name: /정민서/ })
    expect(within(card).getByText('확인 대기 0')).toBeInTheDocument()
  })
})
