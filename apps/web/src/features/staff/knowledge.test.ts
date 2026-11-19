import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

const { rpc, agentFetch, selectResult, inFn } = vi.hoisted(() => ({
  inFn: vi.fn(),
  rpc: vi.fn(),
  agentFetch: vi.fn(),
  selectResult: { value: { data: [] as unknown, error: null as unknown, status: 200 } },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    auth: { signOut: vi.fn(async () => ({})) },
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.update = () => b
      b.insert = () => b
      b.eq = () => b
      b.in = inFn.mockImplementation(() => b)
      b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(selectResult.value).then(resolve, reject)
      return b
    },
  },
}))
vi.mock('@/lib/agent', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/agent')>()), agentFetch }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ profile: { id: 'trainer', org_id: 'org-1', role: 'team_trainer', team_id: 'team-ai' } }),
}))

import { draftAnswer, useKnowledgeActions, useKnowledgeSources, useKnowledgeSourcesFor } from './knowledge'

const VALUES = { question: ' 야근 식대는? ', answer: ' 1만 2천 원이에요. ', category: ' 복지 ' }

beforeEach(() => {
  rpc.mockReset()
  agentFetch.mockReset()
  rpc.mockResolvedValue({ data: null, error: null, status: 200 })
})

describe('draftAnswer', () => {
  it('/knowledge/draft-answer에 {question}을 보내고 초안을 돌려준다', async () => {
    const clauses = [{ id: 'c1', document_title: '복리후생 규정(가상)', label: '제14조', heading: '야근 식대' }]
    agentFetch.mockResolvedValue(new Response(JSON.stringify({ found: true, draft: { question: 'q', answer: '답', category: '복지', clauses } })))

    await expect(draftAnswer('야근 식대는?')).resolves.toEqual({ answer: '답', category: '복지', clauses })
    expect(agentFetch).toHaveBeenCalledWith('/knowledge/draft-answer', { question: '야근 식대는?' })
  })

  it('found:false면 null이다', async () => {
    agentFetch.mockResolvedValue(new Response(JSON.stringify({ found: false })))
    await expect(draftAnswer('모르는 질문')).resolves.toBeNull()
  })
})

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
  return { Wrapper, spy }
}

describe('useKnowledgeActions().resolve', () => {
  it('source가 없으면 resolve_unanswered를 부른다', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useKnowledgeActions(), { wrapper: Wrapper })

    await result.current.resolve('u1', VALUES)

    expect(rpc).toHaveBeenCalledWith('resolve_unanswered', { p_id: 'u1', p_question: '야근 식대는?', p_answer: '1만 2천 원이에요.', p_category: '복지' })
  })

  it('source가 있으면 resolve_unanswered_with_sources를 부르고 목록을 다시 불러온다', async () => {
    const { Wrapper, spy } = wrapper()
    const { result } = renderHook(() => useKnowledgeActions(), { wrapper: Wrapper })

    await result.current.resolve('u1', VALUES, { clauseIds: ['c1', 'c2'], origin: 'ai_draft' })

    expect(rpc).toHaveBeenCalledWith('resolve_unanswered_with_sources', {
      p_id: 'u1',
      p_question: '야근 식대는?',
      p_answer: '1만 2천 원이에요.',
      p_category: '복지',
      p_clause_ids: ['c1', 'c2'],
      p_origin: 'ai_draft',
    })
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])
    expect(keys).toEqual(expect.arrayContaining(['knowledge', 'unanswered', 'knowledge-sources']))
  })
})

describe('useKnowledgeActions: 저장 뒤 임베딩 채우기', () => {
  beforeEach(() => {
    selectResult.value = { data: [], error: null, status: 200 }
  })

  it('지식을 추가·수정하면 /knowledge/index를 부른다', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useKnowledgeActions(), { wrapper: Wrapper })

    await result.current.save({ ...VALUES, status: 'published' })
    await result.current.save({ id: 'k1', ...VALUES, status: 'published' })

    expect(agentFetch).toHaveBeenCalledTimes(2)
    expect(agentFetch).toHaveBeenCalledWith('/knowledge/index', {})
  })

  it('게시·게시 취소와 미답변 해결 뒤에도 부른다', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useKnowledgeActions(), { wrapper: Wrapper })

    await result.current.setStatus('k1', 'published')
    await result.current.resolve('u1', VALUES)

    expect(agentFetch.mock.calls).toEqual([
      ['/knowledge/index', {}],
      ['/knowledge/index', {}],
    ])
  })

  it('임베딩 호출이 실패해도 저장은 성공으로 끝난다', async () => {
    agentFetch.mockRejectedValue(new Error('에이전트 연결 실패'))
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useKnowledgeActions(), { wrapper: Wrapper })

    await expect(result.current.save({ ...VALUES, status: 'published' })).resolves.toBeUndefined()
    expect(agentFetch).toHaveBeenCalledWith('/knowledge/index', {})
  })

  it('저장이 실패하면 부르지 않는다', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: '권한 없음', code: '42501' }, status: 403 })
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useKnowledgeActions(), { wrapper: Wrapper })

    await expect(result.current.resolve('u1', VALUES)).rejects.toThrow()
    expect(agentFetch).not.toHaveBeenCalled()
  })
})

describe('useKnowledgeSources', () => {
  it('조항 정보를 DraftClause로 바꾸고 null label·heading은 빈 문자열로 둔다', async () => {
    selectResult.value = {
      data: [
        { clause_id: 'c1', document_clauses: { id: 'c1', label: '제14조', heading: '야근 식대', policy_documents: { title: '복리후생 규정(가상)' } } },
        { clause_id: 'c2', document_clauses: { id: 'c2', label: null, heading: null, policy_documents: { title: '근태 규정(가상)' } } },
      ],
      error: null,
      status: 200,
    }
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useKnowledgeSources('k1'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([
      { id: 'c1', document_title: '복리후생 규정(가상)', label: '제14조', heading: '야근 식대' },
      { id: 'c2', document_title: '근태 규정(가상)', label: '', heading: '' },
    ])
  })

  it('knowledgeId가 없으면 불러오지 않는다', () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useKnowledgeSources(null), { wrapper: Wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useKnowledgeSourcesFor', () => {
  it('한 번의 in 조회로 지식 id별로 묶는다', async () => {
    selectResult.value = {
      data: [
        { knowledge_id: 'k1', clause_id: 'c1', document_clauses: { id: 'c1', label: '제14조', heading: 'h', policy_documents: { title: 'T' } } },
        { knowledge_id: 'k2', clause_id: 'c2', document_clauses: { id: 'c2', label: null, heading: '제목', policy_documents: { title: 'T' } } },
        { knowledge_id: 'k1', clause_id: 'c3', document_clauses: { id: 'c3', label: '제8조', heading: 'h', policy_documents: { title: 'T' } } },
      ],
      error: null,
      status: 200,
    }
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useKnowledgeSourcesFor(['k2', 'k1']), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(inFn).toHaveBeenCalledTimes(1)
    expect(inFn).toHaveBeenCalledWith('knowledge_id', ['k1', 'k2'])
    expect(result.current.data?.k1.map((c) => c.id)).toEqual(['c1', 'c3'])
    expect(result.current.data?.k2.map((c) => c.id)).toEqual(['c2'])
  })

  it('id가 없으면 불러오지 않는다', () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useKnowledgeSourcesFor([]), { wrapper: Wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})
