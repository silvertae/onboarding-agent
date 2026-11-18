import type { TaskView } from '@/lib/tasks'

// 이 신입에게만 추가한 과제(S6·S9 "이 신입에게 과제 추가"). 숨은 템플릿에 신입이 지정돼 있다.
export function isOneOff(task: TaskView): boolean {
  return task.template.assigned_to !== null
}

// 담당자가 할 수 있는 처리. 평가 과제는 AssessmentCard에서 결과로 끝내므로 여기서 완료 처리하지 않는다.
export function reviewActions(task: TaskView) {
  const mode = task.template.completion_mode
  return {
    canConfirm: mode === 'confirm' && task.status === 'submitted',
    canRework: mode === 'confirm' && task.status === 'submitted',
    canComplete: mode === 'staff_only' && task.status === 'todo' && task.template.kind !== 'assessment',
    // 한 사람용 과제는 고치거나 보관할 수 없어 해당 없음으로 뺀다(mark_na: 담당자는 해당 없음 허용과 상관없이).
    // 기본 과제는 담당자 화면에서 해당 없음으로 바꾸지 않는다.
    canNa: isOneOff(task) && task.status !== 'done' && task.status !== 'na',
  }
}
