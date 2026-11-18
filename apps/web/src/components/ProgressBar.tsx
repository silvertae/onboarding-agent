import { cn } from '@/lib/utils'

type ProgressBarProps = {
  /** 접근 가능한 이름(예: "전체 진행률") */
  label: string
  value: number
  max: number
  /** 기본 8px, sm 6px(카드 안 체크리스트) */
  size?: 'default' | 'sm'
  className?: string
}

// 진행 막대(시안 .bar). 채움은 width 대신 transform으로 옮겨 레이아웃을 다시 계산하지 않는다(system.md "모션").
// scaleX는 끝의 둥근 모서리까지 눌리므로, 꽉 찬 막대를 왼쪽으로 밀어 바탕 밖으로 숨긴다.
export function ProgressBar({ label, value, max, size = 'default', className }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  const hidden = Number(((1 - ratio) * 100).toFixed(2))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('overflow-hidden rounded-full bg-track', size === 'sm' ? 'h-1.5' : 'h-2', className)}
    >
      <div
        className="h-full w-full rounded-full bg-primary transition-transform duration-150 ease-out-ui motion-reduce:transition-none"
        style={{ transform: `translateX(-${hidden}%)` }}
      />
    </div>
  )
}
