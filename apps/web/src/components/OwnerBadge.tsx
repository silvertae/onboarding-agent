import { Badge } from '@/components/ui/badge'
import type { Enums } from '@/lib/database.types'
import { OWNER_LABEL } from '@/lib/labels'

type Props = {
  // 경영지원 과제면 부서, 팀 과제면 팀 이름(teams.name)
  department: Enums<'ops_department'> | null
  teamName?: string | null
  className?: string
}

export function OwnerBadge({ department, teamName, className }: Props) {
  const label = department ? OWNER_LABEL[department] : (teamName ?? '소속 팀')
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}
