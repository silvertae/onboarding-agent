import { BusinessCard } from '@/components/BusinessCard'
import type { Json } from '@/lib/database.types'
import type { TaskView } from '@/lib/tasks'
import type { Hire } from './hires'
import { isRecord } from './json'

type Field = { key: string; label: string }

function fieldsOf(task: TaskView): Field[] {
  const schema = task.template.form_schema
  if (!isRecord(schema) || !Array.isArray(schema.fields)) return []
  return schema.fields.filter(isRecord).map((f) => ({ key: String(f.key), label: String(f.label ?? f.key) }))
}

function text(value: Json | undefined): string {
  if (value === undefined || value === null || value === '') return '—'
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

// 명함(GA-07) 자동 채움 미리보기: 이름·직급·팀·메일은 프로필, 영문 이름은 신입 입력
function BusinessCardPreview({ englishName, hire }: { englishName: string; hire?: Hire }) {
  return (
    <figure aria-label="명함 미리보기" className="m-0 mt-3 max-w-[360px]">
      <BusinessCard name={hire?.full_name} jobTitle={hire?.job_title} teamName={hire?.team?.name} englishName={englishName} email={hire?.email} />
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

  const fields = fieldsOf(task)
  const rows: Field[] = fields.length > 0 ? fields : Object.keys(result).map((key) => ({ key, label: key === 'checked' ? '체크한 항목' : key }))
  const englishName = typeof result.english_name === 'string' ? result.english_name : null

  return (
    <div>
      <dl className="grid grid-cols-[minmax(96px,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className="break-keep text-muted-foreground">{row.label}</dt>
            <dd className="whitespace-pre-wrap break-words">{text(result[row.key])}</dd>
          </div>
        ))}
      </dl>
      {englishName && <BusinessCardPreview englishName={englishName} hire={hire} />}
    </div>
  )
}
