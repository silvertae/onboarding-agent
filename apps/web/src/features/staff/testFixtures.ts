// 도메인 B 화면 테스트용 가상 데이터. 사람 이름·메일은 모두 가상이다.
import type { TaskTemplate, TaskView } from '@/lib/tasks'
import type { Hire } from './hires'

export const TEAM_ID = 'team-ai'

let seq = 0

export function makeTemplate(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  seq += 1
  return {
    id: `tpl-${seq}`,
    org_id: 'org-1',
    code: `X-${seq}`,
    title: `과제 ${seq}`,
    description: '',
    stage: 'week1',
    department: 'ga',
    team_id: null,
    kind: 'ops',
    completion_mode: 'confirm',
    allow_na: false,
    requires_hq_access: false,
    prerequisite_codes: [],
    checklist: null,
    form_schema: null,
    due_offset_days: 5,
    sort_order: seq,
    archived_at: null,
    assigned_to: null,
    created_by: null,
    is_seed: true,
    ...overrides,
  }
}

export function makeTask(
  overrides: Partial<Omit<TaskView, 'template'>> & { template?: Partial<TaskTemplate> } = {},
): TaskView {
  seq += 1
  const { template, ...rest } = overrides
  return {
    id: `task-${seq}`,
    org_id: 'org-1',
    template_id: `tpl-${seq}`,
    new_hire_id: 'h1',
    status: 'todo',
    due_date: '2026-11-20',
    result: null,
    na_reason: null,
    rework_reason: null,
    scheduled_at: null,
    location: null,
    assessment_result: null,
    assessment_note: null,
    submitted_at: null,
    confirmed_by: null,
    confirmed_at: null,
    updated_at: '2026-11-17T00:00:00Z',
    ...rest,
    template: makeTemplate(template),
  }
}

export const HIRES: Hire[] = [
  { id: 'h1', full_name: '김하늘', job_title: '사원', email: 'newhire@demo.test', team_id: TEAM_ID, hire_date: '2026-11-14', team: { name: 'AI팀' } },
  { id: 'h2', full_name: '정민서', job_title: '사원', email: 'hire2@demo.test', team_id: TEAM_ID, hire_date: '2026-11-03', team: { name: 'AI팀' } },
]
