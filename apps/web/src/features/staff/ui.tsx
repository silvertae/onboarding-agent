// 도메인 B 화면에서 함께 쓰는 작은 UI 조각. 공통 components/ui를 건드리지 않으려고 여기에 둔다.
import type { ComponentProps, ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-[18px] border border-border bg-card', className)} {...props} />
}

// S6·S9 과제 표의 제목 칸. 이 신입에게만 추가한 과제는 제목 뒤에 "이 신입만" 배지(시안 .badge = Badge secondary)를 붙인다.
export function TaskTitle({ title, oneOff }: { title: string; oneOff: boolean }) {
  if (!oneOff) return title
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {title}
      <Badge variant="secondary">이 신입만</Badge>
    </span>
  )
}

export { PageHeader } from '@/components/PageHeader'

type TabItem<K extends string> = { key: K; label: string; count?: number }

// 세그먼트 탭(Radix Tabs, components/ui/tabs). 탭 목록과 패널이 같은 SegmentTabs 안에 있어야
// aria-controls·tabpanel이 이어진다. 화면 구조: SegmentTabs > (머리에 SegmentTabList) + SegmentTabPanel
export function SegmentTabs<K extends string>({
  value,
  onChange,
  className,
  children,
}: {
  value: K
  onChange: (key: K) => void
  className?: string
  children: ReactNode
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as K)} className={className}>
      {children}
    </Tabs>
  )
}

export function SegmentTabList<K extends string>({ items, label }: { items: TabItem<K>[]; label: string }) {
  return (
    <TabsList aria-label={label}>
      {items.map((item) => (
        <TabsTrigger key={item.key} value={item.key}>
          {item.label}
          {item.count !== undefined && ' '}
          {item.count !== undefined && (
            <span className="grid min-w-5 place-items-center rounded-full bg-disabled-foreground px-1.5 text-micro font-semibold text-white group-data-[state=active]/tab:bg-foreground">
              {item.count}
            </span>
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}

export const SegmentTabPanel = TabsContent

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-6 py-12 text-center text-sm text-muted-foreground">{children}</p>
}

// 저장·처리 같은 동작 오류의 인라인 문구. 목록을 불러오지 못한 오류는 components/LoadError를 쓴다.
export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  )
}
