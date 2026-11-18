import type { TaskStage, TaskView } from '@/lib/tasks'
import { formatMonthDay } from './format'

export const STAGES: TaskStage[] = ['day1', 'week1', 'month1']

function dueDates(tasks: TaskView[]): string[] {
  return tasks.flatMap((t) => (t.due_date ? [t.due_date] : [])).sort()
}

// 날짜상 진행 중인 단계: 단계 안 마지막 기한이 오늘 이후인 첫 단계. 기한이 없는 단계는 끝을 모르므로 진행 중으로 본다.
// 모든 단계가 지났으면 마지막 단계.
export function currentStage(groups: Record<TaskStage, TaskView[]>, today: string): TaskStage {
  const present = STAGES.filter((stage) => groups[stage].length > 0)
  for (const stage of present) {
    const dues = dueDates(groups[stage])
    if (dues.length === 0 || dues[dues.length - 1] >= today) return stage
  }
  return present[present.length - 1] ?? 'day1'
}

// 단계 머리 날짜: 기한이 하루뿐이면 "11월 17일", 여러 날이면 마지막 기한까지 "~ 11월 22일"
export function stageDateLabel(tasks: TaskView[]): string | null {
  const dues = dueDates(tasks)
  if (dues.length === 0) return null
  const last = formatMonthDay(dues[dues.length - 1])
  return dues[0] === dues[dues.length - 1] ? last : `~ ${last}`
}

// 단계를 접어도 남은 일이 보이게: "할 일 3 · 보완 요청 1 · 확인 대기 1" (신입이 할 차례인 것만 '할 일'로 센다)
export function stageSummary(tasks: TaskView[]): string {
  const todo = tasks.filter((t) => t.status === 'todo' && t.template.completion_mode !== 'staff_only').length
  const rework = tasks.filter((t) => t.status === 'rework').length
  const submitted = tasks.filter((t) => t.status === 'submitted').length
  return [
    todo && `할 일 ${todo}`,
    rework && `보완 요청 ${rework}`,
    submitted && `확인 대기 ${submitted}`,
  ]
    .filter(Boolean)
    .join(' · ')
}
