import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { HIRES } from '@/features/staff/testFixtures'

const { actions } = vi.hoisted(() => ({
  actions: { save: vi.fn(), archive: vi.fn(), restore: vi.fn(), addForHire: vi.fn() },
}))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('./templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./templates')>()),
  useTemplateActions: () => actions,
}))

import { AddTaskButton, AddTaskDialog } from './AddTaskDialog'

const HIRE = HIRES[0] // 김하늘(가상)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset())
})

describe('AddTaskDialog', () => {
  it('제목은 "\'이름\'님에게 과제 추가", 안내 문구가 있고 선행 과제 칸은 없다', () => {
    render(<AddTaskDialog hire={HIRE} open onOpenChange={() => {}} allowAssessment />)
    const dialog = screen.getByRole('dialog', { name: "'김하늘'님에게 과제 추가" })
    expect(dialog).toHaveAccessibleDescription('이 신입에게만 들어가고, 바로 할 일로 보여요.')
    expect(within(dialog).getByLabelText('제목')).toBeInTheDocument()
    expect(within(dialog).queryByText(/선행 과제/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeInTheDocument()
  })

  it('교육 담당자에게는 종류 "평가"가 있고, 아니면 없다', () => {
    const { unmount } = render(<AddTaskDialog hire={HIRE} open onOpenChange={() => {}} allowAssessment />)
    expect(screen.getByRole('radio', { name: '평가' })).toBeInTheDocument()
    unmount()
    render(<AddTaskDialog hire={HIRE} open onOpenChange={() => {}} allowAssessment={false} />)
    expect(screen.queryByRole('radio', { name: '평가' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '안내' })).toBeChecked()
  })

  it('제목이 비어 있으면 "추가"를 누를 수 없다', async () => {
    const user = userEvent.setup()
    render(<AddTaskDialog hire={HIRE} open onOpenChange={() => {}} allowAssessment />)
    const add = screen.getByRole('button', { name: '추가' })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText('제목'), '   ')
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText('제목'), '가상 보충 학습')
    expect(add).toBeEnabled()
  })
})

describe('AddTaskButton (S6·S9 "이 신입에게 과제 추가")', () => {
  it('"추가" → addForHire(hire.id, 입력) 1회(두 번 눌러도 1회), 닫히고 "추가했어요"', async () => {
    const user = userEvent.setup()
    const pending = deferred<unknown>()
    actions.addForHire.mockReturnValueOnce(pending.promise)
    render(<AddTaskButton hire={HIRE} allowAssessment />)

    await user.click(screen.getByRole('button', { name: '이 신입에게 과제 추가' }))
    const dialog = screen.getByRole('dialog', { name: "'김하늘'님에게 과제 추가" })
    await user.type(within(dialog).getByLabelText('제목'), '가상 보충 학습')
    await user.type(within(dialog).getByLabelText('안내문'), '예제를 하나 만들어 보세요.')
    await user.click(within(dialog).getByRole('radio', { name: '실습' }))
    const add = within(dialog).getByRole('button', { name: '추가' })
    await user.click(add)
    await user.click(add)

    expect(actions.addForHire).toHaveBeenCalledTimes(1)
    expect(actions.addForHire).toHaveBeenCalledWith('h1', {
      title: '가상 보충 학습',
      description: '예제를 하나 만들어 보세요.',
      kind: 'practice',
      completionMode: 'self',
      stage: 'day1',
      daysInStage: 0,
      allowNa: false,
      checklist: null,
      prerequisiteCodes: [],
    })

    pending.resolve({ id: 'new-task' })
    expect(await screen.findByRole('status')).toHaveTextContent('추가했어요')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('실패하면 "추가하지 못했어요. 다시 시도해 주세요."를 보이고 대화 상자와 입력을 그대로 둔다', async () => {
    const user = userEvent.setup()
    actions.addForHire.mockRejectedValueOnce(new Error('boom'))
    render(<AddTaskButton hire={HIRE} allowAssessment={false} />)

    await user.click(screen.getByRole('button', { name: '이 신입에게 과제 추가' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('제목'), '가상 주차 등록')
    await user.click(within(dialog).getByRole('button', { name: '추가' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('추가하지 못했어요. 다시 시도해 주세요.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('제목')).toHaveValue('가상 주차 등록')
    expect(screen.queryByText('추가했어요')).not.toBeInTheDocument()
  })

  it('"취소"는 추가하지 않고 닫는다. 다시 열면 빈 칸이다', async () => {
    const user = userEvent.setup()
    render(<AddTaskButton hire={HIRE} allowAssessment />)

    await user.click(screen.getByRole('button', { name: '이 신입에게 과제 추가' }))
    await user.type(screen.getByLabelText('제목'), '가상 과제')
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(actions.addForHire).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '이 신입에게 과제 추가' }))
    expect(screen.getByLabelText('제목')).toHaveValue('')
  })

  it('취소하면 초점이 "이 신입에게 과제 추가" 버튼으로 돌아온다', async () => {
    const user = userEvent.setup()
    render(<AddTaskButton hire={HIRE} allowAssessment />)
    const opener = screen.getByRole('button', { name: '이 신입에게 과제 추가' })
    await user.click(opener)
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(opener).toHaveFocus()
  })

  it('Esc로 닫아도, 추가에 성공해도 초점이 같은 버튼으로 돌아온다', async () => {
    const user = userEvent.setup()
    actions.addForHire.mockResolvedValueOnce({ id: 'new-task' })
    render(<AddTaskButton hire={HIRE} allowAssessment />)
    const opener = screen.getByRole('button', { name: '이 신입에게 과제 추가' })
    await user.click(opener)
    await user.keyboard('{Escape}')
    expect(opener).toHaveFocus()

    await user.click(opener)
    await user.type(screen.getByLabelText('제목'), '가상 보충 학습')
    await user.click(screen.getByRole('button', { name: '추가' }))
    expect(await screen.findByRole('status')).toHaveTextContent('추가했어요')
    expect(opener).toHaveFocus()
  })
})
