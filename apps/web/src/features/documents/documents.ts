import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useAuth, type Profile } from '@/app/AuthProvider'
import { agentFetch, AgentError } from '@/lib/agent'
import type { Tables } from '@/lib/database.types'
import { DbError, isAuthError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { manageScope } from '@/features/staff/knowledge'

export type PolicyDocument = Tables<'policy_documents'>
export type DocumentClause = Pick<Tables<'document_clauses'>, 'id' | 'ord' | 'label' | 'heading' | 'body'>

export const DOC_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const
export const DOC_MAX_BYTES = 10485760

const BUCKET = 'policy-docs'

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

function isDocType(ext: string): ext is keyof typeof DOC_TYPES {
  return Object.hasOwn(DOC_TYPES, ext)
}

// 브라우저 검사는 안내용이다. 실제 제한은 버킷이 한다.
export function checkDocumentFile(file: File): string | null {
  if (!isDocType(extensionOf(file.name))) return `'${file.name}'은 올릴 수 없어요. docx, pdf 파일만 올릴 수 있어요.`
  if (file.size > DOC_MAX_BYTES) return `'${file.name}'이 10MB를 넘어요. 10MB 이하로 줄여서 올려 주세요.`
  return null
}

// 화면에서 버튼을 숨기는 데만 쓴다. 권한 판단은 DB가 한다.
export function canManage(profile: Profile | null, doc: Pick<PolicyDocument, 'org_id' | 'scope' | 'team_id'>): boolean {
  const scope = manageScope(profile)
  if (!profile || !scope) return false
  return profile.org_id === doc.org_id && scope.scope === doc.scope && scope.team_id === doc.team_id
}

// knowledge.ts의 fail과 같다: 인증 오류면 로그아웃한 뒤 던진다.
async function fail(error: { message: string; code?: string }, status: number): Promise<never> {
  const err = new DbError(status, error.message, error.code)
  if (isAuthError(err)) await supabase.auth.signOut()
  throw err
}

// supabase-js StorageError는 status(또는 statusCode)와 메시지만 준다. 만료된 토큰이면 DbError로 바꿔 같은 로그아웃 경로를 탄다.
async function storageFail(error: { message: string; status?: number | string; statusCode?: number | string }): Promise<never> {
  const status = Number(error.status ?? error.statusCode) || 0
  const code = /jwt/i.test(error.message) ? 'PGRST301' : undefined
  return fail({ message: error.message, code }, status)
}

export function agentMessage(err: unknown): string {
  if (err instanceof AgentError) return err.status === 429 ? `${err.message}. 내일 다시 이용해 주세요.` : err.message
  return '문서를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

// 색인 호출이 실패하면 서버는 문서를 "처리 중"으로 남겨 둔다. 이 시간이 지나도 처리 중이면 요청이 실패한 것으로 본다.
export const STALE_PROCESSING_MS = 2 * 60 * 1000

export function isStaleProcessing(doc: Pick<PolicyDocument, 'status' | 'created_at'>, now: number = Date.now()): boolean {
  return doc.status === 'processing' && now - new Date(doc.created_at).getTime() > STALE_PROCESSING_MS
}

// 방금 올린 "처리 중" 문서가 있을 때만 5초마다 다시 불러온다(색인이 끝나면 상태가 바뀐다). 오래된 처리 중 문서는 기다리지 않는다.
export function documentsRefetchInterval(docs: Pick<PolicyDocument, 'status' | 'created_at'>[] | undefined): number | false {
  const now = Date.now()
  return docs?.some((d) => d.status === 'processing' && !isStaleProcessing(d, now)) ? 5000 : false
}

export function useDocuments(): UseQueryResult<PolicyDocument[]> {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['documents', profile?.id],
    enabled: Boolean(profile),
    refetchInterval: (query) => documentsRefetchInterval(query.state.data),
    queryFn: async () => {
      const { data, error, status } = await supabase
        .from('policy_documents')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) await fail(error, status)
      return data!
    },
  })
}

const CLAUSE_PAGE = 1000 // PostgREST max_rows와 같다. 한 번에 이보다 많이 오지 않으므로 나눠서 끝까지 읽는다.

export async function loadClauses(documentId: string): Promise<DocumentClause[]> {
  const all: DocumentClause[] = []
  for (let from = 0; ; from += CLAUSE_PAGE) {
    const { data, error, status } = await supabase
      .from('document_clauses')
      .select('id, ord, label, heading, body')
      .eq('document_id', documentId)
      .order('ord', { ascending: true })
      .range(from, from + CLAUSE_PAGE - 1)
    if (error) await fail(error, status)
    all.push(...data!)
    if (data!.length < CLAUSE_PAGE) return all
  }
}

export function useDocumentClauses(documentId: string | null): UseQueryResult<DocumentClause[]> {
  return useQuery({
    queryKey: ['clauses', documentId],
    enabled: Boolean(documentId),
    queryFn: () => loadClauses(documentId!),
  })
}

export async function indexDocument(documentId: string): Promise<{ status: 'ready' | 'failed'; clause_count: number; error: string | null }> {
  const res = await agentFetch(`/documents/${documentId}/index`, {})
  return (await res.json()) as { status: 'ready' | 'failed'; clause_count: number; error: string | null }
}

// 순서: 행 insert(processing) → storage upload(실패하면 행 delete) → 색인 호출. 색인 호출 실패는 던지지 않는다.
export async function uploadDocument(
  profile: Profile,
  title: string,
  file: File,
): Promise<{ document: PolicyDocument; indexError: string | null }> {
  const ext = extensionOf(file.name)
  const scope = manageScope(profile)
  if (!isDocType(ext) || !scope) throw new Error('이 문서를 올릴 수 없어요.')

  const id = crypto.randomUUID()
  const filePath = `${profile.org_id}/${id}.${ext}`
  const { data, error, status } = await supabase
    .from('policy_documents')
    .insert({
      id,
      org_id: profile.org_id,
      ...scope,
      title: title.trim(),
      file_path: filePath,
      file_type: ext,
      uploaded_by: profile.id,
    })
    .select('*')
    .single()
  if (error) return fail(error, status)

  const upload = await supabase.storage.from(BUCKET).upload(filePath, file, { contentType: DOC_TYPES[ext], upsert: false })
  if (upload.error) {
    try {
      await supabase.from('policy_documents').delete().eq('id', id) // 고아 행 정리(실패해도 업로드 오류를 우선한다)
    } catch {
      // 정리 실패는 무시하고 업로드 오류를 던진다
    }
    return storageFail(upload.error)
  }

  try {
    await indexDocument(id)
    return { document: data as PolicyDocument, indexError: null }
  } catch (err) {
    return { document: data as PolicyDocument, indexError: agentMessage(err) }
  }
}

// 순서: storage remove(정책이 문서 행으로 범위를 확인하므로 행이 남아 있을 때) → 행 delete(조항 cascade).
export async function deleteDocument(doc: Pick<PolicyDocument, 'id' | 'file_path'>): Promise<void> {
  const removed = await supabase.storage.from(BUCKET).remove([doc.file_path])
  if (removed.error) return storageFail(removed.error)
  const { error, status } = await supabase.from('policy_documents').delete().eq('id', doc.id)
  if (error) await fail(error, status)
}

type Draft = { question: string; answer: string; category: string; clause_ids: string[] }

// 초안 API는 DB에 쓰지 않는다. 받은 초안을 RPC로 저장하고 저장한 개수를 돌려준다.
export async function makeKnowledgeDrafts(documentId: string, count = 5): Promise<number> {
  const res = await agentFetch('/knowledge/draft-from-document', { document_id: documentId, count })
  const body = (await res.json()) as { drafts?: unknown }
  if (!Array.isArray(body.drafts)) throw new Error('초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
  // 이미 있는 질문과 겹치는 것만 남았을 때처럼 빈 배열은 정상 결과다
  if (body.drafts.length === 0) return 0
  const drafts = (body.drafts as Draft[]).slice(0, 10)
  const { data, error, status } = await supabase.rpc('save_knowledge_drafts', { p_items: drafts })
  if (error) await fail(error, status)
  return data as number
}

// 화면용 동작 묶음: 끝나면 목록·조항·지식 쿼리를 다시 불러온다. 실패해도 문서 상태가 바뀌었을 수 있어 목록은 다시 불러온다.
export function useDocumentActions() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  async function refresh(id?: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['documents'] }),
      id ? queryClient.invalidateQueries({ queryKey: ['clauses', id] }) : Promise.resolve(),
    ])
  }

  return {
    upload: async (title: string, file: File) => {
      if (!profile) throw new Error('이 문서를 올릴 수 없어요.')
      try {
        const result = await uploadDocument(profile, title, file)
        await refresh(result.document.id)
        return result
      } catch (err) {
        await refresh()
        throw err
      }
    },
    reindex: async (id: string) => {
      try {
        return await indexDocument(id)
      } finally {
        await refresh(id)
      }
    },
    remove: async (doc: Pick<PolicyDocument, 'id' | 'file_path'>) => {
      try {
        await deleteDocument(doc)
      } finally {
        await refresh(doc.id)
      }
    },
    makeDrafts: async (id: string, count?: number) => {
      const saved = await makeKnowledgeDrafts(id, count)
      await queryClient.invalidateQueries({ queryKey: ['knowledge'] })
      return saved
    },
  }
}
