import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'

const { auth } = vi.hoisted(() => ({ auth: { role: 'new_hire' } }))

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({
    profile: { id: 'u1', role: auth.role, full_name: '가상 하늘', job_title: '사원', department: null },
    session: { access_token: 't' },
    loading: false,
    signOut: vi.fn(),
  }),
}))

// 채팅 패널은 features/chat 테스트가 검증한다. 여기서는 페이지만 그리게 한다.
vi.mock('@/features/chat/ChatPanel', () => ({ ChatPanel: ({ children }: { children: ReactNode }) => children }))

import { Layout } from './Layout'

describe('Layout 상단 바', () => {
  beforeEach(() => {
    auth.role = 'new_hire'
  })

  it('교육 담당자 메뉴는 팀 신입 현황 · 시험 출제 · 문제은행 · 지식 관리 순서다', () => {
    auth.role = 'team_trainer'
    render(
      <MemoryRouter initialEntries={['/team/bank']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/team/bank" element={<p>본문</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['팀 신입 현황', '시험 출제', '문제은행', '지식 관리'])
    expect(within(nav).getByRole('link', { name: '문제은행' })).toHaveAttribute('href', '/team/bank')
    expect(within(nav).getByRole('link', { name: '문제은행' })).toHaveAttribute('aria-current', 'page')
  })

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
