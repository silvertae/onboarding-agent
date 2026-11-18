import { cn } from '@/lib/utils'

type Item<V extends string> = { value: V; label: string }

// 목록을 거르는 필터 칩(시안 .chip). 탭이 아니므로 role=tab 대신 버튼 + aria-pressed를 쓴다.
export function FilterChips<V extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: Item<V>[]
  value: V
  onChange: (value: V) => void
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {items.map((item) => {
        const on = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(item.value)}
            className={cn(
              'rounded-full border border-input bg-card px-3 py-1 text-[13px] text-[var(--text-secondary)] outline-none',
              'hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              on && 'border-foreground bg-foreground text-white hover:border-foreground hover:text-white',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
