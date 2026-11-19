import { fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'
import { Mascot } from './Mascot'

function root(container: HTMLElement) {
  return container.firstElementChild as HTMLElement
}

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

const originalAnimate = HTMLElement.prototype.animate

describe('Mascot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    HTMLElement.prototype.animate = originalAnimate
  })

  it('장식이라 화면 읽기에 드러나지 않는다', () => {
    const { container } = render(<Mascot size={36} />)
    expect(root(container)).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('img')).toBeNull()
  })

  it('크기를 --size·--k(size/235) 숫자로 넘겨 그 정사각형 자리를 차지한다', () => {
    const { container } = render(<Mascot size={88} />)
    expect(root(container).style.getPropertyValue('--size')).toBe('88')
    expect(Number(root(container).style.getPropertyValue('--k'))).toBeCloseTo(88 / 235)
  })

  it('포즈 클래스: stand는 기본, wave·sit은 is-wave·is-sit', () => {
    expect(root(render(<Mascot size={36} />).container)).not.toHaveClass('is-wave', 'is-sit')
    expect(root(render(<Mascot size={36} pose="wave" />).container)).toHaveClass('is-wave')
    expect(root(render(<Mascot size={36} pose="sit" />).container)).toHaveClass('is-sit')
  })

  it('idle은 88 이상에서만 is-idle을 붙인다', () => {
    expect(root(render(<Mascot size={88} idle />).container)).toHaveClass('is-idle')
    expect(root(render(<Mascot size={160} idle />).container)).toHaveClass('is-idle')
    expect(root(render(<Mascot size={72} idle />).container)).not.toHaveClass('is-idle')
    expect(root(render(<Mascot size={88} />).container)).not.toHaveClass('is-idle')
  })

  it('바닥 그림자는 64 이상에서만 그린다', () => {
    expect(render(<Mascot size={48} />).container.querySelector('.mascot-shadow')).toBeNull()
    expect(render(<Mascot size={72} />).container.querySelector('.mascot-shadow')).not.toBeNull()
  })

  it('크기 단계 밖의 값은 타입에서 막는다', () => {
    // @ts-expect-error 30은 크기 단계(20·28·36·48·72·88·160)가 아니다
    render(<Mascot size={30} />)
  })

  describe('누르면 튀기(bounce)', () => {
    function stubAnimate() {
      const animations: { cancel: ReturnType<typeof vi.fn> }[] = []
      const animate = vi.fn(() => {
        const a = { cancel: vi.fn() }
        animations.push(a)
        return a as unknown as Animation
      })
      HTMLElement.prototype.animate = animate
      return { animate, animations }
    }

    it('누르면 몸통과 두 팔을 튀게 하고, 이어서 누르면 앞 동작을 끊는다', () => {
      mockReducedMotion(false)
      const { animate, animations } = stubAnimate()
      const { container } = render(<Mascot size={160} pose="wave" bounce />)

      fireEvent.click(root(container))
      expect(animate).toHaveBeenCalledTimes(3) // 몸통 + 두 팔
      expect(animate.mock.contexts[0]).toBe(container.querySelector('.mascot-cube'))

      fireEvent.pointerDown(root(container))
      for (const a of animations) expect(a.cancel).toHaveBeenCalled()
    })

    it('동작 줄이기 설정이면 눌러도 움직이지 않는다', () => {
      mockReducedMotion(true)
      const { animate } = stubAnimate()
      const { container } = render(<Mascot size={160} bounce />)
      fireEvent.click(root(container))
      expect(animate).not.toHaveBeenCalled()
    })

    it('bounce가 없으면 눌러도 움직이지 않는다', () => {
      mockReducedMotion(false)
      const { animate } = stubAnimate()
      const { container } = render(<Mascot size={160} />)
      fireEvent.click(root(container))
      expect(animate).not.toHaveBeenCalled()
    })

    it('버튼이 아니라 키보드 초점을 받지 않는다', () => {
      const { container } = render(<Mascot size={160} bounce />)
      expect(root(container)).not.toHaveAttribute('tabindex')
      expect(root(container).tagName).toBe('SPAN')
    })
  })
})
