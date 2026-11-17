import type { BodyProps } from './types'

// ops·practice·read: 안내문(공통 영역)만 있고 따로 받을 값이 없다.
export function GuideBody({ children }: BodyProps) {
  return <>{children({ ready: true })}</>
}
