import { useId, useState } from 'react'
import { useAuth } from '@/app/AuthProvider'
import { BusinessCard } from '@/components/BusinessCard'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTeamName } from '../useTeamName'
import { TEXTAREA_CLASS, type BodyProps } from './types'

type Field = { key: string; label: string; type: 'text' | 'textarea'; required?: boolean; placeholder?: string }

function readFields(schema: unknown): Field[] {
  const fields = (schema as { fields?: unknown } | null)?.fields
  return Array.isArray(fields) ? (fields as Field[]) : []
}

function initialValues(fields: Field[], result: unknown): Record<string, string> {
  const prev = (result ?? {}) as Record<string, unknown>
  return Object.fromEntries(fields.map((f) => [f.key, typeof prev[f.key] === 'string' ? (prev[f.key] as string) : '']))
}

// 명함 과제(GA-07): 영문 이름 외 정보는 프로필에서 채운다. 읽기 전용 미리보기.
function BusinessCardPreview({ englishName }: { englishName: string }) {
  const { profile } = useAuth()
  const teamName = useTeamName(profile?.team_id)
  return (
    <figure aria-label="명함 자동 채움 미리보기" className="m-0 flex min-w-0 flex-[1_1_280px] flex-col gap-3">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-[15px] font-semibold">자동 채움 미리보기</span>
        <span className="text-xs text-muted-foreground">프로필 기준</span>
      </figcaption>
      <BusinessCard
        name={profile?.full_name}
        jobTitle={profile?.job_title}
        teamName={teamName}
        englishName={englishName}
        email={profile?.email}
      />
    </figure>
  )
}

// input: form_schema의 칸을 그린다. 필수 칸이 공백이면 제출할 수 없다.
export function FormBody({ task, disabled, children }: BodyProps) {
  const fields = readFields(task.template.form_schema)
  const [values, setValues] = useState(() => initialValues(fields, task.result))
  const idPrefix = useId()
  const hasCardPreview = fields.some((f) => f.key === 'english_name')
  const ready = fields.every((f) => !f.required || values[f.key].trim() !== '')
  const result = Object.fromEntries(fields.map((f) => [f.key, values[f.key].trim()]))

  return (
    <>
      <div className="flex flex-wrap gap-7 border-t border-border px-5 py-6 sm:px-7">
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          <h3 className="text-[15px] font-semibold">입력</h3>
          {fields.map((f) => {
            const id = `${idPrefix}-${f.key}`
            const common = {
              id,
              value: values[f.key],
              placeholder: f.placeholder,
              disabled,
              required: f.required,
              onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.key]: e.target.value })),
            }
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label htmlFor={id}>
                  {f.label}
                  {f.required && (
                    <span className="text-st-rework-fg" aria-hidden>
                      *
                    </span>
                  )}
                </Label>
                {f.type === 'textarea' ? <textarea className={TEXTAREA_CLASS} {...common} /> : <Input {...common} />}
              </div>
            )
          })}
        </div>
        {hasCardPreview && <BusinessCardPreview englishName={values.english_name ?? ''} />}
      </div>
      {children({ result, ready })}
    </>
  )
}
