import { vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { blockedBy, groupByStage, progress, type TaskStatus, type TaskView } from './tasks'

let seq = 0
function task(
  code: string,
  overrides: { status?: TaskStatus; stage?: TaskView['template']['stage']; sort?: number; prereq?: string[] } = {},
): TaskView {
  seq += 1
  const templateId = `tpl-${code}`
  return {
    id: `inst-${code}-${seq}`,
    org_id: 'org',
    template_id: templateId,
    new_hire_id: 'hire',
    status: overrides.status ?? 'todo',
    due_date: null,
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
    template: {
      id: templateId,
      org_id: 'org',
      code,
      title: code,
      description: '',
      stage: overrides.stage ?? 'day1',
      department: 'hr',
      team_id: null,
      kind: 'ops',
      completion_mode: 'confirm',
      allow_na: false,
      requires_hq_access: false,
      prerequisite_codes: overrides.prereq ?? [],
      checklist: null,
      form_schema: null,
      due_offset_days: 0,
      sort_order: overrides.sort ?? 0,
      archived_at: null,
      assigned_to: null,
      created_by: null,
      is_seed: true,
    },
  }
}

describe('groupByStage', () => {
  it('단계별로 나누고 sort_order 순으로 정렬한다', () => {
    const a = task('HR-02', { stage: 'day1', sort: 20 })
    const b = task('HR-01', { stage: 'day1', sort: 10 })
    const c = task('GA-01', { stage: 'week1', sort: 5 })

    const grouped = groupByStage([a, c, b])

    expect(grouped.day1).toHaveLength(2)
    expect(grouped.week1).toHaveLength(1)
    expect(grouped.month1).toHaveLength(0)
    expect(grouped.day1.map((t) => t.template.code)).toEqual(['HR-01', 'HR-02'])
  })
})

describe('progress', () => {
  it('완료와 해당 없음을 끝난 과제로 센다', () => {
    const statuses: TaskStatus[] = ['done', 'done', 'na', 'todo', 'todo', 'todo']
    expect(progress(statuses.map((s, i) => task(`T-${i}`, { status: s })))).toEqual({ finished: 3, total: 6 })
  })
})

describe('blockedBy', () => {
  it('아직 끝나지 않은 선행 과제를 돌려준다', () => {
    const prereq = task('HR-02', { status: 'submitted' })
    const target = task('HR-03', { status: 'blocked', prereq: ['HR-02'] })
    expect(blockedBy(target, [prereq, target])).toEqual([prereq])
  })

  it('선행 과제가 완료되면 빈 배열', () => {
    const prereq = task('HR-02', { status: 'done' })
    const target = task('HR-03', { status: 'blocked', prereq: ['HR-02'] })
    expect(blockedBy(target, [prereq, target])).toEqual([])
  })

  it('선행 과제가 해당 없음이어도 빈 배열', () => {
    const prereq = task('HR-02', { status: 'na' })
    const target = task('HR-03', { status: 'blocked', prereq: ['HR-02'] })
    expect(blockedBy(target, [prereq, target])).toEqual([])
  })
})
