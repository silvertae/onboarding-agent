import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { fieldVariants } from "./field"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "default" | "lg"
  // "filter": 표 머리의 거르기(S9 입사자). 탭 묶음과 같은 회색 상자 안에 label을 두고, 그 label이 접근 이름이다.
  variant?: "default" | "filter"
  label?: string
}

// 브라우저 기본 select(키보드·모바일 휠 그대로)에 Input과 같은 높이·테두리와 화살표만 입힌다.
// className은 바깥 상자(너비·여백)에, 나머지 속성은 select에 붙는다.
function NativeSelect({ className, size, variant = "default", label, id, ...props }: NativeSelectProps) {
  const autoId = React.useId()
  // Chrome은 select를 마우스로 눌러도 :focus-visible로 본다. 마우스로 누른 뒤에는 링을 끄고, 키를 누르거나 포커스가 떠나면 다시 켠다.
  const [pointer, setPointer] = React.useState(false)
  if (variant === "filter") {
    const selectId = id ?? autoId
    return (
      <div
        data-slot="native-select"
        onPointerDown={() => setPointer(true)}
        onKeyDown={() => setPointer(false)}
        onBlur={() => setPointer(false)}
        className={cn(
          "group/filter relative inline-flex h-9.5 items-center gap-2 rounded-[10px] bg-secondary pr-2.5 pl-3.5 text-label",
          !pointer && "has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-ring",
          className
        )}
      >
        <label
          htmlFor={selectId}
          className="shrink-0 font-normal whitespace-nowrap text-[var(--text-secondary)] group-hover/filter:text-foreground"
        >
          {label}
        </label>
        <select
          id={selectId}
          data-slot="native-select-control"
          className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-6 font-semibold text-foreground outline-none"
          {...props}
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    )
  }
  return (
    <div data-slot="native-select" className={cn("relative w-full", className)}>
      <select id={id} data-slot="native-select-control" className={cn(fieldVariants({ size }), "appearance-none pr-9")} {...props} />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { NativeSelect }
