import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

// 시안 .tabs(세그먼트 탭). 키보드: ←/→로 이동하며 바로 선택, Tab은 선택된 탭 하나에만 멈춘다.
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] bg-secondary p-[3px] [scrollbar-width:none]", className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "group/tab inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm whitespace-nowrap text-[var(--text-secondary)] outline-none",
        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
