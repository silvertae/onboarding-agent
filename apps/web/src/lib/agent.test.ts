import { vi } from 'vitest'

const { signOut, getSession } = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'token-123' } }, error: null })),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut, getSession } },
}))

import { AgentError, agentFetch } from './agent'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.stubEnv('VITE_AGENT_URL', 'http://agent.test')
  signOut.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('agentFetch', () => {
  it('에이전트 URL로 토큰과 JSON 본문을 POST한다', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await agentFetch('/chat', { message: '안녕' })

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://agent.test/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: '안녕' }),
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('401이면 로그아웃하고 AgentError(401)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { detail: 'expired' })))

    const err = await agentFetch('/chat', {}).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(AgentError)
    expect((err as AgentError).status).toBe(401)
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('429이면 한도 안내 문구로 AgentError(429)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(429, { detail: '오늘 사용 한도를 넘었어요' })))

    const err = await agentFetch('/chat', {}).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(AgentError)
    expect((err as AgentError).status).toBe(429)
    expect((err as AgentError).message).toBe('오늘 사용 한도를 넘었어요')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('응답 detail이 문자열이 아니면 기본 문구를 쓴다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(422, { detail: [{ msg: 'bad' }] })))

    const err = (await agentFetch('/chat', {}).catch((e: unknown) => e)) as AgentError

    expect(err.status).toBe(422)
    expect(typeof err.message).toBe('string')
    expect(err.message.length).toBeGreaterThan(0)
  })

  it('fetch 자체가 실패하면 AgentError(0)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    const err = await agentFetch('/chat', {}).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(AgentError)
    expect((err as AgentError).status).toBe(0)
  })
})
