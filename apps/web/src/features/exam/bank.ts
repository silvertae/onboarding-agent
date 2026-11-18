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

export type BankStatus = BankItem['status']
export type BankSource = BankItem['source']
export type BankFilter = { topic?: string; difficulty?: Difficulty; status: BankStatus }

export const BANK_SOURCE_LABEL: Record<BankSource, string> = { exam: '시험', manual: '직접 추가', migrated: '이관', seed: '기본' }

// 주제 비교 키(DB topic_key와 같은 규칙: 앞뒤 공백을 지우고 소문자). ilike는 _·%를 와일드카드로 읽어 쓰지 않는다.
export const topicKey = (topic: string) => topic.trim().toLowerCase()

// S13 목록: 게시/숨김 하나와 주제·난이도로 거른 우리 팀 문항, 최신순
export function useBankItems(f: BankFilter): UseQueryResult<BankItem[]> {
  const { session } = useAuth()
  const userId = session?.user.id
  const topic = f.topic?.trim() ? topicKey(f.topic) : null
  return useQuery({
    queryKey: [...bankKeys.list(userId), f.status, topic, f.difficulty ?? null],
    enabled: Boolean(userId),
    queryFn: async () => {
      let query = supabase.from('question_bank_items').select('*').eq('status', f.status)
      if (topic) query = query.eq('topic_key', topic)
      if (f.difficulty) query = query.eq('difficulty', f.difficulty)
      // 시드·이관 문항은 created_at이 같아서 id로 순서를 고정한다(고친 행이 자리를 바꾸지 않게)
      const { data, error, status } = await query.order('created_at', { ascending: false }).order('id')
      if (error) fail(status, error)
      return data ?? []
    },
  })
}

type BankPatch = Partial<Pick<BankItem, 'prompt' | 'model_answer' | 'rubric' | 'points' | 'topic' | 'difficulty' | 'status'>>

// 문항 하나를 고친다(숨기기·다시 게시 포함). 은행 문항은 지우지 않는다. 같은 문제면 code 23505.
export async function updateBankItem(id: string, patch: BankPatch): Promise<void> {
  // RLS로 막힌 행은 오류 없이 0행이 되므로 고친 행을 돌려받아 확인한다
  const { error, status } = await supabase.from('question_bank_items').update(patch).eq('id', id).select('id').single()
  if (error) fail(status, error)
}

// 직접 추가: org·팀은 내 프로필에서 가져온다. 같은 문제면 code 23505. 새 문항 id를 돌려준다.
export async function addBankItem(input: { topic: string; difficulty: Difficulty } & DraftQuestion): Promise<string> {
  const { data: auth } = await supabase.auth.getSession()
  const userId = auth.session?.user.id
  if (!userId) throw new DbError(401, '로그인이 필요해요')
  const { data: me, error: meError, status: meStatus } = await supabase.from('profiles').select('org_id, team_id').eq('id', userId).single()
  if (meError) fail(meStatus, meError)
  if (!me.team_id) throw new DbError(403, '소속 팀이 없어 문항을 추가할 수 없어요')
  const { data, error, status } = await supabase
    .from('question_bank_items')
    .insert({
      org_id: me.org_id,
      team_id: me.team_id,
      topic: input.topic.trim(),
      difficulty: input.difficulty,
      prompt: input.prompt,
      model_answer: input.model_answer,
      rubric: input.rubric,
      points: input.points,
      source: 'manual',
    })
    .select('id')
    .single()
  if (error) fail(status, error)
  return data.id
}

export const isDuplicate = (error: unknown) => error instanceof DbError && error.code === '23505'

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
