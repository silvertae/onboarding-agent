import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth, type Profile } from '@/app/AuthProvider'
import { agentFetch } from '@/lib/agent'
import type { Tables } from '@/lib/database.types'
import { DbError, isAuthError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export type KnowledgeItem = Tables<'knowledge_items'>
export type UnansweredQuestion = Tables<'unanswered_questions'> & { team: { name: string } | null }
export type KnowledgeStatus = KnowledgeItem['status']
export type KnowledgeDraft = { id?: string; question: string; answer: string; category: string; status: KnowledgeStatus }

const KNOWLEDGE_KEY = ['knowledge'] as const
const UNANSWERED_KEY = ['unanswered'] as const
const SOURCES_KEY = ['knowledge-sources'] as const

export type DraftClause = { id: string; document_title: string; label: string; heading: string }
export type KnowledgeSource = { clauseIds: string[]; origin: 'manual' | 'ai_draft' }

// 관리 범위는 역할로 정해진다: 교육 담당자 = 우리 팀 지식, 경영지원 = 회사 공통 지식. 화면에서 고를 수 없다.
export function manageScope(profile: Profile | null) {
  if (profile?.role === 'team_trainer' && profile.team_id) return { scope: 'team' as const, team_id: profile.team_id }
  if (profile?.role === 'ops_staff') return { scope: 'company' as const, team_id: null }
  return null
}

function fail(error: { message: string; code?: string }, status: number): never {
  throw new DbError(status, error.message, error.code)
}

// 관리 범위의 지식(초안 포함). 같은 조직의 게시 지식이라도 범위 밖이면 목록에 넣지 않는다.
export function useKnowledge(): UseQueryResult<KnowledgeItem[]> {
  const { profile } = useAuth()
  const scope = manageScope(profile)

  return useQuery({
    queryKey: [...KNOWLEDGE_KEY, profile?.id, scope?.scope, scope?.team_id],
    enabled: Boolean(scope),
    queryFn: async () => {
      let query = supabase.from('knowledge_items').select('*').eq('scope', scope!.scope)
      if (scope!.team_id) query = query.eq('team_id', scope!.team_id)
      const { data, error, status } = await query.order('updated_at', { ascending: false })
      if (error) fail(error, status)
      return data
    },
  })
}

// 규정 조항에서 답 초안을 받는다. 근거가 없으면 null.
export async function draftAnswer(question: string): Promise<{ answer: string; category: string; clauses: DraftClause[] } | null> {
  const res = await agentFetch('/knowledge/draft-answer', { question })
  const body = (await res.json()) as {
    found: boolean
    draft?: { answer: string; category: string; clauses: DraftClause[] }
  }
  if (!body.found || !body.draft) return null
  const { answer, category, clauses } = body.draft
  return { answer, category, clauses }
}

type SourceRow = {
  document_clauses: { id: string; label: string | null; heading: string | null; policy_documents: { title: string } | null } | null
}

// 지식의 근거 조항. 읽을 수 없는 조항은 RLS가 걸러 목록에서 빠진다.
export function useKnowledgeSources(knowledgeId: string | null): UseQueryResult<DraftClause[]> {
  return useQuery({
    queryKey: [...SOURCES_KEY, knowledgeId],
    enabled: Boolean(knowledgeId),
    queryFn: async () => {
      const { data, error, status } = await supabase
        .from('knowledge_sources')
        .select('clause_id, document_clauses(id, label, heading, policy_documents(title))')
        .eq('knowledge_id', knowledgeId!)
      if (error) fail(error, status)
      return (data as unknown as SourceRow[]).flatMap((row) =>
        row.document_clauses
          ? [
              {
                id: row.document_clauses.id,
                document_title: row.document_clauses.policy_documents?.title ?? '',
                label: row.document_clauses.label ?? '',
                heading: row.document_clauses.heading ?? '',
              },
            ]
          : [],
      )
    },
  })
}

let channelSeq = 0

// 열린 미답변 질문. RLS: trainer는 우리 팀 질문, ops는 조직 전체. 새 질문이 기록되면 realtime으로 다시 불러온다.
export function useUnanswered(): UseQueryResult<UnansweredQuestion[]> {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const enabled = Boolean(manageScope(profile))

  useEffect(() => {
    if (!enabled) return
    channelSeq += 1
    const channel = supabase
      .channel(`unanswered-${channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unanswered_questions' }, () => {
        void queryClient.invalidateQueries({ queryKey: UNANSWERED_KEY })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, queryClient])

  return useQuery({
    queryKey: [...UNANSWERED_KEY, profile?.id],
    enabled,
    queryFn: async () => {
      const { data, error, status } = await supabase
        .from('unanswered_questions')
        .select('*, team:teams(name)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
      if (error) fail(error, status)
      return data as unknown as UnansweredQuestion[]
    },
  })
}

// 범위 표시용 팀 이름(교육 담당자). 팀이 없으면 null.
export function useTeamName(teamId: string | null | undefined): string | null {
  const { data } = useQuery({
    queryKey: ['team-name', teamId],
    enabled: Boolean(teamId),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error, status } = await supabase.from('teams').select('name').eq('id', teamId!).maybeSingle()
      if (error) fail(error, status)
      return data?.name ?? null
    },
  })
  return data ?? null
}

export function useKnowledgeActions() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  async function run(call: PromiseLike<{ error: { message: string; code?: string } | null; status: number }>) {
    const { error, status } = await call
    if (error) {
      const err = new DbError(status, error.message, error.code)
      if (isAuthError(err)) await supabase.auth.signOut()
      throw err
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: KNOWLEDGE_KEY }),
      queryClient.invalidateQueries({ queryKey: UNANSWERED_KEY }),
      queryClient.invalidateQueries({ queryKey: SOURCES_KEY }),
    ])
  }

  return {
    // 새 지식이면 관리 범위로 추가, id가 있으면 내용·상태 수정. 범위는 바꾸지 않는다.
    save: async (item: KnowledgeDraft) => {
      const values = {
        question: item.question.trim(),
        answer: item.answer.trim(),
        category: item.category.trim(),
        status: item.status,
      }
      if (item.id) return run(supabase.from('knowledge_items').update(values).eq('id', item.id))
      const scope = manageScope(profile)
      if (!scope || !profile) throw new Error('지식을 관리할 권한이 없어요.')
      return run(supabase.from('knowledge_items').insert({ ...values, ...scope, org_id: profile.org_id }))
    },
    setStatus: (id: string, status: KnowledgeStatus) =>
      run(supabase.from('knowledge_items').update({ status }).eq('id', id)),
    // 미답변 → 게시 지식. 범위는 서버가 호출자 역할로 정한다. source가 있으면 근거 조항과 출처를 함께 저장한다(RPC는 지식 id만 돌려준다).
    resolve: (unansweredId: string, v: { question: string; answer: string; category: string }, source?: KnowledgeSource) => {
      const base = { p_id: unansweredId, p_question: v.question.trim(), p_answer: v.answer.trim(), p_category: v.category.trim() }
      if (!source) return run(supabase.rpc('resolve_unanswered', base))
      return run(supabase.rpc('resolve_unanswered_with_sources', { ...base, p_clause_ids: source.clauseIds, p_origin: source.origin }))
    },
  }
}
