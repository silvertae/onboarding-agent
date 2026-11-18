import { vi } from 'vitest'
import type { BankItem } from './bank'

type Op = [method: string, ...args: unknown[]]
type Result = { data: unknown; error: unknown; status: number }

const { db } = vi.hoisted(() => ({
  db: {
    items: [] as BankItem[],
    topics: [] as { topic: string; topic_key: string }[],
    listError: null as null | { message: string; code?: string },
    writeError: null as null | { message: string; code?: string },
    // 있으면 목록 조회(select *)가 이 약속이 풀릴 때까지 기다린다
    holdList: null as Promise<void> | null,
    // 표마다 한 번의 await에 쓴 빌더 메서드 목록
    queries: [] as { table: string; ops: Op[] }[],
  },
}))

// supabase 쿼리 빌더 흉내: 부른 메서드를 남기고, await하면 메서드에 맞는 결과를 준다(목록은 eq 조건으로 거른다)
vi.mock('@/lib/supabase', () => {
  function respond(table: string, ops: Op[]): Result {
    const has = (m: string) => ops.some((o) => o[0] === m)
    if (table === 'profiles') return { data: { org_id: 'org-1', team_id: 'team-ai' }, error: null, status: 200 }
    if (has('update') || has('insert')) {
      return db.writeError ? { data: null, error: db.writeError, status: 409 } : { data: { id: 'new-1' }, error: null, status: 200 }
    }
    if (ops.some((o) => o[0] === 'select' && o[1] === 'topic, topic_key')) return { data: db.topics, error: null, status: 200 }
    if (db.listError) return { data: null, error: db.listError, status: 500 }
    const rows = db.items.filter((item) =>
      ops.every((o) => o[0] !== 'eq' || (item as unknown as Record<string, unknown>)[o[1] as string] === o[2]),
    )
    return { data: rows, error: null, status: 200 }
  }
  const builder = (table: string) => {
    const ops: Op[] = []
    const b: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'order', 'update', 'insert', 'single']) {
      b[method] = (...args: unknown[]) => {
        ops.push([method, ...args])
        return b
      }
    }
    b.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => {
      db.queries.push({ table, ops })
      const isList = ops.some((o) => o[0] === 'select' && o[1] === '*') && !ops.some((o) => o[0] === 'update' || o[0] === 'insert')
      const wait = isList && db.holdList ? db.holdList : Promise.resolve()
      return wait.then(() => respond(table, ops)).then(resolve, reject)
    }
    return b
  }
  return {
    supabase: {
      from: (table: string) => builder(table),
      auth: { getSession: async () => ({ data: { session: { user: { id: 'trainer' } } } }) },
    },
  }
})
vi.mock('@/app/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'trainer' } } }) }))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BankPage } from './BankPage'

const bankItem = (over: Partial<BankItem>): BankItem => ({
  id: 'b1', org_id: 'org-1', team_id: 'team-ai', topic: 'JavaScript 기초', topic_key: 'javascript 기초', difficulty: 'beginner',
  prompt: 'let과 const의 차이를 쓰시오.', prompt_key: 'k1', model_answer: 'const는 다시 대입할 수 없다', rubric: '차이 10점',
  points: 10, status: 'active', source: 'seed', created_by: null, created_at: '2026-11-18T00:00:00Z', updated_at: '2026-11-18T00:00:00Z',
  ...over,
})

const ITEMS = [
  bankItem({}),
  bankItem({
    id: 'b2', topic: 'JavaScript 비동기', topic_key: 'javascript 비동기', prompt: '출력 순서를 쓰시오.\nconsole.log(1)',
    points: 20, source: 'exam', difficulty: 'intermediate',
  }),
  bankItem({ id: 'b3', prompt: 'null과 undefined의 차이를 쓰시오.', status: 'hidden', source: 'manual' }),
]

beforeEach(() => {
  db.items = ITEMS.map((i) => ({ ...i }))
  db.topics = [
    { topic: ' JavaScript 기초', topic_key: 'javascript 기초' },
    { topic: 'JavaScript 비동기', topic_key: 'javascript 비동기' },
  ]
  db.listError = null
  db.writeError = null
  db.holdList = null
  db.queries = []
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BankPage />
    </QueryClientProvider>,
  )
}

const listQueries = () =>
  db.queries.filter((q) => q.table === 'question_bank_items' && q.ops.some((o) => o[0] === 'select' && o[1] === '*'))
const writes = (method: 'update' | 'insert') =>
  db.queries.filter((q) => q.table === 'question_bank_items' && q.ops.some((o) => o[0] === method)).map((q) => q.ops)

const rowOf = (text: RegExp) => screen.getByRole('button', { name: text }).closest('tr') as HTMLElement

async function expand(text: RegExp) {
  await userEvent.click(await screen.findByRole('button', { name: text }))
}

describe('BankPage', () => {
  it('머리말과 게시 문항의 문제·주제·난이도·배점·출처를 보여 준다', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: '문제은행' })).toBeInTheDocument()
    expect(screen.getByText('우리 팀 시험 문항을 모아 둔 곳이에요. 시험을 만들 때 여기서 먼저 채워요.')).toBeInTheDocument()
    await screen.findByRole('button', { name: /let과 const/ })
    const row = rowOf(/출력 순서/)
    expect(within(row).getAllByText('JavaScript 비동기').length).toBeGreaterThan(0)
    expect(within(row).getAllByText(/중급/).length).toBeGreaterThan(0)
    expect(within(row).getAllByText(/20점/).length).toBeGreaterThan(0)
    expect(within(row).getByText('시험')).toBeInTheDocument()
    expect(within(rowOf(/let과 const/)).getByText('기본')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /null과 undefined/ })).not.toBeInTheDocument()
  })

  it('숨김 보기에서는 숨긴 문항만 보인다', async () => {
    renderPage()
    await screen.findByRole('button', { name: /let과 const/ })
    await userEvent.click(screen.getByRole('radio', { name: '숨김' }))
    expect(await screen.findByRole('button', { name: /null과 undefined/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /let과 const/ })).not.toBeInTheDocument()
    expect(within(rowOf(/null과 undefined/)).getByText('직접 추가')).toBeInTheDocument()
  })

  it('주제 필터는 topic_key로 조회한다(앞뒤 공백·대소문자 무시)', async () => {
    renderPage()
    const select = screen.getByRole('combobox', { name: '주제 필터' })
    await within(select).findByRole('option', { name: 'JavaScript 기초' })
    await userEvent.selectOptions(select, 'JavaScript 기초')
    await waitFor(() =>
      expect(listQueries().some((q) => q.ops.some((o) => o[0] === 'eq' && o[1] === 'topic_key' && o[2] === 'javascript 기초'))).toBe(true),
    )
    expect(await screen.findByRole('button', { name: /let과 const/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /출력 순서/ })).not.toBeInTheDocument()
  })

  it('난이도 칩으로 거른다', async () => {
    renderPage()
    await screen.findByRole('button', { name: /let과 const/ })
    await userEvent.click(screen.getByRole('button', { name: '중급' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /let과 const/ })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /출력 순서/ })).toBeInTheDocument()
    expect(listQueries().some((q) => q.ops.some((o) => o[0] === 'eq' && o[1] === 'difficulty' && o[2] === 'intermediate'))).toBe(true)
  })

  it('행을 펼치면 편집 칸이 열리고, 한 번에 한 행만 펼친다', async () => {
    renderPage()
    await expand(/let과 const/)
    expect(screen.getByRole('button', { name: /let과 const/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('textbox', { name: '문제' })).toHaveValue('let과 const의 차이를 쓰시오.')
    expect(screen.getByRole('combobox', { name: '난이도' })).toHaveValue('beginner')
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 만들기' })).not.toBeInTheDocument()

    await expand(/출력 순서/)
    expect(screen.getByRole('button', { name: /let과 const/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('textbox', { name: '문제' })).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: '문제' })).toHaveValue('출력 순서를 쓰시오.\nconsole.log(1)')
  })

  it('고친 내용을 저장하면 그 문항을 고치고 "저장했어요"를 보인다', async () => {
    renderPage()
    await expand(/let과 const/)
    const prompt = screen.getByRole('textbox', { name: '문제' })
    await userEvent.clear(prompt)
    await userEvent.type(prompt, '고친 문제')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '난이도' }), 'intermediate')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('저장했어요')).toBeInTheDocument()
    const [ops] = writes('update')
    expect(ops).toContainEqual([
      'update',
      {
        prompt: '고친 문제', model_answer: 'const는 다시 대입할 수 없다', rubric: '차이 10점', points: 10,
        topic: 'JavaScript 기초', difficulty: 'intermediate',
      },
    ])
    expect(ops).toContainEqual(['eq', 'id', 'b1'])
  })

  it('고친 문항이 지금 필터에서 빠지면 행을 닫고 "저장했어요"를 표 위에 보인다', async () => {
    renderPage()
    const select = screen.getByRole('combobox', { name: '주제 필터' })
    await within(select).findByRole('option', { name: 'JavaScript 기초' })
    await userEvent.selectOptions(select, 'JavaScript 기초')
    await expand(/let과 const/)
    const topic = screen.getByRole('combobox', { name: '주제' })
    await userEvent.clear(topic)
    await userEvent.type(topic, 'JavaScript 비동기')
    // 저장하면 DB에서 주제가 바뀐다(목록 조회가 topic_key로 거른다)
    db.items = db.items.map((i) => (i.id === 'b1' ? { ...i, topic: 'JavaScript 비동기', topic_key: 'javascript 비동기' } : i))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /let과 const/ })).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('저장했어요')
    expect(screen.queryByRole('textbox', { name: '문제' })).not.toBeInTheDocument()
    expect(writes('update')[0]).toContainEqual(['eq', 'id', 'b1'])
  })

  it('저장 뒤 목록을 다시 읽는 동안에는 편집 칸과 문항 추가를 막고, 다 읽은 뒤에 결과를 보인다', async () => {
    renderPage()
    await expand(/let과 const/)
    await userEvent.type(screen.getByRole('textbox', { name: '채점 기준' }), ' 추가')
    let release = () => {}
    db.holdList = new Promise<void>((r) => (release = r))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(writes('update')).toHaveLength(1))
    // 저장 요청은 끝났지만 목록 조회는 아직이다
    await waitFor(() => expect(listQueries().length).toBeGreaterThan(1))
    expect(screen.getByRole('textbox', { name: '채점 기준' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '문제' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '문항 추가' })).toBeDisabled()
    expect(screen.queryByText('저장했어요')).not.toBeInTheDocument()

    release()
    expect(await screen.findByText('저장했어요')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '채점 기준' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '문항 추가' })).toBeEnabled()
  })

  it('저장이 실패하면 행 안에 실패 문구를 보인다', async () => {
    db.writeError = { message: 'boom', code: 'XX000' }
    renderPage()
    await expand(/let과 const/)
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
  })

  it('숨기면 status를 hidden으로 바꾸고 표 위에 숨김 문구를 보인다', async () => {
    renderPage()
    await expand(/let과 const/)
    db.items = db.items.map((i) => (i.id === 'b1' ? { ...i, status: 'hidden' } : i))
    await userEvent.click(screen.getByRole('button', { name: '숨기기' }))
    expect(await screen.findByText('숨겼어요. 시험 채우기에 더 나오지 않아요.')).toBeInTheDocument()
    const [ops] = writes('update')
    expect(ops).toContainEqual(['update', { status: 'hidden' }])
    expect(ops).toContainEqual(['eq', 'id', 'b1'])
    await waitFor(() => expect(screen.queryByRole('button', { name: /let과 const/ })).not.toBeInTheDocument())
  })

  it('숨김 보기에서 다시 게시하면 status를 active로 바꾼다', async () => {
    renderPage()
    await screen.findByRole('button', { name: /let과 const/ })
    await userEvent.click(screen.getByRole('radio', { name: '숨김' }))
    await expand(/null과 undefined/)
    await userEvent.click(screen.getByRole('button', { name: '다시 게시' }))
    expect(await screen.findByText('다시 게시했어요')).toBeInTheDocument()
    expect(writes('update')[0]).toContainEqual(['update', { status: 'active' }])
  })

  it('문항 추가: 고른 주제를 미리 채운 빈 편집 행을 열고 직접 추가 문항으로 저장한다', async () => {
    renderPage()
    const select = screen.getByRole('combobox', { name: '주제 필터' })
    await within(select).findByRole('option', { name: 'JavaScript 기초' })
    await userEvent.selectOptions(select, 'JavaScript 기초')
    await userEvent.click(screen.getByRole('button', { name: '문항 추가' }))
    expect(screen.getByRole('combobox', { name: '주제' })).toHaveValue('JavaScript 기초')
    expect(screen.getByRole('textbox', { name: '문제' })).toHaveValue('')
    const save = screen.getByRole('button', { name: '저장' })
    expect(save).toBeDisabled()

    await userEvent.type(screen.getByRole('textbox', { name: '문제' }), '새 문제')
    await userEvent.type(screen.getByRole('textbox', { name: '모범 답안' }), '새 답')
    await userEvent.type(screen.getByRole('textbox', { name: '채점 기준' }), '새 기준')
    await userEvent.type(screen.getByRole('spinbutton', { name: '배점' }), '10')
    await userEvent.click(save)
    await waitFor(() => expect(writes('insert')).toHaveLength(1))
    expect(writes('insert')[0]).toContainEqual([
      'insert',
      {
        org_id: 'org-1', team_id: 'team-ai', topic: 'JavaScript 기초', difficulty: 'beginner',
        prompt: '새 문제', model_answer: '새 답', rubric: '새 기준', points: 10, source: 'manual',
      },
    ])
  })

  it('같은 문제를 추가하면 같은 문제 문구를 행 안에 보인다', async () => {
    db.writeError = { message: 'duplicate key value violates unique constraint', code: '23505' }
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '문항 추가' }))
    await userEvent.type(screen.getByRole('combobox', { name: '주제' }), 'JavaScript 기초')
    await userEvent.type(screen.getByRole('textbox', { name: '문제' }), 'let과 const의 차이를 쓰시오.')
    await userEvent.type(screen.getByRole('textbox', { name: '모범 답안' }), '답')
    await userEvent.type(screen.getByRole('textbox', { name: '채점 기준' }), '기준')
    await userEvent.type(screen.getByRole('spinbutton', { name: '배점' }), '10')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('같은 문제가 이미 문제은행에 있어요.')
  })

  it('문항 추가를 취소하면 빈 편집 행을 닫는다', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '문항 추가' }))
    expect(screen.getByRole('textbox', { name: '문제' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('textbox', { name: '문제' })).not.toBeInTheDocument()
  })

  it('문항이 없으면 비어 있음 문구를 보인다', async () => {
    db.items = []
    renderPage()
    expect(await screen.findByText('아직 문항이 없어요. 시험을 확정하면 문항이 여기에 쌓여요.')).toBeInTheDocument()
  })

  it('불러오지 못하면 오류 문구와 다시 불러오기 버튼을 보인다', async () => {
    db.listError = { message: 'boom', code: 'XX000' }
    renderPage()
    expect(await screen.findByText('문제은행을 불러오지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /다시 불러오기/ })).toBeInTheDocument()
  })
})
