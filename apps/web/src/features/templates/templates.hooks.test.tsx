import { vi } from 'vitest'

type Call = { method: string; args: unknown[] }
const { calls, state, rpc } = vi.hoisted(() => ({
  calls: [] as Call[],
  state: { profile: null as unknown, rows: [] as unknown[] },
  rpc: vi.fn(async (_n: string, _a?: unknown) => ({ data: { id: 't1' }, error: null as unknown, status: 200 })),
}))

vi.mock('@/lib/supabase', () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {}
    calls.push({ method: 'from', args: [table] })
    for (const method of ['select', 'eq', 'or', 'is', 'not', 'order']) {
      b[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return b
      }
    }
    b.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ data: state.rows, error: null, status: 200 }).then(resolve)
    return b
  }
  return { supabase: { rpc, from: builder } }
})
vi.mock('@/app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } }, profile: state.profile }) }))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useManagedTemplates, useTemplateActions, useTemplateUsage, type TemplateInput } from './templates'

let client: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children)
}
const has = (method: string, ...args: unknown[]) =>
  calls.some((c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args))

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  calls.length = 0
  state.rows = [{ id: 't1' }]
  state.profile = null
  rpc.mockClear()
})

describe('useManagedTemplates', () => {
  it('교육 담당자는 팀으로, 기본 과제·사용 중만 거른다', async () => {
    state.profile = { role: 'team_trainer', team_id: 'team-ai', department: 'hr' }
    const { result } = renderHook(() => useManagedTemplates('active'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: 't1' }])
    expect(has('from', 'task_templates')).toBe(true)
    expect(has('eq', 'team_id', 'team-ai')).toBe(true)
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'department')).toBe(false)
    expect(has('is', 'assigned_to', null)).toBe(true)
    expect(has('is', 'archived_at', null)).toBe(true)
    expect(has('order', 'stage')).toBe(true)
    expect(has('order', 'sort_order')).toBe(true)
  })

  it('경영지원은 부서로, 보관 보기는 archived_at이 있는 것만', async () => {
    state.profile = { role: 'ops_staff', team_id: null, department: 'hr' }
    const { result } = renderHook(() => useManagedTemplates('archived'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(has('eq', 'department', 'hr')).toBe(true)
    expect(has('not', 'archived_at', 'is', null)).toBe(true)
  })

  it('부서가 있는 교육 담당자도 팀만 쓴다', async () => {
    state.profile = { role: 'team_trainer', team_id: 'team-ai', department: 'hr' }
    renderHook(() => useManagedTemplates('active'), { wrapper })
    await waitFor(() => expect(has('eq', 'team_id', 'team-ai')).toBe(true))
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'department')).toBe(false)
  })

  it('프로필을 불러오기 전에는 조회하지 않는다', () => {
    const { result } = renderHook(() => useManagedTemplates('active'), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(calls).toHaveLength(0)
  })
})

describe('useTemplateUsage', () => {
  it('template_id별 신입 수', async () => {
    state.rows = [{ template_id: 'a' }, { template_id: 'a' }, { template_id: 'b' }]
    const { result } = renderHook(() => useTemplateUsage(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(new Map([['a', 2], ['b', 1]]))
  })
})

describe('useTemplateActions', () => {
  const input: TemplateInput = {
    title: 't', description: '', kind: 'read', completionMode: 'self', stage: 'day1',
    daysInStage: 0, allowNa: false, checklist: null, prerequisiteCodes: [],
  }

  it('성공하면 templates·template-usage·tasks를 무효화한다', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useTemplateActions(), { wrapper })
    await result.current.save(null, input)
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toEqual(expect.arrayContaining([['templates'], ['template-usage'], ['tasks']]))
  })

  it('실패하면 무효화하지 않는다', async () => {
    rpc.mockResolvedValueOnce({ data: null as never, error: { message: 'x', code: '22023' }, status: 400 })
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useTemplateActions(), { wrapper })
    await expect(result.current.archive('t1')).rejects.toMatchObject({ code: '22023' })
    expect(spy).not.toHaveBeenCalled()
  })
})
