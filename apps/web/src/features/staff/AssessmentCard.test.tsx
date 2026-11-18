import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { ExamListItem } from '@/features/exam/exams'
import type { TaskView } from '@/lib/tasks'
import type { Sitting } from './sittings'
import { makeTask, TEAM_ID } from './testFixtures'

const { actions, db, examList } = vi.hoisted(() => ({
  actions: { recordAssessment: vi.fn(async () => {}) },
  db: {
    sittings: [] as unknown[],
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    rpc: vi.fn(),
  },
  examList: { data: [] as unknown[] },
}))

vi.mock('@/lib/supabase', () => {
  const chain = {
    select: (...args: unknown[]) => (db.select(...args), chain),
    eq: (...args: unknown[]) => (db.eq(...args), chain),
    order: async (...args: unknown[]) => (db.order(...args), { data: db.sittings, error: null, status: 200 }),
  }
  return {
    supabase: {
      from: (table: string) => (db.from(table), chain),
      rpc: (...args: unknown[]) => db.rpc(...args),
      auth: { signOut: vi.fn() },
    },
  }
})
vi.mock('@/app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'trainer' } } }) }))
vi.mock('@/lib/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tasks')>()),
  useTaskActions: () => actions,
}))
vi.mock('@/features/exam/exams', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/exam/exams')>()),
  useExams: () => ({ data: examList.data, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}))

import { AssessmentCard } from './AssessmentCard'

function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = (node: ReactElement) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  )
  const result = rtlRender(wrap(ui))
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) }
}

function exam(id: string, title: string, status: ExamListItem['status']): ExamListItem {
  return {
    id,
    title,
    status,
    org_id: 'org-1',
    team_id: TEAM_ID,
    created_by: 'trainer',
    created_at: '2026-11-17T00:00:00Z',
    topic: 'JavaScript 기초',
    difficulty: 'beginner',
    question_count: 5,
  }
}

function sitting(examId: string, title: string): Sitting {
  return {
    id: `s-${examId}`,
    org_id: 'org-1',
    exam_id: examId,
    task_instance_id: 't1',
    assigned_by: 'trainer',
    bank_item_ids: [],
    created_at: '2026-11-18T00:00:00Z',
    exam: { id: examId, title },
  }
}

const base = makeTask({
  id: 'ai-05',
  status: 'todo',
  scheduled_at: '2026-11-20T05:00:00Z',
  location: '7층 소회의실 B',
  assessment_result: 'pass',
  assessment_note: '기본기 좋음',
  template: { department: null, team_id: TEAM_ID, title: '간단 코딩테스트', kind: 'assessment', completion_mode: 'staff_only' },
})

beforeEach(() => {
  actions.recordAssessment.mockClear()
  db.sittings = []
  examList.data = []
  for (const fn of [db.from, db.select, db.eq, db.order, db.rpc]) fn.mockReset()
})

describe('AssessmentCard', () => {
  it('다른 곳에서 바뀐 값은 손대지 않은 칸에 반영하고, 입력 중인 칸은 그대로 둔다', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<AssessmentCard task={base} />)

    await user.clear(screen.getByLabelText('메모'))
    await user.type(screen.getByLabelText('메모'), '내가 쓰는 메모')

    const changed: TaskView = { ...base, assessment_result: 'needs_followup', location: '5층 라운지', assessment_note: '다른 탭 메모' }
    rerender(<AssessmentCard task={changed} />)

    expect(screen.getByRole('radio', { name: '보충 필요' })).toBeChecked()
    expect(screen.getByLabelText('장소')).toHaveValue('5층 라운지')
    expect(screen.getByLabelText('메모')).toHaveValue('내가 쓰는 메모')

    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(actions.recordAssessment).toHaveBeenCalledWith(
      'ai-05',
      expect.objectContaining({ result: 'needs_followup', location: '5층 라운지', note: '내가 쓰는 메모' }),
    )
  })

  it('저장된 일정이나 장소를 비우면 저장할 수 없다고 안내한다(서버가 기존 값을 유지하므로)', async () => {
    const user = userEvent.setup()
    render(<AssessmentCard task={base} />)

    fireEvent.change(screen.getByLabelText('일정'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByText(/지울 수 없어요/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('일정'), { target: { value: '2026-11-21T10:00' } })
    await user.clear(screen.getByLabelText('장소'))
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()

    await user.type(screen.getByLabelText('장소'), '6층 회의실')
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
    expect(screen.queryByText(/지울 수 없어요/)).not.toBeInTheDocument()
  })

  it('저장된 결과가 있으면 "미기록"으로 되돌릴 수 없다(서버가 기존 결과를 유지하므로)', () => {
    render(<AssessmentCard task={base} />)
    expect(screen.getByRole('radio', { name: '미기록' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '통과' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: '보충 필요' })).toBeEnabled()
  })

  it('결과가 없으면 "미기록"을 고를 수 있다', () => {
    render(<AssessmentCard task={{ ...base, assessment_result: null }} />)
    expect(screen.getByRole('radio', { name: '미기록' })).toBeEnabled()
  })

  describe('응시 시험', () => {
    const task = makeTask({
      id: 't1',
      status: 'todo',
      template: { department: null, team_id: TEAM_ID, title: '간단 코딩테스트', kind: 'assessment', completion_mode: 'staff_only' },
    })
    const row = async () => within(await screen.findByRole('group', { name: '응시 시험' }))

    it('이 과제의 응시 기록을 연결한 순서대로 불러오고, 제목은 시험지(S8)로 이어진다', async () => {
      db.sittings = [sitting('e0', 'JS 기본기 — 비동기')]
      render(<AssessmentCard task={task} />)

      const link = await (await row()).findByRole('link', { name: 'JS 기본기 — 비동기' })
      expect(link).toHaveAttribute('href', '/team/exams/e0/print?variant=paper')
      expect(db.from).toHaveBeenCalledWith('exam_sittings')
      expect(db.select).toHaveBeenCalledWith('*, exam:exams(id,title)')
      expect(db.eq).toHaveBeenCalledWith('task_instance_id', 't1')
      expect(db.order).toHaveBeenCalledWith('created_at', { ascending: true })
    })

    it('확정된 시험만 선택지에 나온다(초안·이미 연결한 시험 제외)', async () => {
      examList.data = [exam('e1', '확정 시험', 'final'), exam('e2', '초안 시험', 'draft'), exam('e0', '연결한 시험', 'final')]
      db.sittings = [sitting('e0', '연결한 시험')]
      render(<AssessmentCard task={task} />)

      const r = await row()
      await r.findByRole('link', { name: '연결한 시험' })
      const select = r.getByRole('combobox', { name: '연결할 시험' })
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['확정 시험'])
    })

    it('"연결"을 누르면 assign_exam RPC를 부르고, "연결했어요"와 목록에 제목을 보여 준다', async () => {
      const user = userEvent.setup()
      examList.data = [exam('e1', '확정 시험', 'final')]
      db.rpc.mockImplementation(async () => {
        db.sittings = [sitting('e1', '확정 시험')]
        return { data: db.sittings[0], error: null, status: 200 }
      })
      render(<AssessmentCard task={task} />)

      await user.click(await (await row()).findByRole('button', { name: '연결' }))

      expect(db.rpc).toHaveBeenCalledWith('assign_exam', { p_task: 't1', p_exam: 'e1' })
      expect(await screen.findByText('연결했어요')).toHaveAttribute('role', 'status')
      expect(await (await row()).findByRole('link', { name: '확정 시험' })).toBeInTheDocument()
    })

    it('연결에 실패하면 실패 문구를 보여 준다', async () => {
      const user = userEvent.setup()
      examList.data = [exam('e1', '확정 시험', 'final')]
      db.rpc.mockResolvedValue({ data: null, error: { message: '확정된 시험만 연결할 수 있습니다', code: '22023' }, status: 400 })
      render(<AssessmentCard task={task} />)

      await user.click(await (await row()).findByRole('button', { name: '연결' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('시험을 연결하지 못했어요. 다시 시도해 주세요.')
      expect(screen.queryByText('연결했어요')).not.toBeInTheDocument()
    })

    it('연결한 시험이 없으면 없음 문구를 보여 준다', async () => {
      examList.data = [exam('e1', '확정 시험', 'final')]
      render(<AssessmentCard task={task} />)

      expect(await (await row()).findByText('아직 연결한 시험이 없어요.')).toBeInTheDocument()
    })

    it('확정된 시험이 없으면 선택 대신 안내 문구를 보여 준다', async () => {
      examList.data = [exam('e2', '초안 시험', 'draft')]
      render(<AssessmentCard task={task} />)

      const r = await row()
      const hint = await r.findByText((_, el) => el?.tagName === 'P' && el.textContent === '확정된 시험이 없어요. 시험 출제에서 먼저 확정해 주세요.')
      expect(within(hint).getByRole('link', { name: '시험 출제' })).toHaveAttribute('href', '/team/exams')
      expect(r.queryByRole('combobox')).not.toBeInTheDocument()
      expect(r.queryByRole('button', { name: '연결' })).not.toBeInTheDocument()
    })

    it.each(['blocked', 'na'] as const)('%s 과제에는 응시 시험 줄이 없다', (status) => {
      examList.data = [exam('e1', '확정 시험', 'final')]
      render(<AssessmentCard task={{ ...task, status }} />)

      expect(screen.queryByRole('group', { name: '응시 시험' })).not.toBeInTheDocument()
      expect(db.from).not.toHaveBeenCalled()
    })
  })
})
