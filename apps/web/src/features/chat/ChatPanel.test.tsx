import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { pendingResponse, streamResponse } from './testStream'

const agent = vi.hoisted(() => ({ agentFetch: vi.fn(), wakeAgent: vi.fn() }))
const auth = vi.hoisted(() => ({ role: 'new_hire' as string }))
const db = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn() }))

vi.mock('@/lib/agent', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/agent')>()),
  agentFetch: agent.agentFetch,
  wakeAgent: agent.wakeAgent,
}))
vi.mock('@/lib/supabase', () => ({ supabase: { from: db.from, auth: { signOut: vi.fn() } } }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({
    profile: { id: 'hire-1', role: auth.role, org_id: 'org-1', team_id: 'team-1' },
    session: {},
    loading: false,
    signOut: vi.fn(),
  }),
}))

import { AgentError } from '@/lib/agent'
import { ChatPanel } from './ChatPanel'

function renderPanel() {
  return render(
    <MemoryRouter>
      <ChatPanel>
        <main>페이지 본문</main>
      </ChatPanel>
    </MemoryRouter>,
  )
}

function chat() {
  return within(screen.getByRole('complementary', { name: '온보딩 에이전트 채팅' }))
}

async function ask(text: string) {
  const user = userEvent.setup()
  await user.type(chat().getByLabelText('질문 입력'), text)
  await user.click(chat().getByRole('button', { name: '보내기' }))
}

beforeEach(() => {
  agent.agentFetch.mockReset()
  agent.wakeAgent.mockReset()
  auth.role = 'new_hire'
  db.insert.mockReset().mockResolvedValue({ error: null, status: 201 })
  db.from.mockReset().mockReturnValue({ insert: db.insert })
})

function unansweredReply() {
  return streamResponse([{ type: 'unanswered' }, { type: 'token', text: '확인되지 않은 내용이에요.' }, { type: 'done' }])
}

describe('ChatPanel', () => {
  it('신입이 아니면 페이지만 보이고 채팅은 없다', () => {
    auth.role = 'team_trainer'
    renderPanel()

    expect(screen.getByText('페이지 본문')).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '온보딩 에이전트 채팅' })).not.toBeInTheDocument()
    expect(agent.wakeAgent).not.toHaveBeenCalled()
  })

  it('신입 화면을 열면 질문하기 전에 에이전트를 미리 깨운다', () => {
    renderPanel()

    expect(agent.wakeAgent).toHaveBeenCalledTimes(1)
    expect(agent.agentFetch).not.toHaveBeenCalled()
  })

  it('질문하면 스트리밍한 답을 보여 준다', async () => {
    agent.agentFetch.mockResolvedValueOnce(
      streamResponse([
        { type: 'token', text: '소모품비로 ' },
        { type: 'token', text: '처리해요.' },
        { type: 'done' },
      ]),
    )
    renderPanel()

    await ask('노트북 경비는 어떻게 처리해?')

    expect(await chat().findByText('소모품비로 처리해요.')).toBeInTheDocument()
    expect(chat().getByText('노트북 경비는 어떻게 처리해?')).toBeInTheDocument()
    expect(chat().getByLabelText('질문 입력')).toHaveValue('')
  })

  it('sources → 지식 제목과 과제 링크(/me/tasks/:id)', async () => {
    agent.agentFetch.mockResolvedValueOnce(
      streamResponse([
        { type: 'token', text: '명함 과제에서 신청해요.' },
        {
          type: 'sources',
          knowledge: [{ id: 'k1', question: '명함을 다시 만들고 싶어' }],
          tasks: [{ id: 'task-ga07', code: 'GA-07', title: '명함 신청' }],
        },
        { type: 'done' },
      ]),
    )
    renderPanel()

    await ask('명함 어떻게 만들어?')

    expect(await chat().findByText('명함을 다시 만들고 싶어')).toBeInTheDocument()
    expect(chat().getByRole('link', { name: /명함 신청/ })).toHaveAttribute('href', '/me/tasks/task-ga07')
  })

  describe('규정 원문 출처', () => {
    const clause = {
      id: 'c1',
      document_title: '복리후생 규정(가상)',
      label: '제8조',
      heading: '경조금',
      body: '① 결혼하는 경우 경조금을 준다.\n② <b>굵게</b>',
    }
    const withDocuments = () =>
      streamResponse([
        { type: 'token', text: '경조금은 규정에 있어요.' },
        {
          type: 'sources',
          knowledge: [{ id: 'k1', question: '경조금 신청' }],
          tasks: [{ id: 'task-1', code: 'GA-01', title: '경조금 과제' }],
          documents: [clause],
        },
        { type: 'done' },
      ])

    it('규정 원문 칩을 근거·관련 과제보다 위에 "문서명 제N조 제목"으로 보인다', async () => {
      agent.agentFetch.mockResolvedValueOnce(withDocuments())
      renderPanel()

      await ask('경조금 얼마야?')

      const chip = await chat().findByRole('button', { name: '복리후생 규정(가상) 제8조 경조금' })
      expect(chip).toHaveAttribute('aria-haspopup', 'dialog')
      const knowledge = chat().getByText('경조금 신청')
      const task = chat().getByRole('link', { name: /경조금 과제/ })
      expect(chip.compareDocumentPosition(knowledge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(knowledge.compareDocumentPosition(task) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(chat().getByText('규정 원문')).toBeInTheDocument()
    })

    it('규정 원문 칩을 누르면 조항 창에 문서명, 조항 제목, 본문, 안내 문구가 보이고 닫기로 닫힌다', async () => {
      agent.agentFetch.mockResolvedValueOnce(withDocuments())
      renderPanel()
      await ask('경조금 얼마야?')
      const chip = await chat().findByRole('button', { name: '복리후생 규정(가상) 제8조 경조금' })

      await userEvent.click(chip)

      const dialog = await screen.findByRole('dialog', { name: '제8조 경조금' })
      expect(within(dialog).getByText('복리후생 규정(가상)')).toBeInTheDocument()
      expect(within(dialog).getByText(/결혼하는 경우 경조금을 준다/)).toBeInTheDocument()
      expect(within(dialog).getByRole('note')).toHaveTextContent(
        '담당자가 검토한 답이 아니라 규정 원문에서 찾은 내용이에요. 정확한 적용은 담당 부서에 확인해 주세요.',
      )
      const close = within(dialog).getByRole('button', { name: '닫기' })
      expect(close).toHaveClass('h-11')

      await userEvent.click(close)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it.each([
      ['닫기 버튼', async () => userEvent.click(screen.getByRole('button', { name: '닫기' }))],
      ['Escape', async () => userEvent.keyboard('{Escape}')],
    ])('%s로 닫으면 포커스가 칩으로 돌아온다', async (_name, close) => {
      agent.agentFetch.mockResolvedValueOnce(withDocuments())
      renderPanel()
      await ask('경조금 얼마야?')
      const chip = await chat().findByRole('button', { name: '복리후생 규정(가상) 제8조 경조금' })
      await userEvent.click(chip)
      await screen.findByRole('dialog')

      await close()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(chip).toHaveFocus())
    })

    it('조항 본문은 글자로만 보인다', async () => {
      agent.agentFetch.mockResolvedValueOnce(withDocuments())
      renderPanel()
      await ask('경조금 얼마야?')

      await userEvent.click(await chat().findByRole('button', { name: '복리후생 규정(가상) 제8조 경조금' }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/<b>굵게<\/b>/)).toBeInTheDocument()
      expect(dialog.querySelector('b')).toBeNull()
    })

    it('documents가 없으면 규정 원문 줄이 없다', async () => {
      agent.agentFetch.mockResolvedValueOnce(
        streamResponse([
          { type: 'token', text: '답' },
          { type: 'sources', knowledge: [{ id: 'k1', question: '경조금 신청' }], tasks: [] },
          { type: 'done' },
        ]),
      )
      renderPanel()

      await ask('경조금 얼마야?')

      expect(await chat().findByText('경조금 신청')).toBeInTheDocument()
      expect(chat().queryByText('규정 원문')).not.toBeInTheDocument()
    })
  })

  it('unanswered → 등록 요청 버튼만 보이고, 누르기 전에는 아무것도 기록하지 않는다', async () => {
    agent.agentFetch.mockResolvedValueOnce(unansweredReply())
    renderPanel()

    await ask('동호회 가입비 얼마야?')

    expect(await chat().findByRole('button', { name: '담당자에게 등록 요청' })).toBeInTheDocument()
    expect(chat().queryByText(/전달했어요/)).not.toBeInTheDocument()
    expect(db.from).not.toHaveBeenCalled()
  })

  it('근거가 있는 답변에는 등록 요청 버튼이 없다', async () => {
    agent.agentFetch.mockResolvedValueOnce(
      streamResponse([
        { type: 'token', text: '소모품비로 처리해요.' },
        { type: 'sources', knowledge: [{ id: 'k1', question: '노트북 경비 계정과목이 뭐야?' }], tasks: [] },
        { type: 'done' },
      ]),
    )
    renderPanel()

    await ask('노트북 경비 계정과목이 뭐야?')

    await chat().findByText('소모품비로 처리해요.')
    expect(chat().queryByRole('button', { name: '담당자에게 등록 요청' })).not.toBeInTheDocument()
  })

  it('등록 요청: 질문이 채워진 창에서 고쳐 보내면 본인 권한으로 기록하고 버튼 대신 완료 문구가 남는다', async () => {
    agent.agentFetch.mockResolvedValueOnce(unansweredReply())
    renderPanel()
    const user = userEvent.setup()

    await ask('동호회 가입비 얼마야?')
    await user.click(await chat().findByRole('button', { name: '담당자에게 등록 요청' }))

    const dialog = await screen.findByRole('dialog', { name: '담당자에게 답 등록을 요청할까요?' })
    const field = within(dialog).getByLabelText('요청할 질문')
    expect(field).toHaveValue('동호회 가입비 얼마야?')
    await user.clear(field)
    await user.type(field, '  러닝 동호회 가입비 얼마야?  ')
    await user.click(within(dialog).getByRole('button', { name: '요청 보내기' }))

    expect(db.from).toHaveBeenCalledWith('unanswered_questions')
    expect(db.insert).toHaveBeenCalledExactlyOnceWith({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      org_id: 'org-1',
      asked_by: 'hire-1',
      team_id: 'team-1',
      question: '러닝 동호회 가입비 얼마야?',
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const done = chat().getByText(/담당자에게 요청했어요/)
    expect(done).toHaveAttribute('role', 'status')
    expect(done).toHaveFocus()
    expect(chat().queryByRole('button', { name: '담당자에게 등록 요청' })).not.toBeInTheDocument()
  })

  it('등록 요청: 질문을 비우면 보낼 수 없다', async () => {
    agent.agentFetch.mockResolvedValueOnce(unansweredReply())
    renderPanel()
    const user = userEvent.setup()

    await ask('동호회 가입비 얼마야?')
    await user.click(await chat().findByRole('button', { name: '담당자에게 등록 요청' }))
    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText('요청할 질문'))

    expect(within(dialog).getByRole('button', { name: '요청 보내기' })).toBeDisabled()
  })

  it('등록 요청 실패 → 창 안에 안내하고 다시 보낼 수 있다', async () => {
    db.insert.mockResolvedValueOnce({ error: { message: 'boom', code: '42501' }, status: 403 })
    agent.agentFetch.mockResolvedValueOnce(unansweredReply())
    renderPanel()
    const user = userEvent.setup()

    await ask('동호회 가입비 얼마야?')
    await user.click(await chat().findByRole('button', { name: '담당자에게 등록 요청' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '요청 보내기' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('요청을 보내지 못했어요. 다시 시도해 주세요.')
    await user.click(within(dialog).getByRole('button', { name: '요청 보내기' }))

    expect(db.insert).toHaveBeenCalledTimes(2)
    // 다시 보내도 같은 요청 id를 쓴다(앞선 요청이 실제로는 저장됐어도 행이 하나만 생긴다)
    expect(db.insert.mock.calls[1][0].id).toBe(db.insert.mock.calls[0][0].id)
    expect(await chat().findByText(/담당자에게 요청했어요/)).toBeInTheDocument()
  })

  it('등록 요청: 저장됐는데 응답을 못 받은 뒤 다시 보내면(같은 id 중복 23505) 보낸 것으로 본다', async () => {
    db.insert
      .mockResolvedValueOnce({ error: { message: 'Failed to fetch', code: '' }, status: 0 })
      .mockResolvedValueOnce({ error: { message: 'duplicate key', code: '23505' }, status: 409 })
    agent.agentFetch.mockResolvedValueOnce(unansweredReply())
    renderPanel()
    const user = userEvent.setup()

    await ask('동호회 가입비 얼마야?')
    await user.click(await chat().findByRole('button', { name: '담당자에게 등록 요청' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '요청 보내기' }))
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '요청 보내기' }))

    expect(db.insert.mock.calls[1][0].id).toBe(db.insert.mock.calls[0][0].id)
    expect(await chat().findByText(/담당자에게 요청했어요/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('등록 요청: 답변마다 다른 요청 id를 쓴다', async () => {
    agent.agentFetch.mockResolvedValueOnce(unansweredReply()).mockResolvedValueOnce(unansweredReply())
    renderPanel()
    const user = userEvent.setup()

    await ask('동호회 가입비 얼마야?')
    await chat().findByRole('button', { name: '담당자에게 등록 요청' })
    await ask('사우회 회비 얼마야?')
    await vi.waitFor(() => expect(chat().getAllByRole('button', { name: '담당자에게 등록 요청' })).toHaveLength(2))
    for (const button of chat().getAllByRole('button', { name: '담당자에게 등록 요청' })) {
      await user.click(button)
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '요청 보내기' }))
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    }

    expect(db.insert).toHaveBeenCalledTimes(2)
    expect(db.insert.mock.calls[1][0].id).not.toBe(db.insert.mock.calls[0][0].id)
  })

  it('AgentError(0) → 연결 실패 안내와 다시 시도, 다시 시도하면 같은 질문을 다시 보낸다', async () => {
    agent.agentFetch
      .mockRejectedValueOnce(new AgentError(0, '연결 실패'))
      .mockResolvedValueOnce(streamResponse([{ type: 'token', text: '그룹웨어에서 예약해요.' }, { type: 'done' }]))
    renderPanel()

    await ask('회의실은 어디서 예약해?')

    expect(await chat().findByText(/지금 답변 서비스에 연결할 수 없어요/)).toBeInTheDocument()
    await userEvent.click(chat().getByRole('button', { name: '다시 시도' }))

    expect(await chat().findByText('그룹웨어에서 예약해요.')).toBeInTheDocument()
    expect(agent.agentFetch).toHaveBeenLastCalledWith('/chat', { message: '회의실은 어디서 예약해?', history: [] })
    expect(chat().queryByText(/지금 답변 서비스에 연결할 수 없어요/)).not.toBeInTheDocument()
    expect(chat().getAllByText('회의실은 어디서 예약해?')).toHaveLength(1)
  })

  it('AgentError(429) → 한도 안내, 다시 시도 버튼 없음', async () => {
    agent.agentFetch.mockRejectedValueOnce(new AgentError(429, '오늘 사용 한도를 넘었어요'))
    renderPanel()

    await ask('안녕')

    expect(await chat().findByText('오늘 사용 한도를 넘었어요')).toBeInTheDocument()
    expect(chat().queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  it('빈 입력이면 보내기 비활성', () => {
    renderPanel()

    expect(chat().getByRole('button', { name: '보내기' })).toBeDisabled()
  })

  it('1000자를 넘으면 보내기 비활성과 글자 수 안내', async () => {
    renderPanel()
    const input = chat().getByLabelText('질문 입력')

    await userEvent.click(input)
    await userEvent.paste('가'.repeat(1001))

    expect(chat().getByRole('button', { name: '보내기' })).toBeDisabled()
    expect(chat().getByText(/1,001 \/ 1000/)).toBeInTheDocument()
    expect(chat().getByText(/1000자까지 보낼 수 있어요/)).toBeInTheDocument()
  })

  it('전송 중에는 보내기와 추천 칩이 비활성이고, 첫 글자 전까지 무엇을 하는지 보인다', async () => {
    const pending = pendingResponse([])
    agent.agentFetch.mockResolvedValueOnce(pending.response)
    renderPanel()

    await ask('오늘 뭐 해야 해?')

    expect(await chat().findByRole('status')).toHaveTextContent('사내 지식과 내 과제를 확인하고 있어요')
    await userEvent.type(chat().getByLabelText('질문 입력'), '다음')
    expect(chat().getByRole('button', { name: '보내기' })).toBeDisabled()
    expect(chat().getByRole('button', { name: '회의실 예약 어떻게 해?' })).toBeDisabled()

    await act(async () => pending.finish([{ type: 'token', text: '끝' }, { type: 'done' }]))
    expect(await chat().findByText('끝')).toBeInTheDocument()
    expect(chat().queryByText('사내 지식과 내 과제를 확인하고 있어요')).not.toBeInTheDocument()
  })

  it('8초가 지나도 첫 글자가 없으면 늦어지고 있다고 알리고, 글자가 오면 답으로 바뀐다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const pending = pendingResponse([])
      agent.agentFetch.mockResolvedValueOnce(pending.response)
      renderPanel()

      await ask('오늘 뭐 해야 해?')
      const waiting = await chat().findByRole('status')

      await act(async () => vi.advanceTimersByTime(7000))
      expect(waiting).toHaveTextContent('사내 지식과 내 과제를 확인하고 있어요')

      await act(async () => vi.advanceTimersByTime(1500))
      expect(waiting).toHaveTextContent('답변이 조금 늦어지고 있어요. 잠시만 기다려 주세요.')

      await act(async () => pending.finish([{ type: 'token', text: '끝' }, { type: 'done' }]))
      expect(await chat().findByText('끝')).toBeInTheDocument()
      expect(chat().queryByRole('status')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('추천 질문 칩을 누르면 그 문구로 보낸다', async () => {
    agent.agentFetch.mockResolvedValueOnce(streamResponse([{ type: 'token', text: '답' }, { type: 'done' }]))
    renderPanel()

    await userEvent.click(chat().getByRole('button', { name: '오늘 뭐 해야 해?' }))

    expect(agent.agentFetch).toHaveBeenCalledWith('/chat', { message: '오늘 뭐 해야 해?', history: [] })
    expect(await chat().findByText('답')).toBeInTheDocument()
  })

  describe('대화 전 빈 상태(S4 ①)', () => {
    const QUESTIONS = ['오늘 뭐 해야 해?', '회의실 예약 어떻게 해?', '노트북 경비 계정과목이 뭐야?']

    function emptyState() {
      return chat().queryByRole('region', { name: '온보딩에 대해 물어보세요' })
    }

    it('본문에 소개와 추천 질문 3개를 카드로 보여 주고, 아래 칩 줄은 없다', () => {
      renderPanel()

      const intro = emptyState()
      expect(intro).toBeInTheDocument()
      expect(within(intro!).getByText('등록된 사내 지식과 내 과제로 답해요')).toBeInTheDocument()
      const cards = within(within(intro!).getByRole('group', { name: '추천 질문' })).getAllByRole('button')
      expect(cards.map((b) => b.textContent)).toEqual(QUESTIONS)
      // 같은 이름의 버튼이 칩 줄에 또 있지 않다
      for (const q of QUESTIONS) expect(chat().getAllByRole('button', { name: q })).toHaveLength(1)
      expect(chat().getAllByRole('group', { name: '추천 질문' })).toHaveLength(1)
    })

    it('추천 질문 카드를 누르면 그 질문으로 /chat 요청', async () => {
      agent.agentFetch.mockResolvedValueOnce(streamResponse([{ type: 'token', text: '답' }, { type: 'done' }]))
      renderPanel()

      await userEvent.click(within(emptyState()!).getByRole('button', { name: '노트북 경비 계정과목이 뭐야?' }))

      expect(agent.agentFetch).toHaveBeenCalledWith('/chat', { message: '노트북 경비 계정과목이 뭐야?', history: [] })
    })

    it('첫 메시지 뒤에는 빈 상태가 사라지고 추천 칩 줄이 입력창 위에 나타난다', async () => {
      agent.agentFetch.mockResolvedValueOnce(streamResponse([{ type: 'token', text: '답' }, { type: 'done' }]))
      renderPanel()

      await ask('안녕')
      expect(await chat().findByText('답')).toBeInTheDocument()

      expect(emptyState()).not.toBeInTheDocument()
      const chips = chat().getByRole('group', { name: '추천 질문' })
      expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(QUESTIONS)
      for (const q of QUESTIONS) expect(chat().getAllByRole('button', { name: q })).toHaveLength(1)
      const input = chat().getByLabelText('질문 입력')
      expect(chips.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  it('chat:ask 이벤트를 받으면 입력창을 채운다(보내지는 않는다)', async () => {
    renderPanel()

    act(() => {
      window.dispatchEvent(new CustomEvent('chat:ask', { detail: { text: '"명함 신청" 과제에 대해 알려 줘' } }))
    })

    expect(chat().getByLabelText('질문 입력')).toHaveValue('"명함 신청" 과제에 대해 알려 줘')
    expect(agent.agentFetch).not.toHaveBeenCalled()
  })

  it('Enter로 보내고 Shift+Enter는 줄바꿈', async () => {
    agent.agentFetch.mockResolvedValueOnce(streamResponse([{ type: 'token', text: '답' }, { type: 'done' }]))
    renderPanel()
    const input = chat().getByLabelText('질문 입력')

    await userEvent.type(input, '첫 줄{Shift>}{Enter}{/Shift}둘째 줄')
    expect(agent.agentFetch).not.toHaveBeenCalled()
    await userEvent.type(input, '{Enter}')

    expect(agent.agentFetch).toHaveBeenCalledWith('/chat', { message: '첫 줄\n둘째 줄', history: [] })
  })

  it('모바일에서는 떠 있는 "에이전트에게 묻기" 버튼만큼 본문 아래에 여백을 둬서 마지막 버튼을 가리지 않는다', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: '에이전트에게 묻기' })).toHaveClass('fixed', 'bottom-6', 'lg:hidden')
    // 버튼: 바닥에서 24 + 높이 44 = 68. 본문 아래 여백 64 + 페이지 자체 아래 여백(24~32)으로 그 위에서 끝난다
    const page = screen.getByText('페이지 본문').parentElement
    expect(page).toHaveClass('pb-16', 'lg:pb-0')
  })

  describe('마스코트(system.md "마스코트")', () => {
    function aside() {
      return screen.getByRole('complementary', { name: '온보딩 에이전트 채팅' })
    }

    it('머리는 서 있는 마스코트, 대화 전 소개는 손 흔드는 마스코트이고 둘 다 화면 읽기에 드러나지 않는다', () => {
      renderPanel()
      const head = aside().querySelector('header .mascot')
      expect(head).toHaveAttribute('aria-hidden', 'true')
      expect(head).not.toHaveClass('is-wave', 'is-sit')

      const intro = chat().getByRole('region', { name: '온보딩에 대해 물어보세요' })
      const waves = intro.querySelectorAll('.mascot.is-wave')
      expect(waves.length).toBeGreaterThan(0)
      for (const m of waves) expect(m).toHaveAttribute('aria-hidden', 'true')
      // 데스크톱 패널(88)만 움직인다
      expect(intro.querySelectorAll('.mascot.is-idle')).toHaveLength(1)
      expect(chat().queryAllByRole('img')).toHaveLength(0)
    })

    it('모바일 묻기 버튼은 흰 원 안에 앉은 마스코트를 두고, 이름은 여전히 "에이전트에게 묻기"다', () => {
      renderPanel()
      const button = screen.getByRole('button', { name: '에이전트에게 묻기' })
      const mascot = button.querySelector('.mascot.is-sit')
      expect(mascot).toHaveAttribute('aria-hidden', 'true')
      expect(mascot!.parentElement).toHaveClass('bg-card', 'rounded-full')
    })

    it('답변을 기다리는 말풍선에 앉은 마스코트를 두고, 알리는 문구는 그대로다', async () => {
      const pending = pendingResponse([])
      agent.agentFetch.mockResolvedValueOnce(pending.response)
      renderPanel()

      await ask('오늘 뭐 해야 해?')

      const waiting = await chat().findByRole('status')
      expect(waiting).toHaveTextContent('사내 지식과 내 과제를 확인하고 있어요')
      expect(waiting.querySelector('.mascot.is-sit')).toHaveAttribute('aria-hidden', 'true')
      await act(async () => pending.finish([{ type: 'done' }]))
    })
  })

  it('대화 전에는 "새 대화" 버튼이 없다', () => {
    renderPanel()
    expect(chat().queryByRole('button', { name: '새 대화' })).not.toBeInTheDocument()
  })

  it('새 대화: 저장되지 않는다고 확인한 뒤 대화를 비우고, 다음 질문은 이력 없이 보낸다', async () => {
    agent.agentFetch.mockResolvedValueOnce(streamResponse([{ type: 'token', text: '첫 답' }, { type: 'done' }]))
    agent.agentFetch.mockResolvedValueOnce(streamResponse([{ type: 'token', text: '새 답' }, { type: 'done' }]))
    renderPanel()
    await ask('첫 질문')
    expect(await chat().findByText('첫 답')).toBeInTheDocument()

    await userEvent.click(chat().getByRole('button', { name: '새 대화' }))
    const dialog = await screen.findByRole('alertdialog', { name: '새 대화를 시작할까요?' })
    expect(dialog).toHaveTextContent('지금 대화는 저장되지 않아 다시 볼 수 없어요.')
    await userEvent.click(within(dialog).getByRole('button', { name: '새 대화 시작' }))

    expect(chat().queryByText('첫 답')).not.toBeInTheDocument()
    expect(chat().getByRole('group', { name: '추천 질문' })).toBeInTheDocument()
    expect(chat().queryByRole('button', { name: '새 대화' })).not.toBeInTheDocument()
    // 버튼이 사라지므로 포커스는 입력창으로 간다
    await waitFor(() => expect(chat().getByLabelText('질문 입력')).toHaveFocus())

    await ask('새 질문')
    expect(agent.agentFetch).toHaveBeenLastCalledWith('/chat', { message: '새 질문', history: [] })
  })

  it('새 대화: 취소하면 대화가 그대로 남는다', async () => {
    agent.agentFetch.mockResolvedValueOnce(streamResponse([{ type: 'token', text: '첫 답' }, { type: 'done' }]))
    renderPanel()
    await ask('첫 질문')
    expect(await chat().findByText('첫 답')).toBeInTheDocument()

    await userEvent.click(chat().getByRole('button', { name: '새 대화' }))
    const dialog = await screen.findByRole('alertdialog', { name: '새 대화를 시작할까요?' })
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(chat().getByText('첫 답')).toBeInTheDocument()
  })

  it('새 대화: 답변을 받는 중에는 누를 수 없다', async () => {
    const pending = pendingResponse([])
    agent.agentFetch.mockResolvedValueOnce(pending.response)
    renderPanel()
    await ask('오늘 뭐 해야 해?')

    expect(await chat().findByRole('button', { name: '새 대화' })).toBeDisabled()

    await act(async () => pending.finish([{ type: 'token', text: '끝' }, { type: 'done' }]))
    expect(await chat().findByText('끝')).toBeInTheDocument()
    expect(chat().getByRole('button', { name: '새 대화' })).toBeEnabled()
  })
})
