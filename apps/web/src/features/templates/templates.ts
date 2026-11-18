// 과제 템플릿 데이터 계층: 사용자 토큰으로 RPC·조회(RLS가 담당 범위를 거른다). 저장·보관·복원·한 사람용 추가는 RPC로만 한다.
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useAuth } from '@/app/AuthProvider'
import type { Enums, Json } from '@/lib/database.types'
import { DbError, isAuthError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { TaskInstance, TaskStage, TaskTemplate } from '@/lib/tasks'
import { daysInStage } from './stage'

export type TaskKind = Enums<'task_kind'>
export type CompletionMode = Enums<'completion_mode'>

export type TemplateInput = {
  title: string
  description: string
  kind: TaskKind
  completionMode: CompletionMode
  stage: TaskStage
  daysInStage: number
  allowNa: boolean
  checklist: string[] | null
  prerequisiteCodes: string[]
}

export const templateKeys = {
  list: (userId: string | undefined, view: 'active' | 'archived') => ['templates', userId, view] as const,
  usage: (userId?: string) => ['template-usage', userId] as const,
}

function fail(status: number, error: { message: string; code?: string }): never {
  throw new DbError(status, error.message, error.code)
}

// 내 담당 범위(팀 또는 부서)의 기본 템플릿. 한 사람용(assigned_to)은 제외한다.
export function useManagedTemplates(view: 'active' | 'archived'): UseQueryResult<TaskTemplate[]> {
  const { session, profile } = useAuth()
  const userId = session?.user.id
  // DB RPC와 같은 범위: 교육 담당자는 팀, 경영지원은 부서. 프로필을 불러오기 전이나 다른 역할이면 조회하지 않는다.
  const scope =
    profile?.role === 'team_trainer' && profile.team_id
      ? { column: 'team_id', value: profile.team_id }
      : profile?.role === 'ops_staff' && profile.department
        ? { column: 'department', value: profile.department }
        : null
  return useQuery({
    queryKey: [...templateKeys.list(userId, view), scope?.column, scope?.value],
    enabled: Boolean(userId) && scope !== null,
    queryFn: async () => {
      let q = supabase.from('task_templates').select('*').eq(scope!.column, scope!.value).is('assigned_to', null)
      q = view === 'archived' ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
      const { data, error, status } = await q.order('stage').order('sort_order')
      if (error) fail(status, error)
      return data ?? []
    },
  })
}

// 템플릿별로 이 과제를 받은 신입 수(내가 볼 수 있는 task_instances 기준)
export function useTemplateUsage(): UseQueryResult<Map<string, number>> {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: templateKeys.usage(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error, status } = await supabase.from('task_instances').select('template_id')
      if (error) fail(status, error)
      const usage = new Map<string, number>()
      for (const row of data ?? []) usage.set(row.template_id, (usage.get(row.template_id) ?? 0) + 1)
      return usage
    },
  })
}

type CommonArgs = Omit<TemplateInput, 'prerequisiteCodes'>

function commonArgs(i: CommonArgs) {
  return {
    p_title: i.title,
    p_description: i.description,
    p_kind: i.kind,
    p_completion_mode: i.completionMode,
    p_stage: i.stage,
    p_days_in_stage: i.daysInStage,
    p_allow_na: i.allowNa,
    // 생성된 타입은 Json이지만 null이면 체크리스트 없음을 뜻한다
    p_checklist: i.checklist as Json,
  }
}

export async function saveTemplate(id: string | null, input: TemplateInput): Promise<TaskTemplate> {
  const { data, error, status } = await supabase.rpc('save_task_template', {
    // 새로 만들 때는 null. 생성된 타입은 null을 받지 않는다
    p_id: id as string,
    ...commonArgs(input),
    p_prerequisite_codes: input.prerequisiteCodes,
  })
  if (error) fail(status, error)
  return data as TaskTemplate
}

export async function archiveTemplate(id: string): Promise<TaskTemplate> {
  const { data, error, status } = await supabase.rpc('archive_task_template', { p_id: id })
  if (error) fail(status, error)
  return data as TaskTemplate
}

export async function restoreTemplate(id: string): Promise<TaskTemplate> {
  const { data, error, status } = await supabase.rpc('restore_task_template', { p_id: id })
  if (error) fail(status, error)
  return data as TaskTemplate
}

export async function addTaskForHire(hireId: string, input: CommonArgs): Promise<TaskInstance> {
  const { data, error, status } = await supabase.rpc('add_task_for_hire', { p_new_hire: hireId, ...commonArgs(input) })
  if (error) fail(status, error)
  return data as TaskInstance
}

export function isLocked(usage: number): boolean {
  return usage > 0
}

// DB와 같은 정규화: 선행 코드는 공백 제거·중복 제거·정렬한 집합, 체크리스트는 항목 공백 제거, null과 빈 배열은 같다.
const normPrereq = (codes: readonly string[]) => [...new Set(codes.map((c) => c.trim()))].sort()
const normChecklist = (items: readonly string[] | null) => (items ?? []).map((i) => i.trim())

// 사용 중 템플릿에서 DB가 거부하는 변경(제목·안내문 외 전부)이 있는지. DB 비교와 같은 기준이다.
export function lockedFieldsChanged(before: TaskTemplate, input: TemplateInput): boolean {
  return (
    before.kind !== input.kind ||
    before.completion_mode !== input.completionMode ||
    before.stage !== input.stage ||
    daysInStage(before) !== input.daysInStage ||
    before.allow_na !== input.allowNa ||
    JSON.stringify(normChecklist(before.checklist as string[] | null)) !== JSON.stringify(normChecklist(input.checklist)) ||
    JSON.stringify(normPrereq(before.prerequisite_codes)) !== JSON.stringify(normPrereq(input.prerequisiteCodes))
  )
}

// 화면용: 위 함수를 부르고 성공하면 템플릿·사용 수·과제 쿼리를 무효화한다.
// 실패하면 원래 오류(DbError)를 그대로 던진다. 인증 오류면 로그아웃하고, 그 밖의 실패면 템플릿·사용 수를 다시 읽는다.
export function useTemplateActions() {
  const queryClient = useQueryClient()
  const invalidate = (keys: string[]) => Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
  async function after<T>(call: Promise<T>): Promise<T> {
    let result: T
    try {
      result = await call
    } catch (err) {
      // useMutation을 거치지 않으므로 전역 MutationCache 대신 여기서 로그아웃한다(SECURITY.md 웹: 401 → 로그아웃).
      if (isAuthError(err)) await supabase.auth.signOut()
      // 화면을 연 뒤 신입이 들어와 잠겼거나 다른 곳에서 보관된 경우: 지금 상태(잠금 안내 등)를 보이게 다시 읽는다.
      else await invalidate(['templates', 'template-usage'])
      throw err
    }
    await invalidate(['templates', 'template-usage', 'tasks'])
    return result
  }
  return {
    save: (id: string | null, input: TemplateInput) => after(saveTemplate(id, input)),
    archive: (id: string) => after(archiveTemplate(id)),
    restore: (id: string) => after(restoreTemplate(id)),
    addForHire: (hireId: string, input: CommonArgs) => after(addTaskForHire(hireId, input)),
  }
}
