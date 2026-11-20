// 입력 양식 과제(kind = input)의 칸 정의(task_templates.form_schema) 해석.
// 신입 입력 화면과 담당자 제출 내용이 같이 쓴다. 형식 검사는 화면에서만 한다(서버 검사 없음).

export type FormOption = { value: string; english?: string }

export type FormField = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select'
  required?: boolean
  placeholder?: string
  hint?: string
  // 입력 칸 오른쪽에 붙는 고정 글자(예: 이메일 도메인). 저장값에는 넣지 않는다.
  suffix?: string
  format?: 'tel' | 'email_local'
  options?: FormOption[]
  // text 칸의 영문 대응표(예: 직급 → 영문 직급)
  english?: Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readFormFields(schema: unknown): FormField[] {
  const fields = isRecord(schema) ? schema.fields : undefined
  return Array.isArray(fields) ? (fields.filter(isRecord) as FormField[]) : []
}

export function englishOf(field: FormField, value: string): string {
  const v = value.trim()
  if (field.type === 'select') return field.options?.find((o) => o.value === v)?.english ?? ''
  return field.english?.[v] ?? ''
}

const FORMATS = {
  tel: { pattern: /^[0-9][0-9-]{6,}$/, message: '숫자와 하이픈(-)만 입력해 주세요' },
  email_local: { pattern: /^[A-Za-z0-9._-]+$/, message: '영문·숫자·점(.)·밑줄(_)·하이픈(-)만 입력해 주세요' },
} as const

export function formatError(field: FormField, value: string): string | null {
  const v = value.trim()
  const rule = field.format ? FORMATS[field.format] : undefined
  if (!v || !rule) return null
  return rule.pattern.test(v) ? null : rule.message
}
