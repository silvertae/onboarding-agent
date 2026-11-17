import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// 웹 번들에는 공개 값(VITE_*)만 들어간다. 관리자 키는 절대 여기서 쓰지 않는다.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 환경변수가 필요합니다.')
}

export const supabase: SupabaseClient<Database> = createClient<Database>(url, anonKey)

