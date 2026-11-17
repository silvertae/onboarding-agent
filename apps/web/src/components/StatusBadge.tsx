import { Badge } from '@/components/ui/badge'
import type { Enums } from '@/lib/database.types'
import { STAFF_ONLY_TODO_LABEL, STATUS_LABEL } from '@/lib/labels'

type Props = {
  status: Enums<'task_status'>
  // staff_only 과제의 todo는 "담당자 처리 예정"으로 보여 준다.
  completionMode?: Enums<'completion_mode'>
  className?: string
}

export function StatusBadge({ status, completionMode, className }: Props) {
  const label = status === 'todo' && completionMode === 'staff_only' ? STAFF_ONLY_TODO_LABEL : STATUS_LABEL[status]
  return (
    <Badge variant={status} className={className}>
      {label}
    </Badge>
  )
}
