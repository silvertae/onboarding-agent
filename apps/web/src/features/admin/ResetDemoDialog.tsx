import { RotateCcw } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resetDemo } from './users'

const CONFIRM_WORD = '초기화'
export const RESET_FAILED = '초기화하지 못했어요. 다시 시도해 주세요'

export function ResetDemoDialog({ onDone }: { onDone: () => void }) {
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const [error, setError] = useState<string | null>(null)

  function changeOpen(next: boolean) {
    if (busy) return // 진행 중에는 닫지 않는다
    setOpen(next)
    if (!next) {
      setTyped('')
      setError(null)
    }
  }

  async function run() {
    if (typed !== CONFIRM_WORD || running.current) return
    running.current = true
    setBusy(true)
    setError(null)
    try {
      await resetDemo()
      setOpen(false)
      setTyped('')
      onDone()
    } catch {
      setError(RESET_FAILED)
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="h-10 gap-2 border-destructive/40 px-4 text-destructive hover:text-destructive">
          <RotateCcw aria-hidden />
          데모 데이터 초기화
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>데모 데이터를 초기화할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            기본 계정의 온보딩 진행 상황과 지식·미답변·시험이 처음 상태로 돌아가요. 관리자가 만든 계정은 그대로 남아요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm">
            계속하려면 <strong>{CONFIRM_WORD}</strong>를 입력해 주세요.
          </label>
          <Input id={inputId} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
          <Button
            type="button"
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={typed !== CONFIRM_WORD || busy}
            aria-busy={busy || undefined}
            onClick={run}
          >
            {busy ? '초기화하는 중…' : CONFIRM_WORD}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
