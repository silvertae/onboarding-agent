import { render, screen } from '@testing-library/react'
import App from './App'

test('앱 골격이 서비스 이름을 렌더링한다', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: '온보딩 에이전트' })).toBeInTheDocument()
})
