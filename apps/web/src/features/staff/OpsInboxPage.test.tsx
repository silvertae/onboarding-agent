import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, vi } from 'vitest'
import type { TaskView } from '@/lib/tasks'
import { HIRES, makeTask, TEAM_ID } from './testFixtures'

const { actions, templateActions, state, toXlsx } = vi.hoisted(() => ({
  toXlsx: vi.fn(),
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
    hiresError: false,
    hiresRefetch: vi.fn(),
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
vi.mock('./hires', () => ({ useHires: () => ({
    data: state.hiresLoading || state.hiresError ? undefined : (state.hires ?? HIRES),
    isLoading: state.hiresLoading,
    isError: state.hiresError,
    isFetching: false,
    refetch: state.hiresRefetch,
  }), }))
// "이 신입에게 과제 추가" 대화 상자의 동작은 AddTaskDialog.test.tsx에서 본다.
vi.mock('@/features/templates/templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/templates/templates')>()),
  useTemplateActions: () => templateActions,
}))

// 엑셀 파일 만들기만 바꿔 끼운다(실제 라이브러리는 export.test.ts에서 본다)
vi.mock('./export', async (importActual) => ({
  ...(await importActual<typeof import('./export')>()),
  toXlsx,
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
  state.hiresError = false
  state.hiresRefetch.mockClear()
  state.refetch.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
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
    // 확인 대기 다음은 기한 초과, 그다음이 내가 처리할 일
    await user.keyboard('{ArrowRight}{ArrowRight}')

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
  it('좁은 화면: 입사자·상태·제출 시각·기한 칸은 숨고, 그 값을 과제 칸 아래 한 줄로 보여 준다', () => {
    renderPage()
    const table = screen.getByRole('table', { name: '업무 목록' })
    for (const name of ['입사자', '상태', '제출 시각', '기한']) {
      expect(within(table).getByRole('columnheader', { name })).toHaveClass('hidden', 'sm:table-cell')
    }
    const row = bodyRows().find((r) => r.textContent?.includes('명함 신청'))!
    const taskCell = within(row).getAllByRole('cell')[1]
    expect(taskCell).toHaveTextContent('명함 신청')
    const meta = within(taskCell).getByTestId('row-meta')
    expect(meta).toHaveClass('sm:hidden')
    expect(meta).toHaveTextContent('확인 대기')
    expect(meta).toHaveTextContent('김하늘')
    expect(meta).toHaveTextContent('제출')
  })

  it('좁은 화면 메타 줄에서도 기한 지남은 지난 일수와 함께 빨간 굵은 글자다', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-27T03:00:00Z'))
    renderPage([makeTask({ id: 'late', new_hire_id: 'h1', status: 'submitted', due_date: '2026-11-20', template: { title: '늦은 과제' } })])
    const meta = within(bodyRows()[0]).getByTestId('row-meta')
    expect(within(meta).getByText('11/20 · 7일 지남')).toHaveClass('font-semibold', 'text-destructive')
  })

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
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].querySelector('b')?.textContent)).toEqual(['이도윤', '김하늘', '정민서'])
    // 이도윤: 해당 없음 1개 → 1 / 1, 김하늘: 완료 1 / 총무 과제 3(인사·팀 과제 제외), 확인 대기 1
    expect(rows[0]).toHaveTextContent('1 / 1')
    expect(within(rows[1]).getByText('1 / 3')).toBeInTheDocument()
    expect(within(rows[1]).getAllByRole('cell')[3]).toHaveTextContent('1')
    expect(within(rows[0]).getAllByRole('cell')[3]).toHaveTextContent('0')
    expect(screen.getByRole('table', { name: '입사자 목록' })).not.toHaveTextContent('최유나')
  })

  it('좁은 화면: 입사일·확인 대기 칸과 진행 막대는 숨고, 입사일·확인 대기는 이름 아래 한 줄로 보여 준다', async () => {
    await openHiresTab()
    const table = screen.getByRole('table', { name: '입사자 목록' })
    for (const name of ['입사일', '확인 대기']) {
      expect(within(table).getByRole('columnheader', { name })).toHaveClass('hidden', 'sm:table-cell')
    }
    const row = hireRows().find((r) => r.textContent?.includes('김하늘'))!
    const meta = within(within(row).getAllByRole('cell')[0]).getByTestId('row-meta')
    expect(meta).toHaveClass('sm:hidden')
    expect(meta).toHaveTextContent('11월 14일 입사')
    expect(meta).toHaveTextContent('확인 대기 1')
    expect(within(row).getByRole('progressbar').parentElement).toHaveClass('hidden', 'sm:block')
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

  // 신입 목록 조회가 실패하면 "입사자가 없어요"가 아니라 오류와 다시 불러오기(Codex P2)
  it('신입 목록을 불러오지 못하면 오류 문구와 "다시 불러오기"로 신입 목록을 다시 조회한다', async () => {
    state.hiresError = true
    const user = await openHiresTab()
    expect(screen.getByRole('alert')).toHaveTextContent('입사자 목록을 불러오지 못했어요. 다시 시도해 주세요.')
    expect(screen.queryByText('업무함에 입사자가 없어요')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(state.hiresRefetch).toHaveBeenCalledTimes(1)
  })

  it('입사자가 없으면 빈 상태 문구', async () => {
    await openHiresTab([hrTask])
    expect(screen.getByText('업무함에 입사자가 없어요')).toBeInTheDocument()
  })
})

// 오늘은 2026-11-27(서울)로 고정한다
describe('OpsInboxPage (S9) 기한 초과·대기 일수', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-27T03:00:00Z'))
  })

  const lateTodo = makeTask({ id: 'late-todo', new_hire_id: 'h1', status: 'todo', due_date: '2026-11-20', template: { title: '보안 서약서 제출' } })
  const lateBlocked = makeTask({ id: 'late-blocked', new_hire_id: 'h2', status: 'blocked', due_date: '2026-11-18', template: { title: '좌석·사물함 배정 확인' } })
  const lateSubmitted = makeTask({
    id: 'late-submitted',
    new_hire_id: 'h2',
    status: 'submitted',
    due_date: '2026-11-20',
    submitted_at: '2026-11-26T01:00:00Z',
    template: { title: '사원증 사진 제출' },
  })
  const lateStaff = makeTask({
    id: 'late-staff',
    new_hire_id: 'h2',
    status: 'todo',
    due_date: '2026-11-25',
    template: { title: '출입카드 발급', completion_mode: 'staff_only' },
  })
  const notLate = [
    makeTask({ id: 'done', status: 'done', due_date: '2026-11-10', template: { title: '끝난 과제' } }),
    makeTask({ id: 'na', status: 'na', due_date: '2026-11-10', template: { title: '해당 없음 과제' } }),
    makeTask({ id: 'no-due', status: 'todo', due_date: null, template: { title: '기한 없는 과제' } }),
    makeTask({ id: 'today', status: 'todo', due_date: '2026-11-27', template: { title: '오늘 마감 과제' } }),
    makeTask({ id: 'hr', status: 'todo', due_date: '2026-11-10', template: { department: 'hr', title: '다른 부서 과제' } }),
  ]

  it('기한 초과 탭은 끝나지 않고 기한이 지난 우리 부서 과제만 기한 오름차순으로 보인다', async () => {
    const user = userEvent.setup()
    renderPage([lateTodo, lateSubmitted, lateBlocked, ...notLate])
    await user.click(screen.getByRole('tab', { name: /기한 초과/ }))

    const rows = bodyRows()
    // 같은 기한(11/20)은 입사자 이름순: 김하늘 → 정민서
    expect(rows.map((r) => within(r).getAllByRole('cell')[1].textContent)).toEqual([
      expect.stringContaining('좌석·사물함 배정 확인'),
      expect.stringContaining('보안 서약서 제출'),
      expect.stringContaining('사원증 사진 제출'),
    ])
  })

  it('기한 초과 탭은 차례와 지난 일수를 보인다', async () => {
    const user = userEvent.setup()
    renderPage([lateTodo, lateSubmitted, lateBlocked, lateStaff])
    await user.click(screen.getByRole('tab', { name: /기한 초과/ }))

    const table = screen.getByRole('table', { name: '업무 목록' })
    expect(within(table).getByRole('columnheader', { name: '차례' })).toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: '제출 시각' })).not.toBeInTheDocument()

    const turnOf = (title: string) => {
      const row = bodyRows().find((r) => r.textContent?.includes(title))!
      return within(row).getAllByRole('cell')[3]
    }
    expect(turnOf('보안 서약서 제출')).toHaveTextContent(/^신입$/)
    expect(turnOf('사원증 사진 제출')).toHaveTextContent(/^담당자$/)
    expect(turnOf('출입카드 발급')).toHaveTextContent(/^담당자$/)
    expect(turnOf('좌석·사물함 배정 확인')).toHaveTextContent(/^선행 과제 대기$/)

    const row = bodyRows().find((r) => r.textContent?.includes('보안 서약서 제출'))!
    const due = within(row).getAllByRole('cell')[4]
    expect(due).toHaveTextContent(/^11\/20 · 7일 지남$/)
    expect(due).toHaveClass('font-semibold', 'text-destructive')
  })

  it('기한 초과 탭은 좁은 화면 메타 줄에도 차례를 보인다', async () => {
    const user = userEvent.setup()
    renderPage([lateBlocked])
    await user.click(screen.getByRole('tab', { name: /기한 초과/ }))
    const row = bodyRows().find((r) => r.textContent?.includes('좌석·사물함 배정 확인'))!
    // 과제 칸(좁은 화면에서도 남는 칸)의 메타 줄
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('차례 선행 과제 대기')
  })

  it('탭 순서와 개수', () => {
    renderPage([lateTodo, lateSubmitted, lateBlocked, ...notLate])
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      '확인 대기 1',
      '기한 초과 3',
      '내가 처리할 일 0',
      '입사자별',
      '전체',
    ])
  })

  it('요약에 기한 초과 카드가 있다', () => {
    renderPage([lateTodo, lateSubmitted, lateBlocked, ...notLate])
    const card = screen.getByRole('region', { name: '기한 초과' })
    expect(card).toHaveTextContent('3')
    expect(card).toHaveTextContent('기한이 지난 우리 부서 과제')
  })

  it('요약 카드는 휴대폰에서 2×2, 1024px부터 한 줄 4개이고 좁은 칸에서는 설명을 숨긴다', () => {
    renderPage([lateTodo])
    const card = screen.getByRole('region', { name: '기한 초과' })
    // jsdom은 배치를 계산하지 않으므로 반응형 클래스로 확인한다(실제 배치는 PR 스크린샷)
    expect(card.parentElement).toHaveClass('grid-cols-2', 'lg:grid-cols-4')
    expect(within(card).getByText('기한이 지난 우리 부서 과제')).toHaveClass('hidden', 'sm:block')
  })

  it('확인 대기 줄에 대기 일수를 붙이고 3일 이상은 강조한다', () => {
    renderPage([
      makeTask({ id: 'old', new_hire_id: 'h1', status: 'submitted', submitted_at: '2026-11-24T03:00:00Z', due_date: null, template: { title: '오래 기다린 과제' } }),
      makeTask({ id: 'new', new_hire_id: 'h2', status: 'submitted', submitted_at: '2026-11-27T01:00:00Z', due_date: null, template: { title: '오늘 낸 과제' } }),
    ])
    const [old, fresh] = bodyRows()
    const oldCell = within(old).getAllByRole('cell')[3]
    expect(within(oldCell).getByText('3일 대기')).toHaveClass('font-semibold', 'text-destructive')
    expect(within(within(old).getByTestId('row-meta')).getByText('3일 대기')).toHaveClass('text-destructive')
    expect(within(fresh).getAllByRole('cell')[3]).not.toHaveTextContent('대기')
  })

  it('보완 요청 과제에는 대기 일수를 붙이지 않는다', async () => {
    const user = userEvent.setup()
    renderPage([
      makeTask({ id: 'rw', status: 'rework', submitted_at: '2026-11-20T03:00:00Z', due_date: null, template: { title: '보완 중 과제' } }),
    ])
    await user.click(screen.getByRole('tab', { name: /전체/ }))
    expect(bodyRows()[0]).not.toHaveTextContent('대기')
  })

  it('입사자 필터는 기한 초과 탭에도 적용된다', async () => {
    const user = userEvent.setup()
    renderPage([lateTodo, lateSubmitted, lateBlocked])
    await user.click(screen.getByRole('tab', { name: /기한 초과/ }))
    await user.selectOptions(screen.getByLabelText('입사자'), 'h2')

    const rows = bodyRows()
    expect(rows).toHaveLength(2)
    rows.forEach((row) => expect(row).toHaveTextContent('정민서'))
    // 탭 개수는 부서 전체 기준 그대로
    expect(screen.getByRole('tab', { name: /기한 초과/ })).toHaveTextContent('기한 초과 3')
  })

  it('기한이 지난 과제가 없으면 빈 상태 문구', async () => {
    const user = userEvent.setup()
    renderPage(notLate)
    await user.click(screen.getByRole('tab', { name: /기한 초과/ }))
    expect(screen.getByText('기한이 지난 과제가 없어요')).toBeInTheDocument()
  })
})

describe('OpsInboxPage (S9) 내려받기', () => {
  let blobs: Blob[]
  let names: string[]

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-27T03:00:00Z'))
    blobs = []
    names = []
    toXlsx.mockReset()
    // jsdom에는 createObjectURL이 없어 직접 넣는다
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:test'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
  })
  afterEach(() => vi.restoreAllMocks())

  const late = [
    makeTask({ new_hire_id: 'h1', status: 'todo', due_date: '2026-11-20', template: { title: '보안 서약서 제출' } }),
    makeTask({ new_hire_id: 'h2', status: 'submitted', due_date: '2026-11-18', submitted_at: '2026-11-26T01:00:00Z', template: { title: '사원증 사진 제출' } }),
    makeTask({ new_hire_id: 'h2', status: 'done', due_date: '2026-11-10', template: { title: '끝난 과제' } }),
  ]

  function readText(blob: Blob) {
    return new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsText(blob)
    })
  }

  it('CSV 내려받기는 지금 탭의 지금 행을 내보낸다', async () => {
    const user = userEvent.setup()
    renderPage(late)
    await user.click(screen.getByRole('tab', { name: /기한 초과/ }))
    await user.click(screen.getByRole('button', { name: 'CSV 내려받기' }))

    expect(names).toEqual(['업무함-총무팀-기한 초과-20261127.csv'])
    const lines = (await readText(blobs[0])).replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[0]).toBe('입사자,팀,과제,상태,차례,제출 시각,기한,지난 일수')
    expect(lines).toHaveLength(1 + bodyRows().length)
    // 표와 같은 순서(기한 오름차순)
    expect(lines[1]).toContain('사원증 사진 제출')
    expect(lines[2]).toContain('보안 서약서 제출')
  })

  it('Excel 내려받기는 같은 머리글·행으로 toXlsx를 부르고 .xlsx 이름으로 받는다', async () => {
    const user = userEvent.setup()
    const xlsx = new Blob(['x'])
    toXlsx.mockResolvedValue(xlsx)
    renderPage(late)
    await user.click(screen.getByRole('tab', { name: /기한 초과/ }))
    await user.click(screen.getByRole('button', { name: 'Excel 내려받기' }))

    expect(toXlsx).toHaveBeenCalledWith(
      '기한 초과',
      ['입사자', '팀', '과제', '상태', '차례', '제출 시각', '기한', '지난 일수'],
      [expect.arrayContaining(['사원증 사진 제출']), expect.arrayContaining(['보안 서약서 제출'])],
    )
    expect(blobs).toEqual([xlsx])
    expect(names).toEqual(['업무함-총무팀-기한 초과-20261127.xlsx'])
  })

  it('xlsx를 만들지 못하면 오류 문구를 보인다', async () => {
    const user = userEvent.setup()
    toXlsx.mockRejectedValue(new Error('boom'))
    renderPage(late)
    await user.click(screen.getByRole('button', { name: 'Excel 내려받기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('파일을 만들지 못했어요. 다시 시도해 주세요.')
    expect(names).toEqual([])
  })

  it('입사자별 탭에서는 내려받기 버튼이 없고, 행이 없으면 둘 다 비활성', async () => {
    const user = userEvent.setup()
    renderPage([late[2]])
    // 확인 대기 탭: 행이 없다
    expect(screen.getByRole('button', { name: 'Excel 내려받기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'CSV 내려받기' })).toBeDisabled()

    await user.click(screen.getByRole('tab', { name: /전체/ }))
    expect(screen.getByRole('button', { name: 'CSV 내려받기' })).toBeEnabled()

    await user.click(screen.getByRole('tab', { name: /입사자별/ }))
    expect(screen.queryByRole('button', { name: 'Excel 내려받기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'CSV 내려받기' })).not.toBeInTheDocument()
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
