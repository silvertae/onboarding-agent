import { vi } from 'vitest'

const { calls, results, agentFetch, signOut, storage } = vi.hoisted(() => ({
  agentFetch: vi.fn(),
  calls: [] as { table: string; op: string; args: unknown[] }[],
  results: new Map<string, { data: unknown; error: unknown; status: number }>(),
  signOut: vi.fn(async () => ({})),
  storage: {
    upload: vi.fn(async (..._a: unknown[]): Promise<{ data: unknown; error: unknown }> => ({ data: {}, error: null })),
    remove: vi.fn(async (..._a: unknown[]): Promise<{ data: unknown; error: unknown }> => ({ data: [], error: null })),
  },
}))

function builder(table: string) {
  let op = 'select'
  const b: Record<string, unknown> = {}
  const record = (name: string) => (...args: unknown[]) => {
    if (['insert', 'update', 'delete'].includes(name)) op = name
    calls.push({ table, op: name, args })
    return b
  }
  for (const name of ['select', 'insert', 'update', 'delete', 'eq', 'order']) b[name] = record(name)
  const result = () => results.get(`${table}.${op}`) ?? { data: null, error: null, status: 200 }
  b.single = () => Promise.resolve(result())
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject)
  return b
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: (fn: string, args: unknown) => {
      calls.push({ table: `rpc:${fn}`, op: 'rpc', args: [args] })
      return Promise.resolve(results.get(`rpc:${fn}`) ?? { data: null, error: null, status: 200 })
    },
    storage: {
      from: (bucket: string) => ({
        upload: (...a: unknown[]) => {
          calls.push({ table: `storage:${bucket}`, op: 'upload', args: a })
          return storage.upload(...a)
        },
        remove: (...a: unknown[]) => {
          calls.push({ table: `storage:${bucket}`, op: 'remove', args: a })
          return storage.remove(...a)
        },
      }),
    },
    auth: { signOut },
  },
}))
vi.mock('@/lib/agent', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/agent')>()), agentFetch }))

import type { Profile } from '@/app/AuthProvider'
import { AgentError } from '@/lib/agent'
import { DbError } from '@/lib/errors'
import { canManage, checkDocumentFile, deleteDocument, documentsRefetchInterval, makeKnowledgeDrafts, uploadDocument } from './documents'

const ops: Profile = { id: 'u-ops', org_id: 'org-1', role: 'ops_staff', team_id: null } as Profile
const trainer: Profile = { id: 'u-tr', org_id: 'org-1', role: 'team_trainer', team_id: 'team-ai' } as Profile
const file = (name: string, size = 10) => {
  const f = new File(['x'], name)
  Object.defineProperty(f, 'size', { value: size })
  return f
}
const row = { id: 'ignored', org_id: 'org-1', status: 'processing' }
const order = () => calls.map((c) => `${c.table}.${c.op}`)

beforeEach(() => {
  vi.restoreAllMocks()
  calls.length = 0
  results.clear()
  agentFetch.mockReset()
  agentFetch.mockImplementation(async (path: string, body: unknown) => {
    calls.push({ table: 'agent', op: path, args: [body] })
    return new Response(JSON.stringify({ status: 'ready', clause_count: 3, error: null }))
  })
  storage.upload.mockClear()
  storage.remove.mockClear()
  storage.upload.mockResolvedValue({ data: {}, error: null })
  storage.remove.mockResolvedValue({ data: [], error: null })
  signOut.mockClear()
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
})

describe('checkDocumentFile', () => {
  it('docx, pdf 외 형식은 형식 거절 문구를 준다', () => {
    expect(checkDocumentFile(file('a.jpg'))).toBe("'a.jpg'은 올릴 수 없어요. docx, pdf 파일만 올릴 수 있어요.")
  })
  it('10MB를 넘으면 크기 거절 문구를 준다', () => {
    expect(checkDocumentFile(file('a.pdf', 10485761))).toBe("'a.pdf'이 10MB를 넘어요. 10MB 이하로 줄여서 올려 주세요.")
    expect(checkDocumentFile(file('a.pdf', 10485760))).toBeNull()
  })
  it('대문자 확장자도 통과한다', () => {
    expect(checkDocumentFile(file('A.PDF'))).toBeNull()
    expect(checkDocumentFile(file('A.DOCX'))).toBeNull()
  })
})

describe('uploadDocument', () => {
  it('insert → upload → 색인 순서로 부르고 경로·contentType·행 값을 맞춘다', async () => {
    results.set('policy_documents.insert', { data: { ...row, id: '11111111-1111-4111-8111-111111111111' }, error: null, status: 201 })
    const { document, indexError } = await uploadDocument(ops, '  휴가 규정 ', file('휴가.PDF'))

    expect(indexError).toBeNull()
    expect(document.org_id).toBe('org-1')
    const id = '11111111-1111-4111-8111-111111111111'
    expect(order().filter((o) => !o.endsWith('.select'))).toEqual([
      'policy_documents.insert',
      'storage:policy-docs.upload',
      `agent./documents/${id}/index`,
    ])
    expect(calls.find((c) => c.op === 'insert')?.args[0]).toEqual({
      id, org_id: 'org-1', scope: 'company', team_id: null, title: '휴가 규정',
      file_path: `org-1/${id}.pdf`, file_type: 'pdf', uploaded_by: 'u-ops',
    })
    const up = calls.find((c) => c.op === 'upload')!
    expect(up.args[0]).toBe(`org-1/${id}.pdf`)
    expect(up.args[2]).toEqual({ contentType: 'application/pdf', upsert: false })
  })

  it('교육 담당자는 팀 범위로 넣는다', async () => {
    results.set('policy_documents.insert', { data: row, error: null, status: 201 })
    await uploadDocument(trainer, 't', file('a.docx'))
    expect(calls.find((c) => c.op === 'insert')?.args[0]).toMatchObject({ scope: 'team', team_id: 'team-ai', file_type: 'docx' })
  })

  it('업로드가 실패하면 넣은 행을 지우고 던진다', async () => {
    results.set('policy_documents.insert', { data: row, error: null, status: 201 })
    storage.upload.mockResolvedValue({ data: null, error: { message: 'too big' } })
    await expect(uploadDocument(ops, 't', file('a.pdf'))).rejects.toThrow('too big')

    const o = order()
    expect(o.indexOf('policy_documents.delete')).toBeGreaterThan(o.indexOf('storage:policy-docs.upload'))
    expect(calls).toContainEqual({ table: 'policy_documents', op: 'eq', args: ['id', '11111111-1111-4111-8111-111111111111'] })
    expect(agentFetch).not.toHaveBeenCalled()
  })

  it('업로드 오류가 인증 오류면 로그아웃한 뒤 던진다', async () => {
    results.set('policy_documents.insert', { data: row, error: null, status: 201 })
    storage.upload.mockResolvedValue({ data: null, error: { message: 'jwt expired', statusCode: '401' } })
    await expect(uploadDocument(ops, 't', file('a.pdf'))).rejects.toBeInstanceOf(DbError)
    expect(signOut).toHaveBeenCalled()
  })

  it('정리 delete가 거절돼도 업로드 오류를 던진다', async () => {
    results.set('policy_documents.insert', { data: row, error: null, status: 201 })
    storage.upload.mockResolvedValue({ data: null, error: { message: 'too big' } })
    const original = results.get.bind(results)
    vi.spyOn(results, 'get').mockImplementation((k) => {
      if (k === 'policy_documents.delete') throw new Error('network')
      return original(k)
    })
    await expect(uploadDocument(ops, 't', file('a.pdf'))).rejects.toThrow('too big')
  })

  it('insert가 실패하면 업로드하지 않고 던진다', async () => {
    results.set('policy_documents.insert', { data: null, error: { message: 'denied', code: '42501' }, status: 403 })
    await expect(uploadDocument(ops, 't', file('a.pdf'))).rejects.toBeInstanceOf(DbError)
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('insert가 인증 오류면 로그아웃한 뒤 던진다', async () => {
    results.set('policy_documents.insert', { data: null, error: { message: 'jwt', code: 'PGRST301' }, status: 401 })
    await expect(uploadDocument(ops, 't', file('a.pdf'))).rejects.toBeInstanceOf(DbError)
    expect(signOut).toHaveBeenCalled()
  })

  it('색인 호출이 실패하면 문서를 돌려주고 indexError에 문구를 담는다', async () => {
    results.set('policy_documents.insert', { data: row, error: null, status: 201 })
    agentFetch.mockRejectedValue(new AgentError(502, 'AI 응답을 처리하지 못했어요. 다시 시도해 주세요.'))
    const { document, indexError } = await uploadDocument(ops, 't', file('a.pdf'))
    expect(document).toEqual(row)
    expect(indexError).toBe('AI 응답을 처리하지 못했어요. 다시 시도해 주세요.')
    expect(order()).not.toContain('policy_documents.delete')
  })

  it('색인이 429면 내일 다시 이용하라는 문구를 붙인다', async () => {
    results.set('policy_documents.insert', { data: row, error: null, status: 201 })
    agentFetch.mockRejectedValue(new AgentError(429, '오늘 사용 한도를 넘었어요'))
    const { indexError } = await uploadDocument(ops, 't', file('a.pdf'))
    expect(indexError).toBe('오늘 사용 한도를 넘었어요. 내일 다시 이용해 주세요.')
  })
})

describe('deleteDocument', () => {
  it('storage remove 다음에 행을 지운다', async () => {
    await deleteDocument({ id: 'd1', file_path: 'org-1/d1.pdf' })
    expect(order()).toEqual(['storage:policy-docs.remove', 'policy_documents.delete', 'policy_documents.eq'])
    expect(calls[0].args[0]).toEqual(['org-1/d1.pdf'])
    expect(calls[2].args).toEqual(['id', 'd1'])
  })

  it('remove가 인증 오류면 로그아웃하고 행을 지우지 않고 던진다', async () => {
    storage.remove.mockResolvedValue({ data: null, error: { message: 'Invalid JWT', status: 400 } })
    await expect(deleteDocument({ id: 'd1', file_path: 'p' })).rejects.toBeInstanceOf(DbError)
    expect(signOut).toHaveBeenCalled()
    expect(order()).not.toContain('policy_documents.delete')
  })

  it('remove가 실패하면 행을 지우지 않고 던진다', async () => {
    storage.remove.mockResolvedValue({ data: null, error: { message: 'nope' } })
    await expect(deleteDocument({ id: 'd1', file_path: 'org-1/d1.pdf' })).rejects.toThrow('nope')
    expect(order()).not.toContain('policy_documents.delete')
  })
})

describe('makeKnowledgeDrafts', () => {
  it('응답의 drafts를 그대로 save_knowledge_drafts에 넘기고 저장한 개수를 돌려준다', async () => {
    const drafts = [{ question: 'q', answer: 'a', category: 'c', clause_ids: ['c1'] }]
    agentFetch.mockImplementation(async (path: string, body: unknown) => {
      calls.push({ table: 'agent', op: path, args: [body] })
      return new Response(JSON.stringify({ drafts }))
    })
    results.set('rpc:save_knowledge_drafts', { data: 1, error: null, status: 200 })

    await expect(makeKnowledgeDrafts('d1')).resolves.toBe(1)
    expect(calls[0]).toEqual({ table: 'agent', op: '/knowledge/draft-from-document', args: [{ document_id: 'd1', count: 5 }] })
    expect(calls[1]).toEqual({ table: 'rpc:save_knowledge_drafts', op: 'rpc', args: [{ p_items: drafts }] })
  })

  it.each([{}, { drafts: [] }, { drafts: 'x' }])('drafts가 없거나 비면 저장하지 않고 던진다 %j', async (body) => {
    agentFetch.mockResolvedValue(new Response(JSON.stringify(body)))
    await expect(makeKnowledgeDrafts('d1')).rejects.toThrow('초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(calls.some((c) => c.table.startsWith('rpc:'))).toBe(false)
  })

  it('drafts는 최대 10개까지만 저장한다', async () => {
    const drafts = Array.from({ length: 12 }, (_, i) => ({ question: `q${i}`, answer: 'a', category: 'c', clause_ids: ['c1'] }))
    agentFetch.mockResolvedValue(new Response(JSON.stringify({ drafts })))
    results.set('rpc:save_knowledge_drafts', { data: 10, error: null, status: 200 })
    await makeKnowledgeDrafts('d1')
    expect((calls.find((c) => c.table.startsWith('rpc:'))!.args[0] as { p_items: unknown[] }).p_items).toHaveLength(10)
  })

  it('에이전트가 429면 AgentError를 던지고 저장하지 않는다', async () => {
    agentFetch.mockRejectedValue(new AgentError(429, '오늘 사용 한도를 넘었어요'))
    await expect(makeKnowledgeDrafts('d1', 3)).rejects.toBeInstanceOf(AgentError)
    expect(calls.some((c) => c.table.startsWith('rpc:'))).toBe(false)
  })
})

describe('canManage', () => {
  const doc = (scope: 'company' | 'team', team_id: string | null, org_id = 'org-1') => ({ scope, team_id, org_id })
  it('ops_staff는 같은 조직의 company 문서만 true다', () => {
    expect(canManage(ops, doc('company', null))).toBe(true)
    expect(canManage(ops, doc('team', 'team-ai'))).toBe(false)
  })
  it('team_trainer는 같은 팀의 team 문서만 true다', () => {
    expect(canManage(trainer, doc('team', 'team-ai'))).toBe(true)
    expect(canManage(trainer, doc('team', 'team-x'))).toBe(false)
    expect(canManage(trainer, doc('company', null))).toBe(false)
  })
  it('다른 조직이면 false다', () => {
    expect(canManage(ops, doc('company', null, 'org-2'))).toBe(false)
    expect(canManage(null, doc('company', null))).toBe(false)
  })
})

describe('documentsRefetchInterval', () => {
  const d = (status: string) => ({ status }) as never
  it('처리 중인 문서가 있으면 5초마다 다시 불러온다', () => {
    expect(documentsRefetchInterval([d('ready'), d('processing')])).toBe(5000)
  })
  it('처리 중인 문서가 없거나 목록이 없으면 다시 불러오지 않는다', () => {
    expect(documentsRefetchInterval([d('ready'), d('failed')])).toBe(false)
    expect(documentsRefetchInterval([])).toBe(false)
    expect(documentsRefetchInterval(undefined)).toBe(false)
  })
})
