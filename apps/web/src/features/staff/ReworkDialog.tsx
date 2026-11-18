import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  // 사유를 보내는 함수. 성공하면 true(입력 칸을 비운다).
  onSubmit: (reason: string) => Promise<boolean> | boolean
  disabled?: boolean
  // 어떤 과제에 대한 요청인지 라벨 옆에 보여 준다(S6).
  taskTitle?: string
  submitLabel?: string
  onCancel?: () => void
  // 보내기 버튼 옆에 함께 놓을 버튼(S9의 "확인 (완료 처리)")
  extraActions?: ReactNode
}

// 보완 요청 사유 입력. 시안(S6·S9)대로 팝업이 아니라 패널 안에 펼쳐 둔다.
// 사유가 비어 있거나 공백뿐이면 보낼 수 없다(서버 request_rework도 같은 규칙).
export function ReworkDialog({ onSubmit, disabled, taskTitle, submitLabel = '보완 요청', onCancel, extraActions }: Props) {
  const id = useId()
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()

  async function send() {
    if (!trimmed || disabled) return
    if (await onSubmit(trimmed)) setReason('')
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        보완 요청 사유 <span className="font-normal text-muted-foreground">보완 요청 시 필수{taskTitle ? ` — ${taskTitle}` : ''}</span>
      </label>
      <Textarea
        id={id}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="신입에게 보여질 사유를 적어 주세요"
        maxLength={500}
        disabled={disabled}
      />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={disabled}>
            취소
          </Button>
        )}
        <Button type="button" variant="secondary" disabled={!trimmed || disabled} onClick={() => void send()}>
          {submitLabel}
        </Button>
        {extraActions}
      </div>
    </div>
  )
}
