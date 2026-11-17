import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'
import type { ExamListItem } from './exams'

const { state } = vi.hoisted(() => ({ state: { exams: [] as unknown[] } }))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('./exams', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./exams')>()),
  useExams: () => ({ data: state.exams, isLoading: false, isError: false }),
}))

import { ExamListPage } from './ExamListPage'

const exam = (over: Partial<ExamListItem>): ExamListItem => ({
  id: 'e1', org_id: 'org-1', team_id: 'team-ai', created_by: 'trainer', created_at: '2026-11-17T00:00:00Z',
  title: 'JS 기본기', topic: 'JavaScript 기초', difficulty: 'beginner', status: 'draft', question_count: 5, ...over,
})

function Where() {
  const loc = useLocation()
  return <p data-testid="location">{loc.pathname}</p>
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/team/exams']}>
      <Routes>
        <Route path="/team/exams" element={<ExamListPage />} />
        <Route path="/team/exams/:id" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ExamListPage', () => {
  it('만든 시험의 제목·주제·난이도·문항 수·상태를 보여 준다', () => {
    state.exams = [exam({}), exam({ id: 'e2', title: 'UI5 바인딩', topic: 'UI5', difficulty: 'intermediate', status: 'final', question_count: 6 })]
    renderList()
    const row = screen.getByRole('row', { name: /UI5 바인딩/ })
    expect(within(row).getByText('UI5')).toBeInTheDocument()
    expect(within(row).getByText('중급')).toBeInTheDocument()
    expect(within(row).getByText('6')).toBeInTheDocument()
    expect(within(row).getByText('확정')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /JS 기본기/ })).getByText('초안')).toBeInTheDocument()
  })

  it('시험이 없으면 빈 상태 안내를 보인다', () => {
    state.exams = []
    renderList()
    expect(screen.getByText(/아직 만든 시험이 없어요/)).toBeInTheDocument()
  })

  it('"새 시험 만들기"와 제목 링크는 편집기로 간다', async () => {
    state.exams = [exam({})]
    renderList()
    await userEvent.click(screen.getByRole('link', { name: 'JS 기본기' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/team/exams/e1')
  })

  it('"새 시험 만들기"는 /team/exams/new로 간다', async () => {
    state.exams = []
    renderList()
    await userEvent.click(screen.getByRole('link', { name: /새 시험 만들기/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/team/exams/new')
  })
})
