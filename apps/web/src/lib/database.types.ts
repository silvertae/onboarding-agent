// TODO: Task 2 머지 후 npm run types로 교체
// 임시 수동 작성본. 구현 계획 Task 2의 테이블·RPC 정의를 옮겼다. 생성 파일과 이름·모양을 맞춰 두어
// 교체할 때 import(Database, Tables, Enums 등)를 바꾸지 않아도 되게 했다. 앱용 별칭은 lib/tasks.ts에 둔다.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type UserRole = 'new_hire' | 'team_trainer' | 'ops_staff' | 'admin'
type OpsDepartment = 'hr' | 'ga' | 'accounting'
type TaskStage = 'day1' | 'week1' | 'month1'
type TaskKind = 'ops' | 'read' | 'input' | 'practice' | 'setup' | 'assessment'
type CompletionMode = 'self' | 'confirm' | 'staff_only'
type TaskStatusEnum = 'blocked' | 'todo' | 'submitted' | 'rework' | 'done' | 'na'
type AssessmentResult = 'pass' | 'needs_followup'
type KnowledgeScope = 'company' | 'team'
type KnowledgeStatus = 'draft' | 'published'
type UnansweredStatus = 'open' | 'resolved'
type ExamDifficulty = 'beginner' | 'intermediate'
type ExamStatus = 'draft' | 'final'

// 수동 작성본에서만 쓰는 축약. 생성 파일은 Insert/Update를 칸마다 풀어 쓴다.
type Table<Row, Relationships extends unknown[] = []> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: Relationships
}

type OrgsRow = { id: string; name: string }
type TeamsRow = { id: string; org_id: string; name: string; org_line: string[] }
type ProfilesRow = {
  id: string
  org_id: string
  email: string
  full_name: string
  job_title: string
  role: UserRole
  department: OpsDepartment | null
  team_id: string | null
  hire_date: string | null
  needs_hq_access: boolean
  is_seed: boolean
  created_at: string
}
type TaskTemplatesRow = {
  id: string
  org_id: string
  code: string
  title: string
  description: string
  stage: TaskStage
  department: OpsDepartment | null
  team_id: string | null
  kind: TaskKind
  completion_mode: CompletionMode
  allow_na: boolean
  requires_hq_access: boolean
  prerequisite_codes: string[]
  checklist: Json | null
  form_schema: Json | null
  due_offset_days: number
  sort_order: number
}
type TaskInstancesRow = {
  id: string
  org_id: string
  template_id: string
  new_hire_id: string
  status: TaskStatusEnum
  due_date: string | null
  result: Json | null
  na_reason: string | null
  rework_reason: string | null
  scheduled_at: string | null
  location: string | null
  assessment_result: AssessmentResult | null
  assessment_note: string | null
  submitted_at: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  updated_at: string
}
type KnowledgeItemsRow = {
  id: string
  org_id: string
  scope: KnowledgeScope
  team_id: string | null
  question: string
  answer: string
  category: string
  status: KnowledgeStatus
  updated_by: string | null
  updated_at: string
}
type UnansweredQuestionsRow = {
  id: string
  org_id: string
  asked_by: string
  team_id: string | null
  question: string
  status: UnansweredStatus
  resolved_knowledge_id: string | null
  created_at: string
}
type ExamsRow = {
  id: string
  org_id: string
  team_id: string
  title: string
  topic: string
  difficulty: ExamDifficulty
  status: ExamStatus
  created_by: string | null
  created_at: string
}
type ExamQuestionsRow = {
  id: string
  org_id: string
  exam_id: string
  position: number
  prompt: string
  model_answer: string
  rubric: string
  points: number
}
type UsageCountersRow = { org_id: string; user_id: string; day: string; kind: string; count: number }

export type Database = {
  public: {
    Tables: {
      orgs: Table<OrgsRow>
      teams: Table<TeamsRow>
      profiles: Table<
        ProfilesRow,
        [{ foreignKeyName: 'profiles_team_id_fkey'; columns: ['team_id']; isOneToOne: false; referencedRelation: 'teams'; referencedColumns: ['id'] }]
      >
      task_templates: Table<
        TaskTemplatesRow,
        [{ foreignKeyName: 'task_templates_team_id_fkey'; columns: ['team_id']; isOneToOne: false; referencedRelation: 'teams'; referencedColumns: ['id'] }]
      >
      task_instances: Table<
        TaskInstancesRow,
        [
          { foreignKeyName: 'task_instances_template_id_fkey'; columns: ['template_id']; isOneToOne: false; referencedRelation: 'task_templates'; referencedColumns: ['id'] },
          { foreignKeyName: 'task_instances_new_hire_id_fkey'; columns: ['new_hire_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      >
      knowledge_items: Table<KnowledgeItemsRow>
      unanswered_questions: Table<
        UnansweredQuestionsRow,
        [{ foreignKeyName: 'unanswered_questions_asked_by_fkey'; columns: ['asked_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }]
      >
      exams: Table<ExamsRow>
      exam_questions: Table<
        ExamQuestionsRow,
        [{ foreignKeyName: 'exam_questions_exam_id_fkey'; columns: ['exam_id']; isOneToOne: false; referencedRelation: 'exams'; referencedColumns: ['id'] }]
      >
      usage_counters: Table<UsageCountersRow>
    }
    Views: { [_ in never]: never }
    Functions: {
      start_onboarding: { Args: { p_new_hire: string }; Returns: number }
      submit_task: { Args: { p_id: string; p_result?: Json }; Returns: TaskInstancesRow }
      mark_na: { Args: { p_id: string; p_reason: string }; Returns: TaskInstancesRow }
      confirm_task: { Args: { p_id: string }; Returns: TaskInstancesRow }
      request_rework: { Args: { p_id: string; p_reason: string }; Returns: TaskInstancesRow }
      record_assessment: {
        Args: {
          p_id: string
          p_result: AssessmentResult | null
          p_note: string
          p_scheduled_at?: string | null
          p_location?: string | null
        }
        Returns: TaskInstancesRow
      }
      resolve_unanswered: {
        Args: { p_id: string; p_question: string; p_answer: string; p_category: string }
        Returns: KnowledgeItemsRow
      }
      consume_quota: { Args: { p_kind: string; p_limit: number }; Returns: boolean }
    }
    Enums: {
      user_role: UserRole
      ops_department: OpsDepartment
      task_stage: TaskStage
      task_kind: TaskKind
      completion_mode: CompletionMode
      task_status: TaskStatusEnum
      assessment_result: AssessmentResult
      knowledge_scope: KnowledgeScope
      knowledge_status: KnowledgeStatus
      unanswered_status: UnansweredStatus
      exam_difficulty: ExamDifficulty
      exam_status: ExamStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database['public']

// 생성 파일이 내보내는 도우미와 같은 이름(public 스키마만 지원하는 축약판).
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]

