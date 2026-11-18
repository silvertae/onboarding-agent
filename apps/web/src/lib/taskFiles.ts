import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Tables } from './database.types'
import { DbError } from './errors'
import { supabase } from './supabase'

// 과제 서식(담당자가 템플릿에 붙이는 docx·xlsx·pdf). 계약: docs/contracts.md "과제 서식 저장소".
// 서식 내용은 화면에 그리지 않는다. 내려받기만 하고, 파일 이름은 텍스트로만 그린다.

export type TaskFile = Tables<'task_template_files'>

const BUCKET = 'task-forms'
const SIGNED_URL_SECONDS = 60
const FILES_KEY = ['task-files'] as const

export const MAX_FORM_BYTES = 10 * 1024 * 1024

export const FORM_TYPES: Record<'pdf' | 'docx' | 'xlsx', { mime: string; label: 'PDF' | 'Word' | 'Excel' }> = {
  pdf: { mime: 'application/pdf', label: 'PDF' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel' },
}

export function formExt(fileName: string): 'pdf' | 'docx' | 'xlsx' | null {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0) return null
  const ext = fileName.slice(dot + 1).toLowerCase()
  return ext === 'pdf' || ext === 'docx' || ext === 'xlsx' ? ext : null
}

export function checkFormFile(file: File): 'ok' | 'type' | 'size' {
  if (!formExt(file.name) || file.size === 0) return 'type'
  return file.size > MAX_FORM_BYTES ? 'size' : 'ok'
}

export function formatFileMeta(f: Pick<TaskFile, 'file_name' | 'size_bytes'>): string {
  const ext = formExt(f.file_name)
  const label = ext ? FORM_TYPES[ext].label : ''
  const size =
    f.size_bytes < 1024 * 1024
      ? `${Math.ceil(f.size_bytes / 1024)}KB`
      : `${(f.size_bytes / (1024 * 1024)).toFixed(1)}MB`
  return label ? `${label} · ${size}` : size
}

// 기본 서식 먼저, 그다음 올린 순서대로
export function useTemplateFiles(templateId: string | undefined): UseQueryResult<TaskFile[]> {
  return useQuery({
    queryKey: [...FILES_KEY, templateId],
    enabled: Boolean(templateId),
    queryFn: async () => {
      const { data, error, status } = await supabase
        .from('task_template_files')
        .select('*')
        .eq('template_id', templateId!)
        .order('is_seed', { ascending: false })
        .order('created_at', { ascending: true })
      if (error) throw new DbError(status, error.message, error.code)
      return data
    },
  })
}

export function useFileCounts(): UseQueryResult<Map<string, number>> {
  return useQuery({
    queryKey: [...FILES_KEY, 'counts'],
    queryFn: async () => {
      const { data, error, status } = await supabase.from('task_template_files').select('template_id')
      if (error) throw new DbError(status, error.message, error.code)
      const counts = new Map<string, number>()
      for (const row of data) counts.set(row.template_id, (counts.get(row.template_id) ?? 0) + 1)
      return counts
    },
  })
}

// 객체를 올린 뒤 테이블에 적는다. 테이블 쓰기가 실패하면(같은 이름 23505 등) 올린 객체를 지운다.
// 성공 후 ['task-files'] 무효화는 호출하는 컴포넌트가 한다.
export async function uploadTaskFile(template: { id: string; org_id: string }, file: File): Promise<TaskFile> {
  const ext = formExt(file.name)
  if (!ext) throw new DbError(400, '지원하지 않는 형식입니다', '22023')

  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) throw new DbError(401, '로그인이 필요합니다')

  const path = `${template.org_id}/${template.id}/${crypto.randomUUID()}.${ext}`
  const storage = supabase.storage.from(BUCKET)
  const { error: upError } = await storage.upload(path, file, { contentType: FORM_TYPES[ext].mime, upsert: false })
  if (upError) throw storageError(upError)

  const { data, error, status } = await supabase
    .from('task_template_files')
    .insert({
      org_id: template.org_id,
      template_id: template.id,
      // 맥에서 끌어온 한글 이름은 NFD일 수 있다. 같은 이름 검사와 화면이 어긋나지 않게 NFC로 적는다.
      file_name: file.name.normalize('NFC'),
      storage_path: path,
      size_bytes: file.size,
      uploaded_by: userId,
    })
    .select()
    .single()
  if (error || !data) {
    await storage.remove([path]).catch(() => undefined)
    throw new DbError(status, error?.message ?? '서식을 저장하지 못했습니다', error?.code)
  }
  return data
}

// 행을 먼저 지운다(Storage 삭제 정책이 기본 서식 행이 있는지 본다). 지워진 행이 없으면 객체는 건드리지 않는다.
// 행 삭제 뒤 객체 삭제가 실패하면 던지지만 행은 이미 없다. 호출한 쪽은 성공·실패 모두 목록을 새로 불러온다(onSettled).
export async function deleteTaskFile(file: TaskFile): Promise<void> {
  const { data, error, status } = await supabase.from('task_template_files').delete().eq('id', file.id).select('id')
  if (error) throw new DbError(status, error.message, error.code)
  if (!data || data.length === 0) throw new DbError(404, '서식을 지울 수 없습니다', '42501')

  const { error: rmError } = await supabase.storage.from(BUCKET).remove([file.storage_path])
  if (rmError) throw storageError(rmError)
}

// download 옵션은 쓰지 않는다. storage-js 2.119가 이름을 두 번 인코딩해(URLSearchParams 뒤 encodeURI)
// 한글 이름이 %EB…로 저장된다. 이름은 downloadTaskFile이 붙인다.
export async function signedDownloadUrl(file: TaskFile): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path, SIGNED_URL_SECONDS)
  if (error || !data) throw storageError(error)
  return data.signedUrl
}

// 서명 URL은 다른 출처라 <a download>의 이름이 무시된다. 내용을 받아(10MB 이하) 같은 출처의 객체 URL로 내려받게 한다.
// 객체 URL은 누른 뒤 한참 있다 놓는다. 누르자마자 놓으면 Safari가 내려받기를 끊는다.
const REVOKE_AFTER_MS = 40_000

export async function downloadTaskFile(file: TaskFile): Promise<void> {
  const url = await signedDownloadUrl(file)
  const res = await fetch(url)
  if (!res.ok) throw new DbError(res.status, `서식을 내려받지 못했습니다 (HTTP ${res.status})`)
  const href = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = href
  a.download = file.file_name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), REVOKE_AFTER_MS)
}

// storage-api는 토큰 검증 실패(만료·서명 오류)를 HTTP 400으로 돌려준다. 새 버전은 code 'InvalidJWT',
// 로컬 v1.96은 code 'AccessDenied'에 토큰 검증 문구를 담는다. RLS 거부도 'AccessDenied'라 문구로 가른다.
const JWT_FAILURE = /\bjwt\b|\bjws\b|"exp" claim|signature verification failed/i

function isTokenFailure(err: { message: string; code?: string }): boolean {
  return err.code === 'InvalidJWT' || (err.code === 'AccessDenied' && JWT_FAILURE.test(err.message))
}

// storage-js StorageApiError: status는 숫자(HTTP), statusCode는 문자열, code는 서비스 코드(예: ResourceAlreadyExists).
// 토큰 검증 실패는 401로 담아 화면이 로그아웃하게 한다(isAuthError). RLS 거부는 그대로 둔다(로그아웃하지 않는다).
// 데모 초기화(features/admin/users.ts)도 같은 방식으로 DbError로 바꾼다.
export function storageError(
  err: { message: string; status?: number; statusCode?: string | number; code?: string } | null,
): DbError {
  const fromCode = Number(err?.statusCode)
  const status =
    err && isTokenFailure(err)
      ? 401
      : typeof err?.status === 'number' && err.status > 0
        ? err.status
        : fromCode > 0
          ? fromCode
          : 500
  return new DbError(status, err?.message ?? 'Storage 오류', err?.code)
}
