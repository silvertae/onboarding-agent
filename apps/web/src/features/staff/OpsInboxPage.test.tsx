import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { TaskView } from '@/lib/tasks'
import { HIRES, makeTask, TEAM_ID } from './testFixtures'

const { actions, state } = vi.hoisted(() => ({
  actions: {
    submit: vi.fn(),
    markNa: vi.fn(),
    confirm: vi.fn(async () => {}),
    requestRework: vi.fn(async () => {}),
    recordAssessment: vi.fn(),
  },
  state: { tasks: [] as unknown[] },
}))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({
    profile: { id: 'ops-ga', role: 'ops_staff', department: 'ga', team_id: null, full_name: '가상 지은' },
    session: { user: { id: 'ops-ga' } },
    loading: false,
  }),
}))
vi.mock('@/lib/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tasks')>()),
  useVisibleTasks: () => ({ data: state.tasks, isLoading: false, isError: false }),
  useTaskActions: () => actions,
}))
vi.mock('./hires', () => ({ useHires: () => ({ data: HIRES, isLoading: false, isError: false }) }))

import { OpsInboxPage } from './OpsInboxPage'

const businessCard = makeTask({
  id: 'ga-07',
  new_hire_id: 'h1',
  status: 'submitted',
  submitted_at: '2026-11-17T04:05:00Z',
  result: { english_name: 'KIM HANEUL' },
  template: {
    code: 'GA-07',
    title: '명함 신청',
    kind: 'input',
    form_schema: { fields: [{ key: 'english_name', label: '영문 이름', type: 'text', required: true }] },
  },
})
const welcomeKit = makeTask({
  id: 'ga-08',
  new_hire_id: 'h2',
  status: 'submitted',
  submitted_at: '2026-11-17T00:41:00Z',
  template: { code: 'GA-08', title: '웰컴키트 수령' },
})
const welfareCard = makeTask({ id: 'ga-06', new_hire_id: 'h1', status: 'rework', rework_reason: '앱 화면 확인 필요', template: { title: '복지카드 수령·앱 확인' } })
const fingerprint = makeTask({ id: 'ga-02', new_hire_id: 'h2', status: 'todo', template: { code: 'GA-02', title: '지문 등록·출입 확인', completion_mode: 'staff_only' } })
const points = makeTask({ id: 'ga-04', new_hire_id: 'h1', status: 'done', template: { title: '복지포인트 등록', completion_mode: 'staff_only' } })
// RLS가 막지만, 화면도 자기 부서 과제만 보여야 한다.
const hrTask = makeTask({ id: 'hr-02', new_hire_id: 'h1', status: 'submitted', template: { department: 'hr', title: '근태·결재 시스템 가입' } })
const teamTask = makeTask({ id: 'ai-04', new_hire_id: 'h1', status: 'submitted', template: { department: null, team_id: TEAM_ID, title: '기술스택·경력 조사' } })

const ALL: TaskView[] = [businessCard, welcomeKit, welfareCard, fingerprint, points, hrTask, teamTask]

function renderPage(tasks: TaskView[] = ALL) {
  state.tasks = tasks
  return render(
    <MemoryRouter>
      <OpsInboxPage />
    </MemoryRouter>,
  )
}

function bodyRows() {
  const table = screen.getByRole('table', { name: '업무 목록' })
  return within(table).getAllByRole('row').slice(1)
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear())
})

describe('OpsInboxPage (S9)', () => {
  it('제목은 내 부서 업무함이다', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '총무팀 업무함' })).toBeInTheDocument()
  })

  it('요약의 확인 대기 수는 내 부서 submitted 과제 수다', () => {
    renderPage()
    const summary = screen.getByRole('region', { name: '확인 대기' })
    expect(within(summary).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '보완 요청 중' })).getByText('1')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '진행 중 입사자' })).getByText('2')).toBeInTheDocument()
  })

  it('탭: 확인 대기는 submitted만, 내가 처리할 일은 staff_only·todo만, 전체는 내 부서 전부', async () => {
    const user = userEvent.setup()
    renderPage()

    // 기본 탭 = 확인 대기
    expect(bodyRows()).toHaveLength(2)
    expect(screen.getByRole('table', { name: '업무 목록' })).toHaveTextContent('명함 신청')
    expect(screen.getByRole('table', { name: '업무 목록' })).toHaveTextContent('웰컴키트 수령')

    await user.click(screen.getByRole('tab', { name: /내가 처리할 일/ }))
    expect(bodyRows()).toHaveLength(1)
    expect(bodyRows()[0]).toHaveTextContent('지문 등록·출입 확인')

    await user.click(screen.getByRole('tab', { name: /전체/ }))
    expect(bodyRows()).toHaveLength(5)
    const table = screen.getByRole('table', { name: '업무 목록' })
    expect(table).not.toHaveTextContent('근태·결재 시스템 가입')
    expect(table).not.toHaveTextContent('기술스택·경력 조사')
  })

  it('탭은 ←/→로 옮겨 가고, 선택한 탭이 업무 표가 든 탭 패널을 가리킨다', async () => {
    const user = userEvent.setup()
    renderPage()
    const submitted = screen.getByRole('tab', { name: /확인 대기/ })
    const mine = screen.getByRole('tab', { name: /내가 처리할 일/ })
    expect(mine).toHaveAttribute('tabindex', '-1')

    await user.click(submitted)
    await user.keyboard('{ArrowRight}')

    expect(mine).toHaveFocus()
    expect(mine).toHaveAttribute('aria-selected', 'true')
    const panel = screen.getByRole('tabpanel')
    expect(mine).toHaveAttribute('aria-controls', panel.id)
    expect(within(panel).getByRole('table', { name: '업무 목록' })).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(1)
  })

  it('행을 누르면 오른쪽 패널에 제출 내용(result)을 보여 준다', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('row', { name: /김하늘.*명함 신청/ }))

    const panel = screen.getByRole('complementary', { name: '과제 상세' })
    expect(within(panel).getByText('영문 이름')).toBeInTheDocument()
    expect(within(panel).getAllByText('KIM HANEUL').length).toBeGreaterThan(0)
  })

  it('"확인"을 누르면 confirm(id)', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('row', { name: /김하늘.*명함 신청/ }))

    const panel = screen.getByRole('complementary', { name: '과제 상세' })
    await user.click(within(panel).getByRole('button', { name: /확인 \(완료 처리\)/ }))

    expect(actions.confirm).toHaveBeenCalledWith('ga-07')
  })

  it('보완 요청은 사유가 비어 있거나 공백뿐이면 비활성, 입력하면 requestRework(id, reason)', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('row', { name: /김하늘.*명함 신청/ }))

    const panel = screen.getByRole('complementary', { name: '과제 상세' })
    const send = within(panel).getByRole('button', { name: '보완 요청' })
    expect(send).toBeDisabled()

    const reason = within(panel).getByLabelText(/보완 요청 사유/)
    await user.type(reason, '   ')
    expect(send).toBeDisabled()

    await user.clear(reason)
    await user.type(reason, '여권과 철자가 달라요')
    expect(send).toBeEnabled()
    await user.click(send)

    expect(actions.requestRework).toHaveBeenCalledWith('ga-07', '여권과 철자가 달라요')
    expect(actions.confirm).not.toHaveBeenCalled()
  })

  it('staff_only·todo 과제는 "완료 처리" 버튼으로 confirm(id)', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: /내가 처리할 일/ }))

    await user.click(within(bodyRows()[0]).getByRole('button', { name: '완료 처리' }))

    expect(actions.confirm).toHaveBeenCalledWith('ga-02')
  })

  it('입사자 필터를 고르면 그 입사자 과제만 보인다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: /전체/ }))

    await user.selectOptions(screen.getByLabelText('입사자'), 'h2')

    const rows = bodyRows()
    expect(rows).toHaveLength(2)
    rows.forEach((row) => expect(row).toHaveTextContent('정민서'))
  })

  it('보여 줄 과제가 없으면 빈 상태 문구', () => {
    renderPage([points])
    expect(screen.getByText('확인 대기 중인 과제가 없어요')).toBeInTheDocument()
  })

  // 선택 행 배경을 tr에 칠하면 칸 경계(소수점 너비)에 흰 세로줄이 생긴다. 칸(td)에 칠하고 1px 그림자로 이음새를 덮는다.
  it('선택한 행은 aria-selected이고 배경을 칸(td)에 칠한다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(bodyRows()[0])
    const row = bodyRows()[0]
    expect(row).toHaveAttribute('aria-selected', 'true')
    expect(row).toHaveClass('[&>td]:bg-accent')
    expect(row).not.toHaveClass('bg-accent')
    expect(bodyRows()[1]).toHaveAttribute('aria-selected', 'false')
    expect(bodyRows()[1]).not.toHaveClass('[&>td]:bg-accent')
  })
})
