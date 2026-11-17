import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import type { TaskView } from '@/lib/tasks'
import { makeTask, PROFILE, TEAM_ID } from './testFixtures'

const state = vi.hoisted(() => ({ tasks: [] as TaskView[] }))
const actions = vi.hoisted(() => ({
  submit: vi.fn(),
  markNa: vi.fn(),
  confirm: vi.fn(),
  requestRework: vi.fn(),
  recordAssessment: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ profile: PROFILE, session: { user: { id: 'u1' } }, loading: false, signOut: vi.fn() }),
}))
vi.mock('@/lib/tasks', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tasks')>()),
  useMyTasks: () => ({ data: state.tasks, isPending: false, isError: false }),
  useTaskActions: () => actions,
}))
vi.mock('./useTeamName', () => ({ useTeamName: () => 'AI팀' }))

import { TaskDetailPage } from './TaskDetailPage'

function renderDetail(task: TaskView, others: TaskView[] = []) {
  state.tasks = [task, ...others]
  return render(
    <MemoryRouter initialEntries={[`/me/tasks/${task.id}`]}>
      <Routes>
        <Route path="/me/tasks/:id" element={<TaskDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const ga07Form = { fields: [{ key: 'english_name', label: '영문 이름', type: 'text', required: true, placeholder: 'Haneul Kim' }] }

beforeEach(() => {
  for (const fn of Object.values(actions)) {
    fn.mockReset()
    fn.mockResolvedValue(undefined)
  }
})

describe('과제 상세', () => {
  it('self 과제: 버튼 "완료" → submit(id) 호출', async () => {
    const task = makeTask({ code: 'AI-01', title: '사무실 돌며 인사하기', kind: 'practice', completion_mode: 'self' })
    renderDetail(task)
    await userEvent.click(screen.getByRole('button', { name: '완료' }))
    expect(actions.submit).toHaveBeenCalledWith(task.id)
  })

  it('read 과제: 버튼 "읽었어요"', () => {
    renderDetail(makeTask({ code: 'HR-05', title: '복리후생 규정 열람', kind: 'read', completion_mode: 'self' }))
    expect(screen.getByRole('button', { name: '읽었어요' })).toBeInTheDocument()
  })

  it('confirm 과제: 버튼 "제출"', () => {
    renderDetail(makeTask({ code: 'GA-08', title: '웰컴키트 수령', kind: 'ops', completion_mode: 'confirm', department: 'ga' }))
    expect(screen.getByRole('button', { name: '제출' })).toBeInTheDocument()
    expect(screen.getByText('제출하면 총무팀이 확인해요')).toBeInTheDocument()
  })

  it('staff_only 과제: 버튼 없음, "담당자가 처리하면 완료됩니다"', () => {
    renderDetail(makeTask({ code: 'GA-04', title: '복지포인트 등록', completion_mode: 'staff_only', department: 'ga' }))
    expect(screen.getByText('담당자가 처리하면 완료됩니다')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /완료|제출|읽었어요/ })).not.toBeInTheDocument()
  })

  it('setup 과제: 체크리스트 4개 중 3개 체크 → 완료 비활성, 4개 → submit(id,{checked})', async () => {
    const items = ['SAP 계정', 'cf cli', 'mbt', 'cds cli']
    const task = makeTask({ code: 'AI-09', title: 'BTP 개발 초기 세팅', kind: 'setup', checklist: items, department: null, team_id: TEAM_ID })
    renderDetail(task)
    const done = screen.getByRole('button', { name: '완료' })
    for (const item of items.slice(0, 3)) await userEvent.click(screen.getByRole('checkbox', { name: item }))
    expect(done).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: 'cds cli' }))
    expect(done).toBeEnabled()
    await userEvent.click(done)
    expect(actions.submit).toHaveBeenCalledWith(task.id, { checked: items })
  })

  it('input 과제(GA-07): english_name 비어 있으면 제출 비활성, 입력 후 submit(id,{english_name})', async () => {
    const task = makeTask({ code: 'GA-07', title: '명함 신청', kind: 'input', completion_mode: 'confirm', department: 'ga', form_schema: ga07Form })
    renderDetail(task)
    const submit = screen.getByRole('button', { name: '제출' })
    expect(submit).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/영문 이름/), '  ')
    expect(submit).toBeDisabled()
    await userEvent.clear(screen.getByLabelText(/영문 이름/))
    await userEvent.type(screen.getByLabelText(/영문 이름/), 'Haneul Kim')
    await userEvent.click(submit)
    expect(actions.submit).toHaveBeenCalledWith(task.id, { english_name: 'Haneul Kim' })
  })

  it('GA-07: 프로필의 이름·직급·팀·이메일이 읽기 전용 미리보기로 표시', async () => {
    renderDetail(makeTask({ code: 'GA-07', title: '명함 신청', kind: 'input', completion_mode: 'confirm', department: 'ga', form_schema: ga07Form }))
    const preview = screen.getByRole('figure', { name: '명함 자동 채움 미리보기' })
    expect(preview).toHaveTextContent('가상하늘')
    expect(preview).toHaveTextContent('사원')
    expect(preview).toHaveTextContent('AI팀')
    expect(preview).toHaveTextContent('newhire@demo.test')
    await userEvent.type(screen.getByLabelText(/영문 이름/), 'Haneul Kim')
    expect(preview).toHaveTextContent('Haneul Kim')
  })

  it('input 과제(AI-04): 필수 칸이 모두 채워져야 제출, 선택 칸은 비워도 된다', async () => {
    const form = {
      fields: [
        { key: 'stacks', label: '사용해 본 기술스택', type: 'text', required: true },
        { key: 'experience', label: '프로젝트 경험', type: 'textarea', required: true },
        { key: 'career', label: '경력 요약', type: 'textarea', required: false },
      ],
    }
    const task = makeTask({ code: 'AI-04', title: '기술스택·경력 조사', kind: 'input', form_schema: form, department: null, team_id: TEAM_ID })
    renderDetail(task)
    const submit = screen.getByRole('button', { name: '제출' })
    await userEvent.type(screen.getByLabelText(/사용해 본 기술스택/), 'JavaScript')
    expect(submit).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/프로젝트 경험/), '사내 도구 개발')
    await userEvent.click(submit)
    expect(actions.submit).toHaveBeenCalledWith(task.id, { stacks: 'JavaScript', experience: '사내 도구 개발', career: '' })
  })

  it('allow_na=false → "해당 없음" 버튼 없음', () => {
    renderDetail(makeTask({ code: 'GA-08', title: '웰컴키트 수령', allow_na: false }))
    expect(screen.queryByRole('button', { name: '해당 없음' })).not.toBeInTheDocument()
  })

  it('allow_na=true → 사유 공백이면 확인 비활성, 입력 후 markNa(id, 사유)', async () => {
    const task = makeTask({ code: 'HR-07', title: '피부양자 등록', completion_mode: 'confirm', allow_na: true })
    renderDetail(task)
    await userEvent.click(screen.getByRole('button', { name: '해당 없음' }))
    const ok = screen.getByRole('button', { name: '해당 없음으로 처리' })
    expect(ok).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/해당 없음 사유/), '   ')
    expect(ok).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/해당 없음 사유/), '등록할 가족 없음')
    await userEvent.click(ok)
    expect(actions.markNa).toHaveBeenCalledWith(task.id, '등록할 가족 없음')
  })

  it('rework 상태 → 보완 요청 사유 표시', () => {
    renderDetail(
      makeTask(
        { code: 'GA-07', title: '명함 신청', kind: 'input', completion_mode: 'confirm', department: 'ga', form_schema: ga07Form },
        { status: 'rework', rework_reason: '여권 표기와 같게 맞춰 주세요', result: { english_name: 'Haneul Kim' } },
      ),
    )
    expect(screen.getByText('여권 표기와 같게 맞춰 주세요')).toBeInTheDocument()
    expect(screen.getByLabelText(/영문 이름/)).toHaveValue('Haneul Kim')
    expect(screen.getByRole('button', { name: '다시 제출' })).toBeEnabled()
  })

  it('assessment → 일정·장소·결과 표시, 버튼 없음', () => {
    renderDetail(
      makeTask(
        { code: 'AI-05', title: '간단 코딩테스트', kind: 'assessment', completion_mode: 'staff_only', department: null, team_id: TEAM_ID },
        {
          status: 'done',
          due_date: null,
          scheduled_at: '2026-11-20T05:00:00Z',
          location: '7층 소회의실 B',
          assessment_result: 'pass',
          assessment_note: '반복문 이해가 좋아요',
        },
      ),
    )
    expect(screen.getByText(/11월 20일/)).toBeInTheDocument()
    expect(screen.getByText('7층 소회의실 B')).toBeInTheDocument()
    expect(screen.getByText('통과')).toBeInTheDocument()
    expect(screen.getByText('반복문 이해가 좋아요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /완료|제출|해당 없음/ })).not.toBeInTheDocument()
  })

  it('blocked 과제 → 선행 과제 안내, 버튼 없음', () => {
    const hr02 = makeTask({ code: 'HR-02', title: '근태·결재 시스템 가입' }, { status: 'submitted' })
    renderDetail(makeTask({ code: 'HR-03', title: '인사정보 업데이트', prerequisite_codes: ['HR-02'] }, { status: 'blocked' }), [hr02])
    expect(screen.getByText('근태·결재 시스템 가입 완료 후 열림')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /완료|제출/ })).not.toBeInTheDocument()
  })

  it('제출 버튼 연타 → submit 1회만 호출', async () => {
    let resolve!: () => void
    actions.submit.mockReturnValue(new Promise<void>((r) => (resolve = r)))
    const task = makeTask({ code: 'GA-08', title: '웰컴키트 수령', completion_mode: 'confirm' })
    renderDetail(task)
    await userEvent.dblClick(screen.getByRole('button', { name: '제출' }))
    await userEvent.click(screen.getByRole('button', { name: /제출/ }))
    expect(actions.submit).toHaveBeenCalledTimes(1)
    resolve()
  })

  it('제출 실패 → 오류 안내', async () => {
    actions.submit.mockRejectedValue(new Error('지금은 제출할 수 없는 과제입니다'))
    renderDetail(makeTask({ code: 'GA-08', title: '웰컴키트 수령', completion_mode: 'confirm' }))
    await userEvent.click(screen.getByRole('button', { name: '제출' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('처리하지 못했어요')
  })

  it('"이 과제에 대해 물어보기" → chat:ask 이벤트에 과제 제목', async () => {
    const listener = vi.fn()
    window.addEventListener('chat:ask', listener)
    renderDetail(makeTask({ code: 'GA-08', title: '웰컴키트 수령' }))
    await userEvent.click(screen.getByRole('button', { name: '이 과제에 대해 물어보기' }))
    window.removeEventListener('chat:ask', listener)
    expect(listener).toHaveBeenCalledTimes(1)
    expect((listener.mock.calls[0][0] as CustomEvent<{ text: string }>).detail.text).toContain('웰컴키트 수령')
  })

  it('없는 과제 → 안내와 타임라인 링크', () => {
    state.tasks = []
    render(
      <MemoryRouter initialEntries={['/me/tasks/none']}>
        <Routes>
          <Route path="/me/tasks/:id" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('과제를 찾을 수 없어요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /타임라인으로/ })).toHaveAttribute('href', '/me')
  })
})
