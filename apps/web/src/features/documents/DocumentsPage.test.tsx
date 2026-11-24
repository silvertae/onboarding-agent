import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import type { Profile } from '@/app/AuthProvider'
import { AgentError } from '@/lib/agent'
import { SessionChangedError, type DocumentClause, type PolicyDocument } from './documents'

const OPS: Partial<Profile> = { id: 'u-ops', org_id: 'org-1', role: 'ops_staff', department: 'hr', team_id: null, full_name: '서지원' }
const TRAINER: Partial<Profile> = { id: 'u-tr', org_id: 'org-1', role: 'team_trainer', department: null, team_id: 'team-ai', full_name: '가상 서준' }

type Status = 'success' | 'loading' | 'error'

const { state, mocks, refetch } = vi.hoisted(() => ({
  state: {
    profile: null as unknown,
    docs: [] as PolicyDocument[],
    clauses: [] as DocumentClause[],
    clausesStatus: 'success' as 'success' | 'loading' | 'error',
    status: 'success' as Status,
  },
  mocks: {
    upload: vi.fn(),
    indexDocument: vi.fn(),
    deleteDocument: vi.fn(),
    makeKnowledgeDrafts: vi.fn(),
  },
  refetch: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({ profile: state.profile, session: { user: { id: 'u' } }, loading: false }),
}))
vi.mock('@/features/newhire/useTeamName', () => ({
  useTeamName: (teamId: string | null | undefined) => (teamId ? 'AI팀' : null),
}))
// 데이터 훅만 목으로 바꾼다. 파일 검사·권한 판단 같은 순수 함수는 실제 것을 쓴다.
vi.mock('./documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./documents')>()),
  useDocuments: () => ({
    data: state.status === 'success' ? state.docs : undefined,
    isLoading: state.status === 'loading',
    isError: state.status === 'error',
    isFetching: false,
    refetch,
  }),
  useDocumentClauses: (id: string | null) => ({
    data: id && state.clausesStatus === 'success' ? state.clauses : undefined,
    isLoading: Boolean(id) && state.clausesStatus === 'loading',
    isError: Boolean(id) && state.clausesStatus === 'error',
    isFetching: false,
    refetch,
  }),
  useDocumentActions: () => ({
    upload: mocks.upload,
    reindex: (id: string) => mocks.indexDocument(id),
    remove: (doc: PolicyDocument) => mocks.deleteDocument(doc),
    makeDrafts: (id: string, count?: number) => mocks.makeKnowledgeDrafts(id, count),
  }),
}))

import { DocumentsPage } from './DocumentsPage'

function doc(partial: Partial<PolicyDocument> & Pick<PolicyDocument, 'id' | 'title'>): PolicyDocument {
  return {
    org_id: 'org-1',
    scope: 'company',
    team_id: null,
    file_path: `org-1/${partial.id}.docx`,
    file_type: 'docx',
    status: 'ready',
    error: null,
    clause_count: 18,
    uploaded_by: 'u-ops',
    created_at: '2026-11-18T01:12:00Z',
    ...partial,
  }
}

const READY = doc({ id: 'd1', title: '복리후생 규정(가상)' })
const NOW = '2026-11-18T01:21:00Z'
// 방금 올린 처리 중 문서(1분 전)와 색인 호출이 실패해 2분 넘게 처리 중으로 남은 문서
const PROCESSING = doc({ id: 'd2', title: '취업규칙 발췌(가상)', file_type: 'pdf', status: 'processing', clause_count: 0, created_at: '2026-11-18T01:20:00Z' })
const STALE = doc({ id: 'd5', title: '직무 발명 규정(가상)', file_type: 'pdf', status: 'processing', clause_count: 0, created_at: '2026-11-18T01:10:00Z' })
const FAILED = doc({
  id: 'd3',
  title: '출장 규정 스캔본',
  file_type: 'pdf',
  status: 'failed',
  clause_count: 0,
  // 서버가 저장하는 짧은 문구(services/agent UNREADABLE). 화면은 S14의 긴 문구로 바꿔 보여 준다.
  error: '글자를 읽을 수 없는 파일이에요',
})
const UNREADABLE_LONG = '글자를 읽을 수 없는 파일이에요. 스캔한 PDF는 읽지 못해요. 글자가 들어 있는 docx나 pdf로 다시 올려 주세요.'
const TEAM_DOC = doc({ id: 'd4', title: '팀 온보딩 가이드(가상)', scope: 'team', team_id: 'team-ai', uploaded_by: 'u-tr' })

const CLAUSES: DocumentClause[] = [
  { id: 'c1', ord: 1, label: '제1조', heading: '목적', body: '이 규정은 회사 임직원의 복리후생 제도의 운영 기준을 정한다. (가상 문서)' },
  { id: 'c8', ord: 8, label: '제8조', heading: '경조금', body: '임직원 본인이 결혼하는 경우 경조금 50만 원(가상 금액)과 특별휴가 5일을 준다.' },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <DocumentsPage />
    </MemoryRouter>,
  )
}

function file(name: string, size = 10) {
  const f = new File(['x'], name)
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const pdf = () => file('취업규칙 발췌(가상).pdf')

beforeEach(() => {
  // Date만 고정한다(2분 넘게 처리 중인 문서 판단). 타이머는 그대로 둔다.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  vi.clearAllMocks()
  state.profile = OPS
  state.docs = [READY, PROCESSING, FAILED]
  state.clauses = CLAUSES
  state.clausesStatus = 'success'
  state.status = 'success'
  mocks.upload.mockImplementation(async (title: string) => {
    const created = doc({ id: 'd9', title, file_type: 'pdf', status: 'processing', clause_count: 0, created_at: new Date().toISOString() })
    state.docs = [created, ...state.docs]
    return { document: created, indexError: null }
  })
  mocks.indexDocument.mockResolvedValue({ status: 'ready', clause_count: 3, error: null })
  mocks.deleteDocument.mockResolvedValue(undefined)
  mocks.makeKnowledgeDrafts.mockResolvedValue(5)
})

afterEach(() => vi.useRealTimers())

describe('S14 규정 문서 표', () => {
  it('문서 이름과 "형식 · 올린 사람 · 시각", 범위, 상태 배지, 조항 수를 보여 준다', () => {
    renderPage()
    const table = screen.getByRole('table', { name: '규정 문서 목록' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)

    const ready = within(rows[0])
    expect(ready.getByText('복리후생 규정(가상)')).toBeInTheDocument()
    expect(ready.getByText(/^docx · 서지원 · /)).toBeInTheDocument()
    expect(ready.getByText('회사 공통')).toBeInTheDocument()
    expect(ready.getByText('사용 중')).toHaveAttribute('data-variant', 'done')
    expect(ready.getByText('18')).toBeInTheDocument()

    const processing = within(rows[1])
    expect(processing.getByText('처리 중')).toHaveAttribute('data-variant', 'submitted')
    expect(processing.getByText('—')).toBeInTheDocument()

    const failed = within(rows[2])
    expect(failed.getByText('처리 실패')).toHaveAttribute('data-variant', 'rework')
    expect(failed.getByText('—')).toBeInTheDocument()
  })

  it('좁은 화면: 범위 칸은 숨고 문서 이름 아래 정보 줄 앞에 붙는다. 긴 이름도 줄을 바꾼다', () => {
    renderPage()
    const table = screen.getByRole('table', { name: '규정 문서 목록' })
    expect(within(table).getByRole('columnheader', { name: '범위' })).toHaveClass('hidden', 'sm:table-cell')
    const first = within(table).getAllByRole('row')[1]
    expect(within(first).getByText('회사 공통 ·')).toHaveClass('sm:hidden')
    // 띄어쓰기 없는 긴 이름도 표 칸을 넓히지 않고 줄을 바꾼다
    expect(within(first).getByRole('button', { name: '복리후생 규정(가상)' })).toHaveClass('wrap-anywhere')
  })

  it('머리글에 문서 수가 보이고, 경영지원 설명과 "문서 올리기"(outline)가 있다', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: '규정 문서', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('회사 공통 규정 문서를 올리면 조항으로 나눠 두고, 신입 채팅이 조항을 찾아 출처와 함께 답해요.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '문서 3개' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '문서 올리기' })).toHaveAttribute('data-variant', 'outline')
  })

  it('교육 담당자 설명은 "우리 팀 규정 문서"이고 팀 문서의 범위는 팀 이름이다', () => {
    state.profile = TRAINER
    state.docs = [TEAM_DOC]
    renderPage()
    expect(screen.getByText('우리 팀 규정 문서를 올리면 조항으로 나눠 두고, 신입 채팅이 조항을 찾아 출처와 함께 답해요.')).toBeInTheDocument()
    const row = within(screen.getByRole('table', { name: '규정 문서 목록' })).getAllByRole('row')[1]
    expect(within(row).getByText('AI팀')).toBeInTheDocument()
    expect(within(row).getByText(/^docx · 가상 서준 · /)).toBeInTheDocument()
  })

  it('로딩 중에는 표 스켈레톤을 보여 준다', () => {
    state.status = 'loading'
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중…')
    expect(screen.queryByRole('table', { name: '규정 문서 목록' })).not.toBeInTheDocument()
  })

  it('불러오지 못하면 LoadError와 "다시 불러오기"를 보여 주고 누르면 다시 불러온다', async () => {
    state.status = 'error'
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('규정 문서를 불러오지 못했어요')
    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('문서가 없으면 빈 목록 안내와 "문서 올리기"를 보여 준다', () => {
    state.docs = []
    renderPage()
    expect(screen.getByText('아직 올린 규정 문서가 없어요.')).toBeInTheDocument()
    expect(screen.getByText('복리후생 규정이나 취업규칙을 올리면 신입 채팅이 조항을 찾아 답해요.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '문서 올리기' })).toHaveLength(2)
  })
})

describe('S14 상세 패널', () => {
  it('처음에는 첫 문서가 선택되어 범위·상태 배지, 이름, 파일 정보, 조항 목록이 보인다', () => {
    renderPage()
    const panel = screen.getByRole('complementary', { name: '복리후생 규정(가상)' })
    expect(within(panel).getByText('회사 공통')).toBeInTheDocument()
    expect(within(panel).getByText('사용 중')).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: '복리후생 규정(가상)' })).toBeInTheDocument()
    expect(within(panel).getByText(/^복리후생 규정\(가상\)\.docx · 서지원 · /)).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: '조항 2개' })).toBeInTheDocument()
    const list = within(panel).getByRole('list', { name: '조항 목록' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[1]).toHaveTextContent('제8조')
    expect(items[1]).toHaveTextContent('경조금')
    expect(items[1]).toHaveTextContent('임직원 본인이 결혼하는 경우 경조금 50만 원(가상 금액)')
  })

  it('행을 누르면 그 문서가 오른쪽에 선택된다', async () => {
    renderPage()
    await userEvent.click(screen.getByText('출장 규정 스캔본'))
    const panel = screen.getByRole('complementary', { name: '출장 규정 스캔본' })
    expect(within(panel).getByText('처리 실패')).toBeInTheDocument()
  })

  it('조항을 불러오지 못하면 LoadError가 보인다', () => {
    state.clausesStatus = 'error'
    renderPage()
    expect(within(screen.getByRole('complementary')).getByRole('alert')).toHaveTextContent('조항을 불러오지 못했어요')
  })

  it('조항을 불러오는 중에는 스켈레톤이 보인다', () => {
    state.clausesStatus = 'loading'
    renderPage()
    expect(within(screen.getByRole('complementary')).getByRole('status')).toHaveTextContent('불러오는 중…')
  })

  it('처리 중이면 안내 문구(role=status)와 스켈레톤이 보이고 지식 초안 버튼은 없다', async () => {
    renderPage()
    await userEvent.click(screen.getByText('취업규칙 발췌(가상)'))
    const panel = screen.getByRole('complementary', { name: '취업규칙 발췌(가상)' })
    expect(within(panel).getByRole('status')).toHaveTextContent('문서를 조항으로 나누고 있어요. 1분쯤 걸려요.')
    expect(within(panel).queryByRole('button', { name: /지식 초안/ })).not.toBeInTheDocument()
    expect(panel.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('처리 실패면 문서의 error 문구를 role=note 경고로 보여 주고 "다시 처리"는 색인을 한 번 부른다', async () => {
    renderPage()
    await userEvent.click(screen.getByText('출장 규정 스캔본'))
    const panel = screen.getByRole('complementary', { name: '출장 규정 스캔본' })
    const note = within(panel).getByRole('note')
    expect(note).toHaveAttribute('data-slot', 'alert')
    expect(note).toHaveTextContent(UNREADABLE_LONG)
    expect(within(panel).getByRole('button', { name: '지우기' })).toBeInTheDocument()

    let finish: () => void = () => {}
    mocks.indexDocument.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    await userEvent.dblClick(within(panel).getByRole('button', { name: '다시 처리' }))
    expect(mocks.indexDocument).toHaveBeenCalledTimes(1)
    expect(mocks.indexDocument).toHaveBeenCalledWith('d3')
    finish()
    await waitFor(() => expect(within(panel).getByRole('button', { name: '다시 처리' })).toBeEnabled())
  })

  it('다시 처리하다가 색인 호출이 실패하면 그 문구와 "다시 처리"가 보인다', async () => {
    mocks.indexDocument.mockRejectedValueOnce(new AgentError(503, '문서 처리 서비스에 연결하지 못했어요'))
    renderPage()
    await userEvent.click(screen.getByText('출장 규정 스캔본'))
    const panel = screen.getByRole('complementary', { name: '출장 규정 스캔본' })
    await userEvent.click(within(panel).getByRole('button', { name: '다시 처리' }))
    expect(await within(panel).findByText('문서 처리 서비스에 연결하지 못했어요')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: '다시 처리' })).toBeEnabled()
  })

  it('2분 넘게 처리 중인 문서는 실패 문구와 "다시 처리"를 보여 주고 누르면 색인을 한 번 부른다(배지는 처리 중)', async () => {
    state.docs = [STALE]
    renderPage()
    const row = within(screen.getByRole('table', { name: '규정 문서 목록' })).getAllByRole('row')[1]
    expect(within(row).getByText('처리 중')).toBeInTheDocument()
    const panel = screen.getByRole('complementary', { name: '직무 발명 규정(가상)' })
    expect(within(panel).getByRole('note')).toHaveTextContent('문서를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(within(panel).queryByText(/1분쯤 걸려요/)).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: '지우기' })).toBeInTheDocument()
    mocks.indexDocument.mockImplementation(() => new Promise(() => {}))
    await userEvent.dblClick(within(panel).getByRole('button', { name: '다시 처리' }))
    expect(mocks.indexDocument).toHaveBeenCalledTimes(1)
    expect(mocks.indexDocument).toHaveBeenCalledWith('d5')
  })

  it('방금 올린 처리 중 문서는 안내 문구만 보이고 다시 처리는 없다', () => {
    state.docs = [PROCESSING]
    renderPage()
    const panel = screen.getByRole('complementary')
    expect(within(panel).getByRole('status')).toHaveTextContent('1분쯤 걸려요')
    expect(within(panel).queryByRole('button', { name: '다시 처리' })).not.toBeInTheDocument()
  })

  it('교육 담당자가 보는 회사 공통의 오래된 처리 중 문서에는 다시 처리·지우기가 없다', () => {
    state.profile = TRAINER
    state.docs = [STALE]
    renderPage()
    const panel = screen.getByRole('complementary')
    expect(within(panel).getByRole('note')).toHaveTextContent('문서를 처리하지 못했어요')
    expect(within(panel).queryByRole('button', { name: '다시 처리' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /지우기/ })).not.toBeInTheDocument()
  })

  it('다시 처리가 실패한 뒤 서버 상태가 바뀌면 낡은 색인 오류 대신 문서의 error를 보여 준다', async () => {
    mocks.indexDocument.mockRejectedValueOnce(new AgentError(503, '문서 처리 서비스에 연결하지 못했어요'))
    state.docs = [STALE]
    const view = renderPage()
    const panel = screen.getByRole('complementary')
    await userEvent.click(within(panel).getByRole('button', { name: '다시 처리' }))
    expect(await within(panel).findByText('문서 처리 서비스에 연결하지 못했어요')).toBeInTheDocument()
    state.docs = [{ ...STALE, status: 'failed', error: '문서가 너무 커요. 나눠서 올려 주세요.' }]
    view.rerender(
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>,
    )
    expect(within(screen.getByRole('complementary')).getByRole('note')).toHaveTextContent('문서가 너무 커요. 나눠서 올려 주세요.')
  })

  it('다시 처리하는 동안에도 버튼 문구는 "다시 처리"이고 비활성이다', async () => {
    mocks.indexDocument.mockImplementation(() => new Promise(() => {}))
    state.docs = [FAILED]
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '다시 처리' }))
    expect(screen.getByRole('button', { name: '다시 처리' })).toBeDisabled()
  })

  it('업로드 직후 색인 호출이 실패한 문서는 indexError 문구와 "다시 처리"를 보여 준다', async () => {
    mocks.upload.mockImplementationOnce(async (title: string) => {
      const created = doc({ id: 'd9', title, file_type: 'pdf', status: 'processing', clause_count: 0 })
      state.docs = [created, ...state.docs]
      return { document: created, indexError: '문서를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' }
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '문서 올리기' }))
    await userEvent.upload(screen.getByLabelText('파일'), pdf())
    await userEvent.click(screen.getByRole('button', { name: '올리기' }))
    const panel = await screen.findByRole('complementary', { name: '취업규칙 발췌(가상)' })
    expect(within(panel).getByRole('note')).toHaveTextContent('문서를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(within(panel).getByRole('button', { name: '다시 처리' })).toBeInTheDocument()
  })
})

describe('S14 지식 초안 만들기', () => {
  it('누르면 "초안 만드는 중…"(비활성)이 되고 두 번 눌러도 한 번만 부른다', async () => {
    let finish: (n: number) => void = () => {}
    mocks.makeKnowledgeDrafts.mockImplementation(() => new Promise<number>((resolve) => (finish = resolve)))
    renderPage()
    const button = screen.getByRole('button', { name: '지식 초안 만들기' })
    expect(button).toHaveAttribute('data-size', 'lg')
    await userEvent.dblClick(button)
    const busy = screen.getByRole('button', { name: '초안 만드는 중…' })
    expect(busy).toBeDisabled()
    expect(mocks.makeKnowledgeDrafts).toHaveBeenCalledTimes(1)
    expect(mocks.makeKnowledgeDrafts).toHaveBeenCalledWith('d1', undefined)
    finish(5)
    await screen.findByText('지식 초안 5개를 만들었어요. 검토하고 게시해야 신입에게 보여요.')
  })

  it('성공하면 완료 문구와 "지식 관리에서 검토하기" 링크가 보인다', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '지식 초안 만들기' }))
    const ok = await screen.findByText('지식 초안 5개를 만들었어요. 검토하고 게시해야 신입에게 보여요.')
    expect(ok.closest('[role="status"]')).not.toBeNull()
    expect(screen.getByRole('link', { name: '지식 관리에서 검토하기' })).toHaveAttribute('href', '/knowledge?tab=knowledge&filter=ai')
    expect(screen.getByRole('button', { name: '지식 초안 만들기' })).toBeEnabled()
  })

  it('새로 만들 초안이 없으면(0개) 오류가 아닌 안내와 같은 링크를 보여 준다', async () => {
    mocks.makeKnowledgeDrafts.mockResolvedValueOnce(0)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '지식 초안 만들기' }))
    const info = await screen.findByText('새로 만들 초안이 없어요. 만든 초안은 지식 관리에서 검토해 주세요.')
    expect(info.closest('[role="status"]')).not.toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/개를 만들었어요/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '지식 관리에서 검토하기' })).toHaveAttribute('href', '/knowledge?tab=knowledge&filter=ai')
  })

  it('실패하면 실패 문구가 보인다', async () => {
    mocks.makeKnowledgeDrafts.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '지식 초안 만들기' }))
    expect(await screen.findByText('초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
  })

  it('에이전트가 429면 한도 문구에 "내일 다시 이용해 주세요."를 붙여 보여 준다', async () => {
    mocks.makeKnowledgeDrafts.mockRejectedValueOnce(new AgentError(429, '오늘 사용 한도를 넘었어요'))
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '지식 초안 만들기' }))
    expect(await screen.findByText('오늘 사용 한도를 넘었어요. 내일 다시 이용해 주세요.')).toBeInTheDocument()
    expect(screen.queryByText('초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')).not.toBeInTheDocument()
  })

  it('계정이 바뀌어 저장하지 않았으면(SessionChangedError) 알림 없이 버튼만 원래대로 돌아온다', async () => {
    mocks.makeKnowledgeDrafts.mockRejectedValueOnce(new SessionChangedError())
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '지식 초안 만들기' }))
    expect(await screen.findByRole('button', { name: '지식 초안 만들기' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')).not.toBeInTheDocument()
    expect(screen.queryByText('계정이 바뀌어 초안을 저장하지 않았어요.')).not.toBeInTheDocument()
    expect(screen.queryByText(/만들었어요|새로 만들 초안이 없어요/)).not.toBeInTheDocument()
  })

  it('에이전트가 502면 그 문구를 그대로 보여 준다', async () => {
    mocks.makeKnowledgeDrafts.mockRejectedValueOnce(new AgentError(502, '초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'))
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '지식 초안 만들기' }))
    expect(await screen.findByText('초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
  })

  it('교육 담당자가 회사 공통 문서를 고르면 지우기 아이콘과 지식 초안 만들기가 없다', () => {
    state.profile = TRAINER
    state.docs = [READY, TEAM_DOC]
    renderPage()
    const panel = screen.getByRole('complementary', { name: '복리후생 규정(가상)' })
    expect(within(panel).queryByRole('button', { name: /지우기/ })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: '지식 초안 만들기' })).not.toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: '조항 2개' })).toBeInTheDocument()
  })

  it('교육 담당자가 우리 팀 문서를 고르면 지우기와 지식 초안 만들기가 보인다', () => {
    state.profile = TRAINER
    state.docs = [TEAM_DOC]
    renderPage()
    const panel = screen.getByRole('complementary', { name: '팀 온보딩 가이드(가상)' })
    expect(within(panel).getByRole('button', { name: '팀 온보딩 가이드(가상) 지우기' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: '지식 초안 만들기' })).toBeInTheDocument()
  })

  it('교육 담당자는 회사 공통 처리 실패 문서를 다시 처리·지우기 할 수 없다', async () => {
    state.profile = TRAINER
    state.docs = [FAILED]
    renderPage()
    const panel = screen.getByRole('complementary', { name: '출장 규정 스캔본' })
    expect(within(panel).getByRole('note')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: '다시 처리' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /지우기/ })).not.toBeInTheDocument()
  })
})

describe('S14 지우기', () => {
  it('확인 창에 제목·설명이 보이고 "지우기"를 누르면 deleteDocument를 한 번 부른다', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '복리후생 규정(가상) 지우기' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('heading', { name: "'복리후생 규정(가상)'을 지울까요?" })).toBeInTheDocument()
    expect(within(dialog).getByText('조항 18개가 함께 지워지고, 채팅은 더 이상 이 문서로 답하지 않아요. 이 문서로 만든 지식은 남아요.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(mocks.deleteDocument).toHaveBeenCalledTimes(1))
    expect(mocks.deleteDocument).toHaveBeenCalledWith(READY)
  })

  it('"취소"는 지우지 않고 창을 닫는다', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '복리후생 규정(가상) 지우기' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(mocks.deleteDocument).not.toHaveBeenCalled()
  })

  it('처리 실패 문서의 "지우기"도 같은 확인 창을 연다(조항 수는 0개)', async () => {
    renderPage()
    await userEvent.click(screen.getByText('출장 규정 스캔본'))
    await userEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: '지우기' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/^조항 0개가 함께 지워지고/)).toBeInTheDocument()
  })

  it('지우기에 실패하면 패널에 오류가 보인다', async () => {
    mocks.deleteDocument.mockRejectedValueOnce(new Error('권한이 없어요'))
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '복리후생 규정(가상) 지우기' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '지우기' }))
    expect(await screen.findByText('지우지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
  })
})

describe('S14 올리기 창', () => {
  async function openDialog() {
    await userEvent.click(screen.getByRole('button', { name: '문서 올리기' }))
    return screen.findByRole('dialog', { name: '규정 문서 올리기' })
  }

  it('제목·설명·범위·안내·경고가 시안 그대로 보이고 파일 입력은 docx, pdf만 받는다', async () => {
    renderPage()
    const dialog = await openDialog()
    expect(within(dialog).getByText('올리면 조항으로 나눠 두고, 신입 채팅이 조항을 근거로 답해요.')).toBeInTheDocument()
    expect(within(dialog).getByText('회사 공통 · 경영지원 담당자가 관리해요')).toBeInTheDocument()
    expect(within(dialog).getByText('docx, pdf · 파일당 10MB까지 · 글자가 있는 파일만 읽을 수 있어요(스캔본 제외)')).toBeInTheDocument()
    expect(within(dialog).getByText('가상 문서만 올려 주세요. 실명·연락처 같은 개인정보나 실제 사내 규정은 올리지 않아요.')).toBeInTheDocument()
    const input = within(dialog).getByLabelText('파일')
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', '.docx,.pdf')
    expect(within(dialog).getByRole('button', { name: '올리기' })).toBeDisabled()
  })

  it('고르기 전에는 "파일 선택" 버튼이 있고, 고른 뒤에는 파일 이름·"형식 · 크기"·"다른 파일" 줄로 바뀐다', async () => {
    renderPage()
    const dialog = await openDialog()
    expect(within(dialog).getByRole('button', { name: '파일 선택' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '다른 파일' })).not.toBeInTheDocument()
    await userEvent.upload(within(dialog).getByLabelText('파일'), file('취업규칙 발췌(가상).pdf', 214 * 1024))
    expect(within(dialog).getByText('PDF · 214KB')).toBeInTheDocument()
    expect(within(dialog).getByTitle('취업규칙 발췌(가상).pdf')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '다른 파일' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '파일 선택' })).not.toBeInTheDocument()
  })

  it('"파일 선택"과 "다른 파일"은 숨은 파일 입력을 연다', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    renderPage()
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: '파일 선택' }))
    expect(click).toHaveBeenCalledTimes(1)
    await userEvent.upload(within(dialog).getByLabelText('파일'), pdf())
    await userEvent.click(within(dialog).getByRole('button', { name: '다른 파일' }))
    expect(click).toHaveBeenCalledTimes(2)
    click.mockRestore()
  })

  it('거절된 파일은 파일 줄 대신 "파일 선택" 버튼과 거절 문구를 보인다', async () => {
    renderPage()
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('파일'), file('사진.jpg'), { applyAccept: false })
    expect(within(dialog).getByRole('button', { name: '파일 선택' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '다른 파일' })).not.toBeInTheDocument()
  })

  it('교육 담당자는 범위가 "{팀 이름} · 교육 담당자가 관리해요"로 보인다', async () => {
    state.profile = TRAINER
    state.docs = [TEAM_DOC]
    renderPage()
    const dialog = await openDialog()
    expect(within(dialog).getByText('AI팀 · 교육 담당자가 관리해요')).toBeInTheDocument()
  })

  it('파일을 고르면 문서 이름이 파일 이름(확장자 제외)으로 채워진다', async () => {
    renderPage()
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('파일'), pdf())
    expect(within(dialog).getByLabelText('문서 이름')).toHaveValue('취업규칙 발췌(가상)')
    expect(within(dialog).getByRole('button', { name: '올리기' })).toBeEnabled()
  })

  it('파일 이름으로 채운 이름은 다른 파일을 고르면 새 파일 이름으로 바뀐다', async () => {
    renderPage()
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('파일'), pdf())
    await userEvent.upload(within(dialog).getByLabelText('파일'), file('출장 규정.docx'))
    expect(within(dialog).getByLabelText('문서 이름')).toHaveValue('출장 규정')
  })

  it('이름을 먼저 입력하고 파일을 고르면 입력한 이름을 그대로 둔다', async () => {
    renderPage()
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByLabelText('문서 이름'), '복리후생 규정(가상)')
    await userEvent.upload(within(dialog).getByLabelText('파일'), file('welfare-policy.docx'))
    expect(within(dialog).getByLabelText('문서 이름')).toHaveValue('복리후생 규정(가상)')
    expect(within(dialog).getByRole('button', { name: '올리기' })).toBeEnabled()
  })

  it('채워진 이름을 직접 고친 뒤 다른 파일을 골라도 고친 이름을 그대로 둔다', async () => {
    renderPage()
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('파일'), pdf())
    await userEvent.clear(within(dialog).getByLabelText('문서 이름'))
    await userEvent.type(within(dialog).getByLabelText('문서 이름'), '취업규칙')
    await userEvent.upload(within(dialog).getByLabelText('파일'), file('출장 규정.docx'))
    expect(within(dialog).getByLabelText('문서 이름')).toHaveValue('취업규칙')
  })

  it('이름 칸을 비운 뒤 파일을 고르면 다시 파일 이름으로 채운다', async () => {
    renderPage()
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByLabelText('문서 이름'), '임시')
    await userEvent.clear(within(dialog).getByLabelText('문서 이름'))
    await userEvent.upload(within(dialog).getByLabelText('파일'), file('출장 규정.docx'))
    expect(within(dialog).getByLabelText('문서 이름')).toHaveValue('출장 규정')
  })

  it('.jpg를 고르면 거절 문구가 보이고 "올리기"가 비활성이다', async () => {
    renderPage()
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('파일'), file('사진.jpg'), { applyAccept: false })
    expect(within(dialog).getByRole('alert')).toHaveTextContent("'사진.jpg'은 올릴 수 없어요. docx, pdf 파일만 올릴 수 있어요.")
    expect(within(dialog).getByRole('button', { name: '올리기' })).toBeDisabled()
  })

  it('10MB를 넘으면 크기 거절 문구가 보인다', async () => {
    renderPage()
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('파일'), file('큰 문서.pdf', 10485761))
    expect(within(dialog).getByRole('alert')).toHaveTextContent("'큰 문서.pdf'이 10MB를 넘어요.")
    expect(within(dialog).getByRole('button', { name: '올리기' })).toBeDisabled()
  })

  it('이름을 비우면 "올리기"가 비활성이다', async () => {
    renderPage()
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('파일'), pdf())
    await userEvent.clear(within(dialog).getByLabelText('문서 이름'))
    expect(within(dialog).getByRole('button', { name: '올리기' })).toBeDisabled()
  })

  it('성공하면 창이 닫히고 새 문서가 선택된다. 올리는 동안 두 번 눌러도 한 번만 올린다', async () => {
    renderPage()
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('파일'), pdf())
    await userEvent.dblClick(within(dialog).getByRole('button', { name: '올리기' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(mocks.upload).toHaveBeenCalledWith('취업규칙 발췌(가상)', expect.any(File))
    const panel = await screen.findByRole('complementary', { name: '취업규칙 발췌(가상)' })
    expect(within(panel).getByRole('status')).toHaveTextContent('1분쯤 걸려요')
  })

  it('올리는 동안에는 "올리는 중…"이 보이고 창을 닫을 수 없다', async () => {
    let finish: () => void = () => {}
    mocks.upload.mockImplementation(
      (title: string) =>
        new Promise((resolve) => {
          finish = () => resolve({ document: doc({ id: 'd9', title, status: 'processing', created_at: new Date().toISOString() }), indexError: null })
        }),
    )
    renderPage()
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('파일'), pdf())
    await userEvent.click(within(dialog).getByRole('button', { name: '올리기' }))
    expect(within(dialog).getByRole('button', { name: '올리는 중…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    finish()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('올리기에 실패하면 창 안에 오류가 보이고 입력이 유지된다', async () => {
    mocks.upload.mockRejectedValueOnce(new Error('new row violates row-level security policy'))
    renderPage()
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('파일'), pdf())
    await userEvent.clear(within(dialog).getByLabelText('문서 이름'))
    await userEvent.type(within(dialog).getByLabelText('문서 이름'), '내 이름')
    await userEvent.click(within(dialog).getByRole('button', { name: '올리기' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('올리지 못했어요. 다시 시도해 주세요.')
    expect(within(dialog).getByLabelText('문서 이름')).toHaveValue('내 이름')
    expect(within(dialog).getByRole('button', { name: '올리기' })).toBeEnabled()
  })

  it('다시 열면 이전 입력과 오류가 남지 않는다', async () => {
    mocks.upload.mockRejectedValueOnce(new Error('x'))
    renderPage()
    let dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('파일'), pdf())
    await userEvent.click(within(dialog).getByRole('button', { name: '올리기' }))
    await within(dialog).findByRole('alert')
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    dialog = await openDialog()
    expect(within(dialog).getByLabelText('문서 이름')).toHaveValue('')
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })
})
