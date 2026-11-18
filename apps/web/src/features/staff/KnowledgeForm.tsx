import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { KnowledgeStatus } from './knowledge'
import { ErrorText, Textarea } from './ui'

export type KnowledgeValues = { question: string; answer: string; category: string }

type Props = {
  // resolve: 미답변에 답 등록(게시만 가능), create·edit: 지식 추가·수정
  mode: 'resolve' | 'create' | 'edit'
  initial: KnowledgeValues
  // 역할로 정해진 범위 이름(교육 담당자 "AI팀", 경영지원 "회사 공통"). 고를 수 없다.
  scopeLabel: string
  busy?: boolean
  error?: string | null
  onSubmit: (values: KnowledgeValues, status: KnowledgeStatus) => void
  onCancel: () => void
}

const SOURCE_LABEL = { resolve: '미답변에서 가져옴', create: '새 지식', edit: '수정' } as const

export function KnowledgeForm({ mode, initial, scopeLabel, busy, error, onSubmit, onCancel }: Props) {
  const id = useId()
  const [values, setValues] = useState(initial)
  // 질문과 답변이 공백뿐이면 저장할 수 없다(서버 resolve_unanswered도 같은 규칙).
  const ready = values.question.trim() !== '' && values.answer.trim() !== ''
  const disabled = !ready || busy

  const set = (key: keyof KnowledgeValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }))

  return (
    <aside aria-label="지식 작성" className="flex flex-col rounded-[18px] border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-[17px] font-semibold">지식 작성</h2>
        <span className="text-xs text-muted-foreground">{SOURCE_LABEL[mode]}</span>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-q`} className="text-sm font-semibold">
            질문
          </label>
          <Input id={`${id}-q`} value={values.question} onChange={set('question')} maxLength={300} disabled={busy} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-a`} className="text-sm font-semibold">
            답변
          </label>
          <Textarea id={`${id}-a`} value={values.answer} onChange={set('answer')} className="min-h-32" maxLength={2000} disabled={busy} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-c`} className="text-sm font-semibold">
              분류
            </label>
            <Input id={`${id}-c`} value={values.category} onChange={set('category')} placeholder="예: 복지·생활" maxLength={50} disabled={busy} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span id={`${id}-s`} className="text-sm font-semibold">
              범위
            </span>
            <p aria-labelledby={`${id}-s`} className="flex h-9 items-center rounded-lg bg-secondary px-3 text-sm">
              {scopeLabel}
            </p>
          </div>
        </div>

        {mode === 'resolve' && (
          <p className="rounded-xl border border-alert-info-border bg-alert-info-bg px-4 py-3 text-sm text-alert-info-fg">
            게시하면 이 미답변은 해결됨으로 바뀌고, 같은 질문에 바로 답해요.
          </p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
        <Button type="button" variant="ghost" size="lg" className="px-4" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        {mode !== 'resolve' && (
          <Button type="button" variant="secondary" size="lg" className="px-4" disabled={disabled} onClick={() => onSubmit(values, 'draft')}>
            초안 저장
          </Button>
        )}
        <Button type="button" size="lg" className="px-5" disabled={disabled} onClick={() => onSubmit(values, 'published')}>
          게시
        </Button>
      </div>
    </aside>
  )
}
