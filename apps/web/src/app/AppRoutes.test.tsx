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
