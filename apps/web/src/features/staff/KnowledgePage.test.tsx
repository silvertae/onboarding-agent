import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { Profile } from '@/app/AuthProvider'
import { AgentError } from '@/lib/agent'
import type { KnowledgeItem, UnansweredQuestion } from './knowledge'

const TRAINER: Partial<Profile> = { id: 'trainer', org_id: 'org-1', role: 'team_trainer', department: null, team_id: 'team-ai', full_name: '가상 서준' }
const OPS: Partial<Profile> = { id: 'ops-hr', org_id: 'org-1', role: 'ops_staff', department: 'hr', team_id: null, full_name: '가상 지은' }

const { actions, state, draftAnswer, useKnowledgeSourcesFor } = vi.hoisted(() => ({
  useKnowledgeSourcesFor: vi.fn(),
  actions: {
    save: vi.fn(async () => {}),
    setStatus: vi.fn(async () => {}),
    resolve: vi.fn(async (..._args: unknown[]) => {}),
  },
  draftAnswer: vi.fn(),
  state: {
    profile: null as unknown,
    knowledge: [] as unknown[],
    unanswered: [] as unknown[],
    documents: [{ id: 'd1', status: 'ready' }] as unknown[],
    sources: {} as Record<string, unknown[]>,
  },
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
  useKnowledgeSources: (id: string | null) => ({ data: id ? (state.sources[id] ?? []) : undefined }),
  useKnowledgeSourcesFor,
  draftAnswer,
}))
vi.mock('@/features/documents/documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/documents/documents')>()),
  useDocuments: () => ({ data: state.documents }),
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

function renderPage({ profile = TRAINER, items = knowledge, open = unanswered, url = '/knowledge' } = {}) {
  state.profile = profile
  state.knowledge = items
  state.unanswered = open
  return render(
    <MemoryRouter initialEntries={[url]}>
      <KnowledgePage />
    </MemoryRouter>,
  )
}

function form() {
  return screen.getByRole('complementary', { name: '지식 작성' })
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear())
  draftAnswer.mockReset()
  useKnowledgeSourcesFor.mockReset()
  useKnowledgeSourcesFor.mockImplementation((ids: string[]) => ({
    data: ids.length ? Object.fromEntries(ids.map((id) => [id, state.sources[id] ?? []])) : undefined,
  }))
  state.documents = [{ id: 'd1', status: 'ready' }]
  state.sources = {}
})

describe('KnowledgePage (S10) 미답변 탭', () => {
  it('열린 미답변 질문을 질문·물은 시각·팀과 함께 보여 준다', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: /미답변 질문 2/ })).toHaveAttribute('aria-selected', 'true')
    const row = screen.getByRole('row', { name: /동호회 가입비 얼마야\?/ })
    expect(row).toHaveTextContent('AI팀')
    expect(row).toHaveTextContent('11/17 14:02')
  })

  it('좁은 화면: 물은 시각·팀 칸은 숨고, 그 값을 질문 아래 한 줄로 보여 준다', () => {
    renderPage()
    const table = screen.getByRole('table', { name: '미답변 질문' })
    for (const name of ['물은 시각', '물은 사람의 팀']) {
      expect(within(table).getByRole('columnheader', { name })).toHaveClass('hidden', 'sm:table-cell')
    }
    const meta = within(screen.getByRole('row', { name: /동호회 가입비 얼마야\?/ })).getByTestId('row-meta')
    expect(meta).toHaveClass('sm:hidden')
    expect(meta).toHaveTextContent('11/17 14:02 · AI팀')
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

  it('좁은 화면: 답변·분류·범위·상태·수정일 칸은 숨고, 상태 배지와 분류·범위·수정일을 질문 아래 한 줄로 보여 준다', async () => {
    await openKnowledgeTab()
    const table = screen.getByRole('table', { name: '지식 목록' })
    for (const name of ['답변', '분류', '범위', '상태', '수정일']) {
      expect(within(table).getByRole('columnheader', { name })).toHaveClass('hidden', 'sm:table-cell')
    }
    const meta = within(listRows()[0]).getByTestId('row-meta')
    expect(meta).toHaveClass('sm:hidden')
    expect(meta.querySelector('[data-slot="badge"]')).not.toBeNull()
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

const CLAUSE = { id: 'c1', document_title: '복리후생 규정(가상)', label: '제14조', heading: '야근 식대' }
const DRAFT = { answer: '야근 식대는 1만 2천 원(가상)이에요.', category: '복지', clauses: [CLAUSE] }

describe('KnowledgePage (S10) 규정에서 답 초안 찾기', () => {
  async function openResolve() {
    const user = userEvent.setup()
    renderPage()
    await user.click(within(screen.getByRole('row', { name: /야근 식대는/ })).getByRole('button', { name: '답 등록' }))
    return user
  }

  const findButton = () => within(form()).getByRole('button', { name: '규정에서 답 초안 찾기' })

  it('"답변" 라벨 오른쪽에 버튼이 있고 지식 추가 폼에는 없다', async () => {
    const user = await openResolve()
    expect(findButton()).toBeEnabled()
    expect(findButton().parentElement).toContainElement(within(form()).getByText('답변'))
    await user.click(screen.getByRole('tab', { name: /지식 목록/ }))
    await user.click(screen.getByRole('button', { name: '지식 추가' }))
    expect(within(form()).queryByRole('button', { name: '규정에서 답 초안 찾기' })).not.toBeInTheDocument()
  })

  it('찾는 중에는 버튼이 "찾는 중…"(비활성)이고 안내가 보이며, 두 번 눌러도 한 번만 부른다', async () => {
    let finish!: (v: unknown) => void
    draftAnswer.mockReturnValue(new Promise((r) => (finish = r)))
    const user = await openResolve()

    await user.dblClick(findButton())

    expect(draftAnswer).toHaveBeenCalledTimes(1)
    expect(draftAnswer).toHaveBeenCalledWith('야근 식대는 몇 시부터 신청할 수 있어?')
    expect(within(form()).getByRole('button', { name: '찾는 중…' })).toBeDisabled()
    expect(within(form()).getByRole('status')).toHaveTextContent('규정 조항에서 근거를 찾고 있어요.')
    expect(within(form()).getByRole('button', { name: '게시' })).toBeDisabled()

    finish(DRAFT)
    expect(await within(form()).findByRole('button', { name: '규정에서 답 초안 찾기' })).toBeEnabled()
  })

  it('찾으면 답변·분류를 채우고 근거 조항 칩과 검토 안내를 보이며, 게시하면 ai_draft 출처로 resolve한다', async () => {
    draftAnswer.mockResolvedValue(DRAFT)
    const user = await openResolve()

    await user.click(findButton())

    expect(await within(form()).findByDisplayValue(DRAFT.answer)).toBeInTheDocument()
    expect(within(form()).getByLabelText('분류')).toHaveValue('복지')
    expect(within(form()).getByText('근거 조항')).toBeInTheDocument()
    expect(within(form()).getByText('복리후생 규정(가상) 제14조 야근 식대')).toBeInTheDocument()
    expect(within(form()).getByRole('note')).toHaveTextContent(
      'AI가 규정 조항으로 만든 초안이에요. 금액·기준이 조항과 맞는지 확인하고 게시해 주세요.',
    )

    await user.click(within(form()).getByRole('button', { name: '게시' }))
    expect(actions.resolve).toHaveBeenCalledWith(
      'u2',
      { question: '야근 식대는 몇 시부터 신청할 수 있어?', answer: DRAFT.answer, category: '복지' },
      { clauseIds: ['c1'], origin: 'ai_draft' },
    )
  })

  it('담당자가 답을 고쳐도 origin은 ai_draft 그대로다', async () => {
    draftAnswer.mockResolvedValue(DRAFT)
    const user = await openResolve()
    await user.click(findButton())
    await within(form()).findByDisplayValue(DRAFT.answer)

    await user.type(within(form()).getByLabelText('답변'), ' 추가')
    await user.click(within(form()).getByRole('button', { name: '게시' }))

    expect(actions.resolve).toHaveBeenCalledWith('u2', expect.objectContaining({ answer: `${DRAFT.answer} 추가` }), { clauseIds: ['c1'], origin: 'ai_draft' })
  })

  it('초안이 비어 있는 분류는 기존 값을 둔다', async () => {
    draftAnswer.mockResolvedValue({ ...DRAFT, category: '' })
    const user = await openResolve()
    await user.type(within(form()).getByLabelText('분류'), '생활')
    await user.click(findButton())
    await within(form()).findByDisplayValue(DRAFT.answer)
    expect(within(form()).getByLabelText('분류')).toHaveValue('생활')
  })

  it('폼을 닫았다 다시 열면 출처가 초기화되어 직접 쓴 답은 source 없이 resolve한다', async () => {
    draftAnswer.mockResolvedValue(DRAFT)
    const user = await openResolve()
    await user.click(findButton())
    await within(form()).findByDisplayValue(DRAFT.answer)
    await user.click(within(form()).getByRole('button', { name: '취소' }))

    await user.click(within(screen.getByRole('row', { name: /야근 식대는/ })).getByRole('button', { name: '답 등록' }))
    expect(within(form()).queryByRole('note')).not.toBeInTheDocument()
    await user.type(within(form()).getByLabelText('답변'), '직접 쓴 답')
    await user.click(within(form()).getByRole('button', { name: '게시' }))

    expect(actions.resolve).toHaveBeenCalledWith('u2', { question: '야근 식대는 몇 시부터 신청할 수 있어?', answer: '직접 쓴 답', category: '' })
  })

  it('질문이 비면 버튼이 비활성이다', async () => {
    const user = await openResolve()
    await user.clear(within(form()).getByLabelText('질문'))
    expect(findButton()).toBeDisabled()
  })

  it('늦게 도착한 초안은 다른 질문의 폼에 들어가지 않는다', async () => {
    let finish!: (v: unknown) => void
    draftAnswer.mockReturnValue(new Promise((r) => (finish = r)))
    const user = await openResolve()
    await user.click(findButton())

    await user.click(within(screen.getByRole('row', { name: /동호회 가입비/ })).getByRole('button', { name: '답 등록' }))
    await act(async () => finish(DRAFT))

    expect(within(form()).queryByRole('note')).not.toBeInTheDocument()
    expect(within(form()).queryByText('근거 조항')).not.toBeInTheDocument()
    await user.type(within(form()).getByLabelText('답변'), '직접')
    await user.click(within(form()).getByRole('button', { name: '게시' }))
    expect(actions.resolve).toHaveBeenCalledWith('u1', { question: '동호회 가입비 얼마야?', answer: '직접', category: '' })
  })

  it('열려 있는 같은 질문의 "답 등록"을 다시 눌러도 입력과 AI 출처가 유지된다', async () => {
    draftAnswer.mockResolvedValue(DRAFT)
    const user = await openResolve()
    await user.click(findButton())
    await within(form()).findByDisplayValue(DRAFT.answer)

    await user.click(within(screen.getByRole('row', { name: /야근 식대는/ })).getByRole('button', { name: '답 등록' }))

    expect(within(form()).getByLabelText('답변')).toHaveValue(DRAFT.answer)
    expect(within(form()).getByRole('note')).toBeInTheDocument()
    await user.click(within(form()).getByRole('button', { name: '게시' }))
    expect(actions.resolve).toHaveBeenCalledWith('u2', expect.anything(), { clauseIds: ['c1'], origin: 'ai_draft' })
  })

  it('찾는 중에는 질문 칸이 잠긴다', async () => {
    draftAnswer.mockReturnValue(new Promise(() => {}))
    const user = await openResolve()
    await user.click(findButton())
    expect(within(form()).getByLabelText('질문')).toBeDisabled()
  })

  it('응답이 올 때 질문이 바뀌어 있으면 초안을 버리고 출처도 남기지 않는다', async () => {
    draftAnswer.mockImplementation(async () => {
      fireEvent.change(within(form()).getByLabelText('질문'), { target: { value: '다른 질문' } })
      return DRAFT
    })
    const user = await openResolve()
    await user.click(findButton())
    await waitFor(() => expect(within(form()).queryByRole('status')).not.toBeInTheDocument())

    expect(draftAnswer).toHaveBeenCalledTimes(1)
    expect(within(form()).getByLabelText('답변')).toHaveValue('')
    expect(within(form()).queryByRole('note')).not.toBeInTheDocument()
    expect(within(form()).queryByText('근거 조항')).not.toBeInTheDocument()
    expect(within(form()).queryByRole('status')).not.toBeInTheDocument()
    await user.type(within(form()).getByLabelText('답변'), '직접')
    await user.click(within(form()).getByRole('button', { name: '게시' }))
    expect(actions.resolve).toHaveBeenCalledWith('u2', { question: '다른 질문', answer: '직접', category: '' })
  })

  it('근거가 없으면 안내만 보이고 칸은 그대로다', async () => {
    draftAnswer.mockResolvedValue(null)
    const user = await openResolve()
    await user.type(within(form()).getByLabelText('답변'), '쓰던 답')

    await user.click(findButton())

    expect(await within(form()).findByRole('status')).toHaveTextContent('올린 규정 문서에서 근거를 찾지 못했어요. 답을 직접 써 주세요.')
    expect(within(form()).getByLabelText('답변')).toHaveValue('쓰던 답')
    expect(within(form()).queryByRole('note')).not.toBeInTheDocument()
    await user.click(within(form()).getByRole('button', { name: '게시' }))
    expect(actions.resolve).toHaveBeenCalledWith('u2', expect.anything())
  })

  it('실패하면 문구를 보이고, 한도 초과는 내일 다시 이용 안내를 붙인다', async () => {
    draftAnswer.mockRejectedValueOnce(new AgentError(502, '초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'))
    const user = await openResolve()
    await user.click(findButton())
    expect(await within(form()).findByText('초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()

    draftAnswer.mockRejectedValueOnce(new AgentError(429, '오늘 사용 한도를 넘었어요'))
    await user.click(findButton())
    expect(await within(form()).findByText('오늘 사용 한도를 넘었어요. 내일 다시 이용해 주세요.')).toBeInTheDocument()
  })

  it('읽을 수 있는 ready 문서가 없으면 버튼이 비활성이고 규정 문서 링크를 안내한다', async () => {
    state.documents = [{ id: 'd2', status: 'processing' }]
    await openResolve()

    expect(findButton()).toBeDisabled()
    const notice = within(form()).getByText(/올린 규정 문서가 없어요/)
    expect(notice).toHaveTextContent('올린 규정 문서가 없어요. 규정 문서에서 먼저 올려 주세요.')
    expect(within(notice).getByRole('link', { name: '규정 문서' })).toHaveAttribute('href', '/documents')
    expect(findButton()).toHaveAccessibleDescription(/올린 규정 문서가 없어요/)
  })
})

describe('KnowledgePage (S10) AI 작성 지식', () => {
  const aiItems: KnowledgeItem[] = [
    { ...knowledge[0], id: 'k3', question: '결혼하면 경조금은?', answer: '가상 답', status: 'draft', origin: 'ai_draft' },
    { ...knowledge[0], id: 'k4', question: '복지포인트는 언제?', answer: '가상 답', status: 'published', origin: 'ai_draft' },
    ...knowledge,
  ]

  async function openList() {
    const user = userEvent.setup()
    renderPage({ items: aiItems })
    state.sources = { k3: [CLAUSE, { ...CLAUSE, id: 'c9', label: '제8조' }] }
    await user.click(screen.getByRole('tab', { name: /지식 목록/ }))
    return user
  }

  const listRows = () => within(screen.getByRole('table', { name: '지식 목록' })).getAllByRole('row').slice(1)

  it('?tab=knowledge&filter=ai로 열면 지식 목록 탭의 AI 초안 필터가 선택돼 있다', () => {
    renderPage({ items: aiItems, url: '/knowledge?tab=knowledge&filter=ai' })
    expect(screen.getByRole('tab', { name: /지식 목록/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'AI 초안 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(listRows()).toHaveLength(1)
  })

  it('알 수 없는 tab·filter 값은 무시하고 기본(미답변 탭, 전체)으로 연다', () => {
    renderPage({ items: aiItems, url: '/knowledge?tab=x&filter=y' })
    expect(screen.getByRole('tab', { name: /미답변/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('필터 칩 "전체 N" / "AI 초안 N"이 있고 AI 초안은 AI 작성이면서 초안인 것만 보인다', async () => {
    const user = await openList()
    expect(screen.getByRole('button', { name: '전체 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'AI 초안 1' })).toHaveAttribute('aria-pressed', 'false')
    expect(listRows()).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: 'AI 초안 1' }))

    expect(listRows()).toHaveLength(1)
    expect(listRows()[0]).toHaveTextContent('결혼하면 경조금은?')
    expect(listRows()[0]).toHaveTextContent('제14조, 제8조')
  })

  it('AI 작성 지식의 질문 아래에 "AI 작성" 배지가 있다(게시된 것도)', async () => {
    await openList()
    expect(within(screen.getByRole('row', { name: /결혼하면/ })).getByText('AI 작성')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /복지포인트/ })).getByText('AI 작성')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /팀 코드 리뷰/ })).queryByText('AI 작성')).not.toBeInTheDocument()
  })

  it('전체 보기에서는 조항 번호 캡션을 보이지 않는다', async () => {
    await openList()
    expect(within(screen.getByRole('row', { name: /결혼하면/ })).queryByText(/제14조/)).not.toBeInTheDocument()
  })

  it('수정 폼에 근거 조항 칩이 보인다', async () => {
    const user = await openList()
    await user.click(within(screen.getByRole('row', { name: /결혼하면/ })).getByRole('button', { name: '수정' }))
    expect(within(form()).getByText('근거 조항')).toBeInTheDocument()
    expect(within(form()).getByText('복리후생 규정(가상) 제14조 야근 식대')).toBeInTheDocument()
    expect(within(form()).queryByRole('button', { name: '규정에서 답 초안 찾기' })).not.toBeInTheDocument()
    expect(within(form()).queryByRole('note')).not.toBeInTheDocument()
  })

  it('AI 초안 필터에서 조항 캡션은 한 번의 조회로 모든 행에 나뉘어 보인다', async () => {
    const items = ['k5', 'k6', 'k7'].map((id, i) => ({ ...knowledge[0], id, question: `AI 질문 ${i}`, status: 'draft' as const, origin: 'ai_draft' }))
    state.sources = { k5: [CLAUSE], k6: [{ ...CLAUSE, id: 'c6', label: '제6조' }], k7: [{ ...CLAUSE, id: 'c7', label: '제7조' }] }
    const user = userEvent.setup()
    renderPage({ items })
    await user.click(screen.getByRole('tab', { name: /지식 목록/ }))
    await user.click(screen.getByRole('button', { name: /AI 초안 3/ }))

    const calls = useKnowledgeSourcesFor.mock.calls.filter((c) => (c[0] as string[]).length > 0)
    expect(calls.every((c) => [...(c[0] as string[])].sort().join() === 'k5,k6,k7')).toBe(true)
    expect(listRows()[0]).toHaveTextContent('제14조')
    expect(listRows()[1]).toHaveTextContent('제6조')
    expect(listRows()[2]).toHaveTextContent('제7조')
  })

  it('AI 초안이 없으면 필터 전용 빈 상태를 보인다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: /지식 목록/ }))
    await user.click(screen.getByRole('button', { name: 'AI 초안 0' }))
    expect(screen.getByText('AI 초안이 없어요')).toBeInTheDocument()
  })
})
