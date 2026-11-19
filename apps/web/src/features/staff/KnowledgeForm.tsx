import { FileText, Loader2, Sparkles } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import type { DraftClause, KnowledgeStatus } from './knowledge'
import { ErrorText } from './ui'
import { useGuardedAction } from './useGuardedAction'

export type KnowledgeValues = { question: string; answer: string; category: string }

type Props = {
  // resolve: 미답변에 답 등록(게시만 가능), create·edit: 지식 추가·수정
  mode: 'resolve' | 'create' | 'edit'
  initial: KnowledgeValues
  // 역할로 정해진 범위 이름(교육 담당자 "AI팀", 경영지원 "회사 공통"). 고를 수 없다.
  scopeLabel: string
  busy?: boolean
  error?: string | null
  // resolve 모드에서만: 현재 질문으로 규정 조항에서 답 초안을 찾는다. 근거가 없으면 null, 실패하면 던진다.
  onDraft?: (question: string, stillCurrent: () => boolean) => Promise<{ answer: string; category: string } | null>
  // 근거 조항(AI 초안에서 받았거나 저장된 것)
  clauses?: DraftClause[]
  // 이 폼에서 AI 초안을 받았다(고쳐도 유지). 검토 안내를 보인다.
  aiDraft?: boolean
  draftDisabledReason?: 'no-documents' | null
  onSubmit: (values: KnowledgeValues, status: KnowledgeStatus) => void
  onCancel: () => void
}

const SOURCE_LABEL = { resolve: '미답변에서 가져옴', create: '새 지식', edit: '수정' } as const

function clauseText(c: DraftClause): string {
  return [c.document_title, c.label, c.heading].filter(Boolean).join(' ')
}

export function KnowledgeForm({ mode, initial, scopeLabel, busy, error, onDraft, clauses = [], aiDraft, draftDisabledReason, onSubmit, onCancel }: Props) {
  const id = useId()
  const [values, setValues] = useState(initial)
  // 질문과 답변이 공백뿐이면 저장할 수 없다(서버 resolve_unanswered도 같은 규칙).
  const ready = values.question.trim() !== '' && values.answer.trim() !== ''
  const drafting = useGuardedAction()
  const questionRef = useRef(values.question)
  const [notFound, setNotFound] = useState(false)
  const disabled = !ready || busy || drafting.busy

  const set = (key: keyof KnowledgeValues) => (e: { target: { value: string } }) => {
    if (key === 'question') questionRef.current = e.target.value
    setValues((v) => ({ ...v, [key]: e.target.value }))
  }

  async function findDraft() {
    if (!onDraft) return
    setNotFound(false)
    let found = false
    const ok = await drafting.run(async () => {
      const sent = values.question.trim()
      const stillCurrent = () => questionRef.current.trim() === sent
      const draft = await onDraft(sent, stillCurrent)
      if (!draft) return
      found = true // 초안이 왔다(버려도 "근거 없음" 안내는 아니다)
      // 질문이 바뀌었으면 이 초안은 다른 질문의 것이다. 버린다.
      if (!stillCurrent()) return
      setValues((v) => ({ ...v, answer: draft.answer, category: draft.category.trim() || v.category }))
    })
    if (ok && !found) setNotFound(true)
  }

  return (
    <aside aria-label="지식 작성" className="flex flex-col rounded-[18px] border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-lead font-semibold">지식 작성</h2>
        <span className="text-xs text-muted-foreground">{SOURCE_LABEL[mode]}</span>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-q`} className="text-sm font-semibold">
            질문
          </label>
          <Input id={`${id}-q`} value={values.question} onChange={set('question')} maxLength={300} disabled={busy || drafting.busy} />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`${id}-a`} className="text-sm font-semibold">
              답변
            </label>
            {onDraft && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || drafting.busy || Boolean(draftDisabledReason) || values.question.trim() === ''}
                aria-describedby={draftDisabledReason ? `${id}-nodoc` : undefined}
                onClick={() => void findDraft()}
              >
                {drafting.busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles aria-hidden />}
                {drafting.busy ? '찾는 중…' : '규정에서 답 초안 찾기'}
              </Button>
            )}
          </div>
          {drafting.busy ? (
            <div aria-hidden className="flex min-h-32 flex-col gap-2.5 rounded-lg border border-input p-3">
              <Skeleton className="h-3 w-[92%]" />
              <Skeleton className="h-3 w-[80%]" />
              <Skeleton className="h-3 w-[45%]" />
            </div>
          ) : (
            <Textarea id={`${id}-a`} value={values.answer} onChange={set('answer')} className="min-h-32" maxLength={2000} disabled={busy} />
          )}
          {drafting.busy && (
            <p role="status" className="text-xs text-muted-foreground">
              규정 조항에서 근거를 찾고 있어요.
            </p>
          )}
          {draftDisabledReason === 'no-documents' && (
            <p id={`${id}-nodoc`} className="text-xs text-muted-foreground">
              올린 규정 문서가 없어요.{' '}
              <Link to="/documents" className="font-semibold text-primary">
                규정 문서
              </Link>
              에서 먼저 올려 주세요.
            </p>
          )}
          {clauses.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs text-muted-foreground">
              <span>근거 조항</span>
              {clauses.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 text-foreground">
                  <FileText className="size-3" aria-hidden />
                  {clauseText(c)}
                </span>
              ))}
            </div>
          )}
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
        {notFound && (
          <Alert variant="info" role="status" className="text-sm">
            올린 규정 문서에서 근거를 찾지 못했어요. 답을 직접 써 주세요.
          </Alert>
        )}
        {aiDraft && (
          <Alert variant="warning" role="note" className="text-sm">
            AI가 규정 조항으로 만든 초안이에요. 금액·기준이 조항과 맞는지 확인하고 게시해 주세요.
          </Alert>
        )}
        {drafting.error && <ErrorText>{drafting.error}</ErrorText>}
        {error && <ErrorText>{error}</ErrorText>}
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        {mode !== 'resolve' && (
          <Button type="button" variant="secondary" disabled={disabled} onClick={() => onSubmit(values, 'draft')}>
            초안 저장
          </Button>
        )}
        <Button type="button" disabled={disabled} onClick={() => onSubmit(values, 'published')}>
          게시
        </Button>
      </div>
    </aside>
  )
}
