import type { Enums } from '@/lib/database.types'
import type { TaskView } from '@/lib/tasks'

// 교육 담당자 화면(S5·S6)은 우리 팀 과제만 다룬다. RLS가 막지만 화면에서도 경영지원 과제를 거른다.
export function isTeamTask(task: TaskView, teamId: string | null | undefined): boolean {
  return task.template.team_id !== null && task.template.department === null && (!teamId || task.template.team_id === teamId)
}

export const ASSESSMENT_LABEL: Record<Enums<'assessment_result'>, string> = {
  pass: '통과',
  needs_followup: '보충 필요',
}

// 평가 과제를 가까운 일정 순으로. 일정이 없으면 뒤로, 같으면 템플릿 순서.
export function assessmentsOf(tasks: TaskView[]): TaskView[] {
  return tasks
    .filter((t) => t.template.kind === 'assessment')
    .sort((a, b) => {
      if (a.scheduled_at && b.scheduled_at) return a.scheduled_at.localeCompare(b.scheduled_at)
      if (a.scheduled_at) return -1
      if (b.scheduled_at) return 1
      return a.template.sort_order - b.template.sort_order
    })
}

// 아바타 글자 규칙은 상단 바와 같이 쓴다
export { initials } from '@/components/initials'
