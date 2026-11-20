import { useId, useState } from 'react'
import { useAuth } from '@/app/AuthProvider'
import { BusinessCard, type BusinessCardProps } from '@/components/BusinessCard'
import { businessCardProps } from '@/components/businessCardProps'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { formatError, readFormFields, type FormField } from '@/lib/formSchema'
import { useTeamName } from '../useTeamName'
import type { BodyProps } from './types'

function initialValues(fields: FormField[], result: unknown): Record<string, string> {
  const prev = (result ?? {}) as Record<string, unknown>
  return Object.fromEntries(fields.map((f) => [f.key, typeof prev[f.key] === 'string' ? (prev[f.key] as string) : '']))
}

// 명함 과제(GA-07): 한글 이름은 프로필, 나머지는 입력값으로 그리는 읽기 전용 미리보기.
function BusinessCardPreview({ card }: { card: BusinessCardProps }) {
  return (
    <figure aria-label="명함 자동 채움 미리보기" className="m-0 flex min-w-0 flex-[1_1_280px] flex-col gap-3">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-row font-semibold">자동 채움 미리보기</span>
        <span className="text-xs text-muted-foreground">입력 내용 기준</span>
      </figcaption>
      <BusinessCard {...card} />
    </figure>
  )
}

type FieldProps = {
  field: FormField
  id: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}

function FormFieldInput({ field: f, id, value, disabled, onChange }: FieldProps) {
  const error = formatError(f, value)
  const note = error ?? f.hint
  const noteId = `${id}-note`
  const common = {
    id,
    value,
    disabled,
    required: f.required,
    'aria-describedby': note ? noteId : undefined,
    'aria-invalid': error ? true : undefined,
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {f.label}
        {f.required && (
          <span className="text-st-rework-fg" aria-hidden>
            *
          </span>
        )}
      </Label>
      {f.type === 'select' ? (
        <NativeSelect size="lg" {...common} onChange={(e) => onChange(e.target.value)}>
          <option value="">골라 주세요</option>
          {(f.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.value}
            </option>
          ))}
        </NativeSelect>
      ) : f.type === 'textarea' ? (
        <Textarea {...common} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="flex items-center gap-2">
          <Input
            size="lg"
            {...common}
            className="min-w-0 flex-1"
            placeholder={f.placeholder}
            inputMode={f.format === 'tel' ? 'tel' : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          {f.suffix && <span className="shrink-0 text-muted-foreground">{f.suffix}</span>}
        </div>
      )}
      {note && (
        <span id={noteId} className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          {note}
        </span>
      )}
    </div>
  )
}

// input: form_schema의 칸을 그린다. 필수 칸이 비었거나 형식이 틀리면 제출할 수 없다.
export function FormBody({ task, disabled, children }: BodyProps) {
  const { profile } = useAuth()
  const teamName = useTeamName(profile?.team_id)
  const fields = readFormFields(task.template.form_schema)
  const [values, setValues] = useState(() => initialValues(fields, task.result))
  const idPrefix = useId()
  const ready = fields.every((f) => (!f.required || values[f.key].trim() !== '') && formatError(f, values[f.key]) === null)
  const result = Object.fromEntries(fields.map((f) => [f.key, values[f.key].trim()]))
  const card = businessCardProps(fields, values, {
    full_name: profile?.full_name,
    job_title: profile?.job_title,
    team_name: teamName,
    email: profile?.email,
  })

  return (
    <>
      <div className="flex flex-wrap gap-7 border-t border-border px-5 py-6 sm:px-7">
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          <h3 className="text-row font-semibold">입력</h3>
          {fields.map((f) => (
            <FormFieldInput
              key={f.key}
              field={f}
              id={`${idPrefix}-${f.key}`}
              value={values[f.key]}
              disabled={disabled}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
            />
          ))}
        </div>
        {card && <BusinessCardPreview card={card} />}
      </div>
      {children({ result, ready })}
    </>
  )
}
