import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  insert: vi.fn(),
  del: vi.fn(),
  getSession: vi.fn(),
  order: [] as string[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: m.getSession },
    storage: { from: vi.fn(() => ({ upload: m.upload, remove: m.remove, createSignedUrl: m.createSignedUrl })) },
    from: vi.fn(() => ({ insert: m.insert, delete: m.del })),
  },
}))

import {
  checkFormFile,
  deleteTaskFile,
  formatFileMeta,
  formExt,
  MAX_FORM_BYTES,
  signedDownloadUrl,
  uploadTaskFile,
  type TaskFile,
} from './taskFiles'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function fileOf(name: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name)
}

const row: TaskFile = {
  id: 'f1',
  org_id: 'org',
  template_id: 'tpl',
  file_name: '법인카드 신청서.xlsx',
  storage_path: 'org/tpl/abc.xlsx',
  size_bytes: 10,
  uploaded_by: 'u1',
  is_seed: false,
  created_at: '2026-11-18T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  m.order.length = 0
  m.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
  m.upload.mockResolvedValue({ data: {}, error: null })
  m.remove.mockImplementation(async () => {
    m.order.push('remove')
    return { data: [], error: null }
  })
  m.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: row, error: null, status: 201 }) }) })
  m.del.mockReturnValue({
    eq: () => ({
      select: async () => {
        m.order.push('delete')
        return { data: [{ id: 'f1' }], error: null, status: 200 }
      },
    }),
  })
})

describe('formExt', () => {
  it('확장자를 소문자로 돌려준다', () => {
    expect(formExt('신청서.PDF')).toBe('pdf')
    expect(formExt('보고서.final.xlsx')).toBe('xlsx')
    expect(formExt('노트')).toBeNull()
    expect(formExt('a.exe')).toBeNull()
  })
})

describe('checkFormFile', () => {
  it('형식과 크기를 검사한다', () => {
    expect(checkFormFile(fileOf('a.pdf', 0))).toBe('type')
    expect(checkFormFile(fileOf('a.exe', 5))).toBe('type')
    expect(checkFormFile(fileOf('a.docx', MAX_FORM_BYTES + 1))).toBe('size')
    expect(checkFormFile(fileOf('a.docx', MAX_FORM_BYTES))).toBe('ok')
  })
})

describe('formatFileMeta', () => {
  it('KB는 올림, MB는 소수 1자리', () => {
    expect(formatFileMeta({ file_name: 'a.xlsx', size_bytes: 48_500 })).toBe('Excel · 48KB')
    expect(formatFileMeta({ file_name: 'a.pdf', size_bytes: 2_500_000 })).toBe('PDF · 2.4MB')
  })
})

describe('uploadTaskFile', () => {
  it('ASCII 경로로 올리고 원본 이름을 테이블에 적는다', async () => {
    await uploadTaskFile({ id: 'tpl', org_id: 'org' }, fileOf('법인카드 신청서.xlsx', 7))
    const [path, , opts] = m.upload.mock.calls[0]
    expect(path).toMatch(/^org\/tpl\/[0-9a-f-]{36}\.xlsx$/)
    expect(opts).toEqual({ contentType: XLSX, upsert: false })
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org',
        template_id: 'tpl',
        file_name: '법인카드 신청서.xlsx',
        size_bytes: 7,
        uploaded_by: 'u1',
        storage_path: path,
      }),
    )
  })

  it('테이블 추가가 실패하면 올린 객체를 지우고 DbError를 던진다', async () => {
    m.insert.mockReturnValue({
      select: () => ({ single: async () => ({ data: null, error: { message: 'dup', code: '23505' }, status: 409 }) }),
    })
    const err = await uploadTaskFile({ id: 'tpl', org_id: 'org' }, fileOf('a.pdf', 3)).catch((e: unknown) => e)
    expect(err).toMatchObject({ name: 'DbError', code: '23505' })
    const path = m.upload.mock.calls[0][0]
    expect(m.remove).toHaveBeenCalledTimes(1)
    expect(m.remove).toHaveBeenCalledWith([path])
  })

  it('올리기가 실패하면 테이블에 쓰지 않는다', async () => {
    m.upload.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(uploadTaskFile({ id: 'tpl', org_id: 'org' }, fileOf('a.pdf', 3))).rejects.toMatchObject({
      name: 'DbError',
    })
    expect(m.insert).not.toHaveBeenCalled()
  })
})

describe('deleteTaskFile', () => {
  it('테이블 행을 먼저 지우고 객체를 지운다', async () => {
    await deleteTaskFile(row)
    expect(m.order).toEqual(['delete', 'remove'])
    expect(m.remove).toHaveBeenCalledWith(['org/tpl/abc.xlsx'])
  })

  it('지워진 행이 없으면 객체를 지우지 않고 오류를 던진다', async () => {
    m.del.mockReturnValue({ eq: () => ({ select: async () => ({ data: [], error: null, status: 200 }) }) })
    await expect(deleteTaskFile(row)).rejects.toMatchObject({ name: 'DbError' })
    expect(m.remove).not.toHaveBeenCalled()
  })
})

describe('deleteTaskFile 객체 삭제 실패', () => {
  it('행을 지운 뒤 remove가 실패하면 DbError로 거절한다', async () => {
    m.remove.mockResolvedValue({ data: null, error: { message: 'gone wrong', status: 500 } })
    await expect(deleteTaskFile(row)).rejects.toMatchObject({ name: 'DbError', status: 500 })
    expect(m.del).toHaveBeenCalledTimes(1)
    expect(m.remove).toHaveBeenCalledTimes(1)
  })
})

describe('storage 오류 상태', () => {
  it('올리기 오류의 숫자 status와 code를 DbError에 담는다', async () => {
    m.upload.mockResolvedValue({
      data: null,
      error: { message: 'exists', status: 409, statusCode: '409', code: 'ResourceAlreadyExists' },
    })
    await expect(uploadTaskFile({ id: 'tpl', org_id: 'org' }, fileOf('a.pdf', 3))).rejects.toMatchObject({
      name: 'DbError',
      status: 409,
      code: 'ResourceAlreadyExists',
    })
  })

  it('status가 없으면 statusCode 문자열로 대신한다', async () => {
    m.upload.mockResolvedValue({ data: null, error: { message: 'denied', statusCode: '403' } })
    await expect(uploadTaskFile({ id: 'tpl', org_id: 'org' }, fileOf('a.pdf', 3))).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe('signedDownloadUrl', () => {
  it('60초 서명 URL을 원본 이름으로 받는다', async () => {
    m.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/y' }, error: null })
    await expect(signedDownloadUrl(row)).resolves.toBe('https://x/y')
    expect(m.createSignedUrl).toHaveBeenCalledWith('org/tpl/abc.xlsx', 60, { download: '법인카드 신청서.xlsx' })
  })
})
