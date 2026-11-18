import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { makeTemplate } from '@/features/staff/testFixtures'
import { DbError } from '@/lib/errors'
import type { TaskFile } from '@/lib/taskFiles'

type Status = 'success' | 'loading' | 'error'

const { state, store, m } = vi.hoisted(() => {
  // 목 데이터가 바뀐 것을 화면에 알린다(실제 훅의 쿼리 무효화 → 다시 그리기 흉내)
  const listeners = new Set<() => void>()
  const store = {
    version: 0,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    changed: () => {
      store.version += 1
      listeners.forEach((listener) => listener())
    },
  }
  return {
    state: { files: [] as TaskFile[], status: 'success' as Status, refetch: vi.fn() },
    store,
    m: { upload: vi.fn(), remove: vi.fn(), download: vi.fn(), signOut: vi.fn() },
  }
})

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: m.signOut } } }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({
    profile: { id: 'u1', full_name: '가상 서준', role: 'team_trainer', team_id: 'team-ai', department: null },
    session: { user: { id: 'u1' } },
    loading: false,
  }),
}))
vi.mock('@/lib/taskFiles', async (importActual) => {
  const { useSyncExternalStore } = await import('react')
  return {
    ...(await importActual<typeof import('@/lib/taskFiles')>()),
    useTemplateFiles: () => {
      useSyncExternalStore(store.subscribe, () => store.version)
      return {
        data: state.status === 'success' ? state.files : undefined,
        isLoading: state.status === 'loading',
        isPending: state.status === 'loading',
        isError: state.status === 'error',
        isFetching: false,
        refetch: state.refetch,
      }
    },
    uploadTaskFile: m.upload,
    deleteTaskFile: m.remove,
    downloadTaskFile: m.download,
  }
})

import { TemplateFilesPanel } from './TemplateFilesPanel'

const TEMPLATE = makeTemplate({ id: 'tpl-ac', org_id: 'org-1', code: 'AC-01', title: '법인카드 신청', department: 'accounting' })

function file(over: Partial<TaskFile>): TaskFile {
  return {
    id: 'f1',
    org_id: 'org-1',
    template_id: 'tpl-ac',
    file_name: '법인카드 신청서.xlsx',
    storage_path: 'org-1/tpl-ac/a.xlsx',
    size_bytes: 48 * 1024,
    uploaded_by: null,
    is_seed: true,
    created_at: '2026-01-05T00:00:00Z',
    ...over,
  }
}

const SEED = file({})
const MINE = file({
  id: 'f2',
  file_name: '카드 신청 안내.pdf',
  storage_path: 'org-1/tpl-ac/b.pdf',
  size_bytes: 156 * 1024,
  uploaded_by: 'u1',
  is_seed: false,
  created_at: new Date().toISOString(),
})
const OTHERS = file({
  id: 'f3',
  file_name: '카드 이용 안내.docx',
  storage_path: 'org-1/tpl-ac/c.docx',
  size_bytes: 32 * 1024,
  uploaded_by: 'u2',
  is_seed: false,
  created_at: '2026-01-06T00:00:00Z',
})

function fileOf(name: string, bytes = 1024): File {
  const f = new File(['x'], name)
  Object.defineProperty(f, 'size', { value: bytes })
  return f
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let queryClient: QueryClient

function renderPanel({ template = TEMPLATE as typeof TEMPLATE | null, archived = false, files = [SEED, MINE], status = 'success' as Status } = {}) {
  state.files = files
  state.status = status
  queryClient = new QueryClient()
  vi.spyOn(queryClient, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TemplateFilesPanel template={template} archived={archived} />
    </QueryClientProvider>,
  )
  const input = () => utils.container.querySelector<HTMLInputElement>('input[type="file"]')!
  return { ...utils, input }
}

const section = () => screen.getByRole('region', { name: '서식' })
const rows = () => within(section()).getAllByRole('listitem')
const pickButton = () => screen.queryByRole('button', { name: '파일 선택' })
const filesInvalidated = () => expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['task-files'] })

// 올린 뒤 목록을 다시 읽으면 그 서식이 들어 있다(실제 쿼리 무효화 흉내)
function addsToList(name: string) {
  return async () => {
    const created = file({ id: `new-${name}`, file_name: name, uploaded_by: 'u1', is_seed: false, created_at: new Date().toISOString() })
    state.files = [...state.files, created]
    store.changed()
    return created
  }
}

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset())
  state.refetch.mockReset()
  m.download.mockResolvedValue(undefined)
})

describe('TemplateFilesPanel 자리별 모양', () => {
  it('저장 전 새 과제: 안내 문구만 있고 목록·업로드 영역이 없다', () => {
    renderPanel({ template: null })
    expect(within(section()).getByRole('heading', { level: 3, name: '서식' })).toBeInTheDocument()
    expect(within(section()).getByText('과제를 저장하면 서식을 올릴 수 있어요.')).toBeInTheDocument()
    expect(screen.queryByText('올린 서식은 이 과제를 받은 신입 모두에게 보여요.')).not.toBeInTheDocument()
    expect(pickButton()).not.toBeInTheDocument()
    expect(within(section()).queryByRole('list')).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('저장된 과제: 안내, 목록, 업로드 영역(파일 선택 · 여러 개 · 형식 3종)과 형식·크기 안내, 가상 서식 경고', () => {
    const { input } = renderPanel()
    expect(within(section()).getByText('올린 서식은 이 과제를 받은 신입 모두에게 보여요.')).toBeInTheDocument()
    expect(rows()).toHaveLength(2)
    expect(pickButton()).toBeEnabled()
    expect(within(section()).getByText('파일을 여기로 끌어다 놓거나')).toBeInTheDocument()
    expect(input()).toHaveAttribute('multiple')
    expect(input()).toHaveAttribute('accept', '.pdf,.docx,.xlsx')
    expect(within(section()).getByText('docx, xlsx, pdf · 파일당 10MB까지')).toBeInTheDocument()
    expect(
      within(section()).getByText('가상 서식만 올려 주세요. 실명·연락처 같은 개인정보나 실제 사내 문서는 올리지 않아요.'),
    ).toBeInTheDocument()
  })

  it('서식이 없으면 빈 안내와 업로드 영역', () => {
    renderPanel({ files: [] })
    expect(
      within(section()).getByText('아직 올린 서식이 없어요. 신입이 작성해야 할 Word·Excel·PDF 양식을 올려 주세요.'),
    ).toBeInTheDocument()
    expect(within(section()).queryByRole('list')).not.toBeInTheDocument()
    expect(pickButton()).toBeInTheDocument()
  })

  it('보관한 과제: 보관 안내와 목록(내려받기·지우기)만, 업로드 영역이 없다', () => {
    const { input } = renderPanel({ archived: true })
    expect(within(section()).getByText('보관한 과제에는 서식을 올릴 수 없어요.')).toBeInTheDocument()
    expect(screen.queryByText('올린 서식은 이 과제를 받은 신입 모두에게 보여요.')).not.toBeInTheDocument()
    expect(pickButton()).not.toBeInTheDocument()
    expect(input()).toBeNull()
    expect(screen.queryByText('파일을 여기로 끌어다 놓거나')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '카드 신청 안내.pdf 내려받기' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '카드 신청 안내.pdf 지우기' })).toBeEnabled()
  })

  it('보관한 과제에 서식이 없으면 빈 안내(올려 주세요)를 보이지 않는다', () => {
    renderPanel({ archived: true, files: [] })
    expect(within(section()).getByText('보관한 과제에는 서식을 올릴 수 없어요.')).toBeInTheDocument()
    expect(screen.queryByText(/아직 올린 서식이 없어요/)).not.toBeInTheDocument()
  })

  it('불러오는 중에는 "불러오는 중…"을 알린다', () => {
    renderPanel({ status: 'loading' })
    expect(within(section()).getByRole('status')).toHaveTextContent('불러오는 중…')
  })

  it('목록을 불러오지 못하면 문구와 다시 불러오기', async () => {
    renderPanel({ status: 'error' })
    expect(within(section()).getByText('서식을 불러오지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument()
    await userEvent.click(within(section()).getByRole('button', { name: '다시 불러오기' }))
    expect(state.refetch).toHaveBeenCalledTimes(1)
  })
})

describe('TemplateFilesPanel 파일 행', () => {
  it('기본 서식: "기본 서식" 배지, 날짜만, 지우기 버튼 없음. 올린 서식: 형식·크기·올린 사람·시각과 지우기', () => {
    renderPanel()
    const [seed, mine] = rows()
    expect(within(seed).getByText('기본 서식')).toBeInTheDocument()
    expect(within(seed).getByText('Excel · 48KB · 1월 5일')).toBeInTheDocument()
    expect(within(seed).getByRole('button', { name: '법인카드 신청서.xlsx 내려받기' })).toHaveAttribute('title', '내려받기')
    expect(within(seed).queryByRole('button', { name: /지우기/ })).not.toBeInTheDocument()

    expect(within(mine).queryByText('기본 서식')).not.toBeInTheDocument()
    const meta = within(mine).getByText(/^PDF · 156KB · 가상 서준 · 오늘 \d{2}:\d{2}$/)
    // 좁은 화면에서 항목 사이(" · ")에서만 줄이 바뀌게 항목 안 띄어쓰기는 붙여 둔다
    expect(meta.textContent).toMatch(/ · 가상 서준 · 오늘 \d{2}:\d{2}$/)
    expect(within(mine).getByRole('button', { name: '카드 신청 안내.pdf 지우기' })).toHaveAttribute('title', '지우기')
  })

  it('다른 담당자가 올린 서식은 이름을 읽을 수 없으므로 형식·크기·날짜만', () => {
    renderPanel({ files: [OTHERS] })
    expect(within(rows()[0]).getByText('Word · 32KB · 1월 6일')).toBeInTheDocument()
  })

  it('파일 이름은 텍스트로만 그린다', () => {
    const { container } = renderPanel({ files: [file({ file_name: '<img src=x>.pdf', is_seed: false })] })
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('<img src=x>')).toBeInTheDocument()
  })

  it('내려받기: downloadTaskFile을 부르고, 실패하면 그 행에 문구', async () => {
    m.download.mockRejectedValueOnce(new Error('x'))
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: '카드 신청 안내.pdf 내려받기' }))
    expect(m.download).toHaveBeenCalledWith(MINE)
    expect(within(rows()[1]).getByRole('alert')).toHaveTextContent('파일을 내려받지 못했어요. 다시 시도해 주세요.')
    expect(within(rows()[0]).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('TemplateFilesPanel 올리기', () => {
  it('파일 2개를 고르면 하나씩 올리고, 올리는 동안 목록 맨 위에 "올리는 중" 행, 끝나면 "2개 올렸어요"', async () => {
    const user = userEvent.setup()
    const first = deferred<TaskFile>()
    const second = deferred<TaskFile>()
    m.upload.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { input } = renderPanel()
    const a = fileOf('위키 체크리스트.xlsx')
    const b = fileOf('개인정보 처리 안내(가상).pdf')
    await user.upload(input(), [a, b])

    expect(m.upload).toHaveBeenCalledTimes(2)
    expect(m.upload).toHaveBeenNthCalledWith(1, TEMPLATE, a)
    expect(m.upload).toHaveBeenNthCalledWith(2, TEMPLATE, b)
    const list = rows()
    expect(list).toHaveLength(4)
    expect(list[0]).toHaveTextContent('위키 체크리스트.xlsx')
    expect(within(list[0]).getByRole('status')).toHaveTextContent('올리는 중')
    expect(list[1]).toHaveTextContent('개인정보 처리 안내(가상).pdf')
    expect(within(list[1]).getByRole('status')).toHaveTextContent('올리는 중')
    expect(list[2]).toHaveTextContent('법인카드 신청서.xlsx')

    first.resolve(await addsToList('위키 체크리스트.xlsx')())
    second.resolve(await addsToList('개인정보 처리 안내(가상).pdf')())

    expect(await screen.findByText('2개 올렸어요')).toBeInTheDocument()
    expect(screen.queryByText('올리는 중')).not.toBeInTheDocument()
    expect(rows().map((r) => r.querySelector('.truncate')?.textContent)).toEqual([
      '법인카드 신청서',
      '카드 신청 안내',
      '위키 체크리스트',
      '개인정보 처리 안내(가상)',
    ])
    filesInvalidated()
  })

  it('형식이 다른 파일은 올리지 않고 문구를 보인다(조사 그대로)', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const { input } = renderPanel()
    await user.upload(input(), fileOf('메모.txt'))
    expect(m.upload).not.toHaveBeenCalled()
    expect(within(section()).getByRole('alert')).toHaveTextContent(
      "'메모.txt' 파일은 올릴 수 없어요. docx, xlsx, pdf 파일만 올릴 수 있어요.",
    )
  })

  it('10MB를 넘는 파일은 올리지 않고 문구를 보인다. 같이 고른 맞는 파일은 올린다', async () => {
    const user = userEvent.setup()
    m.upload.mockImplementation(addsToList('카드 이용 안내.docx'))
    const { input } = renderPanel()
    await user.upload(input(), [fileOf('큰 파일.pdf', 11 * 1024 * 1024), fileOf('카드 이용 안내.docx')])
    expect(m.upload).toHaveBeenCalledTimes(1)
    expect(within(section()).getByRole('alert')).toHaveTextContent(
      "'큰 파일.pdf' 파일이 10MB를 넘어요. 10MB 이하로 줄여서 올려 주세요.",
    )
    expect(await screen.findByText('1개 올렸어요')).toBeInTheDocument()
  })

  it('같은 이름(23505)이면 "서식이 이미 있어요" 문구를 보이고 실패 행을 남기지 않는다', async () => {
    const user = userEvent.setup()
    m.upload.mockRejectedValue(new DbError(409, 'duplicate key value', '23505'))
    const { input } = renderPanel()
    await user.upload(input(), fileOf('법인카드 신청서.xlsx'))

    expect(await within(section()).findByText(
      "'법인카드 신청서.xlsx' 서식이 이미 있어요. 바꾸려면 기존 서식을 지운 뒤 올려 주세요.",
    )).toBeInTheDocument()
    expect(screen.queryByText('올리지 못했어요. 다시 시도해 주세요.')).not.toBeInTheDocument()
    expect(screen.queryByText('올리는 중')).not.toBeInTheDocument()
    expect(screen.queryByText(/개 올렸어요/)).not.toBeInTheDocument()
    filesInvalidated()
  })

  it('알림 닫기를 누르면 거절 문구가 사라진다', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const { input } = renderPanel()
    await user.upload(input(), fileOf('메모.txt'))
    await user.click(within(section()).getByRole('button', { name: '알림 닫기' }))
    expect(within(section()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('그 밖의 실패: 행에 문구와 "다시 시도", 누르면 같은 파일로 다시 올린다', async () => {
    const user = userEvent.setup()
    m.upload.mockRejectedValueOnce(new DbError(500, 'boom'))
    const { input } = renderPanel()
    const pdf = fileOf('카드 이용 약관.pdf')
    await user.upload(input(), pdf)

    const failed = (await screen.findByText('올리지 못했어요. 다시 시도해 주세요.')).closest('li')!
    expect(rows()[0]).toBe(failed)
    expect(failed).toHaveTextContent('카드 이용 약관.pdf')
    filesInvalidated()

    m.upload.mockImplementation(addsToList('카드 이용 약관.pdf'))
    await user.click(within(failed).getByRole('button', { name: '다시 시도' }))
    expect(m.upload).toHaveBeenCalledTimes(2)
    expect(m.upload).toHaveBeenLastCalledWith(TEMPLATE, pdf)
    expect(await screen.findByText('1개 올렸어요')).toBeInTheDocument()
    expect(screen.queryByText('올리지 못했어요. 다시 시도해 주세요.')).not.toBeInTheDocument()
  })

  it('세션이 만료돼(401) 올리지 못하면 로그아웃한다', async () => {
    const user = userEvent.setup()
    m.upload.mockRejectedValue(new DbError(401, 'jwt expired'))
    const { input } = renderPanel()
    await user.upload(input(), fileOf('카드 이용 약관.pdf'))
    await vi.waitFor(() => expect(m.signOut).toHaveBeenCalledTimes(1))
  })

  it('파일을 끌어 올리면 "놓으면 바로 올려요", 놓으면 올리고, 벗어나면 원래대로', async () => {
    m.upload.mockImplementation(addsToList('카드 이용 약관.pdf'))
    renderPanel()
    const target = screen.getByText('파일을 여기로 끌어다 놓거나')
    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.getByText('놓으면 바로 올려요')).toBeInTheDocument()

    fireEvent.dragLeave(target, { dataTransfer: { types: ['Files'] }, relatedTarget: null })
    expect(screen.queryByText('놓으면 바로 올려요')).not.toBeInTheDocument()

    const pdf = fileOf('카드 이용 약관.pdf')
    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'], files: [] } })
    fireEvent.drop(target, { dataTransfer: { types: ['Files'], files: [pdf] } })
    expect(screen.queryByText('놓으면 바로 올려요')).not.toBeInTheDocument()
    expect(m.upload).toHaveBeenCalledWith(TEMPLATE, pdf)
    expect(await screen.findByText('1개 올렸어요')).toBeInTheDocument()
  })
})

describe('TemplateFilesPanel 지우기', () => {
  it('확인 창(문구 그대로) → 지우기 → deleteTaskFile, 목록을 다시 읽고 "지웠어요"', async () => {
    const user = userEvent.setup()
    m.remove.mockImplementation(async (target: TaskFile) => {
      state.files = state.files.filter((f) => f.id !== target.id)
      store.changed()
    })
    renderPanel()
    await user.click(screen.getByRole('button', { name: '카드 신청 안내.pdf 지우기' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('heading', { name: "'카드 신청 안내.pdf' 서식을 지울까요?" })).toBeInTheDocument()
    expect(within(dialog).getByText('이 과제를 받은 신입 모두의 화면에서 사라져요.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '지우기' }))

    expect(m.remove).toHaveBeenCalledTimes(1)
    expect(m.remove).toHaveBeenCalledWith(MINE)
    const done = await screen.findByText('지웠어요')
    expect(screen.queryByText('카드 신청 안내')).not.toBeInTheDocument()
    filesInvalidated()
    // 지운 행(과 그 버튼)이 사라지므로 결과 문구로 포커스를 옮긴다
    expect(done.closest('[role="status"]')).toHaveFocus()
  })

  it('취소하면 지우지 않는다', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: '카드 신청 안내.pdf 지우기' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '취소' }))
    expect(m.remove).not.toHaveBeenCalled()
  })

  it('지우지 못하면 그 행에 문구를 보이고 목록을 다시 읽는다', async () => {
    const user = userEvent.setup()
    m.remove.mockRejectedValue(new DbError(500, 'boom'))
    renderPanel()
    await user.click(screen.getByRole('button', { name: '카드 신청 안내.pdf 지우기' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '지우기' }))

    expect(await within(rows()[1]).findByRole('alert')).toHaveTextContent('지우지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(screen.queryByText('지웠어요')).not.toBeInTheDocument()
    filesInvalidated()
  })

  it('세션이 만료돼(401) 지우지 못하면 로그아웃한다', async () => {
    const user = userEvent.setup()
    m.remove.mockRejectedValue(new DbError(401, 'jwt expired'))
    renderPanel()
    await user.click(screen.getByRole('button', { name: '카드 신청 안내.pdf 지우기' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '지우기' }))
    await vi.waitFor(() => expect(m.signOut).toHaveBeenCalledTimes(1))
  })
})
