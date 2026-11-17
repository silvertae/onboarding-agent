import { useQuery } from '@tanstack/react-query'
import { DbError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

// 팀 과제의 담당 배지·필터·명함 미리보기에 쓰는 팀 이름. 같은 조직의 teams는 RLS가 조회를 허용한다.
export function useTeamName(teamId: string | null | undefined): string | null {
  const { data } = useQuery({
    queryKey: ['team-name', teamId],
    enabled: Boolean(teamId),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error, status } = await supabase.from('teams').select('name').eq('id', teamId!).single()
      if (error) throw new DbError(status, error.message, error.code)
      return data.name
    },
  })
  return data ?? null
}
