import { vi } from 'vitest'

const { rpc, topicRows } = vi.hoisted(() => ({
  rpc: vi.fn(async (_name: string, _args?: unknown) => ({ data: null as unknown, error: null as unknown, status: 200 })),
  topicRows: { data: [] as { topic: string; topic_key: string | null }[] },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    from: () => ({ select: () => ({ eq: async () => ({ data: topicRows.data, error: null, status: 200 }) }) }),
  },
}))
vi.mock('@/app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'trainer' } } }) }))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { DbError } from '@/lib/errors'
import {
  AVOID_MAX_ITEMS, bankPrompts, buildAvoidPrompts, pickBankItems, registerExamToBank, toDraft, useBankTopics, type BankItem,
} from './bank'

const item: BankItem = {
  id: 'b1', org_id: 'org-1', team_id: 'team-ai', topic: 'JS', topic_key: 'js', difficulty: 'beginner',
  prompt: '은행 문제', prompt_key: '은행 문제', model_answer: '답', rubric: '기준', points: 20,
  status: 'active', source: 'seed', created_by: null, created_at: '2026-11-18T00:00:00Z', updated_at: '2026-11-18T00:00:00Z',
}

beforeEach(() => rpc.mockReset())

describe('pickBankItems', () => {
  it('pick_bank_items RPC를 조건 그대로 부른다', async () => {
    rpc.mockResolvedValueOnce({ data: [item], error: null, status: 200 })
    const items = await pickBankItems({
      topic: 'JS', difficulty: 'beginner', count: 2, exclude: ['b1'], excludePrompts: ['직접 쓴 문제'], newHireId: 'h1',
    })
    expect(items).toEqual([item])
    expect(rpc).toHaveBeenCalledWith('pick_bank_items', {
      p_topic: 'JS', p_difficulty: 'beginner', p_count: 2, p_exclude: ['b1'], p_exclude_prompts: ['직접 쓴 문제'], p_new_hire: 'h1',
    })
  })

  it('newHireId가 없으면 p_new_hire는 null이다', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null, status: 200 })
    await pickBankItems({ topic: 'JS', difficulty: 'beginner', count: 1, exclude: [], excludePrompts: [] })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_new_hire: null })
  })

  it('RPC 오류는 DbError로 던진다', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 })
    await expect(pickBankItems({ topic: 'JS', difficulty: 'beginner', count: 1, exclude: [], excludePrompts: [] })).rejects.toBeInstanceOf(DbError)
  })
})

describe('bankPrompts', () => {
  it('bank_prompts RPC를 30개 한도로 부른다', async () => {
    rpc.mockResolvedValueOnce({ data: ['a', 'b'], error: null, status: 200 })
    expect(await bankPrompts('JS', 'intermediate')).toEqual(['a', 'b'])
    expect(rpc).toHaveBeenCalledWith('bank_prompts', { p_topic: 'JS', p_difficulty: 'intermediate', p_limit: 30 })
  })
})

describe('registerExamToBank', () => {
  it('새로 넣은 은행 문항 수를 돌려준다', async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null, status: 200 })
    expect(await registerExamToBank('e1')).toBe(2)
    expect(rpc).toHaveBeenCalledWith('register_exam_to_bank', { p_exam: 'e1' })
  })

  it('RPC 오류는 DbError로 던진다', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' }, status: 400 })
    await expect(registerExamToBank('e1')).rejects.toBeInstanceOf(DbError)
  })
})

describe('toDraft', () => {
  it('은행 문항을 편집기 문항으로 바꾸고 출처 id를 남긴다', () => {
    expect(toDraft(item)).toEqual({ prompt: '은행 문제', model_answer: '답', rubric: '기준', points: 20, bank_item_id: 'b1' })
  })
})

describe('buildAvoidPrompts', () => {
  it('은행이 30개여도 편집기 문장을 먼저 넣고 30개에서 자른다', () => {
    const bank = Array.from({ length: 30 }, (_, i) => `은행 ${i}`)
    const out = buildAvoidPrompts(['편집 1', '편집 2'], bank)
    expect(out).toHaveLength(AVOID_MAX_ITEMS)
    expect(out.slice(0, 2)).toEqual(['편집 1', '편집 2'])
    expect(out[2]).toBe('은행 0')
  })

  it('공백만 다른 같은 문장은 한 번만, 빈 문장은 뺀다', () => {
    expect(buildAvoidPrompts(['  같은   문장 ', '', '   '], ['같은 문장', '같은\n문장', '다른 문장'])).toEqual(['같은 문장', '다른 문장'])
  })
})

describe('useBankTopics', () => {
  it('topic_key로 중복을 지우고 앞뒤 공백 없는 주제를 가나다순으로 돌려준다', async () => {
    topicRows.data = [
      { topic: ' 자료구조', topic_key: '자료구조' },
      { topic: ' JavaScript 기초', topic_key: 'javascript 기초' },
      { topic: 'javascript 기초', topic_key: 'javascript 기초' },
      { topic: '배열', topic_key: '배열' },
    ]
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
    const { result } = renderHook(() => useBankTopics(), { wrapper })
    // 한국어 정렬(localeCompare 'ko'): 한글이 영문보다 앞
    await waitFor(() => expect(result.current.data).toEqual(['배열', '자료구조', 'JavaScript 기초']))
  })
})
