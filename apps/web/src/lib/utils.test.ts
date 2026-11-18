import { describe, expect, it } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("조건부 클래스를 합친다", () => {
    const isActive = (n: number) => n > 1
    expect(cn("a", isActive(0) && "b", undefined, null, { c: true, d: false }, ["e"])).toBe("a c e")
  })

  it("충돌하는 Tailwind 클래스는 뒤의 것을 남긴다", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4")
    expect(cn("text-sm text-red-500", "text-blue-500")).toBe("text-sm text-blue-500")
  })
})

// index.css @theme의 글자 단계(text-micro … text-page)를 tailwind-merge가 글자 크기로 알아야 한다.
// 모르면 색 클래스로 보고, 함께 쓴 글자색과 충돌한다며 크기를 지운다.
describe("cn 글자 단계", () => {
  it.each(["micro", "label", "row", "lead", "section", "title", "page"])("text-%s는 글자색과 함께 써도 남는다", (step) => {
    expect(cn(`text-${step} text-[var(--text-secondary)]`)).toBe(`text-${step} text-[var(--text-secondary)]`)
    expect(cn(`text-${step}`, "text-foreground")).toBe(`text-${step} text-foreground`)
  })

  it("글자 단계끼리는 나중 것이 이긴다", () => {
    expect(cn("text-base text-sm", "text-title")).toBe("text-title")
    expect(cn("text-label", "text-row")).toBe("text-row")
  })
})
