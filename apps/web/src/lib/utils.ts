import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// index.css @theme의 글자 단계(--text-*)를 글자 크기로 알려 준다. 모르면 색 클래스로 보고 글자색과 함께 쓸 때 지운다.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "label", "row", "lead", "section", "title", "page"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
