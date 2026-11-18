import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data: unknown; error: { message: string; code?: string } | null; status: number }
const { calls, state, rpc, remove, signOut } = vi.hoisted(() => ({
  calls: [] as { method: string; args: unknown[] }[],
  state: { files: { data: [], error: null, status: 200 } as Result },
  rpc: vi.fn(async (_name: string): Promise<Result> => ({ data: null, error: null, status: 204 })),
  remove: vi.fn(async (_paths: string[]) => ({ data: [] as unknown[], error: null as unknown })),
  signOut: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/lib/supabase', () => {
  const builder = (table: string) => {
    calls.push({ method: 'from', args: [table] })
    const b: Record<string, unknown> = {}
    for (const method of ['select', 'eq']) {
      b[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return b
      }
    }
    b.then = (resolve: (r: Result) => unknown) => Promise.resolve(state.files).then(resolve)
    return b
  }
  return {
    supabase: {
      from: builder,
      rpc,
      storage: {
        from: (bucket: string) => {
          calls.push({ method: 'storage.from', args: [bucket] })
          return { remove }
        },
      },
      auth: { signOut },
    },
  }
})

import { DbError } from '@/lib/errors'
import { resetDemo } from './users'

const has = (method: string, ...args: unknown[]) =>
  calls.some((c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args))

const PATH_A = 'org-1/tpl-1/00000000-0000-4000-8000-000000000001.pdf'
const PATH_B = 'org-1/tpl-2/00000000-0000-4000-8000-000000000002.xlsx'

beforeEach(() => {
  calls.length = 0
  state.files = { data: [], error: null, status: 200 }
  rpc.mockClear()
  remove.mockClear()
  signOut.mockClear()
})

describe('resetDemo', () => {
  it('담당자가 올린 서식 2개 → 두 경로를 task-forms에서 한 번에 지운 뒤 reset_demo', async () => {
    state.files = { data: [{ storage_path: PATH_A }, { storage_path: PATH_B }], error: null, status: 200 }

    await resetDemo()

    expect(has('from', 'task_template_files')).toBe(true)
    expect(has('select', 'storage_path')).toBe(true)
    expect(has('eq', 'is_seed', false)).toBe(true)
    expect(has('storage.from', 'task-forms')).toBe(true)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith([PATH_A, PATH_B])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('reset_demo')
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0])
  })

  it('담당자가 올린 서식이 없으면 remove 없이 reset_demo', async () => {
    await resetDemo()

    expect(remove).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('reset_demo')
  })

  it('객체를 지우지 못하면 reset_demo를 부르지 않고 DbError를 던진다(행이 남아 다시 시도할 수 있게)', async () => {
    state.files = { data: [{ storage_path: PATH_A }], error: null, status: 200 }
    remove.mockResolvedValueOnce({ data: [], error: { message: 'boom', status: 500, statusCode: '500' } })

    await expect(resetDemo()).rejects.toBeInstanceOf(DbError)
    expect(rpc).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('서식 목록을 읽지 못하면 지우지도 reset_demo를 부르지도 않는다', async () => {
    state.files = { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 }

    await expect(resetDemo()).rejects.toMatchObject({ status: 500, code: 'XX000' })
    expect(remove).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('세션이 만료됐으면(401) 로그아웃하고 던진다', async () => {
    state.files = { data: null, error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 }

    await expect(resetDemo()).rejects.toBeInstanceOf(DbError)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reset_demo가 실패하면 DbError를 던진다', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom', code: '42501' }, status: 403 })

    await expect(resetDemo()).rejects.toMatchObject({ status: 403, code: '42501' })
    expect(signOut).not.toHaveBeenCalled()
  })
})
