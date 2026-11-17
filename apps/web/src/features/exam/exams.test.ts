import { vi } from 'vitest'

// supabase 호출을 순서대로 기록하는 가짜 쿼리 빌더
const { calls, results, getSession } = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; args: unknown[] }[],
  results: new Map<string, { data: unknown; error: unknown; status: number }>(),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'trainer' } } } })),
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

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => builder(t), auth: { getSession } } }))

import { DbError } from '@/lib/errors'
import { saveExam } from './exams'

const q = (i: number) => ({ prompt: `문제 ${i}`, model_answer: `답 ${i}`, rubric: `기준 ${i}`, points: 10 })
const base = { title: 'JS 기본기', topic: 'JavaScript 기초', difficulty: 'beginner' as const, status: 'draft' as const }

beforeEach(() => {
  calls.length = 0
  results.clear()
})

describe('saveExam', () => {
  it('기존 시험은 update 후 문항을 지우고 화면 순서대로 position을 매겨 다시 넣는다', async () => {
    results.set('exams.update', { data: { id: 'e1', org_id: 'org-1' }, error: null, status: 200 })
    const id = await saveExam({ id: 'e1', ...base, questions: [q(2), q(1)] })

    expect(id).toBe('e1')
    expect(calls.find((c) => c.table === 'exams' && c.op === 'update')?.args[0]).toEqual(base)
    const ops = calls.filter((c) => c.table === 'exam_questions').map((c) => c.op)
    expect(ops.indexOf('delete')).toBeLessThan(ops.indexOf('insert'))
    expect(calls).toContainEqual({ table: 'exam_questions', op: 'eq', args: ['exam_id', 'e1'] })
    const rows = calls.find((c) => c.table === 'exam_questions' && c.op === 'insert')?.args[0]
    expect(rows).toEqual([
      { org_id: 'org-1', exam_id: 'e1', position: 0, ...q(2) },
      { org_id: 'org-1', exam_id: 'e1', position: 1, ...q(1) },
    ])
  })

  it('새 시험은 내 프로필의 org·팀으로 insert한다', async () => {
    results.set('profiles.select', { data: { org_id: 'org-1', team_id: 'team-ai' }, error: null, status: 200 })
    results.set('exams.insert', { data: { id: 'e-new', org_id: 'org-1' }, error: null, status: 201 })
    const id = await saveExam({ ...base, questions: [q(1)] })

    expect(id).toBe('e-new')
    expect(calls.find((c) => c.table === 'exams' && c.op === 'insert')?.args[0]).toEqual({
      ...base, org_id: 'org-1', team_id: 'team-ai',
    })
  })

  it('문항이 0개면 지우기만 하고 insert하지 않는다', async () => {
    results.set('exams.update', { data: { id: 'e1', org_id: 'org-1' }, error: null, status: 200 })
    await saveExam({ id: 'e1', ...base, questions: [] })
    expect(calls.some((c) => c.table === 'exam_questions' && c.op === 'insert')).toBe(false)
    expect(calls.some((c) => c.table === 'exam_questions' && c.op === 'delete')).toBe(true)
  })

  it('저장 오류는 상태 코드가 담긴 DbError로 던진다', async () => {
    results.set('exams.update', { data: null, error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 })
    await expect(saveExam({ id: 'e1', ...base, questions: [] })).rejects.toBeInstanceOf(DbError)
  })
})
