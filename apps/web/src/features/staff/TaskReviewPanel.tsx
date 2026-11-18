import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { OwnerBadge } from '@/components/OwnerBadge'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { useTaskActions, type TaskView } from '@/lib/tasks'
import { formatDateTime, hireDayLabel, submittedLabel } from './format'
import type { Hire } from './hires'
import { NaReasonForm } from './NaReasonForm'
import { reviewActions } from './reviewActions'
import { ReworkDialog } from './ReworkDialog'
import { SubmittedResult } from './SubmittedResult'
import { ErrorText } from './ui'
import { useGuardedAction } from './useGuardedAction'

type Props = {
  task: TaskView
  // 패널 머리에 입사자 이름·팀을 보여 줄 때(S9). S6처럼 한 신입 화면이면 생략한다.
  hire?: Hire
  onClose?: () => void
}

// 과제 하나의 확인 패널(S9 오른쪽 상세, S6 팀 과제 처리). 상태 변경은 useTaskActions(RPC)로만 한다.
export function TaskReviewPanel({ task, hire, onClose }: Props) {
  const { confirm, requestRework, markNa } = useTaskActions()
  const { busy, error, run } = useGuardedAction()
  const { canConfirm, canRework, canComplete, canNa } = reviewActions(task)
  // 한 사람용 과제의 "해당 없음": 누르면 동작 줄이 사유 입력으로 바뀐다(S3 신입 화면과 같은 흐름)
  const [naOpen, setNaOpen] = useState(false)
  // 초점 이동: 취소하면 "해당 없음" 버튼으로, 성공하면 패널 제목으로(사유 입력이 사라지므로)
  const naButtonRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const returnToNaButton = useRef(false)
  useEffect(() => {
    if (!naOpen && returnToNaButton.current) {
      returnToNaButton.current = false
      naButtonRef.current?.focus()
    }
  }, [naOpen])

  const confirmButton = (label: string) => (
    <Button type="button" disabled={busy} onClick={() => void run(() => confirm(task.id))}>
      <Check />
      {label}
    </Button>
  )
  const naButton = canNa && (
    <Button ref={naButtonRef} type="button" variant="ghost" disabled={busy} onClick={() => setNaOpen(true)}>
      해당 없음
    </Button>
  )

  async function sendNa(reason: string) {
    if (await run(() => markNa(task.id, reason))) {
      setNaOpen(false)
      headingRef.current?.focus()
    }
  }

  function cancelNa() {
    returnToNaButton.current = true
    setNaOpen(false)
  }

  return (
    <aside aria-label="과제 상세" className="flex flex-col rounded-[18px] border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          {hire && (
            <p className="text-xs text-muted-foreground">
              {[hire.full_name, hire.team?.name, hire.hire_date && `입사 ${hireDayLabel(hire.hire_date)}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <h2 ref={headingRef} tabIndex={-1} className="mt-0.5 text-lead font-semibold outline-none">{task.template.title}</h2>
        </div>
        {onClose && (
          <Button type="button" variant="ghost" size="icon" aria-label="상세 닫기" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} completionMode={task.template.completion_mode} />
          <OwnerBadge department={task.template.department} teamName={hire?.team?.name} />
          {task.submitted_at && (
            <span className="text-xs text-muted-foreground">
              {submittedLabel(task.template.completion_mode)} {formatDateTime(task.submitted_at)}
            </span>
          )}
        </div>

        {task.template.description && (
          <section>
            <h3 className="text-sm font-semibold">과제 안내</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{task.template.description}</p>
          </section>
        )}

        <section>
          <h3 className="text-sm font-semibold">신입이 제출한 내용</h3>
          <div className="mt-2">
            <SubmittedResult task={task} hire={hire} />
          </div>
        </section>

        {task.status === 'na' && (
          <section>
            <h3 className="text-sm font-semibold">해당 없음 사유</h3>
            <p className="mt-1 text-sm">{task.na_reason || '—'}</p>
          </section>
        )}

        {task.rework_reason && (task.status === 'rework' || task.status === 'submitted') && (
          <section>
            <h3 className="text-sm font-semibold">{task.status === 'rework' ? '보낸 보완 요청 사유' : '이전 보완 요청 사유'}</h3>
            <p className="mt-1 text-sm">{task.rework_reason}</p>
          </section>
        )}

        {task.template.kind === 'assessment' && <p className="text-sm text-muted-foreground">평가 결과는 평가 카드에서 기록해 주세요.</p>}

        {error && <ErrorText>{error}</ErrorText>}
      </div>

      {(canRework || canConfirm || canComplete || canNa) && (
        // 버튼이 긴 본문 아래로 밀려도 화면 아래에 붙어 보이게 한다(1440×900에서 첫 화면 밖으로 밀리던 문제)
        <div className="sticky bottom-0 z-10 rounded-b-[18px] border-t border-border bg-card px-5 py-4">
          {canNa && naOpen ? (
            <NaReasonForm pending={busy} onCancel={cancelNa} onConfirm={(reason) => void sendNa(reason)} />
          ) : canRework ? (
            <ReworkDialog
              disabled={busy}
              onSubmit={(reason) => run(() => requestRework(task.id, reason))}
              extraActions={
                <>
                  {naButton}
                  {canConfirm && confirmButton('확인 (완료 처리)')}
                </>
              }
            />
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {naButton}
              {canComplete && confirmButton('완료 처리')}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
