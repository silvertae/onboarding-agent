import { useState } from 'react'
import type { BodyProps } from './types'

function initialChecked(result: unknown): string[] {
  const checked = (result as { checked?: unknown } | null)?.checked
  return Array.isArray(checked) ? checked.filter((v): v is string => typeof v === 'string') : []
}

// setup: 하위 체크리스트를 전부 체크해야 완료할 수 있다. 제출 값은 {checked: [...]}.
export function ChecklistBody({ task, disabled, children }: BodyProps) {
  const items = Array.isArray(task.template.checklist) ? task.template.checklist.map(String) : []
  const [checked, setChecked] = useState(() => new Set(initialChecked(task.result)))
  const done = items.filter((item) => checked.has(item))

  function toggle(item: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      return next
    })
  }

  return (
    <>
      <div className="flex flex-col gap-3 border-t border-border px-5 py-6 sm:px-7">
        <h3 className="text-row font-semibold">체크리스트</h3>
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item}>
              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={checked.has(item)}
                  disabled={disabled}
                  onChange={() => toggle(item)}
                />
                {item}
              </label>
            </li>
          ))}
        </ul>
        <span className="text-xs text-muted-foreground">
          {done.length} / {items.length} · 전부 체크하면 완료할 수 있어요
        </span>
      </div>
      {children({ result: { checked: done }, ready: items.length > 0 && done.length === items.length })}
    </>
  )
}
