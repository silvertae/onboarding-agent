import html from '../index.html?raw'
import favicon from '../public/favicon.svg?raw'
import touchIcon from '../public/apple-touch-icon.png'

// 탭 아이콘과 홈 화면 아이콘은 마스코트(system.md "마스코트"). 파일은 public/에 있다
describe('index.html 아이콘', () => {
  it('탭 아이콘은 마스코트 favicon.svg다', () => {
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
    expect(favicon).toContain('젤리 큐브 마스코트')
  })

  it('홈 화면 아이콘(apple-touch-icon)을 연결한다', () => {
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
    expect(touchIcon).toBeTruthy()
  })
})
