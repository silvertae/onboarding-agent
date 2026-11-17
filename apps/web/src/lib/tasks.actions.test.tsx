import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

const { rpc, signOut } = vi.hoisted(() => ({
  rpc: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, auth: { signOut } } }))
vi.mock('@/app/AuthProvider', () => ({ useAuth: () => ({ session: null }) }))

import { DbError } from './errors'
import { useTaskActions } from './tasks'

function actions() {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useTaskActions(), { wrapper }).result.current
}

afterEach(() => {
  rpc.mockReset()
  signOut.mockClear()
})

describe('useTaskActions', () => {
  it('RPC가 401이면 로그아웃하고 DbError를 던진다', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 })

    const err = await actions().confirm('task-1').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(DbError)
    expect((err as DbError).status).toBe(401)
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('권한·상태 오류(401 아님)에는 로그아웃하지 않는다', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: '담당자가 아닙니다', code: 'P0001' }, status: 400 })

    const err = await actions().confirm('task-1').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(DbError)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('성공하면 해당 RPC를 인자와 함께 호출한다', async () => {
    rpc.mockResolvedValue({ data: {}, error: null, status: 200 })

    await actions().requestRework('task-1', '서류 누락')

    expect(rpc).toHaveBeenCalledWith('request_rework', { p_id: 'task-1', p_reason: '서류 누락' })
    expect(signOut).not.toHaveBeenCalled()
  })
})
