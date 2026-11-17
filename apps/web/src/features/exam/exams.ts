// 시험 데이터: 조회·저장은 사용자 토큰으로 supabase(RLS: 우리 팀 team_trainer만), 출제는 에이전트 /exams/*.
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useAuth } from '@/app/AuthProvider'
import { agentFetch } from '@/lib/agent'
import type { Tables } from '@/lib/database.types'
import { DbError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export type Exam = Tables<'exams'>
export type ExamQuestionRow = Tables<'exam_questions'>
export type ExamWithQuestions = Exam & { questions: ExamQuestionRow[] }
export type ExamListItem = Exam & { question_count: number }
export type Difficulty = Exam['difficulty']
export type ExamStatus = Exam['status']

export type DraftQuestion = { prompt: string; model_answer: string; rubric: string; points: number }

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { beginner: '입문', intermediate: '중급' }
export const EXAM_STATUS_LABEL: Record<ExamStatus, string> = { draft: '초안', final: '확정' }

// 에이전트가 받는 기존 문항 하나의 최대 길이(services/agent/app/exam_schema.py PROMPT_MAX)
const EXISTING_PROMPT_MAX = 2000

export const examKeys = {
  list: (userId?: string) => ['exams', userId] as const,
  detail: (id: string) => ['exam', id] as const,
}

function fail(status: number, error: { message: string; code?: string }): never {
  throw new DbError(status, error.message, error.code)
}

export function useExams(): UseQueryResult<ExamListItem[]> {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: examKeys.list(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error, status } = await supabase
        .from('exams')
        .select('*, exam_questions(count)')
        .order('created_at', { ascending: false })
      if (error) fail(status, error)
      return (data as unknown as (Exam & { exam_questions: { count: number }[] })[]).map(
        ({ exam_questions, ...exam }) => ({ ...exam, question_count: exam_questions[0]?.count ?? 0 }),
      )
    },
  })
}

export function useExam(id: string): UseQueryResult<ExamWithQuestions> {
  return useQuery({
    queryKey: examKeys.detail(id),
    enabled: Boolean(id) && id !== 'new',
    queryFn: async () => {
      const { data, error, status } = await supabase
        .from('exams')
        .select('*, questions:exam_questions(*)')
        .eq('id', id)
        .single()
      if (error) fail(status, error)
      const exam = data as unknown as ExamWithQuestions
      return { ...exam, questions: [...exam.questions].sort((a, b) => a.position - b.position) }
    },
  })
}

export type GenerateRequest = {
  topic: string
  difficulty: Difficulty
  question_count: number
  style?: string
  new_hire_id?: string
}

export async function generateExam(req: GenerateRequest): Promise<{ title: string; questions: DraftQuestion[] }> {
  const res = await agentFetch('/exams/generate', req)
  return (await res.json()) as { title: string; questions: DraftQuestion[] }
}

export type RegenerateRequest = {
  topic: string
  difficulty: Difficulty
  existing_prompts: string[]
  instruction?: string
}

export async function regenerateQuestion(req: RegenerateRequest): Promise<DraftQuestion> {
  const res = await agentFetch('/exams/regenerate-question', {
    ...req,
    existing_prompts: req.existing_prompts.slice(0, 10).map((p) => p.slice(0, EXISTING_PROMPT_MAX)),
  })
  return (await res.json()) as DraftQuestion
}

export type SaveExamInput = {
  id?: string
  title: string
  topic: string
  difficulty: Difficulty
  status: ExamStatus
  questions: DraftQuestion[]
}

// 시험을 저장하고 id를 돌려준다. 문항은 지운 뒤 화면 순서(position)대로 다시 넣는다.
export async function saveExam(e: SaveExamInput): Promise<string> {
  const fields = { title: e.title, topic: e.topic, difficulty: e.difficulty, status: e.status }
  let exam: { id: string; org_id: string }

  if (e.id) {
    const { data, error, status } = await supabase.from('exams').update(fields).eq('id', e.id).select('id, org_id').single()
    if (error) fail(status, error)
    exam = data
  } else {
    const { data: auth } = await supabase.auth.getSession()
    const userId = auth.session?.user.id
    if (!userId) throw new DbError(401, '로그인이 필요해요')
    const { data: me, error: meError, status: meStatus } = await supabase
      .from('profiles')
      .select('org_id, team_id')
      .eq('id', userId)
      .single()
    if (meError) fail(meStatus, meError)
    if (!me.team_id) throw new DbError(403, '소속 팀이 없어 시험을 만들 수 없어요')
    const { data, error, status } = await supabase
      .from('exams')
      .insert({ ...fields, org_id: me.org_id, team_id: me.team_id })
      .select('id, org_id')
      .single()
    if (error) fail(status, error)
    exam = data
  }

  const { error: delError, status: delStatus } = await supabase.from('exam_questions').delete().eq('exam_id', exam.id)
  if (delError) fail(delStatus, delError)
  if (e.questions.length > 0) {
    const rows = e.questions.map((q, position) => ({
      org_id: exam.org_id,
      exam_id: exam.id,
      position,
      prompt: q.prompt,
      model_answer: q.model_answer,
      rubric: q.rubric,
      points: q.points,
    }))
    const { error, status } = await supabase.from('exam_questions').insert(rows)
    if (error) fail(status, error)
  }
  return exam.id
}
