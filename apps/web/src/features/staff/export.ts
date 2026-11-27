// 담당자 화면의 표 내려받기(CSV·엑셀).

// 엑셀이 수식으로 읽는 첫 글자
const FORMULA_START = /^[=+\-@]/
// 큰따옴표로 감싸야 하는 글자
const NEEDS_QUOTE = /[",\r\n]/

function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return NEEDS_QUOTE.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

// 앞에 BOM, 줄 끝 \r\n. 쉼표·따옴표·줄바꿈이 있으면 큰따옴표로 감싸고, = + - @ 로 시작하면 앞에 ' 를 붙인다(수식 실행 방지)
export function toCsv(header: string[], rows: string[][]): string {
  return '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(',') + '\r\n').join('')
}

// 객체 URL은 누른 뒤 한참 있다 놓는다. 누르자마자 놓으면 Safari가 내려받기를 끊는다.
const REVOKE_AFTER_MS = 40_000

// Blob을 파일로 내려받는다
export function downloadBlob(filename: string, blob: Blob): void {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), REVOKE_AFTER_MS)
}

// write-excel-file은 이 함수가 불릴 때만 불러온다. 모든 칸은 문자열, 머리글 행은 굵게.
export async function toXlsx(sheetName: string, header: string[], rows: string[][]): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const data = [
    header.map((value) => ({ value, type: String, fontWeight: 'bold' as const })),
    ...rows.map((row) => row.map((value) => ({ value, type: String }))),
  ]
  return writeExcelFile(data, { sheet: sheetName }).toBlob()
}
