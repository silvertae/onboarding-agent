import { blockedBy, type TaskView } from '@/lib/tasks'

// 잠긴 과제 안내: "근태·결재 시스템 가입 완료 후 열림"
export function lockedHint(task: TaskView, all: TaskView[]): string | null {
  if (task.status !== 'blocked') return null
  const titles = blockedBy(task, all).map((t) => t.template.title)
  return titles.length ? `${titles.join(', ')} 완료 후 열림` : null
}
