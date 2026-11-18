import { vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async (_name: string, _args?: unknown) => ({ data: null as unknown, error: null as unknown, status: 200 })),
}))

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, from: vi.fn() } }))
vi.mock('@/app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } }, profile: null }) }))

import { DbError } from '@/lib/errors'
import type { TaskTemplate } from '@/lib/tasks'
import {
  addTaskForHire, archiveTemplate, isLocked, lockedFieldsChanged, restoreTemplate, saveTemplate, type TemplateInput,
} from './templates'

const input: TemplateInput = {
  title: '보안 서약', description: '읽고 서명', kind: 'read', completionMode: 'self', stage: 'week1',
  daysInStage: 2, allowNa: false, checklist: null, prerequisiteCodes: [],
}

const before = {
  id: 't1', title: '보안 서약', description: '읽고 서명', kind: 'read', completion_mode: 'self', stage: 'week1',
  due_offset_days: 7, allow_na: false, checklist: null, prerequisite_codes: [],
} as unknown as TaskTemplate

beforeEach(() => rpc.mockReset())

describe('saveTemplate', () => {
  it('RPC 인자 이름으로 매핑한다', async () => {
    rpc.mockResolvedValue({ data: { id: 't1' }, error: null, status: 200 })
    await saveTemplate(null, input)
    expect(rpc).toHaveBeenCalledWith('save_task_template', {
      p_id: null, p_title: '보안 서약', p_description: '읽고 서명', p_kind: 'read', p_completion_mode: 'self',
      p_stage: 'week1', p_days_in_stage: 2, p_allow_na: false, p_checklist: null, p_prerequisite_codes: [],
    })
  })

  it('체크리스트를 그대로 보낸다', async () => {
    rpc.mockResolvedValue({ data: { id: 't1' }, error: null, status: 200 })
    await saveTemplate('t1', { ...input, kind: 'setup', checklist: ['SAP 계정', 'cf cli'] })
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_id: 't1', p_checklist: ['SAP 계정', 'cf cli'] })
  })

  it('RPC 오류는 code를 보존한 DbError', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: '범위 밖', code: '42501' }, status: 403 })
    const err = await saveTemplate(null, input).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DbError)
    expect(err).toMatchObject({ code: '42501', status: 403 })
  })
})

describe('archive / restore', () => {
  it('p_id로 호출한다', async () => {
    rpc.mockResolvedValue({ data: { id: 't1' }, error: null, status: 200 })
    await archiveTemplate('t1')
    await restoreTemplate('t1')
    expect(rpc).toHaveBeenNthCalledWith(1, 'archive_task_template', { p_id: 't1' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'restore_task_template', { p_id: 't1' })
  })

  it('P0002는 DbError', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: '없음', code: 'P0002' }, status: 404 })
    await expect(archiveTemplate('x')).rejects.toMatchObject({ code: 'P0002' })
  })
})

describe('addTaskForHire', () => {
  it('p_new_hire와 함께 호출하고 선행은 보내지 않는다', async () => {
    rpc.mockResolvedValue({ data: { id: 'i1' }, error: null, status: 200 })
    const { prerequisiteCodes: _omit, ...rest } = input
    await addTaskForHire('hire-1', rest)
    const [name, args] = rpc.mock.calls[0]!
    expect(name).toBe('add_task_for_hire')
    expect(args).toMatchObject({ p_new_hire: 'hire-1', p_title: '보안 서약', p_days_in_stage: 2 })
    expect(args).not.toHaveProperty('p_prerequisite_codes')
  })
})

describe('잠금', () => {
  it('isLocked는 사용 신입이 있을 때', () => {
    expect(isLocked(0)).toBe(false)
    expect(isLocked(1)).toBe(true)
  })
  it('제목·안내문만 다르면 false', () => {
    expect(lockedFieldsChanged(before, { ...input, title: '새 제목', description: '새 안내' })).toBe(false)
  })
  it('체크리스트 항목 하나가 다르면 true', () => {
    const b = { ...before, kind: 'setup', checklist: ['a', 'b'] } as unknown as TaskTemplate
    const same = { ...input, kind: 'setup' as const, checklist: ['a', 'b'] }
    expect(lockedFieldsChanged(b, same)).toBe(false)
    expect(lockedFieldsChanged(b, { ...same, checklist: ['a', 'c'] })).toBe(true)
  })
  it('daysInStage만 다르면 true', () => {
    expect(lockedFieldsChanged(before, { ...input, daysInStage: 3 })).toBe(true)
  })
})
