// 평가 과제에 연결한 응시 시험(exam_sittings). 조회는 사용자 토큰(RLS), 연결은 assign_exam RPC로만 한다.
// 연결 시점에 시험의 은행 문항 id를 스냅샷으로 남겨, 그 신입에게 다음 시험을 만들 때 본 문항을 뺀다.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { Exam } from '@/features/exam/exams'
import type { Tables } from '@/lib/database.types'
import { DbError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export type Sitting = Tables<'exam_sittings'> & { exam: Pick<Exam, 'id' | 'title'> }

export const sittingKeys = {
  list: (taskInstanceId: string) => ['exam-sittings', taskInstanceId] as const,
}

export function useSittings(taskInstanceId: string): UseQueryResult<Sitting[]> {
  return useQuery({
    queryKey: sittingKeys.list(taskInstanceId),
    enabled: Boolean(taskInstanceId),
    queryFn: async () => {
      const { data, error, status } = await supabase
        .from('exam_sittings')
        .select('*, exam:exams(id,title)')
        .eq('task_instance_id', taskInstanceId)
        .order('created_at', { ascending: true })
      if (error) throw new DbError(status, error.message, error.code)
      return data as unknown as Sitting[]
    },
  })
}

// 같은 시험을 다시 연결하면 서버가 처음 기록을 그대로 돌려준다(중복 없음).
export function useAssignExam(taskInstanceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (examId: string) => {
      const { data, error, status } = await supabase.rpc('assign_exam', { p_task: taskInstanceId, p_exam: examId })
      if (error) throw new DbError(status, error.message, error.code)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sittingKeys.list(taskInstanceId) }),
  })
}
