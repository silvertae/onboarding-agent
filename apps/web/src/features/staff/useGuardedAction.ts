import { useCallback, useRef, useState } from 'react'

const FALLBACK = '처리하지 못했어요. 잠시 후 다시 시도해 주세요.'

// 버튼 연타로 RPC가 두 번 나가지 않게 하나씩만 실행하고, 실패 문구를 보관한다.
export function useGuardedAction() {
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    if (running.current) return false
    running.current = true
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : FALLBACK)
      return false
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [])

  return { busy, error, run }
}
