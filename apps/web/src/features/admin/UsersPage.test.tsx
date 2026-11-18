import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/app/AuthProvider'

const { state, agentFetch, rpc } = vi.hoisted(() => ({
  state: { profileLoads: 0, users: [] as unknown[], teams: [] as unknown[] },
  agentFetch: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        order: async () => {
          if (table === 'profiles') state.profileLoads += 1
          return { data: table === 'profiles' ? state.users : state.teams, error: null, status: 200 }
        },
        // 데모 초기화가 먼저 읽는 담당자 서식 목록(task_template_files). 지우는 순서는 users.test.ts에서 본다.
        eq: async () => ({ data: [], error: null, status: 200 }),
      }),
    }),
    rpc,
    storage: { from: () => ({ remove: vi.fn(async () => ({ data: [], error: null })) }) },
    auth: { signOut: vi.fn() },
  },
}))

vi.mock('@/lib/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent')>()
  return { ...actual, agentFetch }
})

import { AgentError } from '@/lib/agent'
import { UsersPage } from './UsersPage'

const ORG = 'org-1'
const AI_TEAM = { id: 'team-ai', name: 'AI팀' }
const SALES_TEAM = { id: 'team-sales', name: '영업팀' }

function profile(p: Partial<Profile> & Pick<Profile, 'id' | 'full_name' | 'role'>): Profile {
  return {
    org_id: ORG,
    email: `${p.id}@demo.test`,
    job_title: '사원',
    department: null,
    team_id: null,
    hire_date: null,
    needs_hq_access: true,
    is_seed: true,
    created_at: '2026-11-10T00:00:00Z',
    ...p,
  }
}

const USERS: Profile[] = [
  profile({ id: 'admin', full_name: '관리자', role: 'admin', email: 'admin@demo.test' }),
  profile({ id: 'h1', full_name: '김하늘', role: 'new_hire', team_id: 'team-ai', hire_date: '2026-11-03' }),
  profile({ id: 'h2', full_name: '한지우', role: 'new_hire', team_id: 'team-ai', hire_date: '2026-11-17', is_seed: false }),
  profile({ id: 't1', full_name: '강민재', role: 'team_trainer', team_id: 'team-ai', job_title: '책임' }),
  profile({ id: 'o1', full_name: '서지원', role: 'ops_staff', department: 'hr', job_title: '대리' }),
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function okResponse(id: string): Response {
  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } })
}

async function fillCommon(user: ReturnType<typeof userEvent.setup>, overrides: { password?: string } = {}) {
  await user.type(screen.getByLabelText('이름'), '테스트 신입')
  await user.type(screen.getByLabelText('직급'), '사원')
  await user.type(screen.getByLabelText('메일'), 'new.hire@demo.test')
  await user.type(screen.getByLabelText('초기 비밀번호'), overrides.password ?? 'secret-123')
}

function submitButton() {
  return screen.getByRole('button', { name: '계정 만들기' })
}

beforeEach(() => {
  state.profileLoads = 0
  state.users = USERS
  state.teams = [AI_TEAM, SALES_TEAM]
  agentFetch.mockReset()
  rpc.mockReset()
})

describe('UsersPage 목록', () => {
  it('이름, 메일, 역할 문구, 부서 또는 팀, 입사일, 기본 계정 여부를 보여 준다', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: '사용자 목록' })

    const hire = within(table).getByText('김하늘').closest('tr')!
    expect(within(hire).getByText('h1@demo.test')).toBeInTheDocument()
    expect(within(hire).getByText('신입')).toBeInTheDocument()
    expect(within(hire).getByText('AI팀')).toBeInTheDocument()
    expect(within(hire).getByText('11/03')).toBeInTheDocument()
    expect(within(hire).getByText('예')).toBeInTheDocument()

    const created = within(table).getByText('한지우').closest('tr')!
    expect(within(created).getByText('아니요')).toBeInTheDocument()

    const ops = within(table).getByText('서지원').closest('tr')!
    expect(within(ops).getByText('경영지원')).toBeInTheDocument()
    expect(within(ops).getByText('인사팀')).toBeInTheDocument()
    expect(within(ops).getByText('—')).toBeInTheDocument()

    expect(screen.getByText(/전체 사용자 5명/)).toBeInTheDocument()
  })

  it('역할 필터 "신입"을 고르면 신입만 보인다', async () => {
    const user = userEvent.setup()
    renderPage()
    const table = await screen.findByRole('table', { name: '사용자 목록' })

    // 역할 필터는 탭이 아니라 목록을 거르는 필터 버튼이다(aria-pressed)
    expect(screen.getByRole('group', { name: '역할 필터' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^전체 5$/ })).toHaveAttribute('aria-pressed', 'true')
    const newHire = screen.getByRole('button', { name: /^신입 2$/, pressed: false })
    await user.click(newHire)
    expect(newHire).toHaveAttribute('aria-pressed', 'true')

    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(table).queryByText('강민재')).not.toBeInTheDocument()
    expect(within(table).queryByText('서지원')).not.toBeInTheDocument()
    expect(within(table).getByText('김하늘')).toBeInTheDocument()
  })
})

describe('UsersPage 등록 폼', () => {
  it('역할에 따라 입력 칸이 바뀐다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table', { name: '사용자 목록' })

    await user.click(screen.getByRole('radio', { name: '경영지원' }))
    expect(screen.getByLabelText('부서')).toBeInTheDocument()
    expect(screen.queryByLabelText('소속 팀')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('입사일')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '신입' }))
    expect(screen.getByLabelText('소속 팀')).toBeInTheDocument()
    expect(screen.getByLabelText('입사일')).toBeInTheDocument()
    expect(screen.getByLabelText('본사 출입 대상')).toBeInTheDocument()
    expect(screen.queryByLabelText('부서')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '교육 담당자' }))
    expect(screen.getByLabelText('소속 팀')).toBeInTheDocument()
    expect(screen.queryByLabelText('입사일')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('부서')).not.toBeInTheDocument()

    // 관리자 역할은 고를 수 없다
    expect(screen.queryByRole('radio', { name: '관리자' })).not.toBeInTheDocument()
  })

  it('역할은 라디오 그룹이라 ←/→로 고를 수 있다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table', { name: '사용자 목록' })
    const newHire = screen.getByRole('radio', { name: '신입' })
    expect(newHire).toBeChecked()

    await user.click(newHire)
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('radio', { name: '교육 담당자' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '교육 담당자' })).toHaveFocus()
    expect(screen.queryByLabelText('입사일')).not.toBeInTheDocument()
  })

  it('필수 칸이 비었거나 비밀번호가 8자 미만이면 등록할 수 없다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table', { name: '사용자 목록' })
    expect(submitButton()).toBeDisabled()

    await fillCommon(user, { password: 'short7!' })
    expect(submitButton()).toBeDisabled()

    await user.type(screen.getByLabelText('초기 비밀번호'), 'x')
    expect(submitButton()).toBeEnabled()

    await user.clear(screen.getByLabelText('이름'))
    expect(submitButton()).toBeDisabled()
    await user.type(screen.getByLabelText('이름'), '테스트 신입')

    // 경영지원은 부서를 골라야 한다
    await user.click(screen.getByRole('radio', { name: '경영지원' }))
    expect(submitButton()).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('부서'), 'ga')
    expect(submitButton()).toBeEnabled()
  })

  it('등록에 성공하면 폼 값을 보내고, 목록을 다시 불러오고, 안내를 보여 준다', async () => {
    const user = userEvent.setup()
    agentFetch.mockResolvedValueOnce(okResponse('new-id'))
    renderPage()
    await screen.findByRole('table', { name: '사용자 목록' })

    await fillCommon(user)
    await user.selectOptions(screen.getByLabelText('소속 팀'), 'team-sales')
    await user.clear(screen.getByLabelText('입사일'))
    await user.type(screen.getByLabelText('입사일'), '2026-11-20')
    await user.click(screen.getByLabelText('본사 출입 대상'))
    const loadsBefore = state.profileLoads

    await user.click(submitButton())

    expect(await screen.findByText(/계정을 만들었어요\. 메일과 비밀번호를 전달해 주세요/)).toBeInTheDocument()
    expect(agentFetch).toHaveBeenCalledTimes(1)
    expect(agentFetch).toHaveBeenCalledWith('/admin/users', {
      email: 'new.hire@demo.test',
      password: 'secret-123',
      full_name: '테스트 신입',
      job_title: '사원',
      role: 'new_hire',
      team_id: 'team-sales',
      hire_date: '2026-11-20',
      needs_hq_access: false,
    })
    expect(state.profileLoads).toBeGreaterThan(loadsBefore)
  })

  it('경영지원 등록에는 부서만 보내고 팀·입사일은 보내지 않는다', async () => {
    const user = userEvent.setup()
    agentFetch.mockResolvedValueOnce(okResponse('ops-id'))
    renderPage()
    await screen.findByRole('table', { name: '사용자 목록' })

    await user.click(screen.getByRole('radio', { name: '경영지원' }))
    await fillCommon(user)
    await user.selectOptions(screen.getByLabelText('부서'), 'accounting')
    await user.click(submitButton())

    await screen.findByText(/계정을 만들었어요/)
    expect(agentFetch).toHaveBeenCalledWith('/admin/users', {
      email: 'new.hire@demo.test',
      password: 'secret-123',
      full_name: '테스트 신입',
      job_title: '사원',
      role: 'ops_staff',
      department: 'accounting',
    })
  })

  it('이미 등록된 메일(409)이면 메일 칸 아래에 안내하고 입력값을 유지한다', async () => {
    const user = userEvent.setup()
    agentFetch.mockRejectedValueOnce(new AgentError(409, '이미 등록된 메일이에요'))
    renderPage()
    await screen.findByRole('table', { name: '사용자 목록' })

    await fillCommon(user)
    await user.click(submitButton())

    const email = screen.getByLabelText('메일')
    expect(await screen.findByText('이미 등록된 메일이에요')).toBeInTheDocument()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveValue('new.hire@demo.test')
    expect(screen.getByLabelText('이름')).toHaveValue('테스트 신입')
    expect(screen.getByLabelText('초기 비밀번호')).toHaveValue('secret-123')
  })

  it.each([
    [500, '계정을 만들지 못했어요'],
    [0, '에이전트 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'],
  ])('등록 실패(%i)면 다시 시도 안내를 보이고 입력값을 유지한다', async (status, message) => {
    const user = userEvent.setup()
    agentFetch.mockRejectedValueOnce(new AgentError(status, message))
    renderPage()
    await screen.findByRole('table', { name: '사용자 목록' })

    await fillCommon(user)
    await user.click(submitButton())

    expect(await screen.findByText('계정을 만들지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(screen.getByLabelText('메일')).toHaveValue('new.hire@demo.test')
    expect(screen.getByLabelText('초기 비밀번호')).toHaveValue('secret-123')
    expect(submitButton()).toBeEnabled()
  })

  it('등록 버튼을 연타해도 한 번만 요청한다', async () => {
    const user = userEvent.setup()
    let resolve: (r: Response) => void = () => {}
    agentFetch.mockImplementationOnce(() => new Promise<Response>((r) => (resolve = r)))
    renderPage()
    await screen.findByRole('table', { name: '사용자 목록' })

    await fillCommon(user)
    const button = submitButton()
    await user.click(button)
    await user.click(button)
    await user.click(button)
    resolve(okResponse('new-id'))

    await screen.findByText(/계정을 만들었어요/)
    expect(agentFetch).toHaveBeenCalledTimes(1)
  })
})

describe('데모 데이터 초기화', () => {
  it('확인 창에 "초기화"를 입력해야 실행되고, 끝나면 완료를 알린다', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValueOnce({ data: null, error: null, status: 204 })
    renderPage()
    await screen.findByRole('table', { name: '사용자 목록' })

    await user.click(screen.getByRole('button', { name: '데모 데이터 초기화' }))
    const dialog = await screen.findByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', { name: '초기화' })
    expect(confirm).toBeDisabled()

    await user.type(within(dialog).getByRole('textbox'), '초기')
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), '화')
    expect(confirm).toBeEnabled()

    await user.click(confirm)

    expect(await screen.findByText('데모 데이터를 초기화했어요.')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('reset_demo')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('초기화가 실패하면 확인 창에 다시 시도 안내를 보인다', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 })
    renderPage()
    await screen.findByRole('table', { name: '사용자 목록' })

    await user.click(screen.getByRole('button', { name: '데모 데이터 초기화' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.type(within(dialog).getByRole('textbox'), '초기화')
    await user.click(within(dialog).getByRole('button', { name: '초기화' }))

    expect(await within(dialog).findByText('초기화하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
  })
})
