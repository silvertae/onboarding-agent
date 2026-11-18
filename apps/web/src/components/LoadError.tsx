import { AlertCircle, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// 목록·화면을 불러오지 못했을 때(시안 S0 "상태"). 그 자리에서 다시 불러온다(query.refetch).
// 저장·처리 같은 동작 오류는 이것을 쓰지 않고 버튼 옆 인라인 문구로 둔다.
export function LoadError({
  children,
  onRetry,
  retrying = false,
  size = 'default',
  className,
}: {
  children: ReactNode
  onRetry?: () => void
  // 다시 불러오는 중(query.isFetching)이면 버튼을 막는다
  retrying?: boolean
  // 신입 화면(S2~S4)은 44px(lg)
  size?: 'default' | 'lg'
  className?: string
}) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle aria-hidden />
      <AlertDescription>{children}</AlertDescription>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={retrying}
          onClick={onRetry}
          className="col-start-2 mt-2 justify-self-start border-alert-err-border bg-card text-alert-err-fg hover:bg-alert-err-bg hover:text-alert-err-fg"
        >
          <RotateCw className={cn(retrying && 'animate-spin motion-reduce:animate-none')} aria-hidden />
          {retrying ? '다시 불러오는 중…' : '다시 불러오기'}
        </Button>
      )}
    </Alert>
  )
}
