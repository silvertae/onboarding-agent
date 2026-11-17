import type { TaskView } from '@/lib/tasks'

// 담당자가 할 수 있는 처리. 평가 과제는 AssessmentCard에서 결과로 끝내므로 여기서 완료 처리하지 않는다.
export function reviewActions(task: TaskView) {
  const mode = task.template.completion_mode
  return {
    canConfirm: mode === 'confirm' && task.status === 'submitted',
    canRework: mode === 'confirm' && task.status === 'submitted',
    canComplete: mode === 'staff_only' && task.status === 'todo' && task.template.kind !== 'assessment',
  }
}
