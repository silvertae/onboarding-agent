import { describe, expect, it } from 'vitest'
import { dueTag } from './format'

describe('dueTag', () => {
  it('기한 전날 이전은 past', () => expect(dueTag('2026-11-18', '2026-11-19')).toEqual({ kind: 'past' }))
  it('당일은 today', () => expect(dueTag('2026-11-19', '2026-11-19')).toEqual({ kind: 'today' }))
  it('3일 남으면 soon 3', () => expect(dueTag('2026-11-22', '2026-11-19')).toEqual({ kind: 'soon', days: 3 }))
  it('7일까지 soon, 8일부터 null', () => {
    expect(dueTag('2026-11-26', '2026-11-19')).toEqual({ kind: 'soon', days: 7 })
    expect(dueTag('2026-11-27', '2026-11-19')).toBeNull()
  })
  it('월을 넘겨도 일수가 맞다', () => expect(dueTag('2026-12-01', '2026-11-29')).toEqual({ kind: 'soon', days: 2 }))
  it('기한 없음은 null', () => expect(dueTag(null, '2026-11-19')).toBeNull())
})
