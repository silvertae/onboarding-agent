import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import type { Profile } from './AuthProvider'

const { authState } = vi.hoisted(() => ({
  authState: { current: { profile: null, session: null, loading: false } as Record<string, unknown> },
}))

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({ ...authState.current, signOut: vi.fn() }),
}))

import { RoleGuard } from './RoleGuard'

const newHire = { id: 'u1', role: 'new_hire', full_name: '가상 신입' } as Profile

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>로그인 화면</p>} />
        <Route element={<RoleGuard allow={['new_hire']} />}>
          <Route path="/me" element={<p>신입 홈</p>} />
        </Route>
        <Route element={<RoleGuard allow={['ops_staff']} />}>
          <Route path="/ops" element={<p>부서 업무함</p>} />
        </Route>
        <Route element={<RoleGuard allow={['admin']} />}>
          <Route path="/admin/users" element={<p>사용자 관리</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RoleGuard', () => {
  it('신입이 /ops에 들어가면 /me로 보낸다', () => {
    authState.current = { profile: newHire, session: { access_token: 't' }, loading: false }
    renderAt('/ops')
    expect(screen.getByText('신입 홈')).toBeInTheDocument()
    expect(screen.queryByText('부서 업무함')).not.toBeInTheDocument()
  })

  it('신입이 /admin/users에 들어가면 /me로 보낸다', () => {
    authState.current = { profile: newHire, session: { access_token: 't' }, loading: false }
    renderAt('/admin/users')
    expect(screen.getByText('신입 홈')).toBeInTheDocument()
  })

  it('세션이 없으면 /login으로 보낸다', () => {
    authState.current = { profile: null, session: null, loading: false }
    renderAt('/me')
    expect(screen.getByText('로그인 화면')).toBeInTheDocument()
  })

  it('허용된 역할이면 화면을 보여 준다', () => {
    authState.current = { profile: newHire, session: { access_token: 't' }, loading: false }
    renderAt('/me')
    expect(screen.getByText('신입 홈')).toBeInTheDocument()
  })

  it('로딩 중에는 이동하지 않는다', () => {
    authState.current = { profile: null, session: null, loading: true }
    renderAt('/me')
    expect(screen.queryByText('로그인 화면')).not.toBeInTheDocument()
    expect(screen.queryByText('신입 홈')).not.toBeInTheDocument()
  })
})
