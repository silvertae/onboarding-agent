import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'
import { makeTemplate } from '@/features/staff/testFixtures'
import { DbError } from '@/lib/errors'
import type { TaskStage, TaskTemplate } from '@/lib/tasks'

type Status = 'success' | 'loading' | 'error'

const { state, actions, refetch, store } = vi.hoisted(() => {
  // 목 데이터가 바뀐 것을 화면에 알린다(실제 훅의 쿼리 무효화 → 다시 그리기 흉내)
  const listeners = new Set<() => void>()
  const store = {
    version: 0,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    changed: () => {
      store.version += 1
      listeners.forEach((listener) => listener())
    },
  }
  return {
    state: {
      profile: null as unknown,
      active: [] as TaskTemplate[],
      archived: [] as TaskTemplate[],
      usage: new Map<string, number>(),
      status: 'success' as Status,
    },
    actions: { save: vi.fn(), archive: vi.fn(), restore: vi.fn(), addForHire: vi.fn() },
    refetch: vi.fn(),
    store,
  }
})

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ profile: state.profile, session: { user: { id: 'u1' } }, loading: false }),
}))
vi.mock('@/features/newhire/useTeamName', () => ({
  useTeamName: (teamId: string | null | undefined) => (teamId ? 'AI팀' : null),
}))
// 데이터 훅만 목으로 바꾼다. 잠금 판단(isLocked·lockedFieldsChanged) 같은 순수 함수는 실제 것을 쓴다.
vi.mock('./templates', async (importOriginal) => {
  const { useSyncExternalStore } = await import('react')
  const query = <T,>(data: T) => ({
    data: state.status === 'success' ? data : undefined,
    isLoading: state.status === 'loading',
    isError: state.status === 'error',
    isFetching: false,
    refetch,
  })
  return {
    ...(await importOriginal<typeof import('./templates')>()),
    useManagedTemplates: (view: 'active' | 'archived') => {
      useSyncExternalStore(store.subscribe, () => store.version)
      return query(view === 'active' ? state.active : state.archived)
    },
    useTemplateUsage: () => {
      useSyncExternalStore(store.subscribe, () => store.version)
      return query(state.usage)
    },
    useTemplateActions: () => actions,
  }
})
// 서식 영역(TemplateFilesPanel): 목록 훅만 목으로 바꾼다. 화면 동작은 TemplateFilesPanel.test가 본다.
vi.mock('@/lib/taskFiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/taskFiles')>()),
  useTemplateFiles: () => ({ data: [], isLoading: false, isPending: false, isError: false, isFetching: false, refetch: vi.fn() }),
  uploadTaskFile: vi.fn(),
  deleteTaskFile: vi.fn(),
  downloadTaskFile: vi.fn(),
}))

import { STAGE_START_DAYS } from './stage'
import { TemplatesPage } from './TemplatesPage'

const TRAINER = { id: 'trainer', org_id: 'org-1', role: 'team_trainer', team_id: 'team-ai', department: null, full_name: '가상 서준' }
const OPS = { id: 'ops-hr', org_id: 'org-1', role: 'ops_staff', team_id: null, department: 'hr', full_name: '가상 지은' }

function ai(code: string, title: string, stage: TaskStage, overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return makeTemplate({
    id: `id-${code}`,
    code,
    title,
    stage,
    team_id: 'team-ai',
    department: null,
    kind: 'practice',
    completion_mode: 'self',
    due_offset_days: STAGE_START_DAYS[stage],
    ...overrides,
  })
}

function aiTemplates(): TaskTemplate[] {
  return [
    ai('AI-01', '사무실 돌며 인사하기', 'day1', { kind: 'ops' }),
    ai('AI-02', '팀 업무·팀원 소개', 'day1', { kind: 'read' }),
    ai('AI-05', '간단 코딩테스트', 'week1', { kind: 'assessment', completion_mode: 'staff_only' }),
    ai('AI-09', 'BTP 개발 초기 세팅', 'week1', {
      kind: 'setup',
      checklist: ['SAP 계정', 'cf cli'],
      prerequisite_codes: ['AI-02'],
    }),
    ai('AI-11', '사내 위키 둘러보기', 'week1', { description: '사내 위키의 팀 공간을 둘러봐 주세요.', due_offset_days: 7 }),
    ai('AI-12', '첫 달 회고', 'month1'),
  ]
}

const ARCHIVED = () => [ai('AI-07', '프린터 사용', 'week1', { archived_at: '2026-11-18T00:00:00Z' })]

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

function renderPage({
  profile = TRAINER as unknown,
  path = '/tasks',
  active = aiTemplates(),
  archived = ARCHIVED(),
  usage = new Map([
    ['id-AI-01', 2],
    ['id-AI-02', 2],
    ['id-AI-05', 2],
    ['id-AI-09', 2],
  ]),
  status = 'success' as Status,
} = {}) {
  state.profile = profile
  state.active = active
  state.archived = archived
  state.usage = usage
  state.status = status
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/tasks"
            element={
              <>
                <TemplatesPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const list = () => screen.getByRole('region', { name: 'AI팀 온보딩 과제' })
const panel = (name: string) => screen.getByRole('region', { name })
const saveButton = () => screen.getByRole('button', { name: '저장' })
const filesArea = (edit: HTMLElement) => within(edit).getByRole('region', { name: '서식' })

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset())
  refetch.mockReset()
})

describe('TemplatesPage (S12) 목록', () => {
  it('교육 담당자: 머리말에 팀 이름, 목록은 단계 3묶음, 행마다 코드·제목·진행 중 N명', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '온보딩 과제' })).toBeInTheDocument()
    expect(
      screen.getByText('AI팀 신입에게 들어갈 온보딩 과제를 관리해요. 새로 만든 과제는 이후 온보딩을 시작하는 신입부터 들어가요.'),
    ).toBeInTheDocument()
    expect(within(list()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['입사일', '첫 주', '첫 달'])

    const row = within(list()).getByRole('link', { name: /AI-01/ })
    expect(row).toHaveTextContent('사무실 돌며 인사하기')
    expect(row).toHaveTextContent('진행 중 2명')
    expect(row).toHaveAttribute('href', '/tasks?template=AI-01')
    expect(within(list()).getByRole('link', { name: /AI-11/ })).toHaveTextContent('진행 중 0명')
  })

  it('교육 담당자는 종류에 "평가"가 있다', () => {
    renderPage({ path: '/tasks?template=AI-11' })
    const kind = screen.getByRole('group', { name: '종류' })
    expect(within(kind).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      '안내',
      '읽기',
      '실습',
      '체크리스트',
      '평가',
    ])
  })

  it('경영지원: 머리말은 부서 과제, 종류에 "평가"가 없다', () => {
    renderPage({
      profile: OPS,
      active: [makeTemplate({ id: 'id-HR-01', code: 'HR-01', title: '근로계약서 작성', stage: 'day1', department: 'hr', team_id: null })],
      archived: [],
      usage: new Map(),
    })
    expect(
      screen.getByText('모든 신입에게 들어갈 인사팀 과제를 관리해요. 새로 만든 과제는 이후 온보딩을 시작하는 신입부터 들어가요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '인사팀 온보딩 과제' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: '종류' })).queryByRole('radio', { name: '평가' })).not.toBeInTheDocument()
  })

  it('?template 없이 들어오면 첫 과제를 보여 주고 주소에도 적는다', () => {
    renderPage()
    expect(within(list()).getByRole('link', { name: /AI-01/ })).toHaveAttribute('aria-current', 'true')
    expect(panel('사무실 돌며 인사하기')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/tasks?template=AI-01')
  })

  it('?template=AI-09로 들어오면 그 과제가 선택된 상태다', () => {
    renderPage({ path: '/tasks?template=AI-09' })
    expect(within(list()).getByRole('link', { name: /AI-09/ })).toHaveAttribute('aria-current', 'true')
    expect(within(list()).getByRole('link', { name: /AI-01/ })).not.toHaveAttribute('aria-current')
    const edit = panel('BTP 개발 초기 세팅')
    expect(within(edit).getByText('AI-09')).toBeInTheDocument()
    expect(within(edit).getByText('진행 중 2명')).toBeInTheDocument()
    expect(within(edit).getByLabelText('제목')).toHaveValue('BTP 개발 초기 세팅')
  })

  it('목록을 불러오지 못하면 목록 안에 다시 불러오기를 둔다', async () => {
    renderPage({ status: 'error' })
    expect(within(list()).getByText('과제를 불러오지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument()
    await userEvent.click(within(list()).getByRole('button', { name: '다시 불러오기' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('불러오는 중에는 "불러오는 중…"을 알리고, 비어 있으면 안내한다', () => {
    const { unmount } = renderPage({ status: 'loading' })
    expect(within(list()).getByRole('status')).toHaveTextContent('불러오는 중…')
    expect(screen.getByRole('button', { name: '과제 추가' })).toBeInTheDocument()
    unmount()

    renderPage({ active: [] })
    expect(within(list()).getByText('아직 과제가 없어요. "과제 추가"로 첫 과제를 만들어 보세요.')).toBeInTheDocument()
  })

  it('보관 보기가 비었으면 "보관한 과제가 없어요."', async () => {
    renderPage({ archived: [] })
    await userEvent.click(screen.getByRole('radio', { name: '보관' }))
    expect(within(list()).getByText('보관한 과제가 없어요.')).toBeInTheDocument()
    expect(within(list()).queryByText('아직 과제가 없어요. "과제 추가"로 첫 과제를 만들어 보세요.')).not.toBeInTheDocument()
  })
})

describe('TemplatesPage 과제 추가', () => {
  it('"과제 추가" → 빈 편집 칸(안내 · 신입이 완료 · 입사일 · 0일). 제목이 비면 저장이 막힌다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '과제 추가' }))

    const edit = panel('과제 추가')
    expect(within(edit).getByLabelText('제목')).toHaveValue('')
    expect(within(edit).getByLabelText('안내문')).toHaveValue('')
    expect(within(edit).getByRole('radio', { name: '안내' })).toBeChecked()
    expect(within(edit).getByRole('radio', { name: '신입이 완료' })).toBeChecked()
    expect(within(edit).getByLabelText('단계')).toHaveValue('day1')
    expect(within(edit).getByLabelText('기한')).toHaveValue(0)
    expect(within(edit).getByRole('checkbox', { name: '해당 없음 허용' })).not.toBeChecked()
    expect(within(edit).queryByRole('button', { name: /보관/ })).not.toBeInTheDocument()
    expect(saveButton()).toBeDisabled()

    await user.type(within(edit).getByLabelText('제목'), '   ')
    expect(saveButton()).toBeDisabled()
    await user.type(within(edit).getByLabelText('제목'), '사내 위키 정리')
    expect(saveButton()).toBeEnabled()
  })

  it('"과제 추가"는 제목 칸으로 포커스를 옮기고, 쓰는 중에 다시 누르면 빈 칸으로 돌아간다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '과제 추가' }))
    expect(screen.getByLabelText('제목')).toHaveFocus()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tasks$/)

    await user.type(screen.getByLabelText('제목'), '쓰다 만 과제')
    await user.click(screen.getByRole('radio', { name: '읽기' }))
    await user.click(screen.getByRole('button', { name: '과제 추가' }))
    expect(screen.getByLabelText('제목')).toHaveValue('')
    expect(screen.getByLabelText('제목')).toHaveFocus()
    expect(screen.getByRole('radio', { name: '안내' })).toBeChecked()
  })

  it('체크리스트 종류에 항목이 없으면 문구를 보이고 저장을 막는다. 항목을 넣으면 풀린다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '과제 추가' }))
    await user.type(screen.getByLabelText('제목'), 'BTP 세팅')
    await user.click(screen.getByRole('radio', { name: '체크리스트' }))

    expect(screen.getByText('체크리스트 항목을 하나 이상 넣어 주세요.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: '새 항목' }), 'SAP 계정')
    await user.click(screen.getByRole('button', { name: '추가' }))
    expect(screen.getByRole('textbox', { name: '항목 1' })).toHaveValue('SAP 계정')
    expect(screen.getByRole('textbox', { name: '새 항목' })).toHaveValue('')
    expect(screen.queryByText('체크리스트 항목을 하나 이상 넣어 주세요.')).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'SAP 계정 지우기' }))
    expect(screen.getByText('체크리스트 항목을 하나 이상 넣어 주세요.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('평가를 고르면 완료 방식이 "담당자만 처리"로 바뀌고 고를 수 없다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '과제 추가' }))
    await user.click(screen.getByRole('radio', { name: '평가' }))

    const mode = screen.getByRole('group', { name: '완료 방식' })
    expect(within(mode).getByRole('radio', { name: '담당자만 처리' })).toBeChecked()
    for (const radio of within(mode).getAllByRole('radio')) expect(radio).toBeDisabled()
  })

  it('새 과제 저장은 연타해도 한 번만 부르고, 저장되면 그 과제를 선택하고 추가 문구를 보인다', async () => {
    const user = userEvent.setup()
    const call = deferred<TaskTemplate>()
    actions.save.mockReturnValue(call.promise)
    renderPage()
    await user.click(screen.getByRole('button', { name: '과제 추가' }))
    await user.type(screen.getByLabelText('제목'), '사내 위키 정리')
    await user.click(saveButton())
    await user.click(saveButton())

    expect(actions.save).toHaveBeenCalledTimes(1)
    expect(actions.save).toHaveBeenCalledWith(null, {
      title: '사내 위키 정리',
      description: '',
      kind: 'ops',
      completionMode: 'self',
      stage: 'day1',
      daysInStage: 0,
      allowNa: false,
      checklist: null,
      prerequisiteCodes: [],
    })

    // 저장 훅은 목록을 다시 읽은 뒤 끝난다
    const created = ai('AI-13', '사내 위키 정리', 'day1', { kind: 'ops' })
    state.active = [...state.active, created]
    call.resolve(created)

    expect(await screen.findByText('과제를 추가했어요. 이후 온보딩을 시작하는 신입부터 들어가요.')).toBeInTheDocument()
    // 주소는 효과에서 옮기므로 문구가 그려진 직후에는 아직 바뀌기 전일 수 있다
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tasks?template=AI-13'))
    expect(panel('사내 위키 정리')).toBeInTheDocument()
    expect(within(list()).getByRole('link', { name: /AI-13/ })).toHaveAttribute('aria-current', 'true')
    // 저장 버튼이 있던 새 과제 패널이 사라지므로 새 과제의 패널 머리로 포커스를 옮긴다
    expect(screen.getByRole('heading', { level: 2, name: '사내 위키 정리' })).toHaveFocus()
  })
})

describe('TemplatesPage 편집', () => {
  it('사용 중인 과제: 잠금 안내, 제목·안내문 외 칸은 읽기 전용', () => {
    renderPage({ path: '/tasks?template=AI-09' })
    const edit = panel('BTP 개발 초기 세팅')

    expect(
      within(edit).getByText('신입 2명이 진행 중이라 제목과 안내문만 고칠 수 있어요. 다른 칸을 바꾸려면 보관하고 새로 만들어 주세요.'),
    ).toBeInTheDocument()
    expect(within(edit).getByLabelText('제목')).toBeEnabled()
    expect(within(edit).getByLabelText('안내문')).toBeEnabled()

    for (const radio of within(within(edit).getByRole('group', { name: '종류' })).getAllByRole('radio')) expect(radio).toBeDisabled()
    for (const radio of within(within(edit).getByRole('group', { name: '완료 방식' })).getAllByRole('radio')) expect(radio).toBeDisabled()
    expect(within(edit).getByRole('radio', { name: '체크리스트' })).toBeChecked()
    expect(within(edit).getByLabelText('단계')).toBeDisabled()
    expect(within(edit).getByLabelText('기한')).toBeDisabled()
    expect(within(edit).getByRole('checkbox', { name: '해당 없음 허용' })).toBeDisabled()
    expect(within(edit).getByRole('textbox', { name: '항목 1' })).toBeDisabled()
    expect(within(edit).getByRole('textbox', { name: '항목 1' })).toHaveValue('SAP 계정')
    expect(within(edit).queryByRole('textbox', { name: '새 항목' })).not.toBeInTheDocument()
    const prerequisites = within(within(edit).getByRole('group', { name: /선행 과제/ })).getAllByRole('checkbox')
    expect(prerequisites.length).toBeGreaterThan(0)
    for (const box of prerequisites) expect(box).toBeDisabled()
    expect(within(edit).getByRole('checkbox', { name: /AI-02/ })).toBeChecked()
  })

  it('사용 중인 과제의 제목을 고쳐 저장하면 saveTemplate(id, …)를 부르고 "저장했어요"', async () => {
    const user = userEvent.setup()
    actions.save.mockResolvedValue(ai('AI-09', 'BTP 초기 세팅', 'week1'))
    renderPage({ path: '/tasks?template=AI-09' })
    const title = screen.getByLabelText('제목')
    await user.clear(title)
    await user.type(title, 'BTP 초기 세팅')
    await user.click(saveButton())

    expect(actions.save).toHaveBeenCalledTimes(1)
    expect(actions.save).toHaveBeenCalledWith('id-AI-09', {
      title: 'BTP 초기 세팅',
      description: '',
      kind: 'setup',
      completionMode: 'self',
      stage: 'week1',
      daysInStage: 0,
      allowNa: false,
      checklist: ['SAP 계정', 'cf cli'],
      prerequisiteCodes: ['AI-02'],
    })
    expect(await screen.findByText('저장했어요')).toBeInTheDocument()
  })

  it('기본으로 고른 과제의 단계를 바꿔 저장해도 패널이 그 과제에 머문다', async () => {
    const user = userEvent.setup()
    const before = aiTemplates()
    renderPage({ active: before, usage: new Map() })
    expect(panel('사무실 돌며 인사하기')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('단계'), 'month1')
    const moved = { ...before[0], stage: 'month1' as const, due_offset_days: STAGE_START_DAYS.month1 }
    actions.save.mockImplementation(async () => {
      // 저장 훅은 다시 읽은 목록과 함께 끝난다: AI-01이 첫 달 묶음 끝으로 옮겨 간다
      state.active = [...before.slice(1), moved]
      return moved
    })
    await user.click(saveButton())

    expect(await screen.findByText('저장했어요')).toBeInTheDocument()
    expect(panel('사무실 돌며 인사하기')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/tasks?template=AI-01')
    expect(within(list()).getByRole('link', { name: /AI-01/ })).toHaveAttribute('aria-current', 'true')
  })

  it('열어 둔 사이 신입이 들어와 저장이 거부되면, 다시 읽은 사용 수로 잠금 안내와 저장된 값을 보인다', async () => {
    const user = userEvent.setup()
    renderPage({ path: '/tasks?template=AI-11' })
    await user.selectOptions(screen.getByLabelText('단계'), 'month1')
    actions.save.mockImplementation(async () => {
      // 훅이 실패 뒤 사용 수를 다시 읽는다: 그 사이 신입 1명이 들어왔다
      state.usage = new Map([...state.usage, ['id-AI-11', 1]])
      store.changed()
      throw new DbError(400, '진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다', '22023')
    })
    await user.click(saveButton())

    expect(await screen.findByText('저장하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
    expect(
      screen.getByText('신입 1명이 진행 중이라 제목과 안내문만 고칠 수 있어요. 다른 칸을 바꾸려면 보관하고 새로 만들어 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('단계')).toBeDisabled()
    expect(screen.getByLabelText('단계')).toHaveValue('week1')

    actions.save.mockResolvedValue(ai('AI-11', '사내 위키 둘러보기', 'week1'))
    await user.click(saveButton())
    expect(actions.save).toHaveBeenLastCalledWith('id-AI-11', expect.objectContaining({ stage: 'week1', daysInStage: 2 }))
  })

  it('입력 양식 과제는 종류가 "입력 양식" 하나뿐이고 바꿀 수 없다', () => {
    renderPage({
      path: '/tasks?template=AI-04',
      active: [ai('AI-04', '기술스택·경력 조사', 'day1', { kind: 'input', form_schema: null })],
      usage: new Map(),
    })
    const kind = within(screen.getByRole('group', { name: '종류' })).getAllByRole('radio')
    expect(kind).toHaveLength(1)
    expect(kind[0].closest('label')).toHaveTextContent('입력 양식')
    expect(kind[0]).toBeChecked()
    expect(kind[0]).toBeDisabled()
    // 사용 중이 아니면 다른 칸은 고칠 수 있다
    expect(screen.getByLabelText('단계')).toBeEnabled()
  })

  it('편집 칸은 340px 기준으로 두 칸이 된다(시안 S12 .form-grid). 대화 상자용 260px 기준을 쓰지 않는다', () => {
    renderPage({ path: '/tasks?template=AI-09' })
    const rows = [screen.getByRole('group', { name: '종류' }), screen.getByLabelText('단계')].map(
      (el) => el.closest('[class*="grid-cols-"]')?.className,
    )
    for (const row of rows) {
      expect(row).toContain('minmax(min(100%,340px),1fr)')
    }
  })

  it('이 과제를 이미 (보관한 과제를 거쳐서라도) 기다리는 과제는 선행 후보에서 빠진다', () => {
    renderPage({
      path: '/tasks?template=AI-11',
      active: [
        ai('AI-01', '사무실 돌며 인사하기', 'day1'),
        ai('AI-11', '사내 위키 둘러보기', 'week1'),
        ai('AI-12', '첫 달 회고', 'month1', { prerequisite_codes: ['AI-11'] }),
        ai('AI-13', '위키 문서 고치기', 'month1', { prerequisite_codes: ['AI-07'] }),
        ai('AI-14', '회고 공유', 'month1', { prerequisite_codes: ['AI-12'] }),
      ],
      archived: [ai('AI-07', '프린터 사용', 'week1', { archived_at: '2026-11-18T00:00:00Z', prerequisite_codes: ['AI-11'] })],
      usage: new Map(),
    })
    const names = within(screen.getByRole('group', { name: /선행 과제/ }))
      .getAllByRole('checkbox')
      .map((box) => box.closest('label')?.textContent)
    // AI-12는 직접, AI-14는 AI-12를 거쳐, AI-13은 보관한 AI-07을 거쳐 AI-11을 기다린다
    expect(names).toEqual(['AI-01 사무실 돌며 인사하기'])
  })

  it('저장에 실패하면 문구를 보이고 입력값을 그대로 둔다', async () => {
    const user = userEvent.setup()
    actions.save.mockRejectedValue(new DbError(500, 'boom'))
    renderPage({ path: '/tasks?template=AI-11' })
    const title = screen.getByLabelText('제목')
    await user.clear(title)
    await user.type(title, '사내 위키 정리')
    await user.click(saveButton())

    expect(await screen.findByText('저장하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
    expect(screen.getByLabelText('제목')).toHaveValue('사내 위키 정리')
    expect(screen.getByLabelText('기한')).toHaveValue(2)
    expect(saveButton()).toBeEnabled()
  })

  it('선행 과제 후보는 사용 중인 과제에서 나온다: 자기 자신과 보관한 과제가 없고, 3개를 고르면 4번째는 고를 수 없다', async () => {
    const user = userEvent.setup()
    // 보관 목록에만 있는 AI-07은 후보가 아니다
    renderPage({ path: '/tasks?template=AI-11', archived: [ai('AI-07', '프린터 사용', 'week1', { archived_at: '2026-11-18T00:00:00Z' })] })
    const group = screen.getByRole('group', { name: /선행 과제/ })
    expect(group).toHaveTextContent('최대 3개')
    const names = within(group)
      .getAllByRole('checkbox')
      .map((box) => box.closest('label')?.textContent)
    expect(names.some((n) => n?.includes('AI-11'))).toBe(false)
    expect(names.some((n) => n?.includes('AI-07'))).toBe(false)
    expect(names.some((n) => n?.includes('AI-01'))).toBe(true)

    await user.click(within(group).getByRole('checkbox', { name: /AI-01/ }))
    await user.click(within(group).getByRole('checkbox', { name: /AI-02/ }))
    await user.click(within(group).getByRole('checkbox', { name: /AI-05/ }))
    expect(within(group).getByRole('checkbox', { name: /AI-09/ })).toBeDisabled()
    expect(within(group).getByRole('checkbox', { name: /AI-12/ })).toBeDisabled()
    expect(within(group).getByRole('checkbox', { name: /AI-01/ })).toBeEnabled()

    actions.save.mockResolvedValue(ai('AI-11', '사내 위키 둘러보기', 'week1'))
    await user.click(saveButton())
    expect(actions.save).toHaveBeenCalledWith('id-AI-11', expect.objectContaining({ prerequisiteCodes: ['AI-01', 'AI-02', 'AI-05'] }))
  })
})

describe('TemplatesPage 보관·다시 사용', () => {
  it('"보관" → 확인 창 → 확인하면 archiveTemplate, 페이지 머리 아래 "보관했어요"', async () => {
    const user = userEvent.setup()
    actions.archive.mockImplementation(async (id: string) => {
      // 저장 훅은 다시 읽은 목록과 함께 끝난다: 보관한 과제는 사용 중 보기에서 빠진다
      state.active = state.active.filter((t) => t.id !== id)
      return ai('AI-11', '사내 위키 둘러보기', 'week1')
    })
    renderPage({ path: '/tasks?template=AI-11' })
    await user.click(screen.getByRole('button', { name: '보관' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('heading', { name: "'사내 위키 둘러보기' 과제를 보관할까요?" })).toBeInTheDocument()
    expect(
      within(dialog).getByText('이후 온보딩을 시작하는 신입에게 들어가지 않아요. 진행 중인 신입의 과제는 그대로예요.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '보관' }))

    expect(actions.archive).toHaveBeenCalledTimes(1)
    expect(actions.archive).toHaveBeenCalledWith('id-AI-11')
    expect(await screen.findByText('보관했어요')).toBeInTheDocument()
    // 보관한 과제는 사용 중 보기에서 빠지므로 첫 과제를 고르고, 포커스는 결과 알림으로 옮긴다
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tasks?template=AI-01'))
    expect(screen.getByText('보관했어요').closest('[role="status"]')).toHaveFocus()
  })

  it('연속으로 보관해도 두 번 모두 결과 알림으로 포커스가 간다', async () => {
    const user = userEvent.setup()
    actions.archive.mockImplementation(async (id: string) => {
      state.active = state.active.filter((t) => t.id !== id)
      return ai('AI-11', '사내 위키 둘러보기', 'week1')
    })
    renderPage({ path: '/tasks?template=AI-11' })
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('button', { name: '보관' }))
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '보관' }))
      await waitFor(() => expect(actions.archive).toHaveBeenCalledTimes(i + 1))
      await waitFor(() => expect(screen.getByText('보관했어요').closest('[role="status"]')).toHaveFocus())
      ;(document.activeElement as HTMLElement).blur()
    }
  })

  it('보관에 실패하면 "보관하지 못했어요…"를 보이고 패널을 그대로 둔다', async () => {
    const user = userEvent.setup()
    actions.archive.mockRejectedValue(new DbError(500, 'boom'))
    renderPage({ path: '/tasks?template=AI-11' })
    await user.click(screen.getByRole('button', { name: '보관' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '보관' }))

    expect(await screen.findByText('보관하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
    expect(screen.queryByText('저장하지 못했어요. 잠시 후 다시 시도해 주세요.')).not.toBeInTheDocument()
    expect(screen.queryByText('보관했어요')).not.toBeInTheDocument()
    expect(panel('사내 위키 둘러보기')).toBeInTheDocument()
  })

  it('다시 사용에 실패하면 "다시 사용하지 못했어요…"를 보인다', async () => {
    const user = userEvent.setup()
    actions.restore.mockRejectedValue(new DbError(500, 'boom'))
    renderPage()
    await user.click(screen.getByRole('radio', { name: '보관' }))
    await user.click(within(panel('프린터 사용')).getByRole('button', { name: '다시 사용' }))

    expect(await screen.findByText('다시 사용하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
    expect(screen.queryByText('저장하지 못했어요. 잠시 후 다시 시도해 주세요.')).not.toBeInTheDocument()
    expect(within(panel('프린터 사용')).getByRole('button', { name: '다시 사용' })).toBeEnabled()
  })

  it('확인 창에서 취소하면 보관하지 않는다', async () => {
    const user = userEvent.setup()
    renderPage({ path: '/tasks?template=AI-11' })
    await user.click(screen.getByRole('button', { name: '보관' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '취소' }))
    expect(actions.archive).not.toHaveBeenCalled()
  })

  it('보관 보기: 칸은 모두 읽기 전용이고 "다시 사용" → restoreTemplate', async () => {
    const user = userEvent.setup()
    actions.restore.mockResolvedValue(ai('AI-07', '프린터 사용', 'week1'))
    renderPage()
    await user.click(screen.getByRole('radio', { name: '보관' }))

    expect(within(list()).getByRole('link', { name: /AI-07/ })).toBeInTheDocument()
    expect(within(list()).queryByRole('link', { name: /AI-01/ })).not.toBeInTheDocument()
    const edit = panel('프린터 사용')
    expect(within(edit).getByLabelText('제목')).toBeDisabled()
    expect(within(edit).getByLabelText('안내문')).toBeDisabled()
    expect(within(edit).getByLabelText('단계')).toBeDisabled()
    expect(within(edit).queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    expect(within(edit).queryByRole('button', { name: '보관' })).not.toBeInTheDocument()

    await user.click(within(edit).getByRole('button', { name: '다시 사용' }))
    expect(actions.restore).toHaveBeenCalledWith('id-AI-07')
    expect(await screen.findByText('다시 사용해요. 이후 온보딩을 시작하는 신입부터 들어가요.')).toBeInTheDocument()
  })
})

describe('TemplatesPage 서식 영역', () => {
  it('사용 중(잠금) 과제를 골라도 서식 업로드 영역은 쓸 수 있다', () => {
    renderPage({ path: '/tasks?template=AI-09' })
    const edit = panel('BTP 개발 초기 세팅')
    expect(within(edit).getByText(/신입 2명이 진행 중이라/)).toBeInTheDocument()
    const files = filesArea(edit)
    expect(within(files).getByText('올린 서식은 이 과제를 받은 신입 모두에게 보여요.')).toBeInTheDocument()
    expect(within(files).getByRole('button', { name: '파일 선택' })).toBeEnabled()
  })

  it('"과제 추가" 직후에는 저장 전 안내만 있고 업로드 영역이 없다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '과제 추가' }))
    const files = filesArea(panel('과제 추가'))
    expect(within(files).getByText('과제를 저장하면 서식을 올릴 수 있어요.')).toBeInTheDocument()
    expect(within(files).queryByRole('button', { name: '파일 선택' })).not.toBeInTheDocument()
  })

  it('새 과제를 저장하면 그 과제 패널에 업로드 영역이 나타난다', async () => {
    const user = userEvent.setup()
    const created = ai('AI-13', '사내 위키 정리', 'day1', { kind: 'ops' })
    actions.save.mockImplementation(async () => {
      state.active = [...state.active, created]
      return created
    })
    renderPage()
    await user.click(screen.getByRole('button', { name: '과제 추가' }))
    await user.type(screen.getByLabelText('제목'), '사내 위키 정리')
    await user.click(saveButton())

    const files = filesArea(await screen.findByRole('region', { name: '사내 위키 정리' }))
    expect(within(files).queryByText('과제를 저장하면 서식을 올릴 수 있어요.')).not.toBeInTheDocument()
    expect(within(files).getByRole('button', { name: '파일 선택' })).toBeEnabled()
  })

  it('보관 보기에서는 서식 업로드 영역 대신 보관 안내', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('radio', { name: '보관' }))
    const files = filesArea(panel('프린터 사용'))
    expect(within(files).getByText('보관한 과제에는 서식을 올릴 수 없어요.')).toBeInTheDocument()
    expect(within(files).queryByRole('button', { name: '파일 선택' })).not.toBeInTheDocument()
  })
})
