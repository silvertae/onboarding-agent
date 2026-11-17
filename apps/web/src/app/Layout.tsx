import { LogOut } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import type { Enums } from '@/lib/database.types'
import { OWNER_LABEL, ROLE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useAuth } from './AuthProvider'

const NAV_BY_ROLE: Record<Enums<'user_role'>, { to: string; label: string }[]> = {
  new_hire: [{ to: '/me', label: '내 온보딩' }],
  team_trainer: [
    { to: '/team', label: '팀 신입 현황' },
    { to: '/team/exams', label: '시험 출제' },
    { to: '/knowledge', label: '지식 관리' },
  ],
  ops_staff: [
    { to: '/ops', label: '부서 업무함' },
    { to: '/knowledge', label: '지식 관리' },
  ],
  admin: [{ to: '/admin/users', label: '사용자 관리' }],
}

const ENV_NAME: Record<string, string> = { local: '로컬', staging: '스테이징' }

// 운영(prod)이 아니면 환경 이름을 함께 보여 준다.
export function DemoChip({ className }: { className?: string }) {
  const env = import.meta.env.VITE_ENV_LABEL
  const envName = env && env !== 'prod' ? (ENV_NAME[env] ?? env) : null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-[var(--text-secondary)]',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-[#b26a00]" aria-hidden />
      데모 환경 · 가상 데이터
      {envName && <span className="font-semibold">· {envName}</span>}
    </span>
  )
}

function AppHeader() {
  const { profile, signOut } = useAuth()
  if (!profile) return null
  const caption = profile.department ? OWNER_LABEL[profile.department] : profile.job_title

  return (
    <header className="border-b border-border bg-white/90">
      <div className="mx-auto flex min-h-15 max-w-[1376px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-2 sm:px-8">
        <span className="text-[15px] font-semibold">온보딩 에이전트</span>
        <DemoChip />
        <nav aria-label="주 메뉴" className="flex flex-auto flex-wrap gap-1">
          {NAV_BY_ROLE[profile.role].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-background',
                  isActive && 'bg-background font-semibold text-foreground',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-8 place-items-center rounded-full bg-[#e8eef8] text-[13px] font-semibold text-primary"
            aria-hidden
          >
            {profile.full_name.slice(-2)}
          </span>
          <div className="flex flex-col leading-tight">
            <b className="text-[13px]">{profile.full_name}</b>
            {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
          </div>
          <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-white">{ROLE_LABEL[profile.role]}</span>
          <Button variant="ghost" size="icon" aria-label="로그아웃" onClick={() => void signOut()}>
            <LogOut />
          </Button>
        </div>
      </div>
    </header>
  )
}

export function Layout() {
  return (
    <div className="min-h-svh bg-background">
      <AppHeader />
      <Outlet />
    </div>
  )
}
