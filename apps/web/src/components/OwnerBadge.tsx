import { Badge } from '@/components/ui/badge'
import type { Enums } from '@/lib/database.types'
import { OWNER_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'

type Props = {
  // 경영지원 과제면 부서, 팀 과제면 팀 이름(teams.name)
  department: Enums<'ops_department'> | null
  teamName?: string | null
  className?: string
}

// 시안 .own / .own-ai: 소속 팀 과제는 파란 틴트, 경영지원 부서 과제는 테두리형
export function OwnerBadge({ department, teamName, className }: Props) {
  const label = department ? OWNER_LABEL[department] : (teamName ?? '소속 팀')
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-md',
        department
          ? 'border-border bg-card text-[var(--text-secondary)]'
          : 'border-own-team-border bg-own-team-bg text-own-team-fg',
        className,
      )}
    >
      {label}
    </Badge>
  )
}
