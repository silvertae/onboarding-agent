import type { Enums } from '@/lib/database.types'
import { formatDateTime } from '../format'
import type { BodyProps } from './types'

const RESULT_LABEL: Record<Enums<'assessment_result'>, string> = { pass: '통과', needs_followup: '보충 필요' }

// assessment: 교육 담당자가 일정·장소·결과를 기록한다. 신입은 보기만 한다.
export function AssessmentBody({ task, children }: BodyProps) {
  const rows = [
    { label: '일정', value: task.scheduled_at ? formatDateTime(task.scheduled_at) : '아직 정해지지 않았어요' },
    { label: '장소', value: task.location ?? '아직 정해지지 않았어요' },
    { label: '결과', value: task.assessment_result ? RESULT_LABEL[task.assessment_result] : '아직 기록되지 않았어요' },
  ]
  return (
    <>
      <div className="flex flex-col gap-3 border-t border-border px-5 py-6 sm:px-7">
        <h3 className="text-row font-semibold">평가 정보</h3>
        <dl className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
          {task.assessment_note && (
            <div className="contents">
              <dt className="text-muted-foreground">메모</dt>
              <dd className="whitespace-pre-wrap">{task.assessment_note}</dd>
            </div>
          )}
        </dl>
        <p className="rounded-lg bg-accent px-3.5 py-2.5 text-label text-accent-foreground">
          교육 담당자가 결과(통과 / 보충 필요)와 메모를 기록해요.
        </p>
      </div>
      {children({ ready: false })}
    </>
  )
}
