import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Profile } from '@/app/AuthProvider'
import { agentFetch } from '@/lib/agent'
import type { Enums, Tables } from '@/lib/database.types'
import { DbError, isAuthError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { storageError } from '@/lib/taskFiles'

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

// 기본 계정의 진행·지식·미답변·시험과 과제 템플릿을 처음 상태로. 관리자가 만든 계정은 남는다.
// 담당자가 올린 서식은 Storage 객체를 먼저 지운다(SQL로는 지울 수 없다). reset_demo가 그 행을 지우므로,
// 객체를 못 지우면 reset_demo를 부르지 않는다. 행이 남아 있어야 다시 시도할 때 경로를 다시 찾는다.
export async function resetDemo(): Promise<void> {
  try {
    const files = await supabase.from('task_template_files').select('storage_path').eq('is_seed', false)
    if (files.error) throw new DbError(files.status, files.error.message, files.error.code)

    const paths = (files.data ?? []).map((f) => f.storage_path)
    if (paths.length > 0) {
      // 버킷 이름은 계약 값(docs/contracts.md "과제 서식 저장소")
      const { error } = await supabase.storage.from('task-forms').remove(paths)
      if (error) throw storageError(error)
    }

    const { error, status } = await supabase.rpc('reset_demo')
    if (error) throw new DbError(status, error.message, error.code)
  } catch (err) {
    if (isAuthError(err)) await supabase.auth.signOut()
    throw err
  }
}
