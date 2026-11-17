import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// 웹 번들에는 공개 값(VITE_*)만 들어간다. 관리자 키는 절대 여기서 쓰지 않는다.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 환경변수가 필요합니다.')
}

export const supabase: SupabaseClient<Database> = createClient<Database>(url, anonKey)

// 조회·RPC 실패를 상태 코드와 함께 던진다. App의 QueryCache가 401이면 로그아웃시킨다.
export class DbError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'DbError'
    this.status = status
    this.code = code
  }
}

// PGRST301: JWT 만료·검증 실패, PGRST303: JWT claim 검증 실패
export function isAuthError(err: unknown): boolean {
  if (!(err instanceof DbError)) return false
  return err.status === 401 || err.code === 'PGRST301' || err.code === 'PGRST303'
}
