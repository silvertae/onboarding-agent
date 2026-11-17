import type { Json } from '@/lib/database.types'

export function isRecord(value: Json | null | undefined): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
