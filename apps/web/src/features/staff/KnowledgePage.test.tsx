import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { Profile } from '@/app/AuthProvider'
import type { KnowledgeItem, UnansweredQuestion } from './knowledge'

const TRAINER: Partial<Profile> = { id: 'trainer', org_id: 'org-1', role: 'team_trainer', department: null, team_id: 'team-ai', full_name: '가상 서준' }
const OPS: Partial<Profile> = { id: 'ops-hr', org_id: 'org-1', role: 'ops_staff', department: 'hr', team_id: null, full_name: '가상 지은' }

const { actions, state } = vi.hoisted(() => ({
  actions: {
    save: vi.fn(async () => {}),
    setStatus: vi.fn(async () => {}),
    resolve: vi.fn(async () => {}),
  },
  state: { profile: null as unknown, knowledge: [] as unknown[], unanswered: [] as unknown[] },
}))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ profile: state.profile, session: { user: { id: 'u' } }, loading: false }),
}))
vi.mock('./knowledge', () => ({
  useKnowledge: () => ({ data: state.knowledge, isLoading: false, isError: false }),
  useUnanswered: () => ({ data: state.unanswered, isLoading: false, isError: false }),
  useKnowledgeActions: () => actions,
  useTeamName: (teamId: string | null) => (teamId ? 'AI팀' : null),
}))

import { KnowledgePage } from './KnowledgePage'

const unanswered: UnansweredQuestion[] = [
  {
    id: 'u1',
    org_id: 'org-1',
    asked_by: 'h1',
    team_id: 'team-ai',
    question: '동호회 가입비 얼마야?',
    status: 'open',
    resolved_knowledge_id: null,
    created_at: '2026-11-17T05:02:00Z',
    team: { name: 'AI팀' },
  },
  {
    id: 'u2',
    org_id: 'org-1',
    asked_by: 'h2',
    team_id: 'team-ai',
    question: '야근 식대는 몇 시부터 신청할 수 있어?',
    status: 'open',
    resolved_knowledge_id: null,
    created_at: '2026-11-16T10:48:00Z',
    team: { name: 'AI팀' },
  },
]

const knowledge: KnowledgeItem[] = [
  {
    id: 'k1',
    org_id: 'org-1',
    scope: 'team',
    team_id: 'team-ai',
    question: '팀 코드 리뷰는 어떻게 해?',
    answer: 'PR에 리뷰어 두 명을 지정합니다.',
    category: '개발 환경',
    status: 'published',
    updated_by: null,
    updated_at: '2026-11-16T00:00:00Z',
    origin: 'manual',
  },
  {
    id: 'k2',
    org_id: 'org-1',
    scope: 'team',
    team_id: 'team-ai',
    question: '개발 서버 접속 방법',
    answer: 'VPN에 먼저 연결한 뒤 SSH로 접속해요.',
    category: '개발 환경',
    status: 'draft',
    updated_by: null,
    updated_at: '2026-11-15T00:00:00Z',
    origin: 'manual',
  },
]

function renderPage({ profile = TRAINER, items = knowledge, open = unanswered } = {}) {
  state.profile = profile
  state.knowledge = items
  state.unanswered = open
  return render(
    <MemoryRouter>
      <KnowledgePage />
    </MemoryRouter>,
  )
}

function form() {
  return screen.getByRole('complementary', { name: '지식 작성' })
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear())
})

describe('KnowledgePage (S10) 미답변 탭', () => {
  it('열린 미답변 질문을 질문·물은 시각·팀과 함께 보여 준다', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: /미답변 질문 2/ })).toHaveAttribute('aria-selected', 'true')
    const row = screen.getByRole('row', { name: /동호회 가입비 얼마야\?/ })
    expect(row).toHaveTextContent('AI팀')
    expect(row).toHaveTextContent('11/17 14:02')
  })

  it('탭은 ←/→로 옮겨 가고 선택한 탭의 패널만 보인다', async () => {
    const user = userEvent.setup()
    renderPage()
    const unanswered = screen.getByRole('tab', { name: /미답변 질문/ })
    expect(screen.getByRole('tabpanel')).toContainElement(screen.getByRole('table', { name: '미답변 질문' }))

    await user.click(unanswered)
    await user.keyboard('{ArrowRight}')

    const knowledge = screen.getByRole('tab', { name: /지식 목록/ })
    expect(knowledge).toHaveFocus()
    expect(knowledge).toHaveAttribute('aria-selected', 'true')
    const panel = screen.getByRole('tabpanel')
    expect(knowledge).toHaveAttribute('aria-controls', panel.id)
    expect(within(panel).getByRole('table', { name: '지식 목록' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: '미답변 질문' })).not.toBeInTheDocument()
  })

  it('미답변이 0건이면 빈 상태 문구', () => {
    renderPage({ open: [] })
    expect(screen.getByText('미답변 질문이 없어요')).toBeInTheDocument()
  })

  it('"답 등록" → 질문이 채워진 폼, 답변이 공백이면 게시 비활성, 입력 후 resolve(id, {...})', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(within(screen.getByRole('row', { name: /동호회 가입비/ })).getByRole('button', { name: '답 등록' }))

    expect(within(form()).getByLabelText('질문')).toHaveValue('동호회 가입비 얼마야?')
    const publish = within(form()).getByRole('button', { name: '게시' })
    expect(publish).toBeDisabled()

    await user.type(within(form()).getByLabelText('답변'), '   ')
    expect(publish).toBeDisabled()

    await user.clear(within(form()).getByLabelText('답변'))
    await user.type(within(form()).getByLabelText('답변'), '동호회마다 월 1~2만 원이에요.')
    await user.type(within(form()).getByLabelText('분류'), '복지·생활')
    expect(publish).toBeEnabled()
    await user.click(publish)

    expect(actions.resolve).toHaveBeenCalledWith('u1', {
      question: '동호회 가입비 얼마야?',
      answer: '동호회마다 월 1~2만 원이에요.',
      category: '복지·생활',
    })
    expect(actions.save).not.toHaveBeenCalled()
  })

  it('질문을 지우면 게시 비활성', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(within(screen.getByRole('row', { name: /동호회 가입비/ })).getByRole('button', { name: '답 등록' }))
    await user.type(within(form()).getByLabelText('답변'), '답')
    await user.clear(within(form()).getByLabelText('질문'))
    expect(within(form()).getByRole('button', { name: '게시' })).toBeDisabled()
  })
})

describe('KnowledgePage (S10) 지식 탭', () => {
  async function openKnowledgeTab(options?: Parameters<typeof renderPage>[0]) {
    const user = userEvent.setup()
    renderPage(options)
    await user.click(screen.getByRole('tab', { name: /지식 목록/ }))
    return user
  }

  function listRows() {
    return within(screen.getByRole('table', { name: '지식 목록' })).getAllByRole('row').slice(1)
  }

  it('검색어로 질문과 답변을 거른다', async () => {
    const user = await openKnowledgeTab()
    expect(listRows()).toHaveLength(2)

    await user.type(screen.getByRole('searchbox', { name: '지식 검색' }), 'VPN')
    expect(listRows()).toHaveLength(1)
    expect(listRows()[0]).toHaveTextContent('개발 서버 접속 방법')

    await user.clear(screen.getByRole('searchbox', { name: '지식 검색' }))
    await user.type(screen.getByRole('searchbox', { name: '지식 검색' }), '코드 리뷰')
    expect(listRows()).toHaveLength(1)
    expect(listRows()[0]).toHaveTextContent('팀 코드 리뷰는 어떻게 해?')
  })

  it('게시 취소 / 게시 → setStatus', async () => {
    const user = await openKnowledgeTab()

    await user.click(within(screen.getByRole('row', { name: /팀 코드 리뷰/ })).getByRole('button', { name: '게시 취소' }))
    expect(actions.setStatus).toHaveBeenCalledWith('k1', 'draft')

    await user.click(within(screen.getByRole('row', { name: /개발 서버 접속/ })).getByRole('button', { name: '게시' }))
    expect(actions.setStatus).toHaveBeenCalledWith('k2', 'published')
  })

  it('추가: 답변이 비면 저장 비활성, 입력 후 초안 저장 → save({..., status:"draft"})', async () => {
    const user = await openKnowledgeTab()
    await user.click(screen.getByRole('button', { name: '지식 추가' }))

    await user.type(within(form()).getByLabelText('질문'), '팀 회식은 언제야?')
    const draft = within(form()).getByRole('button', { name: '초안 저장' })
    expect(draft).toBeDisabled()
    expect(within(form()).getByRole('button', { name: '게시' })).toBeDisabled()

    await user.type(within(form()).getByLabelText('답변'), '분기마다 한 번 해요.')
    await user.click(draft)

    expect(actions.save).toHaveBeenCalledWith({ question: '팀 회식은 언제야?', answer: '분기마다 한 번 해요.', category: '', status: 'draft' })
  })

  it('수정: 기존 값이 채워지고 게시하면 save({id, ..., status:"published"})', async () => {
    const user = await openKnowledgeTab()
    await user.click(within(screen.getByRole('row', { name: /개발 서버 접속/ })).getByRole('button', { name: '수정' }))

    expect(within(form()).getByLabelText('답변')).toHaveValue('VPN에 먼저 연결한 뒤 SSH로 접속해요.')
    await user.click(within(form()).getByRole('button', { name: '게시' }))

    expect(actions.save).toHaveBeenCalledWith({
      id: 'k2',
      question: '개발 서버 접속 방법',
      answer: 'VPN에 먼저 연결한 뒤 SSH로 접속해요.',
      category: '개발 환경',
      status: 'published',
    })
  })
})

describe('KnowledgePage (S10) 범위', () => {
  it('교육 담당자는 범위가 "AI팀"으로 고정되고 고를 수 없다', async () => {
    const user = userEvent.setup()
    renderPage({ profile: TRAINER })
    await user.click(within(screen.getByRole('row', { name: /동호회 가입비/ })).getByRole('button', { name: '답 등록' }))

    expect(within(form()).getByLabelText('범위')).toHaveTextContent('AI팀')
    expect(within(form()).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(form()).queryByRole('radio')).not.toBeInTheDocument()
  })

  it('경영지원은 범위가 "회사 공통"으로 고정되고 고를 수 없다', async () => {
    const user = userEvent.setup()
    renderPage({ profile: OPS })
    await user.click(screen.getByRole('tab', { name: /지식 목록/ }))
    await user.click(screen.getByRole('button', { name: '지식 추가' }))

    expect(within(form()).getByLabelText('범위')).toHaveTextContent('회사 공통')
    expect(within(form()).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(form()).queryByRole('radio')).not.toBeInTheDocument()
  })
})
