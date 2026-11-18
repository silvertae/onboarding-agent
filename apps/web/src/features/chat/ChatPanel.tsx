import { ArrowUp, BookOpen, ChevronRight, CircleAlert, Clock, ListChecks, MessageSquare, RotateCw, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/app/AuthProvider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import symbolUrl from './blueward-symbol.png'
import { MAX_MESSAGE_LENGTH, useChatStream, type ChatMessage } from './useChatStream'

const SUGGESTIONS = ['오늘 뭐 해야 해?', '회의실 예약 어떻게 해?', '노트북 경비 계정과목이 뭐야?']
const HANDED_OVER = '담당자에게 전달했어요'
const QUOTA_HINT = '내일 오전 0시에 다시 쓸 수 있어요. 급한 내용은 담당자에게 문의해 주세요.'

type ChatAskEvent = CustomEvent<{ text?: string }>

// 신입 화면(S2·S3) 오른쪽 채팅 패널(S4). 신입이 아니면 페이지만 그린다.
// 데스크톱은 페이지 옆에 고정, 모바일은 "에이전트에게 묻기" 버튼으로 여는 전체 화면.
export function ChatPanel({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (profile?.role !== 'new_hire') return <>{children}</>
  return (
    <div className="mx-auto flex max-w-[1376px] items-start lg:gap-2 lg:pr-8">
      {/* 모바일: 아래 "에이전트에게 묻기" 버튼(바닥 24 + 높이 44)이 마지막 내용(과제 상세의 완료 버튼 등)을 덮지 않게 여백을 둔다 */}
      <div className="min-w-0 flex-1 pb-16 lg:pb-0">{children}</div>
      <ChatAside />
    </div>
  )
}

function ChatAside() {
  const { messages, sending, send } = useChatStream()
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false) // 모바일 전체 화면 열림
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const counterId = useId()
  const introId = useId()
  const empty = messages.length === 0

  const tooLong = input.length > MAX_MESSAGE_LENGTH
  const canSend = !sending && input.trim().length > 0 && !tooLong

  // S3의 "이 과제에 대해 물어보기" → 입력창을 채우고 패널을 연다(보내지는 않는다)
  useEffect(() => {
    function onAsk(event: Event) {
      const text = (event as ChatAskEvent).detail?.text
      if (!text) return
      setInput(text)
      setOpen(true)
      inputRef.current?.focus()
    }
    window.addEventListener('chat:ask', onAsk)
    return () => window.removeEventListener('chat:ask', onAsk)
  }, [])

  // 새 글자가 오면 맨 아래로
  useEffect(() => {
    const body = bodyRef.current
    if (body) body.scrollTop = body.scrollHeight
  }, [messages])

  function submit(text: string) {
    if (sending) return
    if (text === input) setInput('')
    void send(text)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // 한글 조합 중 Enter는 글자 확정이므로 보내지 않는다
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (canSend) submit(input)
  }

  const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.text

  return (
    <>
      <aside
        aria-label="온보딩 에이전트 채팅"
        className={cn(
          'fixed inset-0 z-40 flex-col bg-card lg:sticky lg:top-6 lg:z-auto lg:my-10 lg:flex lg:h-[calc(100svh-7rem)] lg:w-[400px] lg:shrink-0 lg:overflow-hidden lg:rounded-[18px] lg:border lg:border-border',
          open ? 'flex' : 'hidden',
        )}
      >
        <header className="flex items-center gap-2.5 border-b border-border px-4 py-3 lg:px-5 lg:py-4">
          <img src={symbolUrl} alt="" className="size-8 shrink-0 rounded-[10px]" />
          <div className="flex flex-1 flex-col leading-tight">
            <b className="text-row">온보딩 에이전트</b>
            <span className="text-xs text-muted-foreground">회사·팀 지식으로 답해요</span>
          </div>
          <Button variant="ghost" size="icon" aria-label="채팅 닫기" className="lg:hidden" onClick={() => setOpen(false)}>
            <X />
          </Button>
        </header>

        <div ref={bodyRef} className="flex flex-1 flex-col gap-4 overflow-y-auto bg-surface-chat p-4 lg:p-5">
          {empty && (
            // 대화 전(시안 S4 ①): 가운데 소개와 추천 질문 카드. 아래 칩 줄은 첫 메시지 뒤에만 보인다.
            <section aria-labelledby={introId} className="my-auto flex w-full flex-col items-center gap-1 text-center">
              <img src={symbolUrl} alt="" className="mb-2 size-11 rounded-[12px]" />
              <p id={introId} className="text-lead font-semibold">
                온보딩에 대해 물어보세요
              </p>
              <p className="text-sm text-muted-foreground">등록된 사내 지식과 내 과제로 답해요</p>
              <div role="group" aria-label="추천 질문" className="mt-4 flex w-full flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={sending}
                    onClick={() => submit(s)}
                    className="group/suggest flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-card py-2 pr-3 pl-3.5 text-left text-sm outline-none hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                  >
                    {s}
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground group-hover/suggest:text-primary" aria-hidden />
                  </button>
                ))}
              </div>
            </section>
          )}
          {messages.map((message, i) =>
            message.role === 'user' ? (
              <p
                key={i}
                className="max-w-[85%] self-end rounded-[18px_18px_4px_18px] bg-primary px-3.5 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground"
              >
                {message.text}
              </p>
            ) : (
              <AssistantMessage
                key={i}
                message={message}
                pending={sending && i === messages.length - 1}
                onRetry={lastUserText ? () => submit(lastUserText) : undefined}
                onNavigate={() => setOpen(false)}
              />
            ),
          )}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-border px-3 pt-3 pb-5 lg:px-4 lg:pb-3.5">
          {!empty && (
            <div role="group" aria-label="추천 질문" className="-my-1 flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] lg:flex-wrap">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={sending}
                  onClick={() => submit(s)}
                  className="relative h-9 shrink-0 rounded-full border border-input bg-card px-3.5 text-label outline-none after:absolute after:inset-x-0 after:-inset-y-1 hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div
            className={cn(
              'flex items-end gap-2 rounded-[14px] border border-input bg-card py-1.5 pr-1.5 pl-3.5 focus-within:border-ring',
              tooLong && 'border-st-rework-fg focus-within:border-st-rework-fg',
            )}
          >
            <label htmlFor="chat-input" className="sr-only">
              질문 입력
            </label>
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={sending ? '답변이 끝나면 보낼 수 있어요' : '궁금한 걸 물어보세요'}
              aria-describedby={counterId}
              aria-invalid={tooLong || undefined}
              className="field-sizing-content max-h-40 min-h-6 flex-1 resize-none bg-transparent py-2 text-sm outline-none"
            />
            <button
              type="button"
              aria-label="보내기"
              disabled={!canSend}
              onClick={() => submit(input)}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] disabled:bg-track disabled:text-disabled-foreground"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          </div>
          <span id={counterId} className={cn('text-right text-xs text-muted-foreground tabular-nums', tooLong && 'text-st-rework-fg')}>
            {input.length.toLocaleString('ko-KR')} / {MAX_MESSAGE_LENGTH}
            {tooLong && ` · ${MAX_MESSAGE_LENGTH}자까지 보낼 수 있어요`}
          </span>
        </div>
      </aside>

      {!open && (
        <Button
          size="lg"
          className="fixed right-4 bottom-6 z-30 shadow-[0_8px_24px_rgba(6,71,154,0.35)] lg:hidden"
          onClick={() => setOpen(true)}
        >
          <MessageSquare aria-hidden />
          에이전트에게 묻기
        </Button>
      )}
    </>
  )
}

function AssistantMessage({
  message,
  pending,
  onRetry,
  onNavigate,
}: {
  message: ChatMessage
  pending: boolean
  onRetry?: () => void
  onNavigate: () => void
}) {
  if (message.error) {
    if (!message.retryable) {
      return (
        <Alert variant="warning" role="status" className="rounded-xl px-3">
          <Clock aria-hidden />
          <AlertTitle className="font-semibold">{message.error}</AlertTitle>
          {message.error === '오늘 사용 한도를 넘었어요' && <AlertDescription>{QUOTA_HINT}</AlertDescription>}
        </Alert>
      )
    }
    return (
      <Alert variant="destructive" className="rounded-xl px-3">
        <CircleAlert aria-hidden />
        <AlertDescription>{message.error}</AlertDescription>
        {onRetry && (
          <Button variant="destructive" size="sm" className="mt-2 justify-self-start" onClick={onRetry}>
            <RotateCw aria-hidden />
            다시 시도
          </Button>
        )}
      </Alert>
    )
  }

  if (pending && !message.text) {
    return (
      <span
        role="status"
        aria-label="답변 중"
        className="inline-flex gap-1 self-start rounded-[18px_18px_18px_4px] border border-border bg-card px-3.5 py-4"
      >
        <i className="size-1.5 animate-pulse rounded-full bg-tertiary" />
        <i className="size-1.5 animate-pulse rounded-full bg-tertiary/70 [animation-delay:150ms]" />
        <i className="size-1.5 animate-pulse rounded-full bg-tertiary/45 [animation-delay:300ms]" />
      </span>
    )
  }

  const { knowledge = [], tasks = [] } = message.sources ?? {}
  return (
    <div className="flex max-w-[92%] flex-col gap-2 self-start">
      <p
        className={cn(
          'rounded-[18px_18px_18px_4px] border border-border bg-card px-3.5 py-3 text-sm whitespace-pre-wrap',
          message.unanswered && 'border-alert-warn-border bg-alert-warn-bg',
        )}
      >
        {message.text}
        {pending && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-primary align-[-2px]" aria-hidden />}
      </p>
      {message.unanswered && (
        <span className="text-xs text-muted-foreground">
          {message.text.includes(HANDED_OVER) ? '' : `${HANDED_OVER}. `}답이 등록되면 같은 질문에 답할 수 있어요.
        </span>
      )}
      {knowledge.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>근거</span>
          {knowledge.map((k) => (
            <span key={k.id} className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 text-foreground">
              <BookOpen className="size-3" aria-hidden />
              {k.question}
            </span>
          ))}
        </div>
      )}
      {tasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>관련 과제</span>
          {tasks.map((t) => (
            <Link
              key={t.id}
              to={`/me/tasks/${t.id}`}
              onClick={onNavigate}
              className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 text-primary hover:underline"
            >
              <ListChecks className="size-3" aria-hidden />
              {t.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
