import type { RefObject } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { clauseTitle, type ClauseSource } from './useChatStream'

const CLAUSE_NOTE = '담당자가 검토한 답이 아니라 규정 원문에서 찾은 내용이에요. 정확한 적용은 담당 부서에 확인해 주세요.'

// 규정 원문 한 조항을 보여 주는 창. sm 미만에서는 화면 아래에 붙은 시트, sm부터는 가운데 창이다.
export function ClauseDialog({
  clause,
  open,
  onOpenChange,
  returnFocusRef,
}: {
  clause: ClauseSource | null
  open: boolean
  onOpenChange: (open: boolean) => void
  // 트리거가 없어서 Radix가 포커스를 돌려줄 곳을 모른다. 연 칩을 직접 알려 준다.
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {clause && (
        <DialogContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            if (!returnFocusRef?.current) return
            event.preventDefault()
            returnFocusRef.current.focus()
          }}
          className={cn(
            'max-h-[85dvh] overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4',
            // 모바일: 아래 시트(꽉 찬 너비, 위쪽만 둥근 모서리)
            'top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 rounded-t-xl rounded-b-none',
            // sm부터: 가운데 창
            'sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl',
          )}
        >
          <DialogHeader>
            <p className="text-xs text-muted-foreground">{clause.document_title}</p>
            <DialogTitle>{clauseTitle(clause)}</DialogTitle>
            <DialogDescription className="sr-only">{clause.document_title} 규정 원문</DialogDescription>
          </DialogHeader>
          <p className="rounded-xl border border-border bg-surface-subtle px-4 py-3.5 text-sm whitespace-pre-wrap">
            {clause.body}
          </p>
          <Alert variant="info" role="note">
            <AlertDescription>{CLAUSE_NOTE}</AlertDescription>
          </Alert>
          <DialogFooter className="rounded-b-none sm:rounded-b-xl">
            <DialogClose asChild>
              <Button variant="outline" size="lg">
                닫기
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
