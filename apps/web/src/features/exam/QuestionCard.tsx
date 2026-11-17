import { ArrowDown, ArrowUp, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AgentError } from '@/lib/agent'
import type { DraftQuestion } from './exams'

export const QUESTION_RETRY_MESSAGE = '문항을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'

function regenerateErrorMessage(error: unknown): { text: string; retry: boolean } {
  if (error instanceof AgentError && (error.status === 429 || error.status === 401 || error.status === 403)) {
    return { text: error.message, retry: false }
  }
  return { text: QUESTION_RETRY_MESSAGE, retry: true }
}

type Props = {
  number: number
  total: number
  question: DraftQuestion
  startEditing?: boolean
  disabled?: boolean
  onChange: (next: DraftQuestion) => void
  onRemove: () => void
  onMove: (delta: -1 | 1) => void
  onRegenerate: (instruction: string) => Promise<void>
}

export function QuestionCard({ number, total, question, startEditing = false, disabled, onChange, onRemove, onMove, onRegenerate }: Props) {
  const [editing, setEditing] = useState(startEditing)
  const [regenOpen, setRegenOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState<{ text: string; retry: boolean } | null>(null)
  const label = `${number}번 문항`
  const field = (key: keyof DraftQuestion) => `q${number}-${key}`

  async function regenerate() {
    setRegenerating(true)
    setRegenError(null)
    try {
      await onRegenerate(instruction.trim())
      setRegenOpen(false)
      setInstruction('')
      setEditing(false)
    } catch (error) {
      setRegenError(regenerateErrorMessage(error))
    } finally {
      setRegenerating(false)
    }
  }

  const busy = disabled || regenerating

  return (
    <article aria-label={label} className="rounded-[18px] border border-border bg-card p-5">
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{number}번</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-[var(--text-secondary)]">{question.points || 0}점</span>
        {regenerating && (
          <span role="status" className="text-xs text-primary">
            다시 만드는 중…
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="위로" title="위로" disabled={busy || number === 1} onClick={() => onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="아래로" title="아래로" disabled={busy || number === total} onClick={() => onMove(1)}>
            <ArrowDown />
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setEditing((v) => !v)}>
            <Pencil />
            {editing ? '수정 완료' : '수정'}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} aria-expanded={regenOpen} onClick={() => setRegenOpen((v) => !v)}>
            <RefreshCw />
            다시 만들기
          </Button>
          <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={onRemove}>
            <Trash2 />
            삭제
          </Button>
        </div>
      </header>

      {regenOpen && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-[var(--accent)] p-3">
          <div className="min-w-56 flex-1">
            <Label htmlFor={`q${number}-instruction`} className="mb-1 text-xs">
              지시 한 줄
            </Label>
            <Input
              id={`q${number}-instruction`}
              value={instruction}
              maxLength={200}
              placeholder="예: 배열 메서드를 쓰는 코드 읽기 문항으로"
              disabled={regenerating}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </div>
          <Button type="button" size="lg" disabled={busy} onClick={() => void regenerate()}>
            새 문항 만들기
          </Button>
        </div>
      )}

      {regenError && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#fde8e6] px-3 py-2 text-sm text-[#a1261c]">
          {regenError.text}
          {regenError.retry && (
            <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={busy} onClick={() => void regenerate()}>
              다시 시도
            </Button>
          )}
        </div>
      )}

      {editing ? (
        <div className="mt-4 grid gap-3">
          <div>
            <Label htmlFor={field('prompt')} className="mb-1">문제</Label>
            <Textarea id={field('prompt')} disabled={busy} value={question.prompt} rows={4} onChange={(e) => onChange({ ...question, prompt: e.target.value })} />
          </div>
          <div>
            <Label htmlFor={field('model_answer')} className="mb-1">모범 답안</Label>
            <Textarea id={field('model_answer')} disabled={busy} value={question.model_answer} rows={3} onChange={(e) => onChange({ ...question, model_answer: e.target.value })} />
          </div>
          <div>
            <Label htmlFor={field('rubric')} className="mb-1">채점 기준</Label>
            <Textarea id={field('rubric')} disabled={busy} value={question.rubric} rows={2} onChange={(e) => onChange({ ...question, rubric: e.target.value })} />
          </div>
          <div className="w-32">
            <Label htmlFor={field('points')} className="mb-1">배점</Label>
            <Input
              id={field('points')}
              disabled={busy}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={question.points || ''}
              onChange={(e) => onChange({ ...question, points: Math.trunc(Number(e.target.value)) || 0 })}
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 text-sm">
          <p className="font-mono text-[13px] leading-6 whitespace-pre-wrap">{question.prompt || '(문제를 입력해 주세요)'}</p>
          <dl className="grid gap-2 rounded-xl bg-muted p-3">
            <div>
              <dt className="text-xs font-semibold text-[var(--text-secondary)]">모범 답안</dt>
              <dd className="whitespace-pre-wrap">{question.model_answer}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[var(--text-secondary)]">채점 기준</dt>
              <dd className="whitespace-pre-wrap">{question.rubric}</dd>
            </div>
          </dl>
        </div>
      )}
    </article>
  )
}
