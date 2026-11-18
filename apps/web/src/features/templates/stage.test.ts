import { daysInStage, STAGE_START_DAYS } from './stage'
import type { TaskTemplate } from '@/lib/tasks'

const t = (stage: TaskTemplate['stage'], due: number) => ({ stage, due_offset_days: due }) as TaskTemplate

describe('stage', () => {
  it('단계 시작일은 0·5·30일', () => {
    expect(STAGE_START_DAYS).toEqual({ day1: 0, week1: 5, month1: 30 })
  })
  it('단계 시작 후 일수를 구한다', () => {
    expect(daysInStage(t('week1', 7))).toBe(2)
  })
  it('음수면 0', () => {
    expect(daysInStage(t('month1', 25))).toBe(0)
  })
})
