import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({
    profile: { id: 'u1', role: 'new_hire', full_name: '가상 하늘', job_title: '사원', department: null },
    session: { access_token: 't' },
    loading: false,
    signOut: vi.fn(),
  }),
}))

import { Layout } from './Layout'

describe('Layout 상단 바', () => {
  it('회사 로고, 서비스 이름, 데모 표시, 역할 배지를 보여 준다', () => {
    render(
      <MemoryRouter initialEntries={['/me']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/me" element={<p>본문</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('img', { name: 'Blueward' })).toBeInTheDocument()
    expect(screen.getByText('온보딩 에이전트')).toBeInTheDocument()
    expect(screen.getByText(/데모 환경 · 가상 데이터/)).toBeInTheDocument()
    expect(screen.getByText('신입')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '내 온보딩' })).toBeInTheDocument()
  })
})
