// 편집 칸 값(TemplateInput)의 기본값·변환·검사. S12 화면과 "이 신입에게 과제 추가" 대화 상자가 함께 쓴다.
// 한계는 DB(save_task_template·add_task_for_hire)와 같다.
import type { TaskTemplate } from '@/lib/tasks'
import { daysInStage } from './stage'
import type { TemplateInput } from './templates'

export const TITLE_MAX = 60
export const DESCRIPTION_MAX = 2000
export const DAYS_MAX = 60
export const CHECKLIST_MAX = 20
export const CHECKLIST_ITEM_MAX = 60
export const PREREQUISITE_MAX = 3

// 새 과제 기본값(확정): 안내 · 신입이 완료 · 입사일 · 단계 시작 후 0일
export const NEW_TEMPLATE_INPUT: TemplateInput = {
  title: '',
  description: '',
  kind: 'ops',
  completionMode: 'self',
  stage: 'day1',
  daysInStage: 0,
  allowNa: false,
  checklist: null,
  prerequisiteCodes: [],
}

export function inputFromTemplate(t: TaskTemplate): TemplateInput {
  return {
    title: t.title,
    description: t.description,
    kind: t.kind,
    completionMode: t.completion_mode,
    stage: t.stage,
    daysInStage: daysInStage(t),
    allowNa: t.allow_na,
    checklist: Array.isArray(t.checklist) ? t.checklist.filter((item): item is string => typeof item === 'string') : null,
    prerequisiteCodes: [...t.prerequisite_codes],
  }
}

// 저장할 값: 체크리스트는 체크리스트 종류일 때만 두고, 항목 앞뒤 공백과 빈 항목을 뺀다
export function cleanInput(v: TemplateInput): TemplateInput {
  return {
    ...v,
    checklist: v.kind === 'setup' ? (v.checklist ?? []).map((item) => item.trim()).filter(Boolean) : null,
  }
}

// 체크리스트 종류인데 항목이 하나도 없다("체크리스트 항목을 하나 이상 넣어 주세요.")
export function checklistMissing(v: TemplateInput): boolean {
  return v.kind === 'setup' && (cleanInput(v).checklist ?? []).length === 0
}

export function isTemplateInputValid(v: TemplateInput): boolean {
  const title = v.title.trim()
  const checklist = cleanInput(v).checklist
  return (
    title.length >= 1 &&
    title.length <= TITLE_MAX &&
    v.description.length <= DESCRIPTION_MAX &&
    Number.isInteger(v.daysInStage) &&
    v.daysInStage >= 0 &&
    v.daysInStage <= DAYS_MAX &&
    (v.kind !== 'assessment' || v.completionMode === 'staff_only') &&
    (checklist === null ||
      (checklist.length >= 1 && checklist.length <= CHECKLIST_MAX && checklist.every((item) => item.length <= CHECKLIST_ITEM_MAX))) &&
    v.prerequisiteCodes.length <= PREREQUISITE_MAX
  )
}
