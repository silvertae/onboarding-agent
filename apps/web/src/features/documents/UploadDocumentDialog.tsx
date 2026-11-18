import { TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorText } from '@/features/staff/ui'
import { useGuardedAction } from '@/features/staff/useGuardedAction'
import { checkDocumentFile, useDocumentActions, type PolicyDocument } from './documents'

const UPLOAD_FAILED = '올리지 못했어요. 잠시 후 다시 시도해 주세요.'
const HINT = 'docx, pdf · 파일당 10MB까지 · 글자가 있는 파일만 읽을 수 있어요(스캔본 제외)'
const WARNING = '가상 문서만 올려 주세요. 실명·연락처 같은 개인정보나 실제 사내 규정은 올리지 않아요.'

function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  // 범위 안내: "회사 공통 · 경영지원 담당자가 관리해요" / "{팀 이름} · 교육 담당자가 관리해요"
  scopeText: string
  // 올리기에 성공해 창을 닫은 뒤. 색인 호출이 실패했다면 indexError에 문구가 담긴다.
  onUploaded(document: PolicyDocument, indexError: string | null): void
}

// S14 "규정 문서 올리기". 범위는 역할로 정해져 글자로만 보인다. 올리면 행 → 파일 → 색인 순서로 처리한다(useDocumentActions.upload).
export function UploadDocumentDialog({ open, onOpenChange, scopeText, onUploaded }: Props) {
  const { upload } = useDocumentActions()
  const action = useGuardedAction()
  const id = useId()
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)

  // 열 때마다 빈 칸으로 시작한다(실패한 뒤 닫았다 열어도 이전 입력·문구가 남지 않게).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setTitle('')
      setFile(null)
      action.clearError()
    }
  }

  const fileError = file ? checkDocumentFile(file) : null
  const canSubmit = Boolean(file) && !fileError && title.trim() !== '' && !action.busy

  function changeOpen(next: boolean) {
    if (action.busy) return // 올리는 동안에는 닫지 않는다(Esc·바깥 누르기 포함)
    onOpenChange(next)
  }

  function pick(next: File | null) {
    setFile(next)
    action.clearError()
    if (next) setTitle(baseName(next.name))
  }

  async function submit() {
    if (!file || !canSubmit) return
    let created: { document: PolicyDocument; indexError: string | null } | null = null
    const ok = await action.run(async () => {
      try {
        created = await upload(title.trim(), file)
      } catch (err) {
        throw new Error(UPLOAD_FAILED, { cause: err })
      }
    })
    if (!ok || !created) return
    const { document, indexError } = created
    onOpenChange(false)
    onUploaded(document, indexError)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[18px] p-0 sm:max-w-md">
        <DialogHeader className="gap-1.5 px-6 pt-6">
          <DialogTitle className="text-lead leading-snug font-semibold">규정 문서 올리기</DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">올리면 조항으로 나눠 두고, 신입 채팅이 조항을 근거로 답해요.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-5 pb-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-title`}>문서 이름</Label>
            <Input id={`${id}-title`} value={title} disabled={action.busy} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm leading-none font-medium">범위</span>
            <span className="text-sm text-[var(--text-secondary)]">{scopeText}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-file`}>파일</Label>
            <Input
              id={`${id}-file`}
              type="file"
              accept=".docx,.pdf"
              disabled={action.busy}
              aria-describedby={`${id}-hint`}
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {HINT}
            </p>
            {fileError && <ErrorText>{fileError}</ErrorText>}
          </div>
          <p className="flex items-start gap-1.5 text-xs text-alert-warn-fg">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {WARNING}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
          {action.error && (
            <div className="mr-auto">
              <ErrorText>{action.error}</ErrorText>
            </div>
          )}
          <Button type="button" size="sm" variant="ghost" disabled={action.busy} onClick={() => changeOpen(false)}>
            취소
          </Button>
          <Button type="button" size="sm" disabled={!canSubmit} onClick={() => void submit()}>
            {action.busy ? '올리는 중…' : '올리기'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
