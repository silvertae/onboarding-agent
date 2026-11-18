import type { Profile } from '@/app/AuthProvider'
import { DbError, isAuthError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

// 기본키 중복. 같은 요청 id로 이미 저장된 경우다.
const UNIQUE_VIOLATION = '23505'

// 근거 없는 답변에서 신입이 직접 보내는 지식 등록 요청. 담당자의 S10 미답변 탭에 올라간다.
// 에이전트는 기록하지 않는다. 본인·조직·팀 검사는 RLS "본인 질문 기록"이 한다(신입은 읽을 수 없어 결과를 받지 않는다).
// requestId는 답변마다 하나다. 저장은 됐는데 응답을 못 받아 다시 보내도 행이 하나만 생기고, 중복이면 보낸 것으로 본다.
export async function requestKnowledge(profile: Profile, requestId: string, question: string): Promise<void> {
  const { error, status } = await supabase.from('unanswered_questions').insert({
    id: requestId,
    org_id: profile.org_id,
    asked_by: profile.id,
    team_id: profile.team_id,
    question: question.trim(),
  })
  if (!error || error.code === UNIQUE_VIOLATION) return
  const err = new DbError(status, error.message, error.code)
  if (isAuthError(err)) await supabase.auth.signOut()
  throw err
}
