// 테스트 전용 픽스처. 사람·과제 데이터는 가상이다.
import type { Profile } from '@/app/AuthProvider'
import type { TaskInstance, TaskTemplate, TaskView } from '@/lib/tasks'

export const TEAM_ID = 'team-ai'

let seq = 0

export function makeTask(
  template: Partial<TaskTemplate> & { code: string; title: string },
  instance: Partial<TaskInstance> = {},
): TaskView {
  seq += 1
  const id = instance.id ?? `task-${template.code}`
  return {
    id,
    org_id: 'org',
    new_hire_id: 'u1',
    template_id: `tpl-${template.code}`,
    status: 'todo',
    due_date: '2026-11-20',
    result: null,
    rework_reason: null,
    na_reason: null,
    submitted_at: null,
    confirmed_at: null,
    confirmed_by: null,
    scheduled_at: null,
    location: null,
    assessment_result: null,
    assessment_note: null,
    updated_at: '2026-11-17T00:00:00Z',
    ...instance,
    template: {
      id: `tpl-${template.code}`,
      org_id: 'org',
      description: `${template.title} 안내문`,
      stage: 'day1',
      department: 'hr',
      team_id: null,
      kind: 'ops',
      completion_mode: 'self',
      allow_na: false,
      requires_hq_access: false,
      prerequisite_codes: [],
      checklist: null,
      form_schema: null,
      due_offset_days: 0,
      sort_order: seq,
      archived_at: null,
      assigned_to: null,
      created_by: null,
      is_seed: true,
      ...template,
    },
  }
}

export const PROFILE: Profile = {
  id: 'u1',
  org_id: 'org',
  role: 'new_hire',
  full_name: '가상하늘',
  email: 'newhire@demo.test',
  job_title: '사원',
  department: null,
  team_id: TEAM_ID,
  hire_date: '2026-11-14',
  needs_hq_access: true,
  is_seed: true,
  created_at: '2026-11-14T00:00:00Z',
}
