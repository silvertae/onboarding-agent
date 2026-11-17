import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { vi } from 'vitest'

type Listener = (event: string, session: unknown) => void

const { auth, listeners } = vi.hoisted(() => {
  const listeners: Listener[] = []
  return {
    listeners,
    auth: {
      onAuthStateChange: vi.fn((cb: Listener) => {
        listeners.push(cb)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signOut: vi.fn(async () => ({ error: null })),
    },
  }
})

vi.mock('@/lib/supabase', () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: null, error: null, status: 200 }),
  }
  return {
    supabase: { auth, from: () => query },
  }
})

import { AuthProvider } from './AuthProvider'

function sessionFor(id: string) {
  return { access_token: `t-${id}`, user: { id } }
}

function setup() {
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <p>child</p>
      </AuthProvider>
    </QueryClientProvider>,
  )
  const emit = (event: string, session: unknown) => act(() => listeners.at(-1)!(event, session))
  return { queryClient, emit }
}

afterEach(() => {
  listeners.length = 0
})

describe('AuthProvider 캐시 정리', () => {
  it('어떤 경로로든 로그아웃되면 쿼리 캐시를 비운다', () => {
    const { queryClient, emit } = setup()
    emit('INITIAL_SESSION', sessionFor('a'))
    queryClient.setQueryData(['tasks', 'mine', 'a'], [{ id: 'secret' }])

    emit('SIGNED_OUT', null)

    expect(queryClient.getQueryData(['tasks', 'mine', 'a'])).toBeUndefined()
  })

  it('다른 사용자로 바뀌면 쿼리 캐시를 비운다', () => {
    const { queryClient, emit } = setup()
    emit('INITIAL_SESSION', sessionFor('a'))
    queryClient.setQueryData(['tasks', 'visible', 'a', null], [{ id: 'secret' }])

    emit('SIGNED_IN', sessionFor('b'))

    expect(queryClient.getQueryData(['tasks', 'visible', 'a', null])).toBeUndefined()
  })

  it('같은 사용자의 토큰 갱신에는 캐시를 유지한다', () => {
    const { queryClient, emit } = setup()
    emit('INITIAL_SESSION', sessionFor('a'))
    queryClient.setQueryData(['tasks', 'mine', 'a'], [{ id: 'keep' }])

    emit('TOKEN_REFRESHED', sessionFor('a'))

    expect(queryClient.getQueryData(['tasks', 'mine', 'a'])).toEqual([{ id: 'keep' }])
  })
})
