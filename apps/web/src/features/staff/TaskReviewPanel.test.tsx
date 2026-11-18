import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { makeTask, TEAM_ID } from './testFixtures'

const { actions } = vi.hoisted(() => ({
  actions: {
    markNa: vi.fn(async (_id: string, _reason: string) => {}),
    confirm: vi.fn(async () => {}),
    requestRework: vi.fn(async () => {}),
  },
}))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tasks')>()),
  useTaskActions: () => actions,
}))

import { TaskReviewPanel } from './TaskReviewPanel'

const oneOff = makeTask({
  id: 'one-off',
  status: 'todo',
  template: {
    title: 'React 기초 보충 학습',
    kind: 'practice',
    completion_mode: 'self',
    department: null,
    team_id: TEAM_ID,
    assigned_to: 'h1',
    is_seed: false,
  },
})

beforeEach(() => {
  actions.markNa.mockReset()
  actions.markNa.mockResolvedValue(undefined)
})

describe('TaskReviewPanel 해당 없음 초점 이동', () => {
  it('열면 사유 입력으로 초점이 간다', async () => {
    const user = userEvent.setup()
    render(<TaskReviewPanel task={oneOff} />)
    await user.click(screen.getByRole('button', { name: '해당 없음' }))
    expect(screen.getByLabelText(/해당 없음 사유/)).toHaveFocus()
  })

  it('취소하면 "해당 없음" 버튼으로 초점이 돌아온다', async () => {
    const user = userEvent.setup()
    render(<TaskReviewPanel task={oneOff} />)
    await user.click(screen.getByRole('button', { name: '해당 없음' }))
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.getByRole('button', { name: '해당 없음' })).toHaveFocus()
  })

  it('처리에 성공하면 패널 제목으로 초점이 간다', async () => {
    const user = userEvent.setup()
    render(<TaskReviewPanel task={oneOff} />)
    await user.click(screen.getByRole('button', { name: '해당 없음' }))
    await user.type(screen.getByLabelText(/해당 없음 사유/), '차량이 없어요')
    await user.click(screen.getByRole('button', { name: '해당 없음으로 처리' }))
    expect(actions.markNa).toHaveBeenCalledWith('one-off', '차량이 없어요')
    expect(await screen.findByRole('heading', { name: 'React 기초 보충 학습' })).toHaveFocus()
  })
})
