import { describe, expect, it } from 'vitest'
import { toCsv, toXlsx } from './export'

describe('toCsv', () => {
  it('쉼표·따옴표·줄바꿈을 감싼다', () =>
    expect(toCsv(['a'], [['x,"y"\nz']])).toBe('\uFEFFa\r\n"x,""y""\nz"\r\n'))

  it('수식으로 시작하는 칸은 작은따옴표를 붙인다', () =>
    expect(toCsv(['a'], [['=SUM(1)'], ['+1'], ['-1'], ['@x']])).toBe("\uFEFFa\r\n'=SUM(1)\r\n'+1\r\n'-1\r\n'@x\r\n"))
})

describe('toXlsx', () => {
  it('toXlsx는 xlsx Blob을 만든다', async () => {
    // 실제 라이브러리로 확인한다(mock하지 않는다). 처음 2바이트가 'PK'(zip)
    const blob = await toXlsx('기한 지남', ['이름', '과제'], [['김신입', '=SUM(1)']])
    // jsdom의 Blob은 Response로 읽히지 않아 FileReader로 읽는다
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(blob)
    })
    const bytes = new Uint8Array(buffer)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
    if (blob.type) expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })
})
