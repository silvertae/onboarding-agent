import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { TaskView } from '@/lib/tasks'
import { HIRES, makeTask, TEAM_ID } from './testFixtures'

const { actions, templateActions, state } = vi.hoisted(() => ({
  templateActions: { save: vi.fn(), archive: vi.fn(), restore: vi.fn(), addForHire: vi.fn() },
  actions: {
    submit: vi.fn(),
    markNa: vi.fn(async (_id: string, _reason: string) => {}),
    confirm: vi.fn(async () => {}),
    requestRework: vi.fn(async () => {}),
    recordAssessment: vi.fn(),
  },
  state: {
    tasks: [] as unknown[],
    hires: null as unknown[] | null,
    hiresLoading: false,
    query: { isLoading: false, isError: false, isFetching: false } as Record<string, boolean>,
    refetch: vi.fn(),
  },
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
  useVisibleTasks: () => ({ data: state.query.isLoading || state.query.isError ? undefined : state.tasks, ...state.query, refetch: state.refetch }),
  useTaskActions: () => actions,
}))
vi.mock('./hires', () => ({ useHires: () => ({ data: state.hiresLoading ? undefined : (state.hires ?? HIRES), isLoading: state.hiresLoading, isError: false }) }))
// "이 신입에게 과제 추가" 대화 상자의 동작은 AddTaskDialog.test.tsx에서 본다.
vi.mock('@/features/templates/templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/templates/templates')>()),
  useTemplateActions: () => templateActions,
}))

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

// 이 신입에게만 추가한 과제(assigned_to). 해당 없음 허용이 꺼져 있어도 담당자는 해당 없음으로 뺄 수 있다.
const parking = makeTask({
  id: 'one-off',
  new_hire_id: 'h1',
  status: 'todo',
  template: { title: '주차 등록 신청', completion_mode: 'self', allow_na: false, assigned_to: 'h1', is_seed: false },
})

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
  Object.values(templateActions).forEach((fn) => fn.mockReset())
  state.query = { isLoading: false, isError: false, isFetching: false }
  state.hires = null
  state.hiresLoading = false
  state.refetch.mockClear()
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

describe('OpsInboxPage (S9) 이 신입에게 과제 추가', () => {
  it('입사자 필터가 "전체"면 버튼이 없고, 한 명을 고르면 보인다. 종류에 "평가"가 없다', async () => {
    const user = userEvent.setup()
    renderPage([...ALL, parking])
    expect(screen.queryByRole('button', { name: '이 신입에게 과제 추가' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('입사자'), 'h1')
    await user.click(screen.getByRole('button', { name: '이 신입에게 과제 추가' }))

    const dialog = screen.getByRole('dialog', { name: "'김하늘'님에게 과제 추가" })
    expect(within(dialog).queryByRole('radio', { name: '평가' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: '안내' })).toBeChecked()
  })

  it('입사자 필터를 "전체"로 되돌리면 버튼이 사라진다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(screen.getByLabelText('입사자'), 'h2')
    expect(screen.getByRole('button', { name: '이 신입에게 과제 추가' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('입사자'), '')
    expect(screen.queryByRole('button', { name: '이 신입에게 과제 추가' })).not.toBeInTheDocument()
  })

  it('한 사람용 과제 행에만 "이 신입만" 배지가 붙는다', async () => {
    const user = userEvent.setup()
    renderPage([...ALL, parking])
    await user.click(screen.getByRole('tab', { name: /전체/ }))
    expect(screen.getByRole('row', { name: /주차 등록 신청/ })).toHaveTextContent('이 신입만')
    expect(screen.getByRole('row', { name: /명함 신청/ })).not.toHaveTextContent('이 신입만')
  })

  it('한 사람용 과제는 상세 패널에서 "해당 없음" → 사유 입력 → markNa(id, 사유)', async () => {
    const user = userEvent.setup()
    renderPage([...ALL, parking])
    await user.click(screen.getByRole('tab', { name: /전체/ }))
    await user.click(screen.getByRole('row', { name: /주차 등록 신청/ }))

    const panel = screen.getByRole('complementary', { name: '과제 상세' })
    await user.click(within(panel).getByRole('button', { name: '해당 없음' }))
    await user.type(within(panel).getByLabelText(/해당 없음 사유/), '차량이 없어요')
    await user.click(within(panel).getByRole('button', { name: '해당 없음으로 처리' }))

    expect(actions.markNa).toHaveBeenCalledWith('one-off', '차량이 없어요')
  })

  it('기본 과제 상세 패널에는 "해당 없음"이 없다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('row', { name: /김하늘.*명함 신청/ }))
    const panel = screen.getByRole('complementary', { name: '과제 상세' })
    expect(within(panel).queryByRole('button', { name: '해당 없음' })).not.toBeInTheDocument()
  })
})

describe('OpsInboxPage (S9) 입사자별 탭', () => {
  // h3: 다른 부서 과제만 있어 빠진다. h4: 입사일이 가장 늦고 해당 없음 과제 하나(완료로 센다).
  const LATER_HIRES = [
    ...HIRES,
    { id: 'h3', full_name: '최유나', job_title: '사원', email: 'hire3@demo.test', team_id: TEAM_ID, hire_date: '2026-11-20', team: { name: 'AI팀' } },
    { id: 'h4', full_name: '이도윤', job_title: '사원', email: 'hire4@demo.test', team_id: TEAM_ID, hire_date: '2026-11-17', team: { name: 'AI팀' } },
  ]
  const otherDeptOnly = makeTask({ id: 'hr-03', new_hire_id: 'h3', status: 'todo', template: { department: 'hr', title: '인사 서류 제출' } })
  const naTask = makeTask({ id: 'ga-09', new_hire_id: 'h4', status: 'na', na_reason: '본사 출입 대상 아님', template: { title: '지문 등록·출입 확인' } })

  function hireRows() {
    const table = screen.getByRole('table', { name: '입사자 목록' })
    return within(table).getAllByRole('row').slice(1)
  }

  async function openHiresTab(tasks: TaskView[] = ALL) {
    const user = userEvent.setup()
    renderPage(tasks)
    await user.click(screen.getByRole('tab', { name: '입사자별' }))
    return user
  }

  it('우리 부서 과제가 있는 신입만 입사일 최신순으로, 진행·확인 대기는 우리 부서 과제만 센다', async () => {
    state.hires = LATER_HIRES
    await openHiresTab([...ALL, otherDeptOnly, naTask])

    const rows = hireRows()
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['이도윤AI팀', '김하늘AI팀', '정민서AI팀'])
    // 이도윤: 해당 없음 1개 → 1 / 1, 김하늘: 완료 1 / 총무 과제 3(인사·팀 과제 제외), 확인 대기 1
    expect(rows[0]).toHaveTextContent('1 / 1')
    expect(within(rows[1]).getByText('1 / 3')).toBeInTheDocument()
    expect(within(rows[1]).getAllByRole('cell')[3]).toHaveTextContent('1')
    expect(within(rows[0]).getAllByRole('cell')[3]).toHaveTextContent('0')
    expect(screen.getByRole('table', { name: '입사자 목록' })).not.toHaveTextContent('최유나')
  })

  it('입사자별 탭에는 입사자 드롭다운이 없다', async () => {
    await openHiresTab()
    expect(screen.queryByLabelText('입사자')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이 신입에게 과제 추가' })).not.toBeInTheDocument()
  })

  it('줄을 누르면 "전체" 탭이 그 입사자로 걸러진다', async () => {
    const user = await openHiresTab()
    await user.click(screen.getByRole('row', { name: /정민서/ }))

    expect(screen.getByRole('tab', { name: '전체' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('입사자')).toHaveValue('h2')
    const rows = bodyRows()
    expect(rows).toHaveLength(2)
    rows.forEach((row) => expect(row).toHaveTextContent('정민서'))
  })

  it('줄에서 Enter를 눌러도 같다', async () => {
    const user = await openHiresTab()
    screen.getByRole('row', { name: /김하늘/ }).focus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('tab', { name: '전체' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('입사자')).toHaveValue('h1')
  })

  it('"과제 추가"는 그 신입의 대화 상자를 열고, 대화 상자 안을 눌러도 탭이 바뀌지 않는다', async () => {
    templateActions.addForHire.mockResolvedValueOnce(undefined)
    const user = await openHiresTab()
    await user.click(screen.getByRole('button', { name: "'정민서'님에게 과제 추가" }))

    const dialog = screen.getByRole('dialog', { name: "'정민서'님에게 과제 추가" })
    expect(within(dialog).queryByRole('radio', { name: '평가' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: '읽기' }))
    await user.type(within(dialog).getByLabelText('제목'), '가상 주차 등록')
    await user.click(within(dialog).getByRole('button', { name: '추가' }))

    expect(templateActions.addForHire).toHaveBeenCalledWith('h2', expect.objectContaining({ title: '가상 주차 등록' }))
    expect(screen.getByRole('tab', { name: '입사자별' })).toHaveAttribute('aria-selected', 'true')
    expect(await within(screen.getByRole('row', { name: /정민서/ })).findByRole('status')).toHaveTextContent('추가했어요')
  })

  // 과제는 왔는데 신입 목록이 아직이면 "입사자가 없어요"가 아니라 불러오는 중이다. 스켈레톤도 입사자 표 열이다.
  it('신입 목록을 불러오는 동안은 빈 상태 대신 입사자 표 모양의 "불러오는 중…"', async () => {
    state.hiresLoading = true
    await openHiresTab()
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중…')
    expect(screen.queryByText('업무함에 입사자가 없어요')).not.toBeInTheDocument()
    // 스켈레톤 표는 aria-hidden이라 역할로 찾지 않고 글자로 본다
    expect(document.body).toHaveTextContent('입사일')
    expect(document.body).not.toHaveTextContent('제출 시각')
  })

  it('입사자가 없으면 빈 상태 문구', async () => {
    await openHiresTab([hrTask])
    expect(screen.getByText('업무함에 입사자가 없어요')).toBeInTheDocument()
  })
})

describe('OpsInboxPage 로딩·오류', () => {
  it('불러오는 동안 표 자리에 "불러오는 중…" 상태를 알린다', () => {
    state.query = { isLoading: true, isError: false, isFetching: true }
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중…')
    expect(screen.queryByRole('table', { name: '업무 목록' })).not.toBeInTheDocument()
  })

  it('불러오지 못하면 "다시 불러오기"로 업무 목록을 다시 조회한다', async () => {
    state.query = { isLoading: false, isError: true, isFetching: false }
    renderPage()
    // 버튼이 있으니 문구는 "새로고침"이 아니라 "다시 시도"로 안내한다
    expect(screen.getByRole('alert')).toHaveTextContent('업무 목록을 불러오지 못했어요. 다시 시도해 주세요.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('새로고침')
    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(state.refetch).toHaveBeenCalledTimes(1)
  })
})
