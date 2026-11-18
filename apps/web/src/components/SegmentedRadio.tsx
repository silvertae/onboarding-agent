import { cn } from '@/lib/utils'

type Option<V extends string> = { value: V; label: string; disabled?: boolean }

// 세그먼트 모양의 라디오 그룹(시안 .seg). 네이티브 radio라서 ←/→ 선택과 폼 동작을 브라우저가 맡는다.
// 그룹 이름은 바깥 fieldset의 legend(권장)나 label/labelledBy로 붙인다.
export function SegmentedRadio<V extends string>({
  name,
  options,
  value,
  onChange,
  label,
  labelledBy,
  className,
}: {
  name: string
  options: Option<V>[]
  value: V
  onChange: (value: V) => void
  label?: string
  labelledBy?: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      className={cn('grid auto-cols-fr grid-flow-col gap-0.5 rounded-[10px] bg-secondary p-[3px]', className)}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'cursor-pointer rounded-lg px-3 py-1.5 text-center text-sm text-[var(--text-secondary)]',
            // 읽기 전용(system.md): 막혀도 고른 값은 그대로 읽히게 두고, 고르지 않은 값만 흐리게 한다
            'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled:not(:checked)]:opacity-40',
            'has-[:checked]:bg-card has-[:checked]:font-semibold has-[:checked]:text-foreground has-[:checked]:shadow-sm',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            disabled={option.disabled}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}
