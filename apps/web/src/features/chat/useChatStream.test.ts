import { act, renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { streamResponse, type StreamEvent } from './testStream'

const agent = vi.hoisted(() => ({ agentFetch: vi.fn() }))

vi.mock('@/lib/agent', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/agent')>()),
  agentFetch: agent.agentFetch,
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { AgentError } from '@/lib/agent'
import { useChatStream } from './useChatStream'

function answer(text: string, extra: StreamEvent[] = []): Response {
  return streamResponse([{ type: 'token', text }, ...extra, { type: 'done' }])
}

type ChatBody = { message: string; history: { role: string; text: string }[] }
function requestBody(call: number): ChatBody {
  return agent.agentFetch.mock.calls[call][1] as ChatBody
}

beforeEach(() => {
  agent.agentFetch.mockReset()
})

describe('useChatStream', () => {
  it('token 이벤트를 이어붙여 답변 하나로 만든다', async () => {
    agent.agentFetch.mockResolvedValueOnce(
      streamResponse([
        { type: 'token', text: '노트북 구입비는 ' },
        { type: 'token', text: '소모품비로 ' },
        { type: 'token', text: '처리해요.' },
        { type: 'done' },
      ]),
    )
    const { result } = renderHook(() => useChatStream())

    await act(() => result.current.send('노트북 경비 계정과목이 뭐야?'))

    expect(agent.agentFetch).toHaveBeenCalledWith('/chat', { message: '노트북 경비 계정과목이 뭐야?', history: [] })
    expect(result.current.messages).toEqual([
      { role: 'user', text: '노트북 경비 계정과목이 뭐야?' },
      { role: 'assistant', text: '노트북 구입비는 소모품비로 처리해요.' },
    ])
    expect(result.current.sending).toBe(false)
  })

  it('sources와 unanswered 이벤트를 답변에 붙인다', async () => {
    const sources = {
      knowledge: [{ id: 'k1', question: '노트북 경비 계정과목이 뭐야?' }],
      tasks: [{ id: 't1', code: 'GA-07', title: '명함 신청' }],
    }
    agent.agentFetch.mockResolvedValueOnce(answer('답', [{ type: 'sources', ...sources }]))
    agent.agentFetch.mockResolvedValueOnce(answer('확인되지 않은 내용이에요.', [{ type: 'unanswered' }]))
    const { result } = renderHook(() => useChatStream())

    await act(() => result.current.send('첫 질문'))
    await act(() => result.current.send('동호회 가입비 얼마야?'))

    expect(result.current.messages[1]).toEqual({ role: 'assistant', text: '답', sources: { ...sources, documents: [] } })
    expect(result.current.messages[3]).toEqual({ role: 'assistant', text: '확인되지 않은 내용이에요.', unanswered: true })
  })

  it('sources 이벤트의 documents를 메시지에 담는다', async () => {
    const documents = [{ id: 'c1', document_title: '복리후생 규정(가상)', label: '제8조', heading: '경조금', body: '본문' }]
    agent.agentFetch.mockResolvedValueOnce(answer('답', [{ type: 'sources', knowledge: [], tasks: [], documents }]))
    const { result } = renderHook(() => useChatStream())

    await act(() => result.current.send('경조금 얼마야?'))

    expect(result.current.messages[1].sources?.documents).toEqual(documents)
  })

  it('documents가 없는 sources 이벤트는 documents를 빈 배열로 둔다', async () => {
    agent.agentFetch.mockResolvedValueOnce(answer('답', [{ type: 'sources', knowledge: [], tasks: [] }]))
    const { result } = renderHook(() => useChatStream())

    await act(() => result.current.send('질문'))

    expect(result.current.messages[1].sources?.documents).toEqual([])
  })

  it('두 번째 질문의 history에 첫 질문과 답이 들어간다', async () => {
    agent.agentFetch.mockResolvedValueOnce(answer('첫 답')).mockResolvedValueOnce(answer('두 번째 답'))
    const { result } = renderHook(() => useChatStream())

    await act(() => result.current.send('첫 질문'))
    await act(() => result.current.send('두 번째 질문'))

    expect(requestBody(1)).toEqual({
      message: '두 번째 질문',
      history: [
        { role: 'user', text: '첫 질문' },
        { role: 'assistant', text: '첫 답' },
      ],
    })
  })

  it('메시지가 12개 쌓이면 history에는 최근 10개만 보낸다', async () => {
    agent.agentFetch.mockImplementation(async (_path: string, body: ChatBody) => answer(`${body.message}의 답`))
    const { result } = renderHook(() => useChatStream())

    for (let i = 1; i <= 7; i++) await act(() => result.current.send(`질문${i}`))

    const history = requestBody(6).history
    expect(history).toHaveLength(10)
    expect(history[0]).toEqual({ role: 'user', text: '질문2' })
    expect(history[9]).toEqual({ role: 'assistant', text: '질문6의 답' })
  })

  it('history의 긴 답변은 계약 길이(2000자)로 자른다', async () => {
    agent.agentFetch.mockResolvedValueOnce(answer('가'.repeat(2500))).mockResolvedValueOnce(answer('답'))
    const { result } = renderHook(() => useChatStream())

    await act(() => result.current.send('첫 질문'))
    await act(() => result.current.send('두 번째'))

    expect(requestBody(1).history[1].text).toHaveLength(2000)
  })

  it('AgentError(0) → 연결 실패 안내, 다시 시도 가능, sending=false', async () => {
    agent.agentFetch.mockRejectedValueOnce(new AgentError(0, '연결 실패'))
    const { result } = renderHook(() => useChatStream())

    await act(() => result.current.send('회의실 예약 어떻게 해?'))

    const last = result.current.messages.at(-1)
    expect(last?.error).toContain('지금 답변 서비스에 연결할 수 없어요')
    expect(last?.retryable).toBe(true)
    expect(result.current.sending).toBe(false)
  })

  it('AgentError(429) → 한도 안내, 다시 시도 없음', async () => {
    agent.agentFetch.mockRejectedValueOnce(new AgentError(429, '오늘 사용 한도를 넘었어요'))
    const { result } = renderHook(() => useChatStream())

    await act(() => result.current.send('안녕'))

    const last = result.current.messages.at(-1)
    expect(last?.error).toBe('오늘 사용 한도를 넘었어요')
    expect(last?.retryable).toBe(false)
    expect(result.current.sending).toBe(false)
  })

  it('스트림의 error 이벤트 → 오류 안내, 받은 글자는 남기지 않는다', async () => {
    agent.agentFetch.mockResolvedValueOnce(
      streamResponse([
        { type: 'token', text: '중간까지' },
        { type: 'error', message: '답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.' },
        { type: 'done' },
      ]),
    )
    const { result } = renderHook(() => useChatStream())

    await act(() => result.current.send('질문'))

    const last = result.current.messages.at(-1)
    expect(last?.error).toBe('답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(last?.retryable).toBe(true)
  })

  it('done 없이 끊긴 스트림은 연결 실패로 본다', async () => {
    agent.agentFetch.mockResolvedValueOnce(streamResponse([{ type: 'token', text: '중간까지' }]))
    const { result } = renderHook(() => useChatStream())

    await act(() => result.current.send('질문'))

    expect(result.current.messages.at(-1)?.error).toContain('지금 답변 서비스에 연결할 수 없어요')
  })

  it('오류가 난 질문과 답은 history에서 빠지고, 다음 질문을 보내면 화면에서도 걷힌다', async () => {
    agent.agentFetch
      .mockResolvedValueOnce(answer('첫 답'))
      .mockRejectedValueOnce(new AgentError(0, '연결 실패'))
      .mockResolvedValueOnce(answer('다시 한 답'))
    const { result } = renderHook(() => useChatStream())

    await act(() => result.current.send('첫 질문'))
    await act(() => result.current.send('실패한 질문'))
    await act(() => result.current.send('실패한 질문'))

    expect(requestBody(2).history).toEqual([
      { role: 'user', text: '첫 질문' },
      { role: 'assistant', text: '첫 답' },
    ])
    expect(result.current.messages.map((m) => m.text)).toEqual(['첫 질문', '첫 답', '실패한 질문', '다시 한 답'])
  })

  it('전송 중에는 sending=true이고 두 번째 send는 무시한다', async () => {
    let finish!: () => void
    agent.agentFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = () => resolve(answer('답'))
        }),
    )
    const { result } = renderHook(() => useChatStream())

    let pending!: Promise<void>
    act(() => {
      pending = result.current.send('질문')
    })
    await waitFor(() => expect(result.current.sending).toBe(true))
    await act(() => result.current.send('끼어든 질문'))
    expect(agent.agentFetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      finish()
      await pending
    })
    expect(result.current.sending).toBe(false)
  })
})
