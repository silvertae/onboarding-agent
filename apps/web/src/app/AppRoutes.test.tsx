import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'

const { auth } = vi.hoisted(() => ({ auth: { role: 'new_hire' } }))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('./AuthProvider', () => ({
  useAuth: () => ({
    profile: { id: 'u1', role: auth.role, full_name: '가상 하늘', job_title: '사원', department: null },
    session: { access_token: 't', user: { id: 'u1' } },
    loading: false,
    signOut: vi.fn(),
  }),
}))
// 라우팅만 본다. 화면 내용은 각 화면 테스트가 검증한다.
vi.mock('@/features/chat/ChatPanel', () => ({ ChatPanel: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/features/newhire/HomePage', () => ({ HomePage: () => <p>신입 홈</p> }))
vi.mock('@/features/exam/BankPage', () => ({ BankPage: () => <p>문제은행 화면</p> }))
vi.mock('@/features/templates/TemplatesPage', () => ({ TemplatesPage: () => <p>온보딩 과제 화면</p> }))
vi.mock('@/features/documents/DocumentsPage', () => ({ DocumentsPage: () => <p>규정 문서 화면</p> }))
vi.mock('@/features/admin/UsersPage', () => ({ UsersPage: () => <p>사용자 관리 화면</p> }))

import { AppRoutes } from './App'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('/team/bank 라우트', () => {
  it('교육 담당자에게 문제은행 화면을 보여 준다', () => {
    auth.role = 'team_trainer'
    renderAt('/team/bank')
    expect(screen.getByText('문제은행 화면')).toBeInTheDocument()
  })

  it('신입이 들어가면 /me로 보낸다', () => {
    auth.role = 'new_hire'
    renderAt('/team/bank')
    expect(screen.getByText('신입 홈')).toBeInTheDocument()
    expect(screen.queryByText('문제은행 화면')).not.toBeInTheDocument()
  })
})

describe('/tasks 라우트', () => {
  it('교육 담당자와 경영지원에게 온보딩 과제 화면을 보여 준다', () => {
    auth.role = 'team_trainer'
    const { unmount } = renderAt('/tasks')
    expect(screen.getByText('온보딩 과제 화면')).toBeInTheDocument()
    unmount()

    auth.role = 'ops_staff'
    renderAt('/tasks?template=HR-01')
    expect(screen.getByText('온보딩 과제 화면')).toBeInTheDocument()
  })

  it('신입은 /me로 보낸다', () => {
    auth.role = 'new_hire'
    renderAt('/tasks')
    expect(screen.getByText('신입 홈')).toBeInTheDocument()
    expect(screen.queryByText('온보딩 과제 화면')).not.toBeInTheDocument()
  })

  it('관리자는 /admin/users로 보낸다', () => {
    auth.role = 'admin'
    renderAt('/tasks')
    expect(screen.getByText('사용자 관리 화면')).toBeInTheDocument()
    expect(screen.queryByText('온보딩 과제 화면')).not.toBeInTheDocument()
  })
})

describe('/documents 라우트', () => {
  it('교육 담당자와 경영지원에게 규정 문서 화면을 보여 준다', () => {
    auth.role = 'team_trainer'
    const { unmount } = renderAt('/documents')
    expect(screen.getByText('규정 문서 화면')).toBeInTheDocument()
    unmount()

    auth.role = 'ops_staff'
    renderAt('/documents')
    expect(screen.getByText('규정 문서 화면')).toBeInTheDocument()
  })

  it('신입은 /me로, 관리자는 /admin/users로 보낸다', () => {
    auth.role = 'new_hire'
    const { unmount } = renderAt('/documents')
    expect(screen.getByText('신입 홈')).toBeInTheDocument()
    unmount()

    auth.role = 'admin'
    renderAt('/documents')
    expect(screen.getByText('사용자 관리 화면')).toBeInTheDocument()
  })
})
