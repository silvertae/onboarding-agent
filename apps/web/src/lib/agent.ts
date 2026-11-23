import { supabase } from './supabase'

// 에이전트 서비스 호출은 전부 agentFetch를 거친다. status 0 = 연결 실패.
export class AgentError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AgentError'
    this.status = status
  }
}

const DEFAULT_MESSAGE: Record<number, string> = {
  0: '에이전트 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
  401: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  403: '이 기능을 사용할 권한이 없어요.',
  429: '오늘 사용 한도를 넘었어요',
  502: 'AI 응답을 처리하지 못했어요. 다시 시도해 주세요.',
}
const FALLBACK_MESSAGE = '요청을 처리하지 못했어요. 다시 시도해 주세요.'

function messageFor(status: number, detail: unknown): string {
  if (typeof detail === 'string' && detail.trim()) return detail
  return DEFAULT_MESSAGE[status] ?? FALLBACK_MESSAGE
}

async function readDetail(res: Response): Promise<unknown> {
  try {
    const body: unknown = await res.json()
    return body && typeof body === 'object' && 'detail' in body ? body.detail : undefined
  } catch {
    return undefined
  }
}

export async function agentFetch(path: string, body: unknown): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  let res: Response
  try {
    res = await fetch(`${import.meta.env.VITE_AGENT_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AgentError(0, DEFAULT_MESSAGE[0])
  }

  if (res.status === 401) {
    await supabase.auth.signOut()
    throw new AgentError(401, DEFAULT_MESSAGE[401])
  }
  if (!res.ok) {
    throw new AgentError(res.status, messageFor(res.status, await readDetail(res)))
  }
  return res
}

// 신입 채팅 화면을 열 때 에이전트 인스턴스를 미리 깨운다. 질문을 입력하는 동안 인스턴스가 뜨면 첫 답이 빨라진다.
// 페이지를 연 동안 한 번만 부른다. 토큰을 보내지 않고, 실패해도 무시한다(질문할 때 agentFetch가 오류를 알린다).
let woken = false

export function wakeAgent(): void {
  if (woken) return
  woken = true
  fetch(`${import.meta.env.VITE_AGENT_URL}/health`, { method: 'GET', cache: 'no-store' }).catch(() => {})
}

export function resetWakeForTest(): void {
  woken = false
}
