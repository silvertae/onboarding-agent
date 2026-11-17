// 조회·RPC 실패를 상태 코드와 함께 던진다. 인증 오류(401, JWT 만료)면 호출한 쪽이 로그아웃시킨다.
export class DbError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'DbError'
    this.status = status
    this.code = code
  }
}

// PGRST301: JWT 만료·검증 실패, PGRST303: JWT claim 검증 실패
export function isAuthError(err: unknown): boolean {
  if (!(err instanceof DbError)) return false
  return err.status === 401 || err.code === 'PGRST301' || err.code === 'PGRST303'
}
