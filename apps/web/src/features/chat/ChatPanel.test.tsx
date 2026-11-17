import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { pendingResponse, streamResponse } from './testStream'

const agent = vi.hoisted(() => ({ agentFetch: vi.fn() }))
const auth = vi.hoisted(() => ({ role: 'new_hire' as string }))

vi.mock('@/lib/agent', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/agent')>()),
  agentFetch: agent.agentFetch,
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ profile: { role: auth.role }, session: {}, loading: false, signOut: vi.fn() }),
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
  auth.role = 'new_hire'
})

describe('ChatPanel', () => {
  it('신입이 아니면 페이지만 보이고 채팅은 없다', () => {
    auth.role = 'team_trainer'
    renderPanel()

    expect(screen.getByText('페이지 본문')).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '온보딩 에이전트 채팅' })).not.toBeInTheDocument()
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

  it('unanswered → "담당자에게 전달했어요" 표시', async () => {
    agent.agentFetch.mockResolvedValueOnce(
      streamResponse([{ type: 'unanswered' }, { type: 'token', text: '확인되지 않은 내용이에요.' }, { type: 'done' }]),
    )
    renderPanel()

    await ask('동호회 가입비 얼마야?')

    expect(await chat().findByText(/담당자에게 전달했어요/)).toBeInTheDocument()
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

  it('전송 중에는 보내기와 추천 칩이 비활성이고 답변 중 표시', async () => {
    const pending = pendingResponse([])
    agent.agentFetch.mockResolvedValueOnce(pending.response)
    renderPanel()

    await ask('오늘 뭐 해야 해?')

    expect(await chat().findByRole('status', { name: '답변 중' })).toBeInTheDocument()
    await userEvent.type(chat().getByLabelText('질문 입력'), '다음')
    expect(chat().getByRole('button', { name: '보내기' })).toBeDisabled()
    expect(chat().getByRole('button', { name: '회의실 예약 어떻게 해?' })).toBeDisabled()

    await act(async () => pending.finish([{ type: 'token', text: '끝' }, { type: 'done' }]))
    expect(await chat().findByText('끝')).toBeInTheDocument()
  })

  it('추천 질문 칩을 누르면 그 문구로 보낸다', async () => {
    agent.agentFetch.mockResolvedValueOnce(streamResponse([{ type: 'token', text: '답' }, { type: 'done' }]))
    renderPanel()

    await userEvent.click(chat().getByRole('button', { name: '오늘 뭐 해야 해?' }))

    expect(agent.agentFetch).toHaveBeenCalledWith('/chat', { message: '오늘 뭐 해야 해?', history: [] })
    expect(await chat().findByText('답')).toBeInTheDocument()
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
})
