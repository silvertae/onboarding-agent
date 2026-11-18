// 도메인 B 화면에서 함께 쓰는 작은 UI 조각. 공통 components/ui를 건드리지 않으려고 여기에 둔다.
import type { ComponentProps, ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-[18px] border border-border bg-card', className)} {...props} />
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

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  )
}

export function LoadingText() {
  return (
    <p role="status" className="px-6 py-12 text-center text-sm text-muted-foreground">
      불러오는 중…
    </p>
  )
}
