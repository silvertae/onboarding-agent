import type { TaskStage, TaskTemplate } from '@/lib/tasks'

// 단계가 시작되는 입사 후 일수(설계: 0·5·30일)
export const STAGE_START_DAYS: Record<TaskStage, number> = { day1: 0, week1: 5, month1: 30 }

// 화면의 "단계 시작 후 N일". 기한(due_offset_days)에서 단계 시작일을 뺀다.
export function daysInStage(t: TaskTemplate): number {
  return Math.max(0, t.due_offset_days - STAGE_START_DAYS[t.stage])
}
