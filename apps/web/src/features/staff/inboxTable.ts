// S9 부서 업무함의 탭 이름·차례와 내려받기 표. 화면(OpsInboxPage)과 내려받기가 같은 값을 쓴다.
import { STAFF_ONLY_TODO_LABEL, STATUS_LABEL } from '@/lib/labels'
import type { TaskView } from '@/lib/tasks'
import { daysLate, formatDateTime, isOverdue } from './format'
import type { Hire } from './hires'

// 'hires'(입사자별)는 과제가 아니라 입사자 한 줄씩 보여 주는 탭이다.
export type Tab = 'submitted' | 'overdue' | 'mine' | 'hires' | 'all'

export const TAB_LABEL: Record<Tab, string> = {
  submitted: '확인 대기',
  overdue: '기한 초과',
  mine: '내가 처리할 일',
  hires: '입사자별',
  all: '전체',
}

export const FINISHED = new Set(['done', 'na'])

// 지금 누가 움직여야 하는지(기한 초과 탭의 "차례" 칸)
export function turnLabel(task: TaskView): '신입' | '담당자' | '선행 과제 대기' {
  if (task.status === 'blocked') return '선행 과제 대기'
  if (task.status === 'submitted' || task.template.completion_mode === 'staff_only') return '담당자'
  return '신입'
}

// 내려받기 파일의 머리글과 행. 모든 칸은 문자열이다.
export function exportRows(tasks: TaskView[], hireById: Map<string, Hire>): { header: string[]; rows: string[][] } {
  const header = ['입사자', '팀', '과제', '상태', '차례', '제출 시각', '기한', '지난 일수']
  const rows = tasks.map((task) => {
    const hire = hireById.get(task.new_hire_id)
    const status =
      task.status === 'todo' && task.template.completion_mode === 'staff_only' ? STAFF_ONLY_TODO_LABEL : STATUS_LABEL[task.status]
    const late = !FINISHED.has(task.status) && isOverdue(task.due_date)
    return [
      hire?.full_name ?? '이름 없음',
      hire?.team?.name ?? '',
      task.template.title,
      status,
      turnLabel(task),
      task.submitted_at ? formatDateTime(task.submitted_at) : '',
      task.due_date ?? '',
      late ? String(daysLate(task.due_date!)) : '',
    ]
  })
  return { header, rows }
}
