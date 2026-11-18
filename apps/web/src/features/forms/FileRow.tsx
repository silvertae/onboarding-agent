import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatFileMeta, formExt, type TaskFile } from '@/lib/taskFiles'
import { cn } from '@/lib/utils'

type Props = {
  // 올리는 중인 파일(S12)은 아직 행이 없어 이름·크기만 넘긴다
  file: Pick<TaskFile, 'file_name' | 'size_bytes'>
  // 기본은 "Excel · 48KB". 담당자 화면은 올린 사람·날짜를 덧붙여 넘긴다.
  meta?: string
  badge?: ReactNode
  actions?: ReactNode
  // 행 아래에 보이는 오류 문구
  error?: string
  // 올리는 중(S12, 시안 .file.busy): 형식 아이콘 대신 도는 아이콘, 이름은 보조 색, 메타를 상태로 알린다
  busy?: boolean
}

// 이름이 길면 가운데(기본 이름 끝)를 줄이고 확장자는 남긴다. 이름은 텍스트로만 그린다.
function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot) } : { base: name, ext: '' }
}

// 서식 파일 한 줄. 새 입사자 S3와 담당자 S12가 함께 쓴다(시안 .file).
export function FileRow({ file, meta, badge, actions, error, busy = false }: Props) {
  const { base, ext } = splitName(file.file_name)
  const Icon = formExt(file.file_name) === 'xlsx' ? FileSpreadsheet : FileText
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 sm:px-3.5 sm:py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-background text-[var(--text-secondary)]">
        {busy ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Icon className="size-5" aria-hidden />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            'flex min-w-0 items-center gap-2 text-sm font-medium sm:text-row',
            busy && 'text-[var(--text-secondary)]',
          )}
        >
          <span className="flex min-w-0 items-center">
            <span className="truncate">{base}</span>
            <span className="shrink-0">{ext}</span>
          </span>
          {badge}
        </span>
        {error ? (
          <span role="alert" className="text-xs text-st-rework-fg">
            {error}
          </span>
        ) : (
          <span role={busy ? 'status' : undefined} className="text-xs text-muted-foreground">
            {meta ?? formatFileMeta(file)}
          </span>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </li>
  )
}
