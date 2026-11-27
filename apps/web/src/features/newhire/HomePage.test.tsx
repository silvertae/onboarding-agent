import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import type { TaskView } from '@/lib/tasks'
import { makeTask, PROFILE, TEAM_ID } from './testFixtures'

const state = vi.hoisted(() => ({
  tasks: [] as TaskView[],
  query: { isPending: false, isError: false, isFetching: false } as Record<string, boolean>,
  refetch: vi.fn(),
  counts: new Map<string, number>(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ profile: PROFILE, session: { user: { id: 'u1' } }, loading: false, signOut: vi.fn() }),
}))
vi.mock('@/lib/tasks', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tasks')>()),
  useMyTasks: () => ({ data: state.query.isPending || state.query.isError ? undefined : state.tasks, ...state.query, refetch: state.refetch }),
}))
vi.mock('@/lib/taskFiles', () => ({ useFileCounts: () => ({ data: state.counts }) }))
vi.mock('./useTeamName', () => ({ useTeamName: () => 'AI팀' }))

import { HomePage } from './HomePage'

function renderHome(tasks: TaskView[]) {
  state.tasks = tasks
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

const hr02 = makeTask({ code: 'HR-02', title: '근태·결재 시스템 가입', stage: 'day1', sort_order: 10 }, { status: 'submitted' })
const hr03 = makeTask(
  { code: 'HR-03', title: '인사정보 업데이트', stage: 'week1', prerequisite_codes: ['HR-02'], sort_order: 20 },
  { status: 'blocked' },
)
const ga07 = makeTask(
  { code: 'GA-07', title: '명함 신청', stage: 'week1', department: 'ga', sort_order: 160 },
  { status: 'rework', rework_reason: '여권 표기와 맞춰 주세요' },
)
const ai01 = makeTask(
  { code: 'AI-01', title: '사무실 돌며 인사하기', stage: 'day1', department: null, team_id: TEAM_ID, sort_order: 310 },
  { status: 'todo' },
)
const ai02 = makeTask(
  { code: 'AI-02', title: '팀 업무·팀원 소개', stage: 'day1', department: null, team_id: TEAM_ID, sort_order: 320 },
  { status: 'done' },
)
const ac04 = makeTask(
  { code: 'AC-04', title: '노트북 구입 기준 확인', stage: 'month1', department: 'accounting', sort_order: 240 },
  { status: 'na', na_reason: '구입 계획 없음' },
)
const ga08 = makeTask({ code: 'GA-08', title: '웰컴키트 수령', stage: 'day1', department: 'ga', sort_order: 170 }, { status: 'done' })

const all = [hr02, hr03, ga07, ai01, ai02, ac04, ga08]

// 오늘을 2026-11-18(수)로 고정한다. 픽스처 기한은 모두 11-20이라 처음에는 "입사일" 단계가 진행 중이다.
beforeEach(() => {
  state.query = { isPending: false, isError: false, isFetching: false }
  state.refetch.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 9, 0))
})
afterEach(() => {
  vi.useRealTimers()
})

// 접힌 단계를 모두 편다(단계 머리는 h3 안의 버튼)
async function expandAllStages() {
  for (const button of screen.getAllByRole('button', { expanded: false })) {
    if (button.closest('h3')) await userEvent.click(button)
  }
}

describe('신입 홈 타임라인', () => {
  it('세 단계 제목 "입사일", "첫 주", "첫 달"이 보인다', () => {
    renderHome(all)
    expect(screen.getByRole('heading', { name: /^입사일/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^첫 주/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^첫 달/ })).toBeInTheDocument()
  })

  it('"지금 할 일"에 todo·rework 과제만 있고 rework가 먼저', () => {
    renderHome(all)
    const now = screen.getByRole('region', { name: '지금 할 일' })
    const titles = within(now)
      .getAllByRole('link')
      .map((a) => a.querySelector('[data-task-title]')?.textContent)
    expect(titles).toEqual(['명함 신청', '사무실 돌며 인사하기'])
  })

  it('blocked 과제 행에 "근태·결재 시스템 가입 완료 후 열림" 문구', async () => {
    renderHome(all)
    await expandAllStages()
    const row = screen.getByRole('link', { name: /인사정보 업데이트/ })
    expect(within(row).getByText('근태·결재 시스템 가입 완료 후 열림')).toBeInTheDocument()
    expect(within(row).getByText('선행 과제 대기')).toBeInTheDocument()
  })

  it('진행률 "3 / 6"', () => {
    const six = [
      makeTask({ code: 'A', title: 'a' }, { status: 'done' }),
      makeTask({ code: 'B', title: 'b' }, { status: 'done' }),
      makeTask({ code: 'C', title: 'c' }, { status: 'na', na_reason: '없음' }),
      makeTask({ code: 'D', title: 'd' }, { status: 'todo' }),
      makeTask({ code: 'E', title: 'e' }, { status: 'todo' }),
      makeTask({ code: 'F', title: 'f' }, { status: 'todo' }),
    ]
    renderHome(six)
    expect(screen.getByText('3 / 6')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '전체 진행률' })).toHaveAttribute('aria-valuenow', '50')
  })

  it('담당 필터 "AI팀" 선택 → team 과제만 표시', async () => {
    renderHome(all)
    const list = screen.getByRole('region', { name: '전체 과제' })
    expect(within(list).getByRole('group', { name: '담당 필터' })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(list).getByRole('button', { name: 'AI팀', pressed: false }))
    expect(within(list).getByRole('button', { name: 'AI팀' })).toHaveAttribute('aria-pressed', 'true')
    const titles = within(list)
      .getAllByRole('link')
      .map((a) => a.querySelector('[data-task-title]')?.textContent)
    expect(titles).toEqual(['사무실 돌며 인사하기', '팀 업무·팀원 소개'])
  })

  it('담당 필터 "경영지원" 선택 → 부서 과제만 표시', async () => {
    renderHome(all)
    const list = screen.getByRole('region', { name: '전체 과제' })
    await userEvent.click(within(list).getByRole('button', { name: '경영지원' }))
    expect(within(list).queryByText('사무실 돌며 인사하기')).not.toBeInTheDocument()
    expect(within(list).getByText('웰컴키트 수령')).toBeInTheDocument()
  })

  it('과제 행은 과제 상세로 연결된다', () => {
    renderHome(all)
    expect(screen.getByRole('link', { name: /웰컴키트 수령/ })).toHaveAttribute('href', '/me/tasks/task-GA-08')
  })

  it('과제 0개 → 빈 상태 문구', () => {
    renderHome([])
    expect(screen.getByText('아직 배정된 과제가 없어요')).toBeInTheDocument()
  })

  it('모두 완료 → 축하 문구', () => {
    renderHome([ai02, ga08, ac04])
    expect(screen.getByText(/온보딩 과제를 모두 마쳤어요/)).toBeInTheDocument()
  })

  it('모두 완료 → 축하 문구 앞에 손 흔드는 마스코트(48)가 함께 나온다', () => {
    renderHome([ai02, ga08, ac04])
    const message = screen.getByText('축하해요! 온보딩 과제를 모두 마쳤어요.')
    const mascot = message.closest('p')!.querySelector('.mascot.is-wave')
    expect(mascot).toHaveAttribute('aria-hidden', 'true')
    expect(mascot).not.toHaveClass('is-idle')
  })
})

describe('신입 홈 — 지금 할 일 초점', () => {
  // 입사 2일째(11-18) 시연 상황: 입사일 기한 11-17, 첫 주 11-22, 첫 달 12-17
  const day1 = (code: string, title: string, sort: number, status: TaskView['status'] = 'todo') =>
    makeTask({ code, title, stage: 'day1', sort_order: sort }, { status, due_date: '2026-11-17' })
  const week1 = (code: string, title: string, sort: number, instance: Partial<TaskView> = {}) =>
    makeTask({ code, title, stage: 'week1', sort_order: sort }, { status: 'todo', due_date: '2026-11-22', ...instance })
  const demo = [
    day1('D1', '근태·결재 시스템 가입', 10),
    day1('D2', '복리후생 규정 열람', 20),
    day1('D3', '사무실 돌며 인사하기', 30),
    day1('D4', '웰컴키트 수령', 40, 'done'),
    week1('W1', '피부양자 등록', 110),
    week1('W2', '소득세 감면 신청', 120),
    week1('W3', '법인카드 신청서 작성', 130, { due_date: '2026-11-19' }),
    week1('W4', '명함 신청', 140, { status: 'rework', rework_reason: '여권 표기와 맞춰 주세요' }),
    week1('W5', '기술스택·경력 조사', 150, { status: 'submitted', due_date: '2026-11-17' }),
    makeTask(
      { code: 'W6', title: '복지포인트 등록', stage: 'week1', completion_mode: 'staff_only', sort_order: 160 },
      { status: 'todo', due_date: '2026-11-17' },
    ),
    makeTask({ code: 'M1', title: '카드 분실 대응 안내', stage: 'month1', sort_order: 210 }, { status: 'todo', due_date: '2026-12-17' }),
  ]

  function nowTitles() {
    const now = screen.getByRole('region', { name: '지금 할 일' })
    return within(now)
      .getAllByRole('link')
      .map((a) => a.querySelector('[data-task-title]')?.textContent)
  }

  it('보완 요청 → 기한 이른 순으로 5건만 보이고, "나머지 N건 보기"로 모두 펼친다', async () => {
    renderHome(demo)
    expect(nowTitles()).toEqual(['명함 신청', '근태·결재 시스템 가입', '복리후생 규정 열람', '사무실 돌며 인사하기', '법인카드 신청서 작성'])

    const more = screen.getByRole('button', { name: '나머지 3건 보기' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)

    expect(nowTitles()).toEqual([
      '명함 신청',
      '근태·결재 시스템 가입',
      '복리후생 규정 열람',
      '사무실 돌며 인사하기',
      '법인카드 신청서 작성',
      '피부양자 등록',
      '소득세 감면 신청',
      '카드 분실 대응 안내',
    ])
    expect(screen.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('5건 이하면 펼치기 버튼이 없다', () => {
    renderHome(all)
    expect(screen.queryByRole('button', { name: /나머지 \d+건 보기/ })).not.toBeInTheDocument()
  })

  it('신입이 할 차례인데 기한이 지난 과제에만 "지남"을 붙인다', () => {
    renderHome(demo)
    const now = screen.getByRole('region', { name: '지금 할 일' })
    expect(within(within(now).getByRole('link', { name: /근태·결재 시스템 가입/ })).getByText('지남')).toBeInTheDocument()
    expect(within(within(now).getByRole('link', { name: /법인카드 신청서 작성/ })).queryByText('지남')).not.toBeInTheDocument()
  })

  it('확인 대기·담당자 처리 과제는 기한이 지나도 "지남"을 붙이지 않는다', async () => {
    renderHome(demo)
    const list = screen.getByRole('region', { name: '전체 과제' })
    expect(within(within(list).getByRole('link', { name: /기술스택·경력 조사/ })).queryByText('지남')).not.toBeInTheDocument()
    expect(within(within(list).getByRole('link', { name: /복지포인트 등록/ })).queryByText('지남')).not.toBeInTheDocument()
  })

  it('전체 과제는 날짜상 진행 중인 단계만 펼치고, 단계 머리를 눌러 다른 단계를 편다', async () => {
    renderHome(demo)
    const list = screen.getByRole('region', { name: '전체 과제' })
    const dayHeader = within(list).getByRole('button', { name: /^입사일/ })
    const weekHeader = within(list).getByRole('button', { name: /^첫 주/ })
    expect(dayHeader).toHaveAttribute('aria-expanded', 'false')
    expect(weekHeader).toHaveAttribute('aria-expanded', 'true')
    expect(within(list).getByRole('button', { name: /^첫 달/ })).toHaveAttribute('aria-expanded', 'false')
    expect(within(list).queryByRole('link', { name: /웰컴키트 수령/ })).not.toBeInTheDocument()

    await userEvent.click(dayHeader)
    expect(dayHeader).toHaveAttribute('aria-expanded', 'true')
    expect(within(list).getByRole('link', { name: /웰컴키트 수령/ })).toBeInTheDocument()
  })

  it('단계 머리에 날짜·완료 수와 남은 일 요약을 보여 준다', () => {
    renderHome(demo)
    const list = screen.getByRole('region', { name: '전체 과제' })
    const dayHeader = within(list).getByRole('button', { name: /^입사일/ })
    expect(dayHeader).toHaveTextContent('11월 17일 · 4개 중 1개 완료')
    expect(dayHeader).toHaveTextContent('할 일 3')
    const weekHeader = within(list).getByRole('button', { name: /^첫 주/ })
    expect(weekHeader).toHaveTextContent('~ 11월 22일 · 6개 중 0개 완료')
    expect(weekHeader).toHaveTextContent('할 일 3 · 보완 요청 1 · 확인 대기 1')
  })

  it('모바일 단계 머리: 단계 이름은 줄바꿈하지 않고, 날짜·완료 수는 둘째 줄로 내린다', () => {
    renderHome(demo)
    const list = screen.getByRole('region', { name: '전체 과제' })
    const header = within(list).getByRole('button', { name: /^첫 주/ })
    expect(header).toHaveClass('flex-wrap')
    expect(within(header).getByText('첫 주')).toHaveClass('shrink-0', 'whitespace-nowrap')
    // 좁은 화면: 둘째 줄 전체(basis-full)를 쓰고 단계 이름 아래(pl-6 = 화살표 14 + 간격 10)에 맞춘다. sm부터 한 줄
    expect(within(header).getByText(/11월 22일 · 6개 중 0개 완료/)).toHaveClass('order-last', 'basis-full', 'pl-6', 'sm:order-none', 'sm:basis-auto', 'sm:pl-0')
    expect(within(header).getByText(/할 일 3 · 보완 요청 1/)).toHaveClass('ml-auto', 'min-w-0', 'text-right')
  })

  it('인사말은 진행 중인 단계를 말한다', () => {
    renderHome(demo)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('가상하늘 님, 첫 주를 보내고 있어요')
  })

  it('오늘이 기한이면 "오늘 마감"을 붙인다', () => {
    // 오늘은 서울 날짜로 정한다. 실행 환경 시간대와 상관없이 서울 11/18 09:00으로 고정한다
    vi.setSystemTime(new Date('2026-11-18T00:00:00Z'))
    renderHome([makeTask({ code: 'T1', title: '오늘 과제' }, { status: 'todo', due_date: '2026-11-18' })])
    const now = screen.getByRole('region', { name: '지금 할 일' })
    expect(within(within(now).getByRole('link', { name: /오늘 과제/ })).getByText('오늘 마감')).toBeInTheDocument()
  })

  it('7일 안에 남은 과제에는 D-N을 붙인다', () => {
    // 오늘은 서울 날짜로 정한다. 실행 환경 시간대와 상관없이 서울 11/18 09:00으로 고정한다
    vi.setSystemTime(new Date('2026-11-18T00:00:00Z'))
    renderHome([
      makeTask({ code: 'T1', title: '사흘 남은 과제' }, { status: 'todo', due_date: '2026-11-21' }),
      makeTask({ code: 'T2', title: '먼 과제' }, { status: 'todo', due_date: '2026-11-30' }),
    ])
    const now = screen.getByRole('region', { name: '지금 할 일' })
    expect(within(within(now).getByRole('link', { name: /사흘 남은 과제/ })).getByText('D-3')).toBeInTheDocument()
    expect(within(within(now).getByRole('link', { name: /먼 과제/ })).queryByText(/^D-/)).not.toBeInTheDocument()
  })

  it('확인 대기·담당자 처리 과제에는 오늘 마감·D-N을 붙이지 않는다', async () => {
    renderHome([
      makeTask({ code: 'T1', title: '확인 대기 과제' }, { status: 'submitted', due_date: '2026-11-18' }),
      makeTask({ code: 'T2', title: '담당자 처리 과제', completion_mode: 'staff_only' }, { status: 'todo', due_date: '2026-11-21' }),
    ])
    await expandAllStages()
    const list = screen.getByRole('region', { name: '전체 과제' })
    const submitted = within(list).getByRole('link', { name: /확인 대기 과제/ })
    expect(within(submitted).queryByText('오늘 마감')).not.toBeInTheDocument()
    expect(within(submitted).queryByText(/^D-/)).not.toBeInTheDocument()
    const staff = within(list).getByRole('link', { name: /담당자 처리 과제/ })
    expect(within(staff).queryByText('오늘 마감')).not.toBeInTheDocument()
    expect(within(staff).queryByText(/^D-/)).not.toBeInTheDocument()
  })

  it('인사 문구에 기한 지남 건수를 더한다', () => {
    const { unmount } = renderHome([
      makeTask({ code: 'T1', title: '지난 과제' }, { status: 'todo', due_date: '2026-11-17' }),
      makeTask({ code: 'T2', title: '남은 과제' }, { status: 'todo', due_date: '2026-11-25' }),
    ])
    expect(screen.getByText(/지금 할 일 2건/)).toHaveTextContent(/기한 지남 1건/)
    unmount()
    renderHome([makeTask({ code: 'T2', title: '남은 과제' }, { status: 'todo', due_date: '2026-11-25' })])
    expect(screen.getByText(/지금 할 일 1건/)).not.toHaveTextContent('기한 지남')
  })

  it('오늘은 서울 날짜 기준이다', () => {
    // UTC 15:30 = 서울 11-19 00:30
    vi.setSystemTime(new Date('2026-11-18T15:30:00Z'))
    renderHome([
      makeTask({ code: 'T1', title: '어제 과제' }, { status: 'todo', due_date: '2026-11-18' }),
      makeTask({ code: 'T2', title: '오늘 과제' }, { status: 'todo', due_date: '2026-11-19' }),
    ])
    const now = screen.getByRole('region', { name: '지금 할 일' })
    expect(within(within(now).getByRole('link', { name: /어제 과제/ })).getByText('지남')).toBeInTheDocument()
    expect(within(within(now).getByRole('link', { name: /오늘 과제/ })).getByText('오늘 마감')).toBeInTheDocument()
  })

  it('머리글 날짜와 입사 N일째도 서울 날짜 기준이다', () => {
    // UTC 15:30 = 서울 11-19 00:30. 입사일 11-14 → 6일째
    vi.setSystemTime(new Date('2026-11-18T15:30:00Z'))
    renderHome([makeTask({ code: 'T1', title: '과제' }, { status: 'todo', due_date: '2026-11-19' })])
    expect(screen.getByText(/2026년 11월 19일 목요일 · 입사 6일째/)).toBeInTheDocument()
  })
})

describe('신입 홈 — 서식 표시', () => {
  beforeEach(() => {
    state.query = { isPending: false, isError: false, isFetching: false }
    state.counts = new Map()
  })

  it('서식이 있는 과제 행에만 "서식 N"을 보인다', () => {
    const a = makeTask({ code: 'GA-01', title: '법인카드 신청서 작성' })
    const b = makeTask({ code: 'GA-02', title: '카드사 온라인 동의' })
    const c = makeTask({ code: 'GA-03', title: '보험 안내 확인' })
    state.counts = new Map([
      [a.template_id, 2],
      [c.template_id, 0],
    ])
    renderHome([a, b, c])
    const row = (title: string) => screen.getAllByRole('link').find((l) => l.textContent?.includes(title))!
    expect(within(row('법인카드 신청서 작성')).getByText('서식 2')).toBeInTheDocument()
    expect(within(row('카드사 온라인 동의')).queryByText(/서식/)).not.toBeInTheDocument()
    expect(within(row('보험 안내 확인')).queryByText(/서식/)).not.toBeInTheDocument()
  })
})

describe('신입 홈 — 로딩·오류', () => {
  it('불러오는 동안 "불러오는 중…" 상태를 알린다', () => {
    state.query = { isPending: true, isError: false, isFetching: true }
    renderHome([])
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중…')
  })

  it('불러오지 못하면 오류 알림의 "다시 불러오기"로 다시 조회한다', async () => {
    state.query = { isPending: false, isError: true, isFetching: false }
    renderHome([])
    // 버튼이 있으니 문구는 "새로고침"이 아니라 "다시 시도"로 안내한다
    expect(screen.getByRole('alert')).toHaveTextContent('과제를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('새로고침')
    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(state.refetch).toHaveBeenCalledTimes(1)
  })
})
