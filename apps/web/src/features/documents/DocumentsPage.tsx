import { AlertCircle, Check, Info, Loader2, Sparkles, Trash2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth, type Profile } from '@/app/AuthProvider'
import { LoadError } from '@/components/LoadError'
import { LoadingStatus, TableSkeleton } from '@/components/LoadingStatus'
import { WIDE_CELL } from '@/components/RowMeta'
import { ROW_HOVER, ROW_SELECTED } from '@/components/tableRow'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTeamName } from '@/features/newhire/useTeamName'
import { formatDateTime } from '@/features/staff/format'
import { ErrorText, PageHeader, Panel } from '@/features/staff/ui'
import { useGuardedAction } from '@/features/staff/useGuardedAction'
import { AgentError } from '@/lib/agent'
import { cn } from '@/lib/utils'
import { DeleteDocumentDialog } from './DeleteDocumentDialog'
import {
  agentMessage,
  canManage,
  isStaleProcessing,
  STALE_PROCESSING_MS,
  useDocumentActions,
  useDocumentClauses,
  useDocuments,
  type PolicyDocument,
} from './documents'
import { UploadDocumentDialog } from './UploadDocumentDialog'

type DocStatus = 'processing' | 'ready' | 'failed'

// 문서 상태 배지는 새 색을 만들지 않고 과제 상태 variant를 빌린다(system.md).
const STATUS: Record<DocStatus, { variant: 'submitted' | 'done' | 'rework'; text: string }> = {
  processing: { variant: 'submitted', text: '처리 중' },
  ready: { variant: 'done', text: '사용 중' },
  failed: { variant: 'rework', text: '처리 실패' },
}

const FAILED_FALLBACK = '문서를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
const STALE_FAILED = FAILED_FALLBACK
// 서버는 짧은 문구를 저장한다. S14는 스캔 PDF 안내까지 담은 긴 문구를 보여 준다.
const UNREADABLE_SHORT = '글자를 읽을 수 없는 파일이에요'
const UNREADABLE_LONG = '글자를 읽을 수 없는 파일이에요. 스캔한 PDF는 읽지 못해요. 글자가 들어 있는 docx나 pdf로 다시 올려 주세요.'
const DRAFTS_NONE = '새로 만들 초안이 없어요. 만든 초안은 지식 관리에서 검토해 주세요.'
const REVIEW_LINK = '/knowledge?tab=knowledge&filter=ai'
const DRAFT_FAILED = '초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'
const DELETE_FAILED = '지우지 못했어요. 잠시 후 다시 시도해 주세요.'

type DraftResult = { kind: 'ok'; count: number } | { kind: 'error'; message: string }

const th = 'px-4 py-3 font-semibold whitespace-nowrap'

function statusOf(doc: PolicyDocument) {
  return STATUS[doc.status as DocStatus] ?? STATUS.processing
}

// 원본 파일이 아니라 누가 올렸는지만 보인다. profiles는 다른 담당자의 이름을 읽을 수 없어, 내가 올린 것이 아니면 역할로 적는다.
function uploaderLabel(doc: PolicyDocument, profile: Profile | null): string {
  if (profile && doc.uploaded_by === profile.id) return profile.full_name
  return doc.scope === 'company' ? '경영지원 담당자' : '교육 담당자'
}

// S14 규정 문서. 범위는 역할로 고정: 교육 담당자 = 우리 팀 문서, 경영지원 = 회사 공통 문서.
// 교육 담당자에게는 회사 공통 문서도 목록에 보이지만 읽기만 한다.
export function DocumentsPage() {
  const { profile } = useAuth()
  const isTrainer = profile?.role === 'team_trainer'
  const teamName = useTeamName(isTrainer ? profile?.team_id : null) ?? '우리 팀'
  const query = useDocuments()
  const { reindex, remove, makeDrafts } = useDocumentActions()
  const panelAction = useGuardedAction()
  const draftAction = useGuardedAction()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleting, setDeleting] = useState<PolicyDocument | null>(null)
  // 색인 호출 자체가 실패한 문서(행은 "처리 중"으로 남는다)의 문구
  // status는 문구를 남긴 때의 문서 상태다. 서버 상태가 그 뒤에 바뀌면 이 문구는 낡은 것이라 쓰지 않는다.
  const [indexErrors, setIndexErrors] = useState<Record<string, { message: string; status: string }>>({})
  const [drafts, setDrafts] = useState<Record<string, DraftResult>>({})

  const docs = query.data ?? []
  const selected = docs.find((d) => d.id === selectedId) ?? docs[0] ?? null
  const scopeText = isTrainer ? `${teamName} · 교육 담당자가 관리해요` : '회사 공통 · 경영지원 담당자가 관리해요'
  const scopeName = (doc: PolicyDocument) => (doc.scope === 'company' ? '회사 공통' : teamName)

  function select(id: string) {
    panelAction.clearError()
    setSelectedId(id)
  }

  function setIndexError(id: string, message: string | null, status = 'processing') {
    setIndexErrors((prev) => {
      const next = { ...prev }
      if (message) next[id] = { message, status }
      else delete next[id]
      return next
    })
  }

  function uploaded(doc: PolicyDocument, indexError: string | null) {
    select(doc.id)
    setIndexError(doc.id, indexError, doc.status)
  }

  function retry(doc: PolicyDocument) {
    void panelAction.run(async () => {
      setIndexError(doc.id, null)
      try {
        await reindex(doc.id)
      } catch (err) {
        setIndexError(doc.id, agentMessage(err), doc.status)
      }
    })
  }

  function confirmDelete(doc: PolicyDocument) {
    void panelAction.run(() =>
      remove(doc).catch((err: unknown) => {
        throw new Error(DELETE_FAILED, { cause: err })
      }),
    )
  }

  function createDrafts(doc: PolicyDocument) {
    void draftAction.run(async () => {
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[doc.id]
        return next
      })
      try {
        const count = await makeDrafts(doc.id)
        setDrafts((prev) => ({ ...prev, [doc.id]: { kind: 'ok', count } }))
      } catch (err) {
        // 에이전트 오류(예: 429 하루 한도)는 그 문구를 보여 준다. 그 밖의 오류는 S14 실패 문구다.
        const message = err instanceof AgentError ? agentMessage(err) : DRAFT_FAILED
        setDrafts((prev) => ({ ...prev, [doc.id]: { kind: 'error', message } }))
      }
    })
  }

  const uploadButton = (
    <Button type="button" variant="outline" onClick={() => setUploadOpen(true)}>
      <Upload aria-hidden />
      문서 올리기
    </Button>
  )

  const description = isTrainer
    ? '우리 팀 규정 문서를 올리면 조항으로 나눠 두고, 신입 채팅이 조항을 찾아 출처와 함께 답해요.'
    : '회사 공통 규정 문서를 올리면 조항으로 나눠 두고, 신입 채팅이 조항을 찾아 출처와 함께 답해요.'

  return (
    <main className="mx-auto flex max-w-[1376px] flex-col gap-6 px-4 py-8 sm:px-8">
      <PageHeader title="규정 문서" description={description} actions={uploadButton} />

      {query.isLoading ? (
        <Panel className="overflow-hidden">
          <LoadingStatus>
            <TableSkeleton
              headClassName="border-b"
              columns={[
                { label: '문서', cell: 'two-line' },
                { label: '범위', className: WIDE_CELL },
                { label: '상태', cell: 'badge' },
                { label: '조항', className: 'text-right' },
              ]}
            />
          </LoadingStatus>
        </Panel>
      ) : query.isError ? (
        <LoadError retrying={query.isFetching} onRetry={() => void query.refetch()}>
          규정 문서를 불러오지 못했어요. 다시 시도해 주세요.
        </LoadError>
      ) : docs.length === 0 ? (
        <Panel className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">아직 올린 규정 문서가 없어요.</p>
          <p className="text-label text-muted-foreground">복리후생 규정이나 취업규칙을 올리면 신입 채팅이 조항을 찾아 답해요.</p>
          <div className="mt-2">{uploadButton}</div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
          <Panel className="overflow-hidden" aria-labelledby="documents-title">
            <div className="border-b border-border px-6 py-4">
              <h2 id="documents-title" className="text-lead font-semibold">
                문서 {docs.length}개
              </h2>
            </div>
            <table aria-label="규정 문서 목록" className="w-full text-sm">
              <thead className="border-b border-border bg-surface-subtle text-left text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className={th}>문서</th>
                  <th className={cn(th, WIDE_CELL)}>범위</th>
                  <th className={th}>상태</th>
                  <th className={cn(th, 'text-right')}>조항</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => {
                  const active = doc.id === selected?.id
                  const status = statusOf(doc)
                  return (
                    <tr
                      key={doc.id}
                      className={cn('cursor-pointer border-b border-border last:border-b-0', active ? ROW_SELECTED : ROW_HOVER)}
                      onClick={() => select(doc.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            aria-current={active ? 'true' : undefined}
                            className="w-fit rounded-sm text-left font-medium wrap-anywhere outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            {doc.title}
                          </button>
                          <span className="text-xs text-muted-foreground">
                            <span className="sm:hidden">{scopeName(doc)} · </span>
                            {doc.file_type} · {uploaderLabel(doc, profile)} · {formatDateTime(doc.created_at)}
                          </span>
                        </div>
                      </td>
                      <td className={cn('px-4 py-3 whitespace-nowrap', WIDE_CELL)}>{scopeName(doc)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant}>{status.text}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{doc.status === 'ready' ? doc.clause_count : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Panel>

          {selected && (
            <DocumentPanel
              key={selected.id}
              doc={selected}
              scopeName={scopeName(selected)}
              uploader={uploaderLabel(selected, profile)}
              manageable={canManage(profile, selected)}
              indexError={indexErrors[selected.id]?.status === selected.status ? indexErrors[selected.id].message : null}
              draft={drafts[selected.id] ?? null}
              panelBusy={panelAction.busy}
              panelError={panelAction.error}
              draftBusy={draftAction.busy}
              onRetry={() => retry(selected)}
              onDelete={() => setDeleting(selected)}
              onDraft={() => createDrafts(selected)}
            />
          )}
        </div>
      )}

      <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} scopeText={scopeText} onUploaded={uploaded} />
      <DeleteDocumentDialog doc={deleting} onOpenChange={(open) => !open && setDeleting(null)} onConfirm={confirmDelete} />
    </main>
  )
}

type PanelProps = {
  doc: PolicyDocument
  scopeName: string
  uploader: string
  manageable: boolean
  indexError: string | null
  draft: DraftResult | null
  panelBusy: boolean
  panelError: string | null
  draftBusy: boolean
  onRetry(): void
  onDelete(): void
  onDraft(): void
}

function DocumentPanel({
  doc,
  scopeName,
  uploader,
  manageable,
  indexError,
  draft,
  panelBusy,
  panelError,
  draftBusy,
  onRetry,
  onDelete,
  onDraft,
}: PanelProps) {
  const status = statusOf(doc)
  const titleId = `document-${doc.id}`
  const ready = doc.status === 'ready'
  const failed = doc.status === 'failed'
  // 색인을 부르지 못했다면 행은 "처리 중"으로 남는다. 기다리라고 하지 않고 다시 처리를 권한다.
  const [, setTick] = useState(0)
  const stale = isStaleProcessing(doc)
  // 방금 올린 문서가 2분을 넘기면 다시 그려 "처리하지 못했어요"로 바꾼다.
  useEffect(() => {
    if (doc.status !== 'processing' || stale) return
    const left = new Date(doc.created_at).getTime() + STALE_PROCESSING_MS - Date.now() + 1
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(left, 0))
    return () => clearTimeout(timer)
  }, [doc.status, doc.created_at, stale])
  const notice = ready ? null : (indexError ?? (failed ? (doc.error === UNREADABLE_SHORT ? UNREADABLE_LONG : (doc.error ?? FAILED_FALLBACK)) : stale ? STALE_FAILED : null))

  return (
    <aside aria-labelledby={titleId} className="rounded-[18px] border border-border bg-card">
      <div className="flex items-start justify-between gap-3 px-6 py-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{scopeName}</Badge>
            <Badge variant={status.variant}>{status.text}</Badge>
          </div>
          <h2 id={titleId} className="text-lead font-semibold break-words">
            {doc.title}
          </h2>
          <span className="text-xs text-muted-foreground">
            {doc.title}.{doc.file_type} · {uploader} · {formatDateTime(doc.created_at)}
          </span>
        </div>
        {manageable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${doc.title} 지우기`}
            disabled={panelBusy}
            onClick={onDelete}
            className="text-[var(--text-secondary)] hover:bg-alert-err-bg hover:text-destructive"
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>

      {panelError && (
        <div className="px-6 pb-4">
          <ErrorText>{panelError}</ErrorText>
        </div>
      )}

      {notice ? (
        <div className="flex flex-col gap-3.5 border-t border-border px-6 py-5">
          <Alert variant="destructive" role="note">
            <AlertCircle aria-hidden />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
          {manageable && (
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={panelBusy} onClick={onRetry}>
                다시 처리
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={panelBusy} onClick={onDelete}>
                지우기
              </Button>
            </div>
          )}
        </div>
      ) : doc.status === 'processing' ? (
        <div className="flex flex-col gap-3.5 border-t border-border px-6 py-5">
          <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            문서를 조항으로 나누고 있어요. 1분쯤 걸려요.
          </p>
          <div aria-hidden className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      ) : null}

      {ready && (
        <>
          {manageable && (
            <div className="flex flex-col gap-2.5 border-t border-border px-6 py-5">
              <Button type="button" size="lg" className="self-start" disabled={draftBusy} onClick={onDraft}>
                {draftBusy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles aria-hidden />}
                {draftBusy ? '초안 만드는 중…' : '지식 초안 만들기'}
              </Button>
              <p className="text-xs text-muted-foreground">
                신입이 물을 만한 질문과 답을 조항 근거와 함께 5개까지 만들어요. 초안은 지식 관리에 저장되고, 검토한 뒤 게시해야 신입에게 보여요.
              </p>
              {draft?.kind === 'ok' && (
                <Alert variant={draft.count > 0 ? 'success' : 'info'} role="status">
                  {draft.count > 0 ? <Check aria-hidden /> : <Info aria-hidden />}
                  <AlertDescription className="flex flex-col gap-1">
                    <span>{draft.count > 0 ? `지식 초안 ${draft.count}개를 만들었어요. 검토하고 게시해야 신입에게 보여요.` : DRAFTS_NONE}</span>
                    <Link to={REVIEW_LINK} className="font-semibold">
                      지식 관리에서 검토하기
                    </Link>
                  </AlertDescription>
                </Alert>
              )}
              {draft?.kind === 'error' && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden />
                  <AlertDescription>{draft.message}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <ClauseList doc={doc} />
        </>
      )}
    </aside>
  )
}

function ClauseList({ doc }: { doc: PolicyDocument }) {
  const clauses = useDocumentClauses(doc.id)

  if (clauses.isLoading) {
    return (
      <div className="border-t border-border px-6 py-5">
        <LoadingStatus className="flex flex-col gap-2.5">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-1/3" />
        </LoadingStatus>
      </div>
    )
  }
  if (clauses.isError) {
    return (
      <div className="border-t border-border px-6 py-5">
        <LoadError retrying={clauses.isFetching} onRetry={() => void clauses.refetch()}>
          조항을 불러오지 못했어요. 다시 시도해 주세요.
        </LoadError>
      </div>
    )
  }

  const items = clauses.data ?? []
  return (
    <div className="border-t border-border pb-3">
      <h3 className="px-6 pt-4 pb-1 text-row font-semibold">조항 {items.length}개</h3>
      <ul aria-label="조항 목록" className="flex flex-col">
        {items.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 border-t border-border px-6 py-3 first:border-t-0">
            <div className="flex items-baseline gap-2 text-sm">
              {c.label && <span className="font-semibold whitespace-nowrap">{c.label}</span>}
              {c.heading && <span>{c.heading}</span>}
            </div>
            <p className="line-clamp-2 text-label text-[var(--text-secondary)]">{c.body}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
