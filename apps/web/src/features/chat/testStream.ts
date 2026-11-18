// 테스트용 /chat 응답. 계약(docs/contracts.md)의 "data: {json}\n\n" 형식을 만든다.

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'sources'; knowledge: { id: string; question: string }[]; tasks: { id: string; code: string; title: string }[]; documents?: { id: string; document_title: string; label: string; heading: string; body: string }[] }
  | { type: 'unanswered' }
  | { type: 'error'; message: string }
  | { type: 'done' }

export function sse(events: StreamEvent[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
}

// 한 줄을 여러 조각으로 쪼개 보내서 조각 경계를 넘는 파싱도 확인한다.
export function streamResponse(events: StreamEvent[], chunkSize = 7): Response {
  const body = sse(events)
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < body.length; i += chunkSize) controller.enqueue(encoder.encode(body.slice(i, i + chunkSize)))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

// 끝나지 않는 스트림(전송 중 상태 확인용). finish()로 나머지를 보내고 닫는다.
export function pendingResponse(first: StreamEvent[]) {
  const encoder = new TextEncoder()
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller
      controller.enqueue(encoder.encode(sse(first)))
    },
  })
  return {
    response: new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    finish(rest: StreamEvent[] = [{ type: 'done' }]) {
      ctrl.enqueue(encoder.encode(sse(rest)))
      ctrl.close()
    },
  }
}
