import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Download, Loader2, Trash2, TriangleAlert, Upload, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import { useAuth } from '@/app/AuthProvider'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus } from '@/components/LoadingStatus'
import { Alert } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatKoreanDate } from '@/features/staff/format'
import { DbError, isAuthError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import {
  checkFormFile,
  deleteTaskFile,
  downloadTaskFile,
  formatFileMeta,
  uploadTaskFile,
  useTemplateFiles,
  type TaskFile,
} from '@/lib/taskFiles'
import type { TaskTemplate } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { FileRow } from './FileRow'

// 문구는 docs/screens.md S12 "서식" 표 그대로
const NOTE = '올린 서식은 이 과제를 받은 신입 모두에게 보여요.'
const SAVE_FIRST = '과제를 저장하면 서식을 올릴 수 있어요.'
const ARCHIVED_NOTE = '보관한 과제에는 서식을 올릴 수 없어요.'
const EMPTY = '아직 올린 서식이 없어요. 신입이 작성해야 할 Word·Excel·PDF 양식을 올려 주세요.'
const LOAD_FAILED = '서식을 불러오지 못했어요. 다시 시도해 주세요.'
const HINT = 'docx, xlsx, pdf · 파일당 10MB까지'
const WARNING = '가상 서식만 올려 주세요. 실명·연락처 같은 개인정보나 실제 사내 문서는 올리지 않아요.'
const DROP_HERE = '놓으면 바로 올려요'
const UPLOADING = '올리는 중'
const UPLOAD_FAILED = '올리지 못했어요. 다시 시도해 주세요.'
const DELETED = '지웠어요'
const DELETE_DESCRIPTION = '이 과제를 받은 신입 모두의 화면에서 사라져요.'
const uploaded = (n: number) => `${n}개 올렸어요`
const wrongType = (name: string) => `'${name}' 파일은 올릴 수 없어요. docx, xlsx, pdf 파일만 올릴 수 있어요.`
const tooLarge = (name: string) => `'${name}' 파일이 10MB를 넘어요. 10MB 이하로 줄여서 올려 주세요.`
const duplicate = (name: string) => `'${name}' 서식이 이미 있어요. 바꾸려면 기존 서식을 지운 뒤 올려 주세요.`
const deleteTitle = (name: string) => `'${name}' 서식을 지울까요?`
// 표에 없는 문구: 내려받기 실패는 S3와 같고, 지우기 실패는 S12 저장·보관 실패와 같은 문형이다
const DOWNLOAD_FAILED = '파일을 내려받지 못했어요. 다시 시도해 주세요.'
const DELETE_FAILED = '지우지 못했어요. 잠시 후 다시 시도해 주세요.'

const ACCEPT = '.pdf,.docx,.xlsx'
// 올리기·지우기 뒤에는 성공·실패 모두 이 과제의 서식 목록과 S2 서식 수(['task-files', 'counts'])를 다시 읽는다
const FILES_KEY = ['task-files']

const TZ = 'Asia/Seoul'
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const TIME = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// 오늘(서울) 올렸으면 "오늘 10:24", 아니면 "11월 17일"
function uploadedAt(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  const day = DAY.format(at)
  return day === DAY.format(now) ? `오늘 ${TIME.format(at)}` : formatKoreanDate(day)
}

// "Excel · 24KB · 이름 · 오늘 10:24". 담당자는 RLS상 다른 담당자의 프로필을 읽지 못하므로
// 올린 사람 이름은 내가 올린 서식에만 붙인다. 기본 서식은 올린 사람이 없다.
// 좁은 화면에서는 항목 사이에서만 줄을 바꾼다("오늘 10:24"가 두 줄로 갈리지 않게 항목 안 띄어쓰기는 붙인다).
function metaOf(file: TaskFile, me: { id: string; name: string } | null): string {
  const by = me && file.uploaded_by === me.id ? me.name : null
  return [formatFileMeta(file), by, uploadedAt(file.created_at)]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/ /g, ' '))
    .join(' · ')
}

type Props = {
  // null이면 저장 전 새 과제
  template: TaskTemplate | null
  archived: boolean
}

// S12 오른쪽 패널의 "서식" 영역(시안 S12-tasks .files-sec). 올리기·지우기는 저장과 따로 바로 반영되고,
// 사용 중 잠금과 관계없다. 보관한 과제는 목록·내려받기·지우기만 한다(DB 정책과 같다).
export function TemplateFilesPanel({ template, archived }: Props) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3.5 border-t border-border px-5 pt-5 pb-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-row font-semibold">
          서식
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">{!template ? SAVE_FIRST : archived ? ARCHIVED_NOTE : NOTE}</p>
      </div>
      {template && <TemplateFiles template={template} archived={archived} />}
    </section>
  )
}

type Pending = { key: number; file: File; failed: boolean }
type RowBusy = 'download' | 'delete'

function TemplateFiles({ template, archived }: { template: TaskTemplate; archived: boolean }) {
  const { profile } = useAuth()
  const me = profile ? { id: profile.id, name: profile.full_name } : null
  const queryClient = useQueryClient()
  const files = useTemplateFiles(template.id)

  // 올리는 중·올리기 실패 행(목록 맨 위)
  const [pending, setPending] = useState<Pending[]>([])
  const nextKey = useRef(0)
  // 올리기 전 검사·같은 이름으로 거절한 파일 문구
  const [rejected, setRejected] = useState<string[]>([])
  const rejectedRef = useRef<HTMLDivElement>(null)
  // "N개 올렸어요"·"지웠어요"
  const [result, setResult] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  // 포커스가 있던 행·버튼이 사라질 때 옮길 곳(결과 문구 또는 거절 문구). 문구가 그려진 뒤 아래 효과가 옮긴다.
  const focusNext = useRef<'result' | 'rejected' | null>(null)
  // 올리는 중·실패 행의 요소("다시 시도"를 누르면 버튼이 사라지므로 그 행으로 포커스를 옮긴다)
  const pendingRows = useRef(new Map<number, HTMLLIElement>())
  // 행별 내려받기·지우기 진행과 실패 문구. 상태 갱신 전 두 번째 클릭은 inFlight가 막는다.
  const [rowBusy, setRowBusy] = useState<ReadonlyMap<string, RowBusy>>(new Map())
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, string>>(new Map())
  const inFlight = useRef(new Set<string>())
  // 지우기 확인 창. 닫히는 동안 제목이 비지 않게 대상은 닫아도 남겨 둔다.
  // 행마다 Trigger를 두지 않으므로, 닫히면 창을 연 지우기 버튼으로 포커스를 직접 돌려준다.
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [target, setTarget] = useState<TaskFile | null>(null)
  const opener = useRef<HTMLElement | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  useEffect(() => {
    if (focusNext.current === 'result' && result) {
      focusNext.current = null
      resultRef.current?.focus()
    } else if (focusNext.current === 'rejected' && rejected.length > 0) {
      focusNext.current = null
      rejectedRef.current?.focus()
    }
  }, [result, rejected])

  // 업로드 영역 밖에 파일을 놓으면 브라우저가 그 파일을 열어 쓰던 내용과 올리는 중인 파일을 잃는다.
  // 업로드 영역이 있는 동안 창 전체에서 파일 끌기의 기본 동작을 막는다(업로드 영역이 이미 처리한 것은 건너뛴다).
  useEffect(() => {
    if (archived) return
    function block(e: DragEvent) {
      if (e.defaultPrevented || !Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [archived])

  const refresh = () => queryClient.invalidateQueries({ queryKey: FILES_KEY })
  const rowHasFocus = (key: number) => pendingRows.current.get(key)?.contains(document.activeElement) ?? false

  function startRow(id: string, kind: RowBusy): boolean {
    if (inFlight.current.has(id)) return false
    inFlight.current.add(id)
    setRowBusy((m) => new Map(m).set(id, kind))
    setRowErrors((m) => {
      const next = new Map(m)
      next.delete(id)
      return next
    })
    return true
  }

  function endRow(id: string, error?: string) {
    inFlight.current.delete(id)
    setRowBusy((m) => {
      const next = new Map(m)
      next.delete(id)
      return next
    })
    if (error) setRowErrors((m) => new Map(m).set(id, error))
  }

  // 한 파일을 올린다. 성공·실패 모두 목록을 다시 읽은 뒤 그 행을 정리한다. 인증 오류(401)면 로그아웃한다.
  async function send(entry: Pending): Promise<boolean> {
    try {
      await uploadTaskFile(template, entry.file)
    } catch (err) {
      if (isAuthError(err)) {
        await supabase.auth.signOut()
        return false
      }
      await refresh()
      if (err instanceof DbError && err.code === '23505') {
        if (rowHasFocus(entry.key)) focusNext.current = 'rejected'
        setPending((list) => list.filter((p) => p.key !== entry.key))
        setRejected((list) => [...list, duplicate(entry.file.name)])
      } else {
        setPending((list) => list.map((p) => (p.key === entry.key ? { ...p, failed: true } : p)))
      }
      return false
    }
    await refresh()
    if (rowHasFocus(entry.key)) focusNext.current = 'result'
    setPending((list) => list.filter((p) => p.key !== entry.key))
    return true
  }

  async function upload(chosen: File[]) {
    if (chosen.length === 0) return
    const messages: string[] = []
    const entries: Pending[] = []
    for (const file of chosen) {
      const check = checkFormFile(file)
      if (check === 'type') messages.push(wrongType(file.name))
      else if (check === 'size') messages.push(tooLarge(file.name))
      else entries.push({ key: nextKey.current++, file, failed: false })
    }
    setResult(null)
    setRejected(messages)
    if (entries.length === 0) return
    setPending((list) => [...list, ...entries])
    const done = (await Promise.all(entries.map(send))).filter(Boolean).length
    if (done > 0) setResult(uploaded(done))
  }

  async function retry(entry: Pending) {
    // 누른 "다시 시도"가 사라지므로 다시 올리는 그 행으로 포커스를 옮긴다
    pendingRows.current.get(entry.key)?.focus()
    setResult(null)
    setPending((list) => list.map((p) => (p.key === entry.key ? { ...p, failed: false } : p)))
    if (await send(entry)) setResult(uploaded(1))
  }

  async function download(file: TaskFile) {
    if (!startRow(file.id, 'download')) return
    try {
      await downloadTaskFile(file)
      endRow(file.id)
    } catch (err) {
      endRow(file.id, DOWNLOAD_FAILED)
      if (isAuthError(err)) await supabase.auth.signOut()
    }
  }

  // 행을 먼저 지우고 객체를 지운다(taskFiles). 객체 삭제만 실패해도 던지므로, 성공·실패 모두 목록을 다시 읽는다.
  // 행이 이미 사라졌으면 실패 문구도 그 행과 함께 사라진다.
  async function remove(file: TaskFile) {
    if (!startRow(file.id, 'delete')) return
    setResult(null)
    try {
      await deleteTaskFile(file)
    } catch (err) {
      if (isAuthError(err)) {
        endRow(file.id)
        await supabase.auth.signOut()
        return
      }
      await refresh()
      endRow(file.id, DELETE_FAILED)
      return
    }
    await refresh()
    endRow(file.id)
    // 지운 행과 그 버튼이 사라지므로 결과 문구로 포커스를 옮긴다
    focusNext.current = 'result'
    setResult(DELETED)
  }

  function askDelete(file: TaskFile, button: HTMLElement) {
    if (inFlight.current.has(file.id)) return
    opener.current = button
    setTarget(file)
    setConfirmOpen(true)
  }

  function hasFiles(e: ReactDragEvent) {
    return Array.from(e.dataTransfer?.types ?? []).includes('Files')
  }

  // 올리는 중·실패 행은 목록을 불러오는 중이거나 불러오지 못했어도 보인다(업로드 영역은 그대로 쓸 수 있다)
  const loaded = !files.isLoading && !files.isError
  const list = loaded ? (files.data ?? []) : []

  return (
    <>
      {(pending.length > 0 || list.length > 0) && (
        <ul className="overflow-hidden rounded-lg border border-border bg-card">
          {pending.map((entry) => (
            <FileRow
              key={`pending-${entry.key}`}
              ref={(el) => {
                if (el) pendingRows.current.set(entry.key, el)
                else pendingRows.current.delete(entry.key)
              }}
              focusable
              file={{ file_name: entry.file.name, size_bytes: entry.file.size }}
              busy={!entry.failed}
              meta={UPLOADING}
              error={entry.failed ? UPLOAD_FAILED : undefined}
              actions={
                entry.failed && (
                  <Button type="button" variant="ghost" onClick={() => void retry(entry)}>
                    다시 시도
                  </Button>
                )
              }
            />
          ))}
          {list.map((file) => {
            const busy = rowBusy.get(file.id)
            return (
              <FileRow
                key={file.id}
                file={file}
                meta={metaOf(file, me)}
                badge={
                  file.is_seed && (
                    <Badge variant="outline" className="rounded-md border-own-team-border bg-own-team-bg text-own-team-fg">
                      기본 서식
                    </Badge>
                  )
                }
                error={rowErrors.get(file.id)}
                actions={
                  <>
                    {/* 툴팁 컴포넌트가 없어 title로 이름을 보인다(TemplateForm 지우기 버튼과 같다) */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="내려받기"
                      aria-label={`${file.file_name} 내려받기`}
                      aria-disabled={busy ? true : undefined}
                      className="text-[var(--text-secondary)] aria-disabled:opacity-50"
                      onClick={() => void download(file)}
                    >
                      {busy === 'download' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download aria-hidden />}
                    </Button>
                    {/* 기본 서식은 지우지 않는다(DB도 막는다) */}
                    {!file.is_seed && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="지우기"
                        aria-label={`${file.file_name} 지우기`}
                        aria-disabled={busy ? true : undefined}
                        className="text-[var(--text-secondary)] hover:bg-alert-err-bg hover:text-destructive aria-disabled:opacity-50"
                        onClick={(e) => askDelete(file, e.currentTarget)}
                      >
                        {busy === 'delete' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Trash2 aria-hidden />}
                      </Button>
                    )}
                  </>
                }
              />
            )
          })}
        </ul>
      )}
      {files.isLoading && <FilesSkeleton />}
      {files.isError && (
        <LoadError retrying={files.isFetching} onRetry={() => void files.refetch()}>
          {LOAD_FAILED}
        </LoadError>
      )}
      {loaded && !archived && pending.length === 0 && list.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">{EMPTY}</p>
      )}

      {!archived && (
        <div
          className={cn(
            'flex flex-col items-center gap-2 rounded-[14px] border-[1.5px] border-dashed px-5 py-4.5 text-center text-sm transition-[background-color,border-color] duration-150 ease-out-ui motion-reduce:transition-none',
            over ? 'border-primary bg-alert-info-bg' : 'border-input bg-surface-chat',
          )}
          onDragEnter={(e) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            setOver(true)
          }}
          onDragOver={(e) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDragLeave={(e) => {
            if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
            setOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            void upload(Array.from(e.dataTransfer.files))
          }}
        >
          <span className="grid size-9 place-items-center rounded-full border border-border bg-card text-primary">
            <Upload className="size-5" aria-hidden />
          </span>
          {/* 끌어 올린 동안에는 안내를 감추고(자리는 유지해 높이가 바뀌지 않게) 같은 칸에 "놓으면 바로 올려요"를 둔다 */}
          <div className="grid w-full place-items-center">
            <div className={cn('col-start-1 row-start-1 flex flex-col items-center gap-2', over && 'invisible')}>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <span>파일을 여기로 끌어다 놓거나</span>
                <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                  파일 선택
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">{HINT}</span>
              <p className="flex items-start gap-1.5 text-left text-xs text-alert-warn-fg">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                {WARNING}
              </p>
            </div>
            {over && <p className="col-start-1 row-start-1 font-semibold text-primary">{DROP_HERE}</p>}
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const chosen = Array.from(e.target.files ?? [])
              // 같은 파일을 다시 골라도 change가 오게 비운다
              e.target.value = ''
              void upload(chosen)
            }}
          />
        </div>
      )}

      {rejected.length > 0 && (
        <Alert
          ref={rejectedRef}
          tabIndex={-1}
          variant="destructive"
          role="alert"
          className="items-start outline-none has-[>svg]:grid-cols-[auto_1fr_auto]"
        >
          <AlertCircle aria-hidden />
          <div className="flex flex-col gap-0.5">
            {rejected.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="알림 닫기"
            className="-my-1 -mr-1.5 text-alert-err-fg hover:text-alert-err-fg"
            onClick={() => setRejected([])}
          >
            <X aria-hidden />
          </Button>
        </Alert>
      )}

      {result && (
        <Alert ref={resultRef} tabIndex={-1} variant="success" role="status" className="outline-none">
          <Check aria-hidden />
          <p className="self-center">{result}</p>
        </Alert>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            opener.current?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lead font-semibold">{target ? deleteTitle(target.file_name) : ''}</AlertDialogTitle>
            <AlertDialogDescription>{DELETE_DESCRIPTION}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => target && void remove(target)}>
              지우기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// 목록 불러오는 중: 파일 행 모양(아이콘 칸 + 이름·메타 두 줄)
function FilesSkeleton() {
  return (
    <LoadingStatus className="overflow-hidden rounded-lg border border-border bg-card">
      {['w-40', 'w-56'].map((width) => (
        <div key={width} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 sm:px-3.5 sm:py-3">
          <Skeleton className="size-10 shrink-0 rounded-[10px]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className={cn('h-4', width)} />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </LoadingStatus>
  )
}
