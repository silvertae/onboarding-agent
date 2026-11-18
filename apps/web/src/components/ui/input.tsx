import * as React from "react"
import { cn } from "@/lib/utils"
import { fieldVariants } from "./field"

type InputProps = Omit<React.ComponentProps<"input">, "size"> & { size?: "default" | "lg" }

function Input({ className, type, size, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldVariants({ size }),
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input }
