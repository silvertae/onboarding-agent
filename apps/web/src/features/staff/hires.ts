import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useAuth } from '@/app/AuthProvider'
import type { Tables } from '@/lib/database.types'
import { DbError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

type Profile = Tables<'profiles'>

export type Hire = Pick<Profile, 'id' | 'full_name' | 'job_title' | 'email' | 'team_id' | 'hire_date'> & {
  team: { name: string } | null
}

// 담당자가 볼 수 있는 신입 프로필. RLS: ops는 조직의 신입 전체, trainer는 우리 팀 신입만.
export function useHires(): UseQueryResult<Hire[]> {
  const { session } = useAuth()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['hires', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error, status } = await supabase
        .from('profiles')
        .select('id, full_name, job_title, email, team_id, hire_date, team:teams(name)')
        .eq('role', 'new_hire')
        .order('hire_date', { ascending: false })
      if (error) throw new DbError(status, error.message, error.code)
      return data as unknown as Hire[]
    },
  })
}
