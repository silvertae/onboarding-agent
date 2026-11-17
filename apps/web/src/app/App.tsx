import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { UsersPage } from '@/features/admin/UsersPage'
import { ExamEditorPage } from '@/features/exam/ExamEditorPage'
import { ExamListPage } from '@/features/exam/ExamListPage'
import { ExamPrintPage } from '@/features/exam/ExamPrintPage'
import { HomePage } from '@/features/newhire/HomePage'
import { TaskDetailPage } from '@/features/newhire/TaskDetailPage'
import { HireDetailPage } from '@/features/staff/HireDetailPage'
import { KnowledgePage } from '@/features/staff/KnowledgePage'
import { OpsInboxPage } from '@/features/staff/OpsInboxPage'
import { TeamOverviewPage } from '@/features/staff/TeamOverviewPage'
import { isAuthError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { AuthProvider, useAuth } from './AuthProvider'
import { Layout } from './Layout'
import { LoginPage } from './LoginPage'
import { FullPageMessage, HOME_BY_ROLE, RoleGuard } from './RoleGuard'

// 조회·RPC가 인증 오류(401, JWT 만료)로 실패하면 로그아웃한다. RoleGuard가 /login으로 보낸다.
function onAuthFailure(error: unknown) {
  if (isAuthError(error)) void supabase.auth.signOut()
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthFailure }),
  mutationCache: new MutationCache({ onError: onAuthFailure }),
  defaultOptions: {
    queries: { retry: (count, error) => !isAuthError(error) && count < 2, refetchOnWindowFocus: false },
  },
})

function HomeRedirect() {
  const { session, profile, loading } = useAuth()
  if (loading) return <FullPageMessage><p role="status">불러오는 중…</p></FullPageMessage>
  if (!session || !profile) return <Navigate to="/login" replace />
  return <Navigate to={HOME_BY_ROLE[profile.role]} replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route element={<RoleGuard allow={['new_hire']} />}>
          <Route path="/me" element={<HomePage />} />
          <Route path="/me/tasks/:id" element={<TaskDetailPage />} />
        </Route>
        <Route element={<RoleGuard allow={['team_trainer']} />}>
          <Route path="/team" element={<TeamOverviewPage />} />
          <Route path="/team/hires/:id" element={<HireDetailPage />} />
          <Route path="/team/exams" element={<ExamListPage />} />
          <Route path="/team/exams/:id" element={<ExamEditorPage />} />
          <Route path="/team/exams/:id/print" element={<ExamPrintPage />} />
        </Route>
        <Route element={<RoleGuard allow={['ops_staff']} />}>
          <Route path="/ops" element={<OpsInboxPage />} />
        </Route>
        <Route element={<RoleGuard allow={['team_trainer', 'ops_staff']} />}>
          <Route path="/knowledge" element={<KnowledgePage />} />
        </Route>
        <Route element={<RoleGuard allow={['admin']} />}>
          <Route path="/admin/users" element={<UsersPage />} />
        </Route>
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
