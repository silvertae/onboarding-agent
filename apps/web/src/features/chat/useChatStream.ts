import { useCallback, useRef, useState } from 'react'
import { AgentError, agentFetch } from '@/lib/agent'

export type ClauseSource = { id: string; document_title: string; label: string; heading: string; body: string }

export function clauseTitle(clause: Pick<ClauseSource, 'label' | 'heading'>) {
  return `${clause.label} ${clause.heading}`.trim()
}

export type Sources = {
  knowledge: { id: string; question: string }[]
  tasks: { id: string; code: string; title: string }[]
  documents: ClauseSource[]
}

// retryable: 오류 답변에 "다시 시도"를 보여 줄지(한도 초과·권한 없음은 다시 해도 같으므로 false)
export type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
  sources?: Sources
  unanswered?: boolean
  error?: string
  retryable?: boolean
}

type StreamEvent =
  | { type: 'token'; text: string }
  | ({ type: 'sources' } & Omit<Sources, 'documents'> & { documents?: ClauseSource[] })
  | { type: 'unanswered' }
  | { type: 'error'; message: string }
  | { type: 'done' }

// 계약(docs/contracts.md) 한도
export const MAX_MESSAGE_LENGTH = 1000
const MAX_HISTORY = 10
const MAX_HISTORY_TEXT = 2000

export const CONNECTION_ERROR = '지금 답변 서비스에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.'
const NOT_RETRYABLE = new Set([401, 403, 422, 429])

class StreamError extends Error {}

// 오류가 없는 대화만 이력으로 보낸다. 오류 답변의 짝인 질문도 뺀다.
function buildHistory(messages: ChatMessage[]): { role: 'user' | 'assistant'; text: string }[] {
  const clean: ChatMessage[] = []
  messages.forEach((m, i) => {
    if (m.error) return
    if (m.role === 'user' && messages[i + 1]?.error) return
    clean.push(m)
  })
  return clean.slice(-MAX_HISTORY).map((m) => ({ role: m.role, text: m.text.slice(0, MAX_HISTORY_TEXT) }))
}

// 마지막 대화가 실패였다면 화면에서 걷는다(다시 보내면 새 질문과 답으로 바뀐다)
function dropFailedTail(messages: ChatMessage[]): ChatMessage[] {
  const last = messages.at(-1)
  if (last?.role === 'assistant' && last.error) return messages.slice(0, -2)
  return messages
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) yield JSON.parse(line.slice(6)) as StreamEvent
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function useChatStream(): { messages: ChatMessage[]; sending: boolean; send(text: string): Promise<void> } {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  // 렌더 사이에 최신 값을 읽기 위한 사본(전송 중 중복 호출 방지, 이력 계산)
  const messagesRef = useRef<ChatMessage[]>([])
  const sendingRef = useRef(false)

  const update = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  const patchAnswer = useCallback(
    (patch: (answer: ChatMessage) => ChatMessage) => {
      const current = messagesRef.current
      update([...current.slice(0, -1), patch(current[current.length - 1])])
    },
    [update],
  )

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || text.length > MAX_MESSAGE_LENGTH || sendingRef.current) return
      sendingRef.current = true
      setSending(true)

      const base = dropFailedTail(messagesRef.current)
      const history = buildHistory(base)
      update([...base, { role: 'user', text }, { role: 'assistant', text: '' }])

      try {
        const res = await agentFetch('/chat', { message: text, history })
        if (!res.body) throw new StreamError()
        let finished = false
        for await (const event of readEvents(res.body)) {
          if (event.type === 'token') {
            patchAnswer((a) => ({ ...a, text: a.text + event.text }))
          } else if (event.type === 'sources') {
            patchAnswer((a) => ({ ...a, sources: { knowledge: event.knowledge, tasks: event.tasks, documents: event.documents ?? [] } }))
          } else if (event.type === 'unanswered') {
            patchAnswer((a) => ({ ...a, unanswered: true }))
          } else if (event.type === 'error') {
            patchAnswer(() => ({ role: 'assistant', text: '', error: event.message, retryable: true }))
          } else if (event.type === 'done') {
            finished = true
            break
          }
        }
        if (!finished) throw new StreamError()
      } catch (err) {
        const status = err instanceof AgentError ? err.status : 0
        const message = err instanceof AgentError && status !== 0 ? err.message : CONNECTION_ERROR
        patchAnswer(() => ({ role: 'assistant', text: '', error: message, retryable: !NOT_RETRYABLE.has(status) }))
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    },
    [patchAnswer, update],
  )

  return { messages, sending, send }
}
