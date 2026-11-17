import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Profile } from '@/app/AuthProvider'
import { agentFetch } from '@/lib/agent'
import type { Enums, Tables } from '@/lib/database.types'
import { DbError, isAuthError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export type Team = Pick<Tables<'teams'>, 'id' | 'name'>

// docs/contracts.md의 POST /admin/users. 역할에 맞지 않는 칸은 보내지 않는다.
export type CreateUserRequest = {
  email: string
  password: string
  full_name: string
  job_title: string
  role: Exclude<Enums<'user_role'>, 'admin'>
  department?: Enums<'ops_department'>
  team_id?: string
  hire_date?: string
  needs_hq_access?: boolean
}

export const USERS_KEY = ['admin-users'] as const

function fail(error: { message: string; code?: string }, status: number): never {
  throw new DbError(status, error.message, error.code)
}

// 같은 조직의 모든 사용자(RLS: admin), 이름순
export function useUsers(): UseQueryResult<Profile[]> {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: async () => {
      const { data, error, status } = await supabase.from('profiles').select('*').order('full_name')
      if (error) fail(error, status)
      return data
    },
  })
}

export function useTeams(): UseQueryResult<Team[]> {
  return useQuery({
    queryKey: ['admin-teams'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error, status } = await supabase.from('teams').select('id, name').order('name')
      if (error) fail(error, status)
      return data
    },
  })
}

// 에이전트 서비스가 관리자 키로 계정을 만든다. 반환: 새 사용자 id
export async function createUser(req: CreateUserRequest): Promise<string> {
  const res = await agentFetch('/admin/users', req)
  const body = (await res.json()) as { id: string }
  return body.id
}

// 기본 계정의 진행·지식·미답변·시험을 처음 상태로. 관리자가 만든 계정은 남는다.
export async function resetDemo(): Promise<void> {
  const { error, status } = await supabase.rpc('reset_demo')
  if (error) {
    const err = new DbError(status, error.message, error.code)
    if (isAuthError(err)) await supabase.auth.signOut()
    throw err
  }
}
