import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/app/AuthProvider'
import type { Enums, Json, Tables } from './database.types'
import { DbError, supabase } from './supabase'

export type TaskStatus = Enums<'task_status'>
export type TaskStage = Enums<'task_stage'>
export type TaskInstance = Tables<'task_instances'>
export type TaskTemplate = Tables<'task_templates'>
export type TaskView = TaskInstance & { template: TaskTemplate }

const TASKS_KEY = ['tasks'] as const
const TASK_SELECT = '*, template:task_templates(*)'
const FINISHED: ReadonlySet<TaskStatus> = new Set(['done', 'na'])

// 과제 상태 변경은 RPC로만 한다. 이 파일에서 task_instances를 update하지 않는다.

let channelSeq = 0

// task_instances 변경을 받으면 과제 쿼리를 무효화한다. RLS가 realtime에도 적용된다.
function useTaskRealtime(enabled: boolean, filter?: string) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    channelSeq += 1
    const channel = supabase
      .channel(`task-instances-${channelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_instances', ...(filter ? { filter } : {}) },
        () => {
          void queryClient.invalidateQueries({ queryKey: TASKS_KEY })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, filter, queryClient])
}

export function useMyTasks(): UseQueryResult<TaskView[]> {
  const { session } = useAuth()
  const userId = session?.user.id
  useTaskRealtime(Boolean(userId), userId ? `new_hire_id=eq.${userId}` : undefined)

  return useQuery({
    queryKey: [...TASKS_KEY, 'mine', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error, status } = await supabase
        .from('task_instances')
        .select(TASK_SELECT)
        .eq('new_hire_id', userId!)
      if (error) throw new DbError(status, error.message, error.code)
      return data as unknown as TaskView[]
    },
  })
}

// RLS가 허용하는 과제 전부(담당자 화면용). newHireId로 한 신입만 좁힐 수 있다.
export function useVisibleTasks(filter?: { newHireId?: string }): UseQueryResult<TaskView[]> {
  const { session } = useAuth()
  const userId = session?.user.id
  const newHireId = filter?.newHireId
  useTaskRealtime(Boolean(userId), newHireId ? `new_hire_id=eq.${newHireId}` : undefined)

  return useQuery({
    // 결과가 RLS(보는 사람)에 따라 달라지므로 키에 사용자 id를 넣는다.
    queryKey: [...TASKS_KEY, 'visible', userId, newHireId ?? null],
    enabled: Boolean(userId),
    queryFn: async () => {
      let query = supabase.from('task_instances').select(TASK_SELECT)
      if (newHireId) query = query.eq('new_hire_id', newHireId)
      const { data, error, status } = await query
      if (error) throw new DbError(status, error.message, error.code)
      return data as unknown as TaskView[]
    },
  })
}

export type AssessmentInput = {
  result: 'pass' | 'needs_followup' | null
  note: string
  scheduledAt?: string
  location?: string
}

export function useTaskActions() {
  const queryClient = useQueryClient()

  async function run(call: PromiseLike<{ error: { message: string; code?: string } | null; status: number }>) {
    const { error, status } = await call
    if (error) throw new DbError(status, error.message, error.code)
    await queryClient.invalidateQueries({ queryKey: TASKS_KEY })
  }

  return {
    submit: (id: string, result?: unknown) =>
      run(supabase.rpc('submit_task', { p_id: id, ...(result === undefined ? {} : { p_result: result as Json }) })),
    markNa: (id: string, reason: string) => run(supabase.rpc('mark_na', { p_id: id, p_reason: reason })),
    confirm: (id: string) => run(supabase.rpc('confirm_task', { p_id: id })),
    requestRework: (id: string, reason: string) => run(supabase.rpc('request_rework', { p_id: id, p_reason: reason })),
    recordAssessment: (id: string, a: AssessmentInput) =>
      run(
        supabase.rpc('record_assessment', {
          p_id: id,
          p_result: a.result,
          p_note: a.note,
          p_scheduled_at: a.scheduledAt ?? null,
          p_location: a.location ?? null,
        }),
      ),
  }
}

export function groupByStage(tasks: TaskView[]): Record<TaskStage, TaskView[]> {
  const groups: Record<TaskStage, TaskView[]> = { day1: [], week1: [], month1: [] }
  for (const task of tasks) groups[task.template.stage].push(task)
  for (const list of Object.values(groups)) list.sort((a, b) => a.template.sort_order - b.template.sort_order)
  return groups
}

export function progress(tasks: TaskView[]): { finished: number; total: number } {
  return { finished: tasks.filter((t) => FINISHED.has(t.status)).length, total: tasks.length }
}

// 아직 done|na가 아닌 선행 과제
export function blockedBy(task: TaskView, all: TaskView[]): TaskView[] {
  const codes = new Set(task.template.prerequisite_codes)
  return all.filter((t) => codes.has(t.template.code) && !FINISHED.has(t.status))
}
