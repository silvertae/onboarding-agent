import type { ReactNode } from 'react'

// 페이지 머리: 제목(28/600) + 설명 + 오른쪽 동작. 직원·관리자 화면이 함께 쓴다.
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-page font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
