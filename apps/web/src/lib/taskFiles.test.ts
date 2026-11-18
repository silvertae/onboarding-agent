import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbError, isAuthError } from './errors'

const m = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  insert: vi.fn(),
  del: vi.fn(),
  getSession: vi.fn(),
  order: [] as string[],
  select: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: m.getSession },
    storage: { from: vi.fn(() => ({ upload: m.upload, remove: m.remove, createSignedUrl: m.createSignedUrl })) },
    from: vi.fn(() => ({ insert: m.insert, delete: m.del, select: m.select })),
  },
}))

import {
  checkFormFile,
  deleteTaskFile,
  downloadTaskFile,
  formatFileMeta,
  formExt,
  MAX_FORM_BYTES,
  signedDownloadUrl,
  useTemplateFiles,
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

  it('한글 이름은 NFC로 적는다(맥에서 끌어온 NFD 이름)', async () => {
    const nfd = '신청서.pdf'.normalize('NFD')
    expect(nfd).not.toBe('신청서.pdf')
    await uploadTaskFile({ id: 'tpl', org_id: 'org' }, fileOf(nfd, 7))
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ file_name: '신청서.pdf' }))
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

  // storage-api는 토큰 검증 실패를 HTTP 400으로 돌려준다. 401로 담아야 화면이 로그아웃한다(SECURITY.md 웹: 401 → 로그아웃).
  it('만료·잘못된 토큰(InvalidJWT)은 HTTP 400이어도 401로 담는다', async () => {
    m.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'jwt expired', status: 400, statusCode: 'InvalidJWT', code: 'InvalidJWT' },
    })
    const err = await signedDownloadUrl(row).catch((e: unknown) => e)
    expect(err).toMatchObject({ name: 'DbError', status: 401, code: 'InvalidJWT' })
    expect(isAuthError(err)).toBe(true)
  })

  it('토큰 검증 실패를 AccessDenied로 돌려주는 storage-api(로컬 v1.96)도 401로 담는다', async () => {
    for (const message of ['"exp" claim timestamp check failed', 'signature verification failed', 'jwt malformed']) {
      m.upload.mockResolvedValue({ data: null, error: { message, status: 400, statusCode: '403', code: 'AccessDenied' } })
      const err = await uploadTaskFile({ id: 'tpl', org_id: 'org' }, fileOf('a.pdf', 3)).catch((e: unknown) => e)
      expect(err).toMatchObject({ name: 'DbError', status: 401 })
      expect(isAuthError(err)).toBe(true)
    }
  })

  it('RLS 거부(AccessDenied, 행 보안 정책)는 401로 바꾸지 않는다(로그아웃하지 않는다)', async () => {
    m.upload.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy', status: 400, statusCode: '403', code: 'AccessDenied' },
    })
    const err = await uploadTaskFile({ id: 'tpl', org_id: 'org' }, fileOf('a.pdf', 3)).catch((e: unknown) => e)
    expect(err).toMatchObject({ name: 'DbError', status: 400, code: 'AccessDenied' })
    expect(isAuthError(err)).toBe(false)
  })
})

describe('signedDownloadUrl', () => {
  // storage-js 2.119는 download 이름을 두 번 인코딩한다(%25EB…). 그래서 이름은 서명 URL에 싣지 않는다.
  it('60초 서명 URL을 download 옵션 없이 받는다', async () => {
    m.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/y' }, error: null })
    await expect(signedDownloadUrl(row)).resolves.toBe('https://x/y')
    expect(m.createSignedUrl).toHaveBeenCalledWith('org/tpl/abc.xlsx', 60)
  })
})

describe('downloadTaskFile', () => {
  const SIGNED = 'http://127.0.0.1:54321/storage/v1/object/sign/task-forms/org/tpl/abc.xlsx?token=t'
  const OBJECT_URL = 'blob:http://localhost/obj-1'
  const fetchMock = vi.fn()
  const createObjectURL = vi.fn()
  const revokeObjectURL = vi.fn()
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  let clicked: { href: string; download: string; inDom: boolean; revokedAtClick: boolean }[]
  let clickSpy: { mockRestore: () => void } | undefined
  // jsdom의 Blob과 Node의 Response는 서로 섞이지 않는다. 구현이 쓰는 ok·status·blob()만 흉내 낸다.
  const response = (status: number, body = '') => ({
    ok: status >= 200 && status < 300,
    status,
    blob: async () => new Blob([body]),
  })

  beforeEach(() => {
    clicked = []
    m.createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null })
    fetchMock.mockResolvedValue(response(200, 'xlsx-bytes'))
    createObjectURL.mockReturnValue(OBJECT_URL)
    vi.stubGlobal('fetch', fetchMock)
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({
        href: this.href,
        download: this.download,
        inDom: document.body.contains(this),
        revokedAtClick: revokeObjectURL.mock.calls.length > 0,
      })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    clickSpy?.mockRestore()
    URL.createObjectURL = original.create
    URL.revokeObjectURL = original.revoke
  })

  it('서명 URL을 직접 받아 원본 이름 그대로 저장하게 한다', async () => {
    vi.useFakeTimers()
    await downloadTaskFile(row)

    expect(m.createSignedUrl).toHaveBeenCalledWith('org/tpl/abc.xlsx', 60)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(SIGNED)
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(clicked).toEqual([{ href: OBJECT_URL, download: '법인카드 신청서.xlsx', inDom: true, revokedAtClick: false }])
    expect(document.querySelector('a[download]')).toBeNull()

    // 누른 뒤에 객체 URL을 놓는다(누르자마자 놓으면 Safari가 내려받기를 끊는다)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL)
  })

  it('받은 내용을 Blob으로 넘긴다', async () => {
    await downloadTaskFile(row)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    await expect(blob.text()).resolves.toBe('xlsx-bytes')
  })

  it('응답이 실패면 HTTP 상태를 담은 DbError로 거절하고 아무것도 누르지 않는다', async () => {
    fetchMock.mockResolvedValue(response(404, '{"error":"not_found"}'))
    const err = await downloadTaskFile(row).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DbError)
    expect(err).toMatchObject({ name: 'DbError', status: 404 })
    expect(isAuthError(err)).toBe(false)
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(clicked).toEqual([])
  })

  it('응답이 401이면 인증 오류로 거절한다(호출한 쪽이 로그아웃)', async () => {
    fetchMock.mockResolvedValue(response(401))
    const err = await downloadTaskFile(row).catch((e: unknown) => e)
    expect(err).toMatchObject({ name: 'DbError', status: 401 })
    expect(isAuthError(err)).toBe(true)
  })

  it('서명이 토큰 만료로 실패하면 받지 않고 401로 거절한다', async () => {
    m.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'jwt expired', status: 400, statusCode: 'InvalidJWT', code: 'InvalidJWT' },
    })
    const err = await downloadTaskFile(row).catch((e: unknown) => e)
    expect(err).toMatchObject({ name: 'DbError', status: 401 })
    expect(isAuthError(err)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useTemplateFiles 순서', () => {
  it('기본 서식 먼저, 그다음 올린 순서(오래된 것 먼저)로 요청한다', async () => {
    const order = vi.fn()
    const result = { data: [row], error: null, status: 200 }
    order.mockReturnValueOnce({ order }).mockReturnValueOnce(Promise.resolve(result))
    m.select.mockReturnValue({ eq: () => ({ order }) })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
    const { result: hook } = renderHook(() => useTemplateFiles('tpl'), { wrapper })
    await waitFor(() => expect(hook.current.isSuccess).toBe(true))
    expect(order.mock.calls).toEqual([
      ['is_seed', { ascending: false }],
      ['created_at', { ascending: true }],
    ])
  })
})
