// 팀 문제은행: 사용자 토큰으로 RPC·조회(RLS: 우리 팀 team_trainer만). 은행 채우기는 LLM 한도를 쓰지 않는다.
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useAuth } from '@/app/AuthProvider'
import type { Tables } from '@/lib/database.types'
import { DbError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Difficulty, DraftQuestion } from './exams'

export type BankItem = Tables<'question_bank_items'>

// 에이전트 /exams/generate의 avoid_prompts 한도(docs/contracts.md)
export const AVOID_MAX_ITEMS = 30
export const AVOID_PROMPT_MAX = 500

export const bankKeys = {
  topics: (userId?: string) => ['bank-topics', userId] as const,
  list: (userId?: string) => ['bank', userId] as const,
}

function fail(status: number, error: { message: string; code?: string }): never {
  throw new DbError(status, error.message, error.code)
}

export async function pickBankItems(a: {
  topic: string
  difficulty: Difficulty
  count: number
  exclude: string[]
  excludePrompts: string[]
  newHireId?: string
}): Promise<BankItem[]> {
  const { data, error, status } = await supabase.rpc('pick_bank_items', {
    p_topic: a.topic,
    p_difficulty: a.difficulty,
    p_count: a.count,
    p_exclude: a.exclude,
    p_exclude_prompts: a.excludePrompts,
    // 생성된 타입은 null을 받지 않지만 RPC 기본값이 null이라 그대로 보낸다
    p_new_hire: (a.newHireId ?? null) as string,
  })
  if (error) fail(status, error)
  return data ?? []
}

export async function bankPrompts(topic: string, difficulty: Difficulty): Promise<string[]> {
  const { data, error, status } = await supabase.rpc('bank_prompts', {
    p_topic: topic,
    p_difficulty: difficulty,
    p_limit: AVOID_MAX_ITEMS,
  })
  if (error) fail(status, error)
  return data ?? []
}

// 확정 시험의 새 문항을 은행에 넣고 새로 넣은 개수를 돌려준다. 다시 불러도 중복이 생기지 않는다.
export async function registerExamToBank(examId: string): Promise<number> {
  const { data, error, status } = await supabase.rpc('register_exam_to_bank', { p_exam: examId })
  if (error) fail(status, error)
  return data ?? 0
}

// 게시 문항의 주제 목록(편집기 주제 칸 자동완성). 표기가 달라도 topic_key가 같으면 하나만.
export function useBankTopics(): UseQueryResult<string[]> {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: bankKeys.topics(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error, status } = await supabase.from('question_bank_items').select('topic, topic_key').eq('status', 'active')
      if (error) fail(status, error)
      const byKey = new Map<string, string>()
      for (const row of data ?? []) {
        const key = row.topic_key ?? row.topic.trim().toLowerCase()
        if (!byKey.has(key)) byKey.set(key, row.topic.trim())
      }
      return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'ko'))
    },
  })
}

export function toDraft(item: BankItem): DraftQuestion {
  return { prompt: item.prompt, model_answer: item.model_answer, rubric: item.rubric, points: item.points, bank_item_id: item.id }
}

const normalize = (p: string) => p.trim().replace(/\s+/g, ' ')

// 생성 회피 목록: 편집기 문장을 먼저, 그다음 은행 문장. 빈 문장·공백만 다른 같은 문장은 빼고 30개에서 자른다.
export function buildAvoidPrompts(editor: string[], bank: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of [...editor, ...bank]) {
    const key = normalize(p)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
    if (out.length === AVOID_MAX_ITEMS) break
  }
  return out
}
