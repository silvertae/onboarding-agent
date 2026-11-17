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
