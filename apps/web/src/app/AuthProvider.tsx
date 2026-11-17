import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Tables } from '@/lib/database.types'
import { DbError, isAuthError, supabase } from '@/lib/supabase'

export type Profile = Tables<'profiles'>

type AuthValue = {
  profile: Profile | null
  session: Session | null
  loading: boolean
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  // 마지막으로 프로필 조회를 마친 사용자 id. 현재 세션 사용자와 다르면 아직 불러오는 중이다.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    // 콜백은 동기로 둔다(auth-js 문서: async 콜백은 토큰 갱신 중 교착 위험). 구독 즉시 INITIAL_SESSION이 온다.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setSessionReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      const { data, error, status } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (cancelled) return
      if (error && isAuthError(new DbError(status, error.message, error.code))) {
        await supabase.auth.signOut()
        return
      }
      setProfile(error ? null : data)
      setLoadedFor(userId)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    queryClient.clear()
  }, [queryClient])

  const value = useMemo<AuthValue>(() => {
    const profileReady = !userId || loadedFor === userId
    return {
      session,
      profile: userId && profileReady ? profile : null,
      loading: !sessionReady || !profileReady,
      signOut,
    }
  }, [session, sessionReady, userId, loadedFor, profile, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다.')
  return value
}
