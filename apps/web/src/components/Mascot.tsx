import { useRef, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import './mascot.css'

// 젤리 큐브 마스코트(system.md "마스코트"). 에이전트를 나타내는 자리에만 둔다. 장식이라 aria-hidden이고 옆 글자가 이름을 맡는다.
export type MascotSize = 20 | 28 | 36 | 48 | 72 | 88 | 160
export type MascotPose = 'stand' | 'wave' | 'sit'

const BASE_SIZE = 235 // 원본 jelly-mascot.html의 크기. --k = size / 235
const IDLE_MIN = 88 // 반복 움직임은 이 크기 이상에서만
const SHADOW_MIN = 64 // 바닥 그림자는 이 크기 이상에서만
const BOUNCE_MS = 820

type Props = {
  size: MascotSize
  pose?: MascotPose
  /** 둥실 뜨기·깜빡임·손 흔들기. 88 미만이면 무시한다 */
  idle?: boolean
  /** 누르면 말랑하게 튄다(S1 로그인 160만). 버튼이 아니라 키보드 초점은 받지 않는다 */
  bounce?: boolean
  className?: string
}

export function Mascot({ size, pose = 'stand', idle = false, bounce = false, className }: Props) {
  const cubeRef = useRef<HTMLSpanElement>(null)
  const armRefs = useRef<(HTMLElement | null)[]>([])
  const running = useRef<Animation[]>([])

  function stop() {
    for (const a of running.current) a.cancel()
    running.current = []
  }

  // 원본 jelly-mascot.html의 click 동작: 눌림 → 튀어 오름 → 출렁임, 두 팔은 26°씩 벌렸다 돌아온다
  function play() {
    if (!bounce || !cubeRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    stop()
    const timing = { duration: BOUNCE_MS, easing: 'ease-in-out' }
    const lift = (size / BASE_SIZE) * -27
    running.current.push(
      cubeRef.current.animate(
        [
          { transform: 'scale(1.12, 0.81)' },
          { transform: `translateY(${lift}px) scale(0.92, 1.12)`, offset: 0.3 },
          { transform: 'scale(1.06, 0.94)', offset: 0.62 },
          { transform: 'scale(0.98, 1.03)', offset: 0.83 },
          { transform: 'none' },
        ],
        timing,
      ),
    )
    armRefs.current.forEach((arm, i) => {
      if (!arm) return
      const deg = i === 0 ? 26 : -26
      running.current.push(
        arm.animate([{ transform: 'none' }, { transform: `rotate(${deg}deg)`, offset: 0.32 }, { transform: 'none' }], timing),
      )
    })
  }

  const style = { '--size': size, '--k': size / BASE_SIZE } as CSSProperties

  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        'mascot relative block shrink-0',
        pose !== 'stand' && `is-${pose}`,
        idle && size >= IDLE_MIN && 'is-idle',
        bounce && 'cursor-pointer touch-manipulation',
        className,
      )}
      onPointerDown={bounce ? stop : undefined}
      onClick={bounce ? play : undefined}
    >
      {size >= SHADOW_MIN && <span className="mascot-shadow" />}
      <span className="mascot-float">
        <span ref={cubeRef} className="mascot-cube">
          <i className="mascot-limb mascot-foot mascot-left" />
          <i className="mascot-limb mascot-foot mascot-right" />
          <i ref={(el) => void (armRefs.current[0] = el)} className="mascot-limb mascot-arm mascot-left" />
          <i ref={(el) => void (armRefs.current[1] = el)} className="mascot-limb mascot-arm mascot-right" />
          <span className="mascot-face">
            <i className="mascot-eye mascot-left" />
            <i className="mascot-eye mascot-right" />
          </span>
        </span>
      </span>
    </span>
  )
}
