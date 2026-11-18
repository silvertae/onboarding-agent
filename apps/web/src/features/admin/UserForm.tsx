import { useId, useRef, useState, type FormEvent } from 'react'
import { SegmentedRadio } from '@/components/SegmentedRadio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AgentError } from '@/lib/agent'
import type { Enums } from '@/lib/database.types'
import { OWNER_LABEL, ROLE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { createUser, type CreateUserRequest, type Team } from './users'

type Role = CreateUserRequest['role']
type Department = Enums<'ops_department'>

const ROLES: Role[] = ['new_hire', 'team_trainer', 'ops_staff']
const DEPARTMENTS = Object.keys(OWNER_LABEL) as Department[]

export const DUPLICATE_EMAIL = '이미 등록된 메일이에요'
export const CREATE_FAILED = '계정을 만들지 못했어요. 다시 시도해 주세요'

export type CreatedUser = { id: string; fullName: string; role: Role; where: string }

function todayInSeoul(): string {
  // sv-SE 형식이 YYYY-MM-DD다
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

const selectClass =
  'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30'
const inputClass = 'h-10 bg-card'

export function UserForm({ teams, onCreated }: { teams: Team[]; onCreated: (user: CreatedUser) => void }) {
  const ids = useId()
  const [role, setRole] = useState<Role>('new_hire')
  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [teamId, setTeamId] = useState('')
  const [department, setDepartment] = useState<Department | ''>('')
  const [hireDate, setHireDate] = useState(todayInSeoul)
  const [needsHqAccess, setNeedsHqAccess] = useState(true)

  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // 팀을 아직 고르지 않았으면 첫 팀을 기본값으로 둔다
  const selectedTeam = teamId || teams[0]?.id || ''
  const needsTeam = role !== 'ops_staff'

  const valid =
    fullName.trim().length > 0 &&
    jobTitle.trim().length > 0 &&
    email.trim().includes('@') &&
    password.length >= 8 &&
    password.length <= 72 &&
    (role === 'ops_staff' ? department !== '' : selectedTeam !== '') &&
    (role !== 'new_hire' || hireDate !== '')

  function buildRequest(): CreateUserRequest {
    const base = { email: email.trim(), password, full_name: fullName.trim(), job_title: jobTitle.trim(), role }
    if (role === 'ops_staff') return { ...base, department: department as Department }
    if (role === 'team_trainer') return { ...base, team_id: selectedTeam }
    return { ...base, team_id: selectedTeam, hire_date: hireDate, needs_hq_access: needsHqAccess }
  }

  function describe(): string {
    if (role === 'ops_staff') return department ? OWNER_LABEL[department as Department] : ''
    return teams.find((t) => t.id === selectedTeam)?.name ?? ''
  }

  function reset() {
    setFullName('')
    setJobTitle('')
    setEmail('')
    setPassword('')
    setDepartment('')
    setHireDate(todayInSeoul())
    setNeedsHqAccess(true)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    // 연타해도 요청은 한 번만 보낸다
    if (!valid || running.current) return
    running.current = true
    setBusy(true)
    setEmailError(null)
    setFormError(null)
    try {
      const id = await createUser(buildRequest())
      onCreated({ id, fullName: fullName.trim(), role, where: describe() })
      reset()
    } catch (err) {
      // 실패하면 입력값을 그대로 두고 안내만 한다
      if (err instanceof AgentError && err.status === 409) setEmailError(DUPLICATE_EMAIL)
      else if (err instanceof AgentError && err.status === 422) setFormError(err.message)
      else setFormError(CREATE_FAILED)
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const field = (name: string) => `${ids}-${name}`

  return (
    <form onSubmit={submit} aria-label="계정 등록" noValidate>
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-lg font-bold">계정 등록</h2>
        <p className="text-xs text-muted-foreground">관리자 계정은 만들 수 없어요</p>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-2">
          <span id={field('role')} className="text-sm font-semibold">
            역할
          </span>
          <SegmentedRadio
            name={field('role-choice')}
            labelledBy={field('role')}
            options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            value={role}
            onChange={setRole}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={field('name')}>이름</Label>
            <Input
              id={field('name')}
              className={inputClass}
              value={fullName}
              maxLength={50}
              placeholder="홍길동"
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={field('title')}>직급</Label>
            <Input
              id={field('title')}
              className={inputClass}
              value={jobTitle}
              maxLength={50}
              placeholder="사원"
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={field('email')}>메일</Label>
          <Input
            id={field('email')}
            type="email"
            autoComplete="off"
            className={inputClass}
            value={email}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? field('email-error') : undefined}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailError(null)
            }}
          />
          {emailError && (
            <p id={field('email-error')} className="text-xs text-destructive">
              {emailError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={field('password')}>초기 비밀번호</Label>
          <Input
            id={field('password')}
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={password}
            maxLength={72}
            aria-describedby={field('password-hint')}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p id={field('password-hint')} className="text-xs text-muted-foreground">
            8자 이상
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl bg-muted p-4">
          {role === 'ops_staff' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={field('department')}>부서</Label>
              <select
                id={field('department')}
                className={selectClass}
                value={department}
                onChange={(e) => setDepartment(e.target.value as Department | '')}
              >
                <option value="">부서 선택</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {OWNER_LABEL[d]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className={cn('grid gap-3', needsTeam && role === 'new_hire' && 'grid-cols-2')}>
              <div className="flex flex-col gap-2">
                <Label htmlFor={field('team')}>소속 팀</Label>
                <select
                  id={field('team')}
                  className={selectClass}
                  value={selectedTeam}
                  onChange={(e) => setTeamId(e.target.value)}
                >
                  {teams.length === 0 && <option value="">팀 없음</option>}
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {role === 'new_hire' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={field('hire-date')}>입사일</Label>
                  <Input
                    id={field('hire-date')}
                    type="date"
                    className={inputClass}
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          {role === 'new_hire' && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={needsHqAccess}
                  onChange={(e) => setNeedsHqAccess(e.target.checked)}
                />
                본사 출입 대상
              </label>
              <p className="text-xs text-muted-foreground">등록하면 온보딩 과제가 바로 만들어져요.</p>
            </>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
      </div>

      {/* 폼이 길어도 등록 버튼이 화면 아래에 붙어 보이게 한다 */}
      <div className="sticky bottom-0 z-10 flex justify-end rounded-b-[18px] border-t border-border bg-card px-5 py-4">
        <Button type="submit" className="h-11 px-6 text-base" disabled={!valid || busy}>
          {busy ? '만드는 중…' : '계정 만들기'}
        </Button>
      </div>
    </form>
  )
}
