import { useId, useState } from 'react'
import { SegmentedRadio } from '@/components/SegmentedRadio'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Enums } from '@/lib/database.types'
import { useTaskActions, type TaskView } from '@/lib/tasks'
import { isoToLocalInput, localInputToIso } from './format'
import { ASSESSMENT_LABEL } from './teamTasks'
import { ErrorText, Panel } from './ui'
import { useGuardedAction } from './useGuardedAction'

type Choice = 'none' | Enums<'assessment_result'>

type FormValues = { scheduled: string; location: string; choice: Choice; note: string }
type Field = keyof FormValues
const FIELDS: Field[] = ['scheduled', 'location', 'choice', 'note']

function serverValues(task: TaskView): FormValues {
  return {
    scheduled: isoToLocalInput(task.scheduled_at),
    location: task.location ?? '',
    choice: task.assessment_result ?? 'none',
    note: task.assessment_note ?? '',
  }
}

function sameValues(a: FormValues, b: FormValues): boolean {
  return FIELDS.every((key) => a[key] === b[key])
}

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'none', label: '미기록' },
  { value: 'pass', label: ASSESSMENT_LABEL.pass },
  { value: 'needs_followup', label: ASSESSMENT_LABEL.needs_followup },
]

// 평가 과제(간단 코딩테스트, JS 기본기 테스트)의 일정·장소·결과·메모 기록.
// 결과를 고르지 않고 저장하면 일정만 저장되고(result=null), 결과를 고르면 과제가 완료된다(record_assessment).
export function AssessmentCard({ task }: { task: TaskView }) {
  const { recordAssessment } = useTaskActions()
  const { busy, error, run } = useGuardedAction()
  const id = useId()
  const server = serverValues(task)
  // base = 폼을 마지막으로 맞춘 서버 값. 서버 값이 바뀌면(다른 탭·담당자 저장, realtime) 손대지 않은 칸만 따라간다.
  const [base, setBase] = useState(server)
  const [form, setForm] = useState(server)
  const [saved, setSaved] = useState(false)
  if (!sameValues(base, server)) {
    setBase(server)
    setForm((current) => {
      const next = { ...current }
      for (const key of FIELDS) if (current[key] === base[key]) (next as Record<Field, string>)[key] = server[key]
      return next
    })
  }
  const { scheduled, location, choice, note } = form
  const set = <K extends Field>(key: K, value: FormValues[K]) => {
    setSaved(false)
    setForm((f) => ({ ...f, [key]: value }))
  }

  // record_assessment는 비운 일정·장소를 무시하고 기존 값을 유지한다(coalesce). 지운 것처럼 보이지 않게 저장을 막는다.
  const clearsSaved = (base.scheduled !== '' && scheduled === '') || (base.location.trim() !== '' && location.trim() === '')
  // 결과도 같다: 기록된 결과는 미기록으로 되돌릴 수 없다(coalesce로 기존 결과·완료 상태 유지).
  const resultRecorded = base.choice !== 'none'
  const unrecords = resultRecorded && choice === 'none'

  // 선행 과제 대기·해당 없음이면 서버가 거절한다.
  const locked = task.status === 'blocked' || task.status === 'na'
  const disabled = locked || busy

  async function save() {
    if (clearsSaved || unrecords) return
    setSaved(false)
    const ok = await run(() =>
      recordAssessment(task.id, {
        result: choice === 'none' ? null : choice,
        note: note.trim(),
        scheduledAt: localInputToIso(scheduled),
        location: location.trim() || undefined,
      }),
    )
    setSaved(ok)
  }

  return (
    <Panel aria-label={task.template.title}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
        <h2 className="text-lead font-semibold">{task.template.title}</h2>
        {task.assessment_result ? (
          <Badge variant={task.assessment_result === 'pass' ? 'done' : 'rework'}>{ASSESSMENT_LABEL[task.assessment_result]}</Badge>
        ) : (
          <StatusBadge status={task.status} completionMode={task.template.completion_mode} />
        )}
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-at`} className="text-sm font-semibold">
              일정
            </label>
            <Input id={`${id}-at`} type="datetime-local" value={scheduled} onChange={(e) => set('scheduled', e.target.value)} disabled={disabled} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-loc`} className="text-sm font-semibold">
              장소
            </label>
            <Input
              id={`${id}-loc`}
              value={location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="장소"
              maxLength={100}
              disabled={disabled}
            />
          </div>
        </div>

        <fieldset disabled={disabled} className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold">결과</legend>
          <SegmentedRadio
            name={`${id}-result`}
            label="결과"
            options={CHOICES.map((c) => ({ ...c, disabled: c.value === 'none' && resultRecorded }))}
            value={choice}
            onChange={(next) => set('choice', next)}
          />
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-note`} className="text-sm font-semibold">
            메모
          </label>
          <Textarea
            id={`${id}-note`}
            value={note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="신입에게도 보여요"
            maxLength={1000}
            disabled={disabled}
          />
        </div>

        {locked && <p className="text-sm text-muted-foreground">선행 과제가 끝나면 기록할 수 있어요.</p>}
        {clearsSaved && <p className="text-sm text-destructive">저장된 일정·장소는 지울 수 없어요. 새 값으로 바꿔 주세요.</p>}
        {resultRecorded && <p className="text-xs text-muted-foreground">기록된 결과는 미기록으로 되돌릴 수 없어요. 통과 / 보충 필요 사이에서만 바꿀 수 있어요.</p>}
        {error && <ErrorText>{error}</ErrorText>}
        {saved && (
          <p role="status" className="text-sm text-st-done-fg">
            저장했어요.
          </p>
        )}

        <div className="flex justify-end">
          <Button type="button" disabled={disabled || clearsSaved || unrecords} onClick={() => void save()}>
            저장
          </Button>
        </div>
      </div>
    </Panel>
  )
}
