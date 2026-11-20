import { englishOf, type FormField } from '@/lib/formSchema'
import type { BusinessCardProps } from './BusinessCard'

export type CardProfile = {
  full_name?: string | null
  job_title?: string | null
  team_name?: string | null
  email?: string | null
}

const NO_DIVISION = '공란'

function text(values: Record<string, unknown>, key: string): string {
  const v = values[key]
  return typeof v === 'string' ? v.trim() : ''
}

// 명함(GA-07) 그리기 값. 한글 이름은 프로필, 나머지는 입력값이다.
// 옛 기록(영문 이름만 받던 때, job_title 키가 없다)은 직급·팀·메일을 프로필에서 채운다.
export function businessCardProps(
  fields: FormField[],
  values: Record<string, unknown>,
  profile: CardProfile,
): BusinessCardProps | null {
  if (!fields.some((f) => f.key === 'english_name')) return null
  const englishName = text(values, 'english_name')

  if (!('job_title' in values)) {
    return {
      name: profile.full_name,
      jobTitle: profile.job_title,
      englishName,
      division: profile.team_name,
      email: profile.email,
    }
  }

  const field = (key: string) => fields.find((f) => f.key === key)
  const jobTitle = text(values, 'job_title')
  const division = text(values, 'division')
  const emailId = text(values, 'email_id')
  const jobField = field('job_title')
  const divisionField = field('division')
  const hasDivision = division !== '' && division !== NO_DIVISION
  return {
    name: profile.full_name,
    jobTitle,
    englishName,
    englishTitle: jobField ? englishOf(jobField, jobTitle) : '',
    division: hasDivision ? division : null,
    englishDivision: hasDivision && divisionField ? englishOf(divisionField, division) : '',
    email: emailId ? emailId + (field('email_id')?.suffix ?? '') : null,
    phone: text(values, 'phone'),
  }
}
