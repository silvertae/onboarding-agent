import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'

const { signInWithPassword } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword } },
}))

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({ profile: null, session: null, loading: false, signOut: vi.fn() }),
}))

import { LoginPage } from './LoginPage'

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  signInWithPassword.mockReset()
})

describe('LoginPage', () => {
  it('개발 모드가 아니면 데모 계정 버튼이 DOM에 없다', () => {
    vi.stubEnv('DEV', false)
    renderLogin()
    expect(screen.queryByTestId('demo-accounts')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /데모/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
  })

  it('개발 모드에서는 데모 계정 버튼 5개를 보여 준다', () => {
    vi.stubEnv('DEV', true)
    renderLogin()
    expect(screen.getByTestId('demo-accounts').querySelectorAll('button')).toHaveLength(5)
  })

  it('회사 로고와 푸터 회사명을 보여 준다', () => {
    vi.stubEnv('DEV', false)
    renderLogin()
    expect(screen.getByRole('img', { name: 'Blueward' })).toBeInTheDocument()
    expect(screen.getByText('© Blueward · 사내 AI Agent 경진대회 출품 데모')).toBeInTheDocument()
  })

  it('로그인에 실패하면 안내 문구를 보여 준다', async () => {
    vi.stubEnv('DEV', false)
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400 },
    })
    renderLogin()

    await userEvent.type(screen.getByLabelText('메일'), 'someone@demo.test')
    await userEvent.type(screen.getByLabelText('비밀번호'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('메일 또는 비밀번호를 확인해 주세요')
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'someone@demo.test', password: 'wrong-password' })
  })
})
