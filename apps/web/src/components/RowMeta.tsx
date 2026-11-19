import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// 좁은 화면(sm 미만) 표: 보조 칸은 WIDE_CELL로 숨기고, 그 값을 첫 칸 아래 RowMeta 한 줄로 옮긴다(system.md "좁은 화면", S13과 같은 방법).
export const WIDE_CELL = 'hidden sm:table-cell'

type Item = ReactNode | null | undefined | false

// 배지는 앞에, 값은 " · "로 잇는다. 빈 값은 건너뛴다. 강조가 필요한 값(기한 지남)은 span으로 넘긴다.
export function RowMeta({ badge, items, className }: { badge?: ReactNode; items: Item[]; className?: string }) {
  const shown = items.filter((item) => item !== null && item !== undefined && item !== false && item !== '')
  return (
    // 인라인 흐름: 배지 바로 뒤에 글자가 이어지고, 넘칠 때만 줄을 바꾼다(flex면 글자 묶음이 통째로 내려가 배지만 한 줄을 차지한다).
    <div data-testid="row-meta" className={cn('mt-1 text-xs leading-6 font-normal text-muted-foreground sm:hidden', className)}>
      {badge && <span className="mr-2 inline-flex align-middle">{badge}</span>}
      {shown.length > 0 && (
        <span>
          {shown.map((item, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              {item}
            </Fragment>
          ))}
        </span>
      )}
    </div>
  )
}
