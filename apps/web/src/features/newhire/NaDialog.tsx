import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { TEXTAREA_CLASS } from './taskBodies/types'

type Props = {
  pending: boolean
  onCancel(): void
  onConfirm(reason: string): void
}

// "해당 없음" 사유 입력. 시안대로 과제 카드 안에 펼쳐지는 영역이다. 사유는 필수.
export function NaDialog({ pending, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const id = useId()
  const trimmed = reason.trim()

  return (
    <form
      aria-label="해당 없음 처리"
      className="flex flex-col gap-3 border-t border-border bg-[#fafafc] px-5 py-5 sm:px-7"
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed) onConfirm(trimmed)
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>
          해당 없음 사유
          <span className="text-[#a1261c]" aria-hidden>
            *
          </span>
        </Label>
        <textarea
          id={id}
          className={TEXTAREA_CLASS}
          value={reason}
          required
          placeholder="예: 등록할 피부양자가 없어요"
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={!trimmed || pending}>
          해당 없음으로 처리
        </Button>
      </div>
    </form>
  )
}
