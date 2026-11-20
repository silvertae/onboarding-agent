import { BusinessCard, type BusinessCardProps } from '@/components/BusinessCard'
import { businessCardProps } from '@/components/businessCardProps'
import type { Json } from '@/lib/database.types'
import { readFormFields } from '@/lib/formSchema'
import type { TaskView } from '@/lib/tasks'
import type { Hire } from './hires'
import { isRecord } from './json'

type Row = { key: string; label: string; suffix?: string }

function text(value: Json | undefined): string {
  if (value === undefined || value === null || value === '') return '—'
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

// 값이 있을 때만 고정 글자(예: 이메일 도메인)를 붙인다.
function withSuffix(value: string, suffix?: string): string {
  return suffix && value !== '—' ? value + suffix : value
}

// 명함(GA-07) 미리보기: 한글 이름은 프로필, 나머지는 신입 입력(옛 기록은 프로필 직급·팀·메일)
function BusinessCardPreview({ card }: { card: BusinessCardProps }) {
  return (
    <figure aria-label="명함 미리보기" className="m-0 mt-3 max-w-[360px]">
      <BusinessCard {...card} />
    </figure>
  )
}

// 신입이 제출한 내용(task_instances.result)을 과제 종류에 맞게 보여 준다.
export function SubmittedResult({ task, hire }: { task: TaskView; hire?: Hire }) {
  const result = task.result
  if (result === null || result === undefined) {
    const sent = task.status === 'submitted' || task.status === 'done'
    return <p className="text-sm text-muted-foreground">{sent ? '입력 내용 없이 제출 여부만 확인하는 과제예요.' : '아직 제출 전이에요.'}</p>
  }
  if (!isRecord(result)) return <p className="text-sm">{text(result)}</p>

  const fields = readFormFields(task.template.form_schema)
  const rows: Row[] =
    fields.length > 0
      ? fields.map((f) => ({ key: String(f.key), label: String(f.label ?? f.key), suffix: f.suffix }))
      : Object.keys(result).map((key) => ({ key, label: key === 'checked' ? '체크한 항목' : key }))
  const card =
    typeof result.english_name === 'string'
      ? businessCardProps(fields, result, {
          full_name: hire?.full_name,
          job_title: hire?.job_title,
          team_name: hire?.team?.name,
          email: hire?.email,
        })
      : null

  return (
    <div>
      <dl className="grid grid-cols-[minmax(96px,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className="break-keep text-muted-foreground">{row.label}</dt>
            <dd className="whitespace-pre-wrap break-words">{withSuffix(text(result[row.key]), row.suffix)}</dd>
          </div>
        ))}
      </dl>
      {card && <BusinessCardPreview card={card} />}
    </div>
  )
}
