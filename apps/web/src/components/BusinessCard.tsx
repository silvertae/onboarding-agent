import logoUrl from '@/assets/blueward-logo.png'

type Props = {
  name?: string | null
  jobTitle?: string | null
  teamName?: string | null
  englishName: string
  email?: string | null
}

// 명함(GA-07) 앞면. 신입 과제 화면(입력 중 미리보기)과 담당자 업무함(제출 내용)이 같은 모양을 쓴다.
// 이름·직급·팀·메일은 프로필, 영문 이름은 신입 입력. 데이터 조회는 각 화면이 하고 여기서는 그리기만 한다.
export function BusinessCard({ name, jobTitle, teamName, englishName, email }: Props) {
  const meta = [jobTitle, teamName].filter(Boolean).join(' · ')
  return (
    <div className="flex aspect-[90/50] flex-col justify-between rounded-[10px] border border-input bg-white px-6 py-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
      <img src={logoUrl} alt="Blueward" className="h-4 w-auto self-start" />
      <div className="flex flex-col gap-0.5">
        <p className="text-[17px]">
          <b>{name || '이름'}</b>
          {meta && (
            <>
              {' '}
              <span className="text-xs font-normal text-[var(--text-secondary)]">{meta}</span>
            </>
          )}
        </p>
        <span className="text-xs font-semibold tracking-[0.4px] text-primary">{englishName.trim() || '영문 이름'}</span>
        {email && <span className="mt-1.5 text-[11px] break-all text-muted-foreground">{email}</span>}
      </div>
    </div>
  )
}
