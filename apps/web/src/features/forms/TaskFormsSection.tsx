import { Download, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { downloadTaskFile, useTemplateFiles, type TaskFile } from '@/lib/taskFiles'
import { FileRow } from './FileRow'

const FAIL_TEXT = '파일을 내려받지 못했어요. 다시 시도해 주세요.'

// S3 "작성할 서식". 서식이 없으면 그리지 않는다. 잠긴 과제·완료한 과제에서도 받을 수 있다.
export function TaskFormsSection({ templateId }: { templateId: string }) {
  const { data: files } = useTemplateFiles(templateId)
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set())
  // 상태 갱신 전 두 번째 클릭도 막는다
  const inFlight = useRef(new Set<string>())

  if (!files || files.length === 0) return null

  async function download(file: TaskFile) {
    if (inFlight.current.has(file.id)) return
    inFlight.current.add(file.id)
    setBusyIds((s) => new Set(s).add(file.id))
    setFailedIds((s) => {
      const next = new Set(s)
      next.delete(file.id)
      return next
    })
    try {
      await downloadTaskFile(file)
    } catch {
      setFailedIds((s) => new Set(s).add(file.id))
    } finally {
      inFlight.current.delete(file.id)
      setBusyIds((s) => {
        const next = new Set(s)
        next.delete(file.id)
        return next
      })
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border px-5 py-6 sm:px-7">
      <h3 className="text-row font-semibold">작성할 서식</h3>
      <ul className="overflow-hidden rounded-xl border border-border bg-card">
        {files.map((file) => {
          const busy = busyIds.has(file.id)
          const label = `${file.file_name} 내려받기`
          return (
            <FileRow
              key={file.id}
              file={file}
              error={failedIds.has(file.id) ? FAIL_TEXT : undefined}
              actions={
                <>
                  {/* 모바일은 44px 아이콘 버튼, 데스크톱은 44px 글자 버튼(system.md). CSS로만 전환한다. */}
                  <Button
                    variant="outline"
                    size="icon-lg"
                    disabled={busy}
                    aria-label={label}
                    className="sm:hidden"
                    onClick={() => void download(file)}
                  >
                    {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download aria-hidden />}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={busy}
                    aria-label={label}
                    className="hidden sm:inline-flex"
                    onClick={() => void download(file)}
                  >
                    {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download aria-hidden />}
                    {busy ? '내려받는 중' : '내려받기'}
                  </Button>
                </>
              }
            />
          )
        })}
      </ul>
    </div>
  )
}
