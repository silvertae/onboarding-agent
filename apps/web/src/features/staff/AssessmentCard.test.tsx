import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { TaskView } from '@/lib/tasks'
import { makeTask, TEAM_ID } from './testFixtures'

const { actions } = vi.hoisted(() => ({
  actions: { recordAssessment: vi.fn(async () => {}) },
}))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'trainer' } } }) }))
vi.mock('@/lib/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tasks')>()),
  useTaskActions: () => actions,
}))

import { AssessmentCard } from './AssessmentCard'

const base = makeTask({
  id: 'ai-05',
  status: 'todo',
  scheduled_at: '2026-11-20T05:00:00Z',
  location: '7층 소회의실 B',
  assessment_result: 'pass',
  assessment_note: '기본기 좋음',
  template: { department: null, team_id: TEAM_ID, title: '간단 코딩테스트', kind: 'assessment', completion_mode: 'staff_only' },
})

beforeEach(() => actions.recordAssessment.mockClear())

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
})
