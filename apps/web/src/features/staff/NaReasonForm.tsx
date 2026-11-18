import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  pending: boolean
  onCancel(): void
  onConfirm(reason: string): void
}

// 한 사람용 과제를 해당 없음으로 뺄 때의 사유 입력(S6·S9 과제 상세 패널 아래 동작 줄).
// 신입 화면 S3의 NaDialog와 문구·규칙(사유 필수)이 같고, 크기만 담당자 화면(버튼 36)에 맞췄다.
export function NaReasonForm({ pending, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const id = useId()
  const trimmed = reason.trim()

  return (
    <form
      aria-label="해당 없음 처리"
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed && !pending) onConfirm(trimmed)
      }}
    >
      <Label htmlFor={id} className="text-sm font-semibold">
        해당 없음 사유
        <span className="text-st-rework-fg" aria-hidden>
          *
        </span>
      </Label>
      <Textarea
        id={id}
        autoFocus
        value={reason}
        required
        placeholder="신입에게 보여질 사유를 적어 주세요"
        disabled={pending}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={!trimmed || pending}>
          해당 없음으로 처리
        </Button>
      </div>
    </form>
  )
}
