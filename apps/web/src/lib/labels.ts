import type { Enums } from './database.types'

// 상태 문구는 docs/screens.md 표를 따른다. staff_only 과제의 todo는 StatusBadge가 "담당자 처리 예정"으로 바꾼다.
export const STATUS_LABEL: Record<Enums<'task_status'>, string> = {
  blocked: '선행 과제 대기',
  todo: '할 일',
  submitted: '확인 대기',
  rework: '보완 요청',
  done: '완료',
  na: '해당 없음',
}

export const STAFF_ONLY_TODO_LABEL = '담당자 처리 예정'

export const OWNER_LABEL = {
  hr: '인사팀',
  ga: '총무팀',
  accounting: '회계팀',
} as const satisfies Record<Enums<'ops_department'>, string>

export const ROLE_LABEL = {
  new_hire: '신입',
  team_trainer: '교육 담당자',
  ops_staff: '경영지원',
  admin: '관리자',
} as const satisfies Record<Enums<'user_role'>, string>

export const STAGE_LABEL = {
  day1: '입사일',
  week1: '첫 주',
  month1: '첫 달',
} as const satisfies Record<Enums<'task_stage'>, string>
