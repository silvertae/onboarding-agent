import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Profile } from '@/app/AuthProvider'
import type { Enums } from '@/lib/database.types'
import { FilterChips } from '@/components/FilterChips'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus, TableSkeleton } from '@/components/LoadingStatus'
import { PageHeader } from '@/components/PageHeader'
import { Alert } from '@/components/ui/alert'
import { OWNER_LABEL, ROLE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { ResetDemoDialog } from './ResetDemoDialog'
import { UserForm, type CreatedUser } from './UserForm'
import { USERS_KEY, useTeams, useUsers, type Team } from './users'

type Role = Enums<'user_role'>
type Filter = 'all' | Role

const FILTERS: Role[] = ['new_hire', 'team_trainer', 'ops_staff', 'admin']

type Notice = { kind: 'created'; user: CreatedUser } | { kind: 'reset' }

// 'YYYY-MM-DD' → 'MM/DD' (시안 표기)
function shortDate(date: string | null): string {
  if (!date) return '—'
  const [, m, d] = date.split('-')
  return `${m}/${d}`
}

function placement(p: Profile, teams: Map<string, string>): string {
  if (p.role === 'ops_staff' && p.department) return OWNER_LABEL[p.department]
  if (p.team_id) return teams.get(p.team_id) ?? '—'
  return '—'
}

function NoticeBanner({ notice }: { notice: Notice }) {
  return (
    <Alert variant="success" role="status">
      <Check aria-hidden />
      {notice.kind === 'created' ? (
        <p className="self-center">
          <strong>계정을 만들었어요. 메일과 비밀번호를 전달해 주세요.</strong> — {notice.user.fullName} (
          {ROLE_LABEL[notice.user.role]}
          {notice.user.where && ` · ${notice.user.where}`})
          {notice.user.role === 'new_hire' && ' · 온보딩 과제가 준비됐어요.'}
        </p>
      ) : (
        <p className="self-center">데모 데이터를 초기화했어요.</p>
      )}
    </Alert>
  )
}

export function UsersPage() {
  const queryClient = useQueryClient()
  const usersQuery = useUsers()
  const teamsQuery = useTeams()
  const [filter, setFilter] = useState<Filter>('all')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [createdIds, setCreatedIds] = useState<string[]>([])

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  const teams = useMemo<Team[]>(() => teamsQuery.data ?? [], [teamsQuery.data])
  const teamNames = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams])
  const counts = useMemo(() => {
    const c: Record<Role, number> = { new_hire: 0, team_trainer: 0, ops_staff: 0, admin: 0 }
    for (const u of users) c[u.role] += 1
    return c
  }, [users])
  const visible = filter === 'all' ? users : users.filter((u) => u.role === filter)

  function refreshUsers() {
    void queryClient.invalidateQueries({ queryKey: USERS_KEY })
  }

  function handleCreated(user: CreatedUser) {
    setCreatedIds((ids) => [...ids, user.id])
    setNotice({ kind: 'created', user })
    refreshUsers()
  }

  function handleReset() {
    setNotice({ kind: 'reset' })
    refreshUsers()
  }

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: `전체 ${users.length}` },
    ...FILTERS.map((r) => ({ value: r, label: `${ROLE_LABEL[r]} ${counts[r]}` })),
  ]

  return (
    <main className="mx-auto flex max-w-[1376px] flex-col gap-6 px-4 py-8 sm:px-8">
      <PageHeader
        title="사용자 관리"
        description={`전체 사용자 ${users.length}명 · 계정 수정·삭제는 지원하지 않아요.`}
        actions={<ResetDemoDialog onDone={handleReset} />}
      />

      {notice && <NoticeBanner notice={notice} />}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <section className="overflow-hidden rounded-[18px] border border-border bg-card">
          <FilterChips
            label="역할 필터"
            className="border-b border-border px-6 py-5"
            items={filters}
            value={filter}
            onChange={setFilter}
          />

          {usersQuery.isLoading ? (
            <LoadingStatus>
              <TableSkeleton
                headClassName="border-b"
                rows={6}
                columns={[
                  { label: '이름', className: 'font-medium' },
                  { label: '메일', className: 'font-medium' },
                  { label: '역할', className: 'font-medium' },
                  { label: '부서·팀', className: 'font-medium' },
                  { label: '입사일', className: 'font-medium' },
                  { label: '기본 계정', className: 'font-medium' },
                ]}
              />
            </LoadingStatus>
          ) : usersQuery.isError ? (
            <div className="p-6">
              <LoadError retrying={usersQuery.isFetching} onRetry={() => void usersQuery.refetch()}>
                사용자 목록을 불러오지 못했어요. 새로고침해 주세요.
              </LoadError>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table aria-label="사용자 목록" className="w-full text-sm">
                <thead className="border-b border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">이름</th>
                    <th className="px-4 py-3 font-medium">메일</th>
                    <th className="px-4 py-3 font-medium">역할</th>
                    <th className="px-4 py-3 font-medium">부서·팀</th>
                    <th className="px-4 py-3 font-medium">입사일</th>
                    <th className="px-4 py-3 font-medium">기본 계정</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((u) => {
                    const isNew = createdIds.includes(u.id)
                    return (
                      <tr key={u.id} className={cn('border-b border-border last:border-b-0', isNew && 'bg-accent')}>
                        <td className="px-4 py-3 font-semibold">
                          {u.full_name}
                          {isNew && (
                            <span className="ml-2 rounded bg-st-todo-bg px-1.5 py-0.5 text-xs font-medium text-primary">
                              새로 만듦
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-label">{u.email}</td>
                        <td className="px-4 py-3">{ROLE_LABEL[u.role]}</td>
                        <td className="px-4 py-3">{placement(u, teamNames)}</td>
                        <td className="px-4 py-3">{shortDate(u.hire_date)}</td>
                        <td className={cn('px-4 py-3', !u.is_seed && 'text-muted-foreground')}>
                          {u.is_seed ? '예' : '아니요'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {visible.length === 0 && <p className="px-6 py-10 text-sm text-muted-foreground">사용자가 없어요</p>}
            </div>
          )}
        </section>

        <section className="rounded-[18px] border border-border bg-card">
          <UserForm teams={teams} onCreated={handleCreated} />
        </section>
      </div>
    </main>
  )
}
