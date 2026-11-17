import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { TaskView } from '@/lib/tasks'
import { makeTask, PROFILE, TEAM_ID } from './testFixtures'

const state = vi.hoisted(() => ({ tasks: [] as TaskView[] }))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ profile: PROFILE, session: { user: { id: 'u1' } }, loading: false, signOut: vi.fn() }),
}))
vi.mock('@/lib/tasks', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tasks')>()),
  useMyTasks: () => ({ data: state.tasks, isPending: false, isError: false }),
}))
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

describe('신입 홈 타임라인', () => {
  it('세 단계 제목 "입사일", "첫 주", "첫 달"이 보인다', () => {
    renderHome(all)
    expect(screen.getByRole('heading', { name: '입사일' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '첫 주' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '첫 달' })).toBeInTheDocument()
  })

  it('"지금 할 일"에 todo·rework 과제만 있고 rework가 먼저', () => {
    renderHome(all)
    const now = screen.getByRole('region', { name: '지금 할 일' })
    const titles = within(now)
      .getAllByRole('link')
      .map((a) => a.querySelector('[data-task-title]')?.textContent)
    expect(titles).toEqual(['명함 신청', '사무실 돌며 인사하기'])
  })

  it('blocked 과제 행에 "근태·결재 시스템 가입 완료 후 열림" 문구', () => {
    renderHome(all)
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
    await userEvent.click(within(list).getByRole('button', { name: 'AI팀' }))
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
})
