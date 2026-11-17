import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { HomePage } from '@/features/newhire/HomePage'
import { TaskDetailPage } from '@/features/newhire/TaskDetailPage'
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

// 기능 페이지는 각 Task에서 이 자리를 교체한다.
function Placeholder({ title }: { title: string }) {
  return (
    <main className="mx-auto max-w-[1376px] p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">준비 중</p>
    </main>
  )
}

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
          <Route path="/team" element={<Placeholder title="팀 신입 현황" />} />
          <Route path="/team/hires/:id" element={<Placeholder title="신입 상세" />} />
          <Route path="/team/exams" element={<Placeholder title="시험 출제" />} />
          <Route path="/team/exams/:id" element={<Placeholder title="시험 편집" />} />
          <Route path="/team/exams/:id/print" element={<Placeholder title="시험 인쇄" />} />
        </Route>
        <Route element={<RoleGuard allow={['ops_staff']} />}>
          <Route path="/ops" element={<Placeholder title="부서 업무함" />} />
        </Route>
        <Route element={<RoleGuard allow={['team_trainer', 'ops_staff']} />}>
          <Route path="/knowledge" element={<Placeholder title="지식 관리" />} />
        </Route>
        <Route element={<RoleGuard allow={['admin']} />}>
          <Route path="/admin/users" element={<Placeholder title="사용자 관리" />} />
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
