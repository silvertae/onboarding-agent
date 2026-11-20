import logoUrl from '@/assets/blueward-logo.png'

export type BusinessCardProps = {
  name?: string | null
  jobTitle?: string | null
  englishName: string
  englishTitle?: string
  division?: string | null
  englishDivision?: string
  email?: string | null
  phone?: string
}

// 명함(GA-07) 앞면. 신입 과제 화면(입력 중 미리보기)과 담당자 업무함(제출 내용)이 같은 모양을 쓴다.
// 값 계산은 businessCardProps가 하고 여기서는 그리기만 한다. 시안 S3-task-detail·S9-ops.
export function BusinessCard({ name, jobTitle, englishName, englishTitle, division, englishDivision, email, phone }: BusinessCardProps) {
  return (
    <div className="flex aspect-[90/50] flex-col justify-between gap-3 rounded-[10px] border border-input bg-white px-6 py-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
      <img src={logoUrl} alt="Blueward" className="h-4 w-auto self-start" />
      <div className="flex flex-col gap-0.5">
        <p className="text-[17px]">
          <b>{name || '이름'}</b>
          {jobTitle && (
            <>
              {' '}
              <span className="text-xs font-normal text-[var(--text-secondary)]">{jobTitle}</span>
            </>
          )}
        </p>
        <p className="text-xs font-semibold tracking-[0.4px] text-primary">
          <span>{englishName.trim() || '영문 이름'}</span>
          {englishTitle && (
            <>
              {' · '}
              <span className="font-normal">{englishTitle}</span>
            </>
          )}
        </p>
        {division && (
          <p data-testid="card-division" className="mt-1 text-xs text-[var(--text-secondary)]">
            <span>{division}</span>
            {englishDivision && (
              <>
                {' · '}
                <span className="text-muted-foreground">{englishDivision}</span>
              </>
            )}
          </p>
        )}
        {(email || phone) && (
          // 좁은 명함에서 메일은 어디서든 줄을 바꾸고, 연락처는 숫자 중간에서 끊기지 않게 한 덩어리로 둔다.
          <p className="mt-1.5 flex flex-wrap gap-x-1.5 text-[11px] text-muted-foreground">
            {email && <span className="break-all">{email}</span>}
            {email && phone && <span aria-hidden>·</span>}
            {phone && <span className="whitespace-nowrap">{phone}</span>}
          </p>
        )}
      </div>
    </div>
  )
}
