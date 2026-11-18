import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { TaskFile } from '@/lib/taskFiles'

const state = vi.hoisted(() => ({ files: [] as TaskFile[], isPending: false }))
const download = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/taskFiles', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/taskFiles')>()),
  useTemplateFiles: () => ({ data: state.files, isPending: state.isPending }),
  downloadTaskFile: download,
}))

import { TaskFormsSection } from './TaskFormsSection'

function file(over: Partial<TaskFile>): TaskFile {
  return {
    id: 'f1',
    org_id: 'org',
    template_id: 'tpl',
    file_name: '법인카드 신청서.xlsx',
    storage_path: 'org/tpl/a.xlsx',
    size_bytes: 48 * 1024,
    uploaded_by: null,
    is_seed: true,
    created_at: '2026-11-17T00:00:00Z',
    ...over,
  } as TaskFile
}

// 같은 행에 모바일(아이콘)·데스크톱(글자) 버튼이 함께 있다. 화면 폭에 따라 CSS가 하나만 보인다.
const btns = (name: string) => screen.getAllByRole('button', { name: `${name} 내려받기` })

const XLSX = file({})
const DOCX = file({ id: 'f2', file_name: '법인카드 사용 동의서.docx', size_bytes: 32 * 1024 })

beforeEach(() => {
  state.files = []
  state.isPending = false
  download.mockReset()
  download.mockResolvedValue(undefined)
})

describe('작성할 서식', () => {
  it('서식이 없으면 섹션을 그리지 않는다', () => {
    const { container } = render(<TaskFormsSection templateId="tpl" />)
    expect(screen.queryByText('작성할 서식')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('불러오는 중에는 그리지 않는다', () => {
    state.isPending = true
    const { container } = render(<TaskFormsSection templateId="tpl" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('서식 2개: 행 2개와 형식·크기', () => {
    state.files = [XLSX, DOCX]
    render(<TaskFormsSection templateId="tpl" />)
    expect(screen.getByRole('heading', { name: '작성할 서식' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Excel · 48KB')).toBeInTheDocument()
    expect(screen.getByText('Word · 32KB')).toBeInTheDocument()
  })

  it('내려받기: 한 번 호출하고 진행 중에는 그 버튼만 비활성', async () => {
    state.files = [XLSX, DOCX]
    let finish!: () => void
    download.mockReturnValue(new Promise<void>((r) => (finish = r)))
    render(<TaskFormsSection templateId="tpl" />)
    await userEvent.click(btns('법인카드 신청서.xlsx')[0])
    expect(download).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledWith(XLSX)
    for (const b of btns('법인카드 신청서.xlsx')) expect(b).toBeDisabled()
    for (const b of btns('법인카드 사용 동의서.docx')) expect(b).toBeEnabled()
    finish()
    await vi.waitFor(() => {
      for (const b of btns('법인카드 신청서.xlsx')) expect(b).toBeEnabled()
    })
  })

  it('실패하면 그 행 아래에 안내를 보인다', async () => {
    state.files = [XLSX, DOCX]
    download.mockRejectedValue(new Error('x'))
    render(<TaskFormsSection templateId="tpl" />)
    await userEvent.click(btns('법인카드 사용 동의서.docx')[0])
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[1]).getByRole('alert')).toHaveTextContent('파일을 내려받지 못했어요. 다시 시도해 주세요.')
    expect(within(rows[0]).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('파일 이름은 텍스트로만 그린다', () => {
    state.files = [file({ file_name: '<img src=x>.pdf' })]
    const { container } = render(<TaskFormsSection templateId="tpl" />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('<img src=x>')).toBeInTheDocument()
  })

  it('크기: 모바일은 44px 아이콘 버튼, 데스크톱은 lg(44px) 버튼이고 높이·여백을 덮어쓰지 않는다', () => {
    state.files = [XLSX]
    render(<TaskFormsSection templateId="tpl" />)
    const [mobile, desktop] = btns('법인카드 신청서.xlsx')
    expect(mobile).toHaveAttribute('data-size', 'icon-lg')
    expect(mobile).toHaveClass('sm:hidden')
    expect(mobile).toHaveTextContent('')
    expect(desktop).toHaveAttribute('data-size', 'lg')
    expect(desktop).toHaveClass('hidden', 'sm:inline-flex')
    expect(desktop).toHaveTextContent('내려받기')
    expect(desktop.className).not.toMatch(/sm:(py-|px-|h-|size-)|(^|\s)py-/)
  })
})
