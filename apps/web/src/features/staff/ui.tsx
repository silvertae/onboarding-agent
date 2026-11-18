// 도메인 B 화면에서 함께 쓰는 작은 UI 조각. 공통 components/ui를 건드리지 않으려고 여기에 둔다.
import type { ComponentProps, ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const fieldClass =
  'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldClass, 'min-h-20 resize-y', className)} {...props} />
}

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(fieldClass, 'h-10 py-0 pr-8', className)} {...props} />
}

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-[18px] border border-border bg-card', className)} {...props} />
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

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
            <span className="grid min-w-5 place-items-center rounded-full bg-disabled-foreground px-1.5 text-[11px] font-semibold text-white group-data-[state=active]/tab:bg-foreground">
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
