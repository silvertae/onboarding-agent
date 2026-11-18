import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'
import type { TaskView } from '@/lib/tasks'
import { HIRES, makeTask, TEAM_ID } from './testFixtures'

const { actions, state } = vi.hoisted(() => ({
  actions: {
    submit: vi.fn(),
    markNa: vi.fn(),
    confirm: vi.fn(async () => {}),
    requestRework: vi.fn(async () => {}),
    recordAssessment: vi.fn(async () => {}),
  },
  state: { tasks: [] as unknown[], filter: undefined as unknown },
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
  useVisibleTasks: (filter?: unknown) => {
    state.filter = filter
    return { data: state.tasks, isLoading: false, isError: false }
  },
  useTaskActions: () => actions,
}))
vi.mock('./hires', () => ({ useHires: () => ({ data: HIRES, isLoading: false, isError: false }) }))

import { HireDetailPage } from './HireDetailPage'

const team = (overrides: Parameters<typeof makeTask>[0]) =>
  makeTask({ ...overrides, template: { department: null, team_id: TEAM_ID, ...overrides?.template } })

const survey = (status: TaskView['status'], result: TaskView['result'] = null) =>
  team({
    id: 'ai-04',
    status,
    result,
    template: {
      code: 'AI-04',
      title: '기술스택·경력 조사',
      kind: 'input',
      completion_mode: 'self',
      form_schema: {
        fields: [
          { key: 'stacks', label: '사용해 본 기술스택', type: 'text', required: true },
          { key: 'experience', label: '프로젝트 경험', type: 'textarea', required: true },
          { key: 'career', label: '경력 요약', type: 'textarea', required: false },
        ],
      },
    },
  })
const btp = team({
  id: 'ai-09',
  status: 'todo',
  template: { code: 'AI-09', title: 'BTP 개발 초기 세팅', kind: 'setup', completion_mode: 'self', checklist: ['SAP 계정', 'cf cli', 'mbt', 'cds cli'] },
})
const codingTest = team({
  id: 'ai-05',
  status: 'todo',
  template: { code: 'AI-05', title: '간단 코딩테스트', kind: 'assessment', completion_mode: 'staff_only' },
})
const jsTest = team({
  id: 'ai-10',
  status: 'blocked',
  template: { code: 'AI-10', title: 'JS 자습 후 기본기 테스트', kind: 'assessment', completion_mode: 'staff_only' },
})
const review = team({ id: 'ai-x', status: 'submitted', submitted_at: '2026-11-17T01:12:00Z', template: { title: '코드 리뷰 실습', completion_mode: 'confirm' } })
const opsTask = makeTask({ id: 'ga-07', status: 'submitted', template: { department: 'ga', title: '명함 신청' } })

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

function renderPage(tasks: TaskView[]) {
  state.tasks = tasks
  return render(
    <MemoryRouter initialEntries={['/team/hires/h1']}>
      <Routes>
        <Route path="/team/hires/:id" element={<HireDetailPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear())
})

describe('HireDetailPage (S6)', () => {
  it('URL의 신입 과제만 조회하고, 이름과 팀 과제 진행을 보여 준다', () => {
    renderPage([survey('done', { stacks: 'JavaScript' }), btp, codingTest, jsTest, review, opsTask])
    expect(state.filter).toEqual({ newHireId: 'h1' })
    expect(screen.getByRole('heading', { level: 1, name: '김하늘' })).toBeInTheDocument()
    expect(screen.getByText(/팀 과제 1 \/ 5/)).toBeInTheDocument()
  })

  it('경영지원 과제 제목이 화면에 없다', () => {
    renderPage([survey('todo'), btp, codingTest, jsTest, opsTask])
    expect(screen.queryByText('명함 신청')).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: '팀 과제' })).toHaveTextContent('BTP 개발 초기 세팅')
  })

  it('AI-04 제출 결과의 stacks·experience·career를 보여 준다', () => {
    renderPage([
      survey('done', { stacks: 'JavaScript, React', experience: '학부 연구실 웹 프론트엔드', career: '신입' }),
      btp,
    ])
    const card = screen.getByRole('region', { name: '기술스택·경력 조사 결과' })
    expect(within(card).getByText('JavaScript, React')).toBeInTheDocument()
    expect(within(card).getByText('학부 연구실 웹 프론트엔드')).toBeInTheDocument()
    expect(within(card).getByText('신입')).toBeInTheDocument()
  })

  it('AI-04 미제출이면 "아직 제출 전"', () => {
    renderPage([survey('todo'), btp])
    const card = screen.getByRole('region', { name: '기술스택·경력 조사 결과' })
    expect(within(card).getByText(/아직 제출 전/)).toBeInTheDocument()
  })

  it('AI-09 체크리스트 진행을 보여 준다', () => {
    renderPage([btp])
    const card = screen.getByRole('region', { name: 'BTP 세팅 체크리스트' })
    expect(within(card).getByText('0 / 4')).toBeInTheDocument()
    expect(within(card).getByText('cds cli')).toBeInTheDocument()
  })

  it('AI-09 완료면 체크리스트가 모두 끝난 것으로 보인다', () => {
    renderPage([{ ...btp, status: 'done', result: { checked: ['SAP 계정', 'cf cli', 'mbt', 'cds cli'] } }])
    const card = screen.getByRole('region', { name: 'BTP 세팅 체크리스트' })
    expect(within(card).getByText('4 / 4')).toBeInTheDocument()
    const bar = within(card).getByRole('progressbar', { name: '체크리스트 진행률' })
    expect(bar).toHaveAttribute('aria-valuenow', '4')
    expect(bar).toHaveAttribute('aria-valuemax', '4')
  })

  it('평가 카드: 일정만 저장하면 recordAssessment(id, {result:null, ...})', async () => {
    const user = userEvent.setup()
    renderPage([codingTest, jsTest])
    const card = screen.getByRole('region', { name: '간단 코딩테스트' })

    fireEvent.change(within(card).getByLabelText('일정'), { target: { value: '2026-11-20T14:00' } })
    await user.type(within(card).getByLabelText('장소'), '7층 소회의실 B')
    await user.click(within(card).getByRole('button', { name: '저장' }))

    expect(actions.recordAssessment).toHaveBeenCalledWith('ai-05', {
      result: null,
      note: '',
      scheduledAt: '2026-11-20T14:00:00+09:00',
      location: '7층 소회의실 B',
    })
  })

  it('평가 카드: "통과"를 고르고 저장하면 result:"pass"', async () => {
    const user = userEvent.setup()
    renderPage([codingTest])
    const card = screen.getByRole('region', { name: '간단 코딩테스트' })

    await user.click(within(card).getByRole('radio', { name: '통과' }))
    await user.type(within(card).getByLabelText('메모'), '반복문 이해 좋음')
    await user.click(within(card).getByRole('button', { name: '저장' }))

    expect(actions.recordAssessment).toHaveBeenCalledWith('ai-05', expect.objectContaining({ result: 'pass', note: '반복문 이해 좋음' }))
  })

  it('선행 과제 대기 중인 평가는 기록할 수 없다', () => {
    renderPage([jsTest])
    const card = screen.getByRole('region', { name: 'JS 자습 후 기본기 테스트' })
    expect(within(card).getByRole('button', { name: '저장' })).toBeDisabled()
  })

  it('확인 대기 팀 과제를 고르면 확인 패널이 열리고, 보완 요청은 사유가 공백이면 비활성', async () => {
    const user = userEvent.setup()
    renderPage([review, btp])

    await user.click(within(screen.getByRole('row', { name: /코드 리뷰 실습/ })).getByRole('button', { name: '처리' }))
    const panel = screen.getByRole('complementary', { name: '과제 상세' })
    const send = within(panel).getByRole('button', { name: '보완 요청' })
    expect(send).toBeDisabled()
    await user.type(within(panel).getByLabelText(/보완 요청 사유/), '  ')
    expect(send).toBeDisabled()

    await user.click(within(panel).getByRole('button', { name: /확인/ }))
    expect(actions.confirm).toHaveBeenCalledWith('ai-x')
  })

  it('"이 신입 기준으로 시험 만들기"는 /team/exams/new?hire=<id>로 이동한다', async () => {
    const user = userEvent.setup()
    renderPage([btp])
    await user.click(screen.getByRole('button', { name: '이 신입 기준으로 시험 만들기' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/team/exams/new?hire=h1')
  })

  it('볼 수 없는 신입이면 안내 문구', () => {
    state.tasks = []
    render(
      <MemoryRouter initialEntries={['/team/hires/unknown']}>
        <Routes>
          <Route path="/team/hires/:id" element={<HireDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('신입을 찾을 수 없어요')).toBeInTheDocument()
  })
})
