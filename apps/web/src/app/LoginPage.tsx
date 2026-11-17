import { CalendarDays, Check, Info, MessageSquare, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import logoUrl from '@/assets/blueward-logo.png'
import { Navigate } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'
import { DemoChip } from './Layout'
import { HOME_BY_ROLE } from './RoleGuard'

const INVALID_CREDENTIALS = '메일 또는 비밀번호를 확인해 주세요.'
const LOGIN_FAILED = '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.'

const FEATURES = [
  { icon: CalendarDays, title: '단계별 타임라인', caption: '입사일 · 첫 주 · 첫 달' },
  { icon: MessageSquare, title: '근거 있는 답변', caption: '모르면 담당자에게 전달' },
  { icon: Check, title: '담당자 확인', caption: '인사 · 총무 · 회계 · AI팀' },
]

export function LoginPage() {
  const { session, profile, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session && profile) return <Navigate to={HOME_BY_ROLE[profile.role]} replace />

  async function signIn(nextEmail: string, nextPassword: string) {
    setSubmitting(true)
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: nextEmail, password: nextPassword })
      if (authError) setError(authError.status === 400 ? INVALID_CREDENTIALS : LOGIN_FAILED)
    } catch {
      setError(LOGIN_FAILED)
    } finally {
      setSubmitting(false)
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void signIn(email.trim(), password)
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="flex flex-1 flex-wrap items-stretch">
        <section className="flex min-w-0 flex-[1_1_480px] flex-col justify-between gap-12 border-r border-border bg-card px-6 py-16 sm:px-[clamp(24px,6vw,96px)]">
          <img src={logoUrl} alt="Blueward" className="h-8 w-auto self-start" />
          <div className="flex max-w-[520px] flex-col gap-5">
            <DemoChip className="self-start" />
            <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl sm:leading-[54px]">
              입사 첫날부터 첫 달까지,
              <br />
              할 일과 답을 한곳에서.
            </h1>
            <p className="text-[17px] leading-[25px] text-[var(--text-secondary)]">
              온보딩 에이전트는 신입의 과제 타임라인을 안내하고, 회사·팀 지식으로 질문에 답하며, 담당자 확인까지 이어 줍니다.
            </p>
          </div>
          <div className="grid max-w-[640px] grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, caption }) => (
              <div key={title} className="flex flex-col gap-1.5">
                <Icon className="size-5 text-primary" aria-hidden />
                <b className="text-sm">{title}</b>
                <span className="text-xs text-muted-foreground">{caption}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-[1_1_480px] items-center justify-center px-6 py-16">
          <Card className="w-full max-w-[420px] gap-5 rounded-[18px] p-10">
            <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-2xl font-semibold">로그인</h2>
                <p className="text-sm text-muted-foreground">안내받은 계정으로 로그인해 주세요.</p>
              </div>
              <Alert role="note" className="border-accent bg-accent text-accent-foreground">
                <Info aria-hidden />
                <AlertDescription className="text-accent-foreground">
                  가상 데이터로 운영되는 데모입니다. 계정은 안내받은 정보를 사용해 주세요.
                </AlertDescription>
              </Alert>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">메일</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={error === INVALID_CREDENTIALS || undefined}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error === INVALID_CREDENTIALS || undefined}
                  required
                />
              </div>
              {error && (
                <Alert variant="destructive" className="border-[#f3c5c1] bg-[#fde8e6]">
                  <TriangleAlert aria-hidden />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" size="lg" className="h-11 w-full" disabled={submitting || !email || !password}>
                {submitting ? '로그인 중…' : '로그인'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">로그인하면 역할에 맞는 화면으로 이동합니다.</p>
            </form>
            {import.meta.env.DEV && <DevDemoAccounts disabled={submitting} onPick={(e, p) => void signIn(e, p)} />}
          </Card>
        </section>
      </div>
      <footer className="flex flex-wrap justify-between gap-2 border-t border-border px-8 py-4 text-xs text-muted-foreground">
        <span>© Blueward · 사내 AI Agent 경진대회 출품 데모</span>
        <span>모든 인물·조직·데이터는 가상입니다.</span>
      </footer>
    </div>
  )
}

// 개발 모드 전용. 운영 빌드에서는 import.meta.env.DEV가 false로 치환되어 이 컴포넌트가 렌더링되지 않는다.
// 로컬 기본 계정(scripts/with-local-env.sh의 DEMO_PASSWORD 기본값)만 다룬다.
function DevDemoAccounts({ disabled, onPick }: { disabled: boolean; onPick: (email: string, password: string) => void }) {
  const accounts = [
    { label: '신입', email: 'newhire@demo.test' },
    { label: '교육 담당자', email: 'trainer@demo.test' },
    { label: '인사', email: 'hr@demo.test' },
    { label: '총무', email: 'ga@demo.test' },
    { label: '회계', email: 'acc@demo.test' },
  ]
  return (
    <div data-testid="demo-accounts" className="flex flex-col gap-2 border-t border-dashed border-border pt-4">
      <span className="text-xs text-muted-foreground">개발 모드 · 로컬 데모 계정</span>
      <div className="flex flex-wrap gap-2">
        {accounts.map((a) => (
          <Button key={a.email} type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onPick(a.email, 'demo1234')}>
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
