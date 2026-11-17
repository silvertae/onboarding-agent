import { Navigate, Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import type { Enums } from '@/lib/database.types'
import { useAuth } from './AuthProvider'

type Role = Enums<'user_role'>

export const HOME_BY_ROLE: Record<Role, string> = {
  new_hire: '/me',
  team_trainer: '/team',
  ops_staff: '/ops',
  admin: '/admin/users',
}

export function FullPageMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground">
      {children}
    </div>
  )
}

// 로그인하지 않았으면 /login, 허용되지 않은 역할이면 그 역할의 첫 화면으로 보낸다.
export function RoleGuard({ allow }: { allow: Role[] }) {
  const { session, profile, loading, signOut } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <FullPageMessage>
        <p role="status">불러오는 중…</p>
      </FullPageMessage>
    )
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile) {
    return (
      <FullPageMessage>
        <p>계정 정보를 불러오지 못했어요. 관리자에게 문의해 주세요.</p>
        <Button variant="outline" className="rounded-full" onClick={() => void signOut()}>
          로그아웃
        </Button>
      </FullPageMessage>
    )
  }
  if (!allow.includes(profile.role)) return <Navigate to={HOME_BY_ROLE[profile.role]} replace />
  return <Outlet />
}
