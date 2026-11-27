import { describe, expect, it } from 'vitest'

// 웹 테스트는 실행하는 PC·CI의 시간대와 상관없이 서울 시간대로 돈다(vite.config.ts test.env.TZ).
// 서비스 기준 시간대가 서울이라, 브라우저 날짜를 쓰는 화면 테스트가 다른 시간대에서 하루 밀리지 않게 한다.
describe('테스트 시간대', () => {
  it('서울 시간대로 실행된다', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Seoul')
    // UTC 15:30 = 서울 다음 날 00:30
    expect(new Date('2026-11-18T15:30:00Z').getDate()).toBe(19)
  })
})
