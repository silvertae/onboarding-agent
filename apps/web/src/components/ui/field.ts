import { cva } from "class-variance-authority"

// 시안 .input 40 / .input-lg 44. 모바일은 16px(iOS 확대 방지), md부터 14·15px.
export const fieldVariants = cva(
  "w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
  {
    variants: {
      size: {
        default: "h-10 md:text-sm",
        lg: "h-11 md:text-row",
      },
    },
    defaultVariants: { size: "default" },
  }
)
