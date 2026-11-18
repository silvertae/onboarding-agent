import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { fieldVariants } from "./field"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & { size?: "default" | "lg" }

// 브라우저 기본 select(키보드·모바일 휠 그대로)에 Input과 같은 높이·테두리와 화살표만 입힌다.
// className은 바깥 상자(너비·여백)에, 나머지 속성은 select에 붙는다.
function NativeSelect({ className, size, ...props }: NativeSelectProps) {
  return (
    <div data-slot="native-select" className={cn("relative w-full", className)}>
      <select data-slot="native-select-control" className={cn(fieldVariants({ size }), "appearance-none pr-9")} {...props} />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { NativeSelect }
