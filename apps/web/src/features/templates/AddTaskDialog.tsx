import { Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { Hire } from '@/features/staff/hires'
import { ErrorText } from '@/features/staff/ui'
import { useGuardedAction } from '@/features/staff/useGuardedAction'
import { TemplateForm } from './TemplateForm'
import { cleanInput, isTemplateInputValid, NEW_TEMPLATE_INPUT } from './templateInput'
import { useTemplateActions, type TemplateInput } from './templates'

const ADDED = '추가했어요'
const ADD_FAILED = '추가하지 못했어요. 다시 시도해 주세요.'

type Props = {
  hire: Hire
  open: boolean
  onOpenChange(open: boolean): void
  // 평가 종류는 교육 담당자만(S6). 경영지원(S9)에게는 없다.
  allowAssessment: boolean
  // 추가에 성공해 대화 상자를 닫은 뒤
  onAdded?(): void
  // 대화 상자를 여는 버튼. Dialog 안에 두어야 닫을 때 초점이 이 버튼으로 돌아온다.
  trigger?: ReactNode
}

// "이 신입에게 과제 추가"(S6·S9). 칸은 S12 편집 칸에서 선행 과제를 뺀 것이고, 기본값도 S12 새 과제와 같다.
// add_task_for_hire가 이 신입만 쓰는 숨은 템플릿과 할 일을 만든다. 한 사람용 과제에 서식을 올리는 자리는 없다.
export function AddTaskDialog({ hire, open, onOpenChange, allowAssessment, onAdded, trigger }: Props) {
  const { addForHire } = useTemplateActions()
  const action = useGuardedAction()
  const [value, setValue] = useState<TemplateInput>(NEW_TEMPLATE_INPUT)

  // 열 때마다 빈 칸으로 시작한다(실패한 뒤 닫았다 열어도 이전 입력·문구가 남지 않게). 렌더 중에 맞춰 첫 화면부터 비어 있다.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValue(NEW_TEMPLATE_INPUT)
      action.clearError()
    }
  }

  function changeOpen(next: boolean) {
    if (action.busy) return // 추가하는 동안에는 닫지 않는다(Esc·바깥 누르기 포함)
    onOpenChange(next)
  }

  function change(next: TemplateInput) {
    setValue(next)
    action.clearError()
  }

  async function add() {
    const input = cleanInput(value)
    const added = await action.run(() =>
      addForHire(hire.id, input).catch((err: unknown) => {
        throw new Error(ADD_FAILED, { cause: err })
      }),
    )
    if (!added) return
    onOpenChange(false)
    onAdded?.()
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[18px] p-0 sm:max-w-2xl"
      >
        <DialogHeader className="gap-1.5 px-6 pt-6">
          <DialogTitle className="text-lead leading-snug font-semibold">{`'${hire.full_name}'님에게 과제 추가`}</DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">이 신입에게만 들어가고, 바로 할 일로 보여요.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-6 pt-5 pb-6">
          <TemplateForm
            value={value}
            onChange={change}
            lockedFields={false}
            allowAssessment={allowAssessment}
            showPrerequisites={false}
            prerequisiteOptions={[]}
            compact
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
          {action.error && (
            <div className="mr-auto">
              <ErrorText>{action.error}</ErrorText>
            </div>
          )}
          <Button type="button" variant="secondary" disabled={action.busy} onClick={() => changeOpen(false)}>
            취소
          </Button>
          <Button type="button" disabled={action.busy || !isTemplateInputValid(value)} onClick={() => void add()}>
            추가
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// S6 "팀 과제" 머리·S9 입사자 필터 옆의 버튼. 추가하면 대화 상자가 닫히고 버튼 왼쪽에 "추가했어요"가 남는다.
export function AddTaskButton({ hire, allowAssessment }: { hire: Hire; allowAssessment: boolean }) {
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState(false)

  return (
    <div className="flex items-center gap-3">
      {added && (
        <p role="status" className="text-sm text-st-done-fg">
          {ADDED}
        </p>
      )}
      <AddTaskDialog
        hire={hire}
        open={open}
        onOpenChange={setOpen}
        allowAssessment={allowAssessment}
        onAdded={() => setAdded(true)}
        trigger={
          <Button type="button" variant="secondary" onClick={() => setAdded(false)}>
            <Plus aria-hidden />이 신입에게 과제 추가
          </Button>
        }
      />
    </div>
  )
}
