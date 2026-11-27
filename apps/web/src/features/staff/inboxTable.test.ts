import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportRows } from './inboxTable'
import { HIRES, makeTask } from './testFixtures'

describe('exportRows', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-27T03:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  const hireById = new Map(HIRES.map((h) => [h.id, h]))

  it('머리글과 칸 값. 담당자 처리 todo는 "담당자 처리 예정", 끝난 과제는 지난 일수가 비어 있다', () => {
    const { header, rows } = exportRows(
      [
        makeTask({ new_hire_id: 'h1', status: 'todo', due_date: '2026-11-20', template: { title: '출입카드 발급', completion_mode: 'staff_only' } }),
        makeTask({ new_hire_id: 'h2', status: 'done', due_date: '2026-11-20', template: { title: '명함 신청' } }),
        makeTask({ new_hire_id: 'nobody', status: 'todo', due_date: null, template: { title: '기한 없는 과제' } }),
      ],
      hireById,
    )
    expect(header).toEqual(['입사자', '팀', '과제', '상태', '차례', '제출 시각', '기한', '지난 일수'])
    expect(rows).toEqual([
      ['김하늘', 'AI팀', '출입카드 발급', '담당자 처리 예정', '담당자', '', '2026-11-20', '7'],
      ['정민서', 'AI팀', '명함 신청', '완료', '신입', '', '2026-11-20', ''],
      ['이름 없음', '', '기한 없는 과제', '할 일', '신입', '', '', ''],
    ])
  })
})
