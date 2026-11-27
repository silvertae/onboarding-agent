# 기한 신호(신입 "지금 할 일" 보강 · 부서 업무함 "기한 초과" 탭) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.


**Goal:** 신입은 "지금 할 일"에서 기한이 얼마나 남았는지 한눈에 보고, 경영지원 담당자는 업무함에서 기한이 지난 과제와 오래 기다린 확인 대기를 찾아 Excel(.xlsx)이나 CSV로 골라 내려받는다.

**Architecture:** 웹만 바꾼다. 마이그레이션·RPC·RLS·에이전트는 건드리지 않는다. 기한 판단은 서울 날짜 기준으로 통일한다. 데이터는 지금 쓰는 `useMyTasks`·`useVisibleTasks`(`task_instances.due_date`·`submitted_at`)를 그대로 쓴다. 내려받기 파일은 브라우저에서 만든다. CSV는 직접 Blob으로, xlsx는 `write-excel-file`을 그 버튼을 누를 때만 불러와(dynamic import) 만든다. 초기 번들은 커지지 않는다.

**Tech Stack:** React + TS, Vitest + Testing Library, Tailwind 의미 토큰, `features/staff/ui.tsx`의 SegmentTabs, `write-excel-file`(새 의존성, xlsx 쓰기 전용·MIT. 설치한 버전의 README·타입으로 사용법을 확인한다)

**Spec:** `docs/superpowers/specs/2026-11-27-due-signals-design.md`(Task 1에서 작성). 근거는 이 대화에서 Leo가 고른 두 가지다. ① A는 새 카드를 만들지 않고 기존 "지금 할 일" 카드를 보강한다. ② 병목 보드는 새 화면이 아니라 S9의 "기한 초과" 탭으로 만든다.

## 실행 방식 (Leo 지시 2026-11-27)

병렬로 할 수 있는 할 일은 서브에이전트에게 맡긴다. 모든 구현은 karpathy-guidelines를 따른다(최소 코드, 필요한 곳만 고치기, 성공 기준을 테스트로 확인). 브랜치 하나(`feat/due-signals`)에서 일하고, 서브에이전트는 **서로 다른 파일만** 고치며 커밋하지 않는다. 각 묶음이 끝나면 내가 diff·테스트를 확인하고 할 일별로 커밋한다.

| 묶음 | 동시에 하는 일 | 고치는 파일 |
|---|---|---|
| 1 | Task 1 시안·문서(나), Task 2 `dueTag`(서브에이전트), Task 4a·5a 보조 함수(서브에이전트: `staff/format.ts`의 `daysLate`·`daysWaiting`, `staff/export.ts`, 의존성 설치) | docs/…, `newhire/format*`, `staff/format*`·`staff/export*`·`apps/web/package*.json` |
| ─ | **Leo 시안 확인** | |
| 2 | Task 3 S2(서브에이전트), Task 4b S9 탭(서브에이전트) | `newhire/TaskRow`·`HomePage*`, `staff/OpsInboxPage*` |
| 3 | Task 5b 내려받기 버튼(같은 파일이라 Task 4b 뒤) | `staff/OpsInboxPage*` |
| 4 | Task 6 검토·PR(나), 마지막에 새 검토자 1명이 브랜치 전체 검토 | |

Task 4·5의 보조 함수 단계(format·export 테스트와 구현)는 묶음 1에서, 화면 단계는 묶음 2·3에서 한다.

## Context

1차 심사 기간 중에 SuccessFactors·Workday 조사에서 나온 기능 가운데 작고 시연 효과가 큰 두 가지를 넣는다.

- S2에는 "지금 할 일"이 이미 있다(`apps/web/src/features/newhire/HomePage.tsx:214-244`). 다만 기한은 "기한 11월 18일 (수) · 지남"만 표시하고, 오늘 날짜를 **브라우저 시간**으로 계산한다(`toDateOnly`).
- S9의 확인 대기 탭은 이미 `submitted_at` 오름차순이다. 하지만 기한이 지난 과제를 모아 보는 곳과 대기 일수 표시, 내보내기는 없다.

## Global Constraints

- 화면 문구는 한국어로 쓰고, 상태 문구는 `lib/labels.ts`의 `STATUS_LABEL`만 쓴다.
- 색은 의미 토큰만 쓴다. 기한 지남은 신입 화면에서 `text-st-rework-fg`, 담당자 화면에서 `font-semibold text-destructive`(기존 규칙)로 표시한다. hex, 임의 글자 크기, 직접 만든 탭은 쓰지 않는다. `bash scripts/check-design.sh`를 통과해야 한다.
- 탭은 `SegmentTabs`/`SegmentTabList`/`SegmentTabPanel`만 쓴다. 숫자에는 `tabular-nums`를 쓴다. 좁은 화면에서는 `WIDE_CELL`과 `RowMeta`를 쓴다.
- 오늘 날짜는 `todaySeoul()`(`features/staff/format.ts`)로 구한다.
- 공통 영역(`apps/web/src/lib`, `src/app`)은 고치지 않는다. 새 보조 함수는 `features/*` 안에 둔다.
- 시안(`S2-me.html`, `S9-ops.html` + png)을 먼저 고치고 Leo 확인을 받은 뒤 구현한다(CLAUDE.md UI 작업 2단계).

## Review Focus

1. **자정 무렵 시간대**: 브라우저가 UTC이고 시각이 `2026-11-18T15:30Z`(서울 11/19 00:30)이면 오늘은 11/19다. 기한이 11/18인 과제는 "지남", 기한이 11/19인 과제는 "오늘 마감"이어야 한다. 테스트는 Task 2·3에 둔다.
2. **기한이 없는 과제**(`due_date` null): 신입 화면에 D-day 표시가 없고, 기한 초과 탭에도 들어가지 않는다. 테스트는 Task 2·4에 둔다.
3. **내려받기 특수문자**: 과제명이나 이름에 쉼표, 큰따옴표, 줄바꿈이 있거나 `=`·`+`·`-`·`@`로 시작하면 깨지지 않고 수식으로 실행되지 않아야 한다. Excel에서 한글이 보이도록 CSV에 BOM을 넣는다. xlsx는 모든 칸을 문자열로 넣는다. 테스트는 Task 5에 둔다.
4. **보완 요청 과제의 대기 일수**: `request_rework`는 `submitted_at`을 지우지 않는다. 그래서 대기 일수는 `status === 'submitted'`일 때만 표시해야 한다. 테스트는 Task 4에 둔다.
5. **입사자 필터와 새 탭**: 입사자 필터를 고른 채로 "기한 초과" 탭으로 가면 그 입사자의 기한 초과 과제만 보이고, 탭 개수 배지는 부서 전체 수를 유지한다(기존 탭과 같다). 테스트는 Task 4에 둔다.

---

### Task 1: 설계 문서·시안·화면 명세 (Leo 확인 지점)

**Files:**
- Create: `docs/superpowers/specs/2026-11-27-due-signals-design.md`(짧은 설계. 의도, 목표·비목표, 두 결정, 아래 "정한 것")
- Modify: `docs/design/onboarding-design/screens/S2-me.html`, `S9-ops.html`, `png/S2-me.png`, `png/S9-ops.png`
- Modify: `docs/screens.md` S2·S9 절, 필요하면 `.interface-design/system.md`(D-day 표기 규칙 한 줄), `docs/demo-script.md`·`docs/judge-guide.md`(S9 탭 순서를 적은 곳이 있으면)

**정한 것(설계 문서에 그대로 적는다):**
- S2 행 기한 표기(신입이 할 차례인 과제만. `isHiresTurn` 기준은 지금과 같다):
  - 지남: `기한 11월 18일 (수) · 지남`(st-rework-fg)
  - 오늘: `· 오늘 마감`(st-rework-fg)
  - 1~7일 남음: `· D-3`(muted)
  - 8일 이상 남음: 날짜만 표시
- S2 인사 문구: `지금 할 일 N건, 보완 요청 M건, 기한 지남 K건이 있어요.`(0인 항목은 뺀다). 정렬과 5건 제한은 그대로 둔다.
- S9 탭 순서: `확인 대기 · 기한 초과 · 내가 처리할 일 · 입사자별 · 전체`. 기본 탭은 "확인 대기"로 둔다.
- 기한 초과 대상: 우리 부서 과제 가운데 `done`·`na`가 아니고 `due_date < 오늘(서울)`인 과제(blocked 포함). 정렬은 기한 오름차순, 같으면 입사자 이름순.
- 기한 초과 탭의 열: 입사자 · 과제 · 상태 · **차례** · 기한(`11/20 · 7일 지남`). "제출 시각" 열 자리를 "차례"로 바꾼다.
  - 차례 판정: `blocked`이면 `선행 과제 대기`, `submitted`이거나 `staff_only`이면 `담당자`, 나머지(todo·rework)는 `신입`
- 확인 대기 탭의 제출 시각 칸: `11/17 13:05 · 3일 대기`. 대기 일수 1일 이상일 때만 붙이고, 3일 이상이면 `font-semibold text-destructive`로 표시한다.
- 요약 카드: 4번째 카드 `기한 초과`(설명 "기한이 지난 우리 부서 과제")를 추가한다. 격자는 `md:grid-cols-2 xl:grid-cols-4`.
- 내려받기 버튼 두 개: `Excel 내려받기`, `CSV 내려받기`(페이지 머리 동작, 기본 크기, outline, lucide `Download`). 드롭다운 메뉴 컴포넌트가 없어 새로 들이지 않고 버튼 둘로 고르게 한다. 지금 탭의 지금 행(입사자 필터 반영)을 내보낸다. 입사자별 탭에서는 숨긴다. 행이 0건이면 둘 다 비활성화한다.
  - 열(두 형식 같음): 입사자, 팀, 과제, 상태, 차례, 제출 시각, 기한, 지난 일수
  - 파일명: `업무함-{부서}-{탭 이름}-{YYYYMMDD}.xlsx` / `.csv`. xlsx 시트 이름은 탭 이름, 머리글 행은 굵게.
  - xlsx 파일을 만들다 실패하면(모듈 로드 실패 등) 버튼 옆 `ErrorText`: `파일을 만들지 못했어요. 다시 시도해 주세요.`
  - 메일 주소는 넣지 않는다(데이터는 가상이지만 개인정보 최소화)
- 비목표: 알림·메일, 서버 집계·RPC, 새 경로·메뉴, 일괄 처리, 상태 이력

- [ ] **Step 1:** 브랜치 `feat/due-signals` 생성(`git switch -c`)
- [ ] **Step 2:** 설계 문서 작성, S2·S9 시안 HTML 수정, png 갱신(`scripts/design/README.md` 방식)
- [ ] **Step 3:** `docs/screens.md`의 S2(기한 표기, 인사 문구)와 S9(탭, 열, 요약 카드, Excel·CSV 내려받기, 빈 상태 `기한이 지난 과제가 없어요`) 갱신
- [ ] **Step 4:** Leo에게 시안 png 두 장을 보여 주고 확인받기. **확인 전에는 Task 2 이후로 넘어가지 않는다.**
- [ ] **Step 5:** 커밋 `docs: 기한 신호 설계·시안(S2 지금 할 일, S9 기한 초과 탭)`

---

### Task 2: 신입 기한 표기 보조 함수

**Files:**
- Modify: `apps/web/src/features/newhire/format.ts`
- Test: `apps/web/src/features/newhire/format.test.ts`(없으면 새로 만든다)

**Interfaces:**
- Produces: `export type DueTag = { kind: 'past' } | { kind: 'today' } | { kind: 'soon'; days: number } | null`
- Produces: `export function dueTag(dueDate: string | null, today: string): DueTag`. 7일 이내면 soon, 8일 이상 남았거나 null이면 null을 돌려준다. `today`는 `todaySeoul()`의 결과다.

- [ ] **Step 1: 실패하는 테스트**

```ts
describe('dueTag', () => {
  it('기한 전날 이전은 past', () => expect(dueTag('2026-11-18', '2026-11-19')).toEqual({ kind: 'past' }))
  it('당일은 today', () => expect(dueTag('2026-11-19', '2026-11-19')).toEqual({ kind: 'today' }))
  it('3일 남으면 soon 3', () => expect(dueTag('2026-11-22', '2026-11-19')).toEqual({ kind: 'soon', days: 3 }))
  it('7일까지 soon, 8일부터 null', () => {
    expect(dueTag('2026-11-26', '2026-11-19')).toEqual({ kind: 'soon', days: 7 })
    expect(dueTag('2026-11-27', '2026-11-19')).toBeNull()
  })
  it('월을 넘겨도 일수가 맞다', () => expect(dueTag('2026-12-01', '2026-11-29')).toEqual({ kind: 'soon', days: 2 }))
  it('기한 없음은 null', () => expect(dueTag(null, '2026-11-19')).toBeNull())
})
```

- [ ] **Step 2:** `npm run test:web -- format.test` 실행 → FAIL(`dueTag` 없음)
- [ ] **Step 3:** `dueTag` 구현. 일수는 UTC 자정 기준 날짜 차이로 계산한다(`staff/format.ts`의 `dayIndex`와 같은 방식). `isPastDue`는 다른 곳에서도 쓰므로 남긴다.
- [ ] **Step 4:** 다시 실행 → PASS
- [ ] **Step 5:** 커밋 `feat(web): 신입 과제 기한까지 남은 날 계산`

---

### Task 3: S2 "지금 할 일" 보강

**Files:**
- Modify: `apps/web/src/features/newhire/TaskRow.tsx`(`Meta`의 기한 부분), `apps/web/src/features/newhire/HomePage.tsx`(`todayKey`, 인사 문구)
- Test: `apps/web/src/features/newhire/HomePage.test.tsx`

**Interfaces:**
- Consumes: `dueTag`(Task 2), `todaySeoul`(`features/staff/format.ts`)
- `TaskRow`의 Props는 바꾸지 않는다(`today`는 그대로 'YYYY-MM-DD').

- [ ] **Step 1: 실패하는 테스트**(기존 픽스처 `makeTask` 사용, 시각은 기존 `2026-11-18 09:00`)
  - `'오늘이 기한이면 "오늘 마감"을 붙인다'`: due `2026-11-18` todo 과제 행 안에 `getByText('오늘 마감')`
  - `'7일 안에 남은 과제에는 D-N을 붙인다'`: due `2026-11-21` → `getByText('D-3')`. due `2026-11-30` → `queryByText(/^D-/)` 없음
  - `'확인 대기·담당자 처리 과제에는 오늘 마감·D-N을 붙이지 않는다'`: 기존 220~231행 테스트와 같은 구성
  - `'인사 문구에 기한 지남 건수를 더한다'`: 지남 과제 1건 → `getByText(/기한 지남 1건/)`. 0건이면 문구에 '기한 지남'이 없다
  - `'오늘은 서울 날짜 기준이다'`: `vi.setSystemTime(new Date('2026-11-18T15:30:00Z'))`. due `2026-11-18` → '지남', due `2026-11-19` → '오늘 마감'
  - 기존 "지남" 테스트 두 개가 그대로 통과해야 한다
- [ ] **Step 2:** `npm run test:web -- HomePage` → 새 테스트 FAIL
- [ ] **Step 3:** 구현
  - `HomePage`의 `todayKey`를 `todaySeoul(today)`로 바꾼다. `daysSinceHire`와 `formatToday`는 그대로 둔다.
  - `Meta`는 `isHiresTurn(task)`일 때 `dueTag`에 따라 `지남`/`오늘 마감`(둘 다 `font-semibold text-st-rework-fg`)이나 `D-N`(muted, `tabular-nums`)을 붙인다.
  - 인사 문구의 건수는 `now.filter(t => dueTag(t.due_date, todayKey)?.kind === 'past')`로 센다.
- [ ] **Step 4:** `npm run test:web -- HomePage` PASS, `bash scripts/check-design.sh` PASS
- [ ] **Step 5:** 커밋 `feat(web): 지금 할 일에 오늘 마감·D-N 표시와 서울 날짜 기준`

---

### Task 4: S9 "기한 초과" 탭·대기 일수·요약 카드

**Files:**
- Modify: `apps/web/src/features/staff/format.ts`, `apps/web/src/features/staff/OpsInboxPage.tsx`
- Test: `apps/web/src/features/staff/format.test.ts`(있으면 추가, 없으면 새로 만든다), `apps/web/src/features/staff/OpsInboxPage.test.tsx`

**Interfaces:**
- Produces (`staff/format.ts`):
  - `daysLate(dueDate: string, today?: string): number`: 기한 다음 날이 1
  - `daysWaiting(submittedAt: string, today?: string): number`: 제출 시각을 서울 날짜로 바꾼 뒤 오늘과의 차이
- Produces (`OpsInboxPage.tsx`, Task 5에서 사용. export한다):
  - `type Tab = 'submitted' | 'overdue' | 'mine' | 'hires' | 'all'`
  - `export function turnLabel(task: TaskView): '신입' | '담당자' | '선행 과제 대기'`
  - `export const TAB_LABEL: Record<Tab, string>`

- [ ] **Step 1: 실패하는 테스트**
  - format: `daysLate('2026-11-20','2026-11-27') === 7`, `daysWaiting('2026-11-24T14:00:00Z','2026-11-27') === 3`, `daysWaiting('2026-11-26T15:30:00Z','2026-11-27') === 0`(서울 11/27 00:30)
  - OpsInboxPage(기존 mock 구성 사용, `vi.setSystemTime`으로 오늘을 2026-11-27로 고정):
    - `'기한 초과 탭은 끝나지 않고 기한이 지난 우리 부서 과제만 기한 오름차순으로 보인다'`: done·na·기한 없음·오늘 기한·다른 부서 과제는 빠진다. blocked는 들어간다.
    - `'기한 초과 탭은 차례와 지난 일수를 보인다'`: todo → '신입', submitted → '담당자', staff_only todo → '담당자', blocked → '선행 과제 대기'. 기한 칸 `11/20 · 7일 지남`
    - `'탭 순서와 개수'`: `getAllByRole('tab')`의 이름이 순서대로 확인 대기, 기한 초과, 내가 처리할 일, 입사자별, 전체. 기한 초과 개수 배지가 맞다.
    - `'요약에 기한 초과 카드가 있다'`: `getByRole('region'|…, { name: '기한 초과' })` 안의 숫자
    - `'확인 대기 줄에 대기 일수를 붙이고 3일 이상은 강조한다'`: submitted 3일 → '3일 대기'가 `text-destructive`. 0일 → '대기' 문구 없음
    - `'보완 요청 과제에는 대기 일수를 붙이지 않는다'`: status rework에 submitted_at 있음 → 전체 탭에서 '대기' 없음
    - `'입사자 필터는 기한 초과 탭에도 적용된다'`
    - 빈 상태: `'기한이 지난 과제가 없어요'`
- [ ] **Step 2:** `npm run test:web -- staff` → FAIL
- [ ] **Step 3:** 구현
  - `inTab`에 `overdue: !FINISHED.has(status) && isOverdue(due_date)`를 넣는다.
  - `byTab`에서 overdue는 `due_date` 오름차순, 같으면 이름순으로 정렬한다.
  - `EMPTY_TEXT.overdue`를 넣고 `counts.overdue`를 센다.
  - 탭 목록과 `TableSkeleton` 열을 바꾼다(overdue는 "제출 시각" 대신 "차례").
  - 기한 칸은 `{formatMonthDay} · {daysLate}일 지남`으로 표시한다. `RowMeta` 줄에도 같은 문구를 넣는다.
  - 제출 시각 칸의 대기 일수는 `status === 'submitted' && days >= 1`일 때만 붙인다.
  - `SummaryCard` 4개, 격자는 `md:grid-cols-2 xl:grid-cols-4`
- [ ] **Step 4:** `npm run test:web` 전체 PASS(기존 S9 테스트의 탭 순서 단언을 고쳐야 하면 설계 문서대로 고친다), `bash scripts/check-design.sh` PASS
- [ ] **Step 5:** 커밋 `feat(web): 부서 업무함에 기한 초과 탭과 확인 대기 일수`

---

### Task 5: Excel·CSV 내려받기

**Files:**
- Create: `apps/web/src/features/staff/export.ts`
- Test: `apps/web/src/features/staff/export.test.ts`, `OpsInboxPage.test.tsx`
- Modify: `apps/web/package.json`·`package-lock.json`(`npm --prefix apps/web install write-excel-file`. shadcn이 아니므로 `cn` 버그와 무관하지만 package.json diff는 확인한다)
- Modify: `apps/web/src/features/staff/OpsInboxPage.tsx`(`PageHeader` 동작 자리)

**Interfaces:**
- Produces:
  - `export function toCsv(header: string[], rows: string[][]): string`: 앞에 BOM `﻿`, 줄 끝은 `\r\n`
  - `export function downloadBlob(filename: string, blob: Blob): void`: `URL.createObjectURL`, `<a download>`, revoke. `lib/taskFiles.ts`의 `downloadTaskFile` 방식을 따른다.
  - `export async function toXlsx(sheetName: string, header: string[], rows: string[][]): Promise<Blob>`: `await import('write-excel-file')`로 불러와 Blob을 만든다. 칸은 모두 문자열로 넣는다(수식이 아니라 문자열 칸이라 수식 실행 걱정이 없다). 머리글 행은 굵게.
- Consumes: `turnLabel`, `TAB_LABEL`, `daysLate`(Task 4), `STATUS_LABEL`, `formatDateTime`

- [ ] **Step 1: 실패하는 테스트**

```ts
it('쉼표·따옴표·줄바꿈을 감싼다', () =>
  expect(toCsv(['a'], [['x,"y"\nz']])).toBe('﻿a\r\n"x,""y""\nz"\r\n'))
it('수식으로 시작하는 칸은 작은따옴표를 붙인다', () =>
  expect(toCsv(['a'], [['=SUM(1)'], ['+1'], ['-1'], ['@x']])).toBe("﻿a\r\n'=SUM(1)\r\n'+1\r\n'-1\r\n'@x\r\n"))
```

  - OpsInboxPage:
  - export.test: `'toXlsx는 xlsx Blob을 만든다'`: 결과 Blob의 처음 2바이트가 `PK`(zip)이고 type이 xlsx MIME이다. 실제 라이브러리로 확인한다(mock하지 않는다).
  - OpsInboxPage(`./export`의 `toXlsx`만 mock, `downloadBlob`은 `URL.createObjectURL` spy):
    - `'CSV 내려받기는 지금 탭의 지금 행을 내보낸다'`: 기한 초과 탭에서 누르면 Blob 텍스트의 첫 줄이 `입사자,팀,과제,상태,차례,제출 시각,기한,지난 일수`이고 행 수가 탭 행 수와 같다. download 이름은 `업무함-총무-기한 초과-20261127.csv`(부서 라벨은 `OWNER_LABEL` 값을 따른다).
    - `'Excel 내려받기는 같은 머리글·행으로 toXlsx를 부르고 .xlsx 이름으로 받는다'`: `toXlsx`가 `('기한 초과', header, rows)`로 불리고 download 이름은 `업무함-총무-기한 초과-20261127.xlsx`
    - `'xlsx를 만들지 못하면 오류 문구를 보인다'`: `toXlsx` reject → `파일을 만들지 못했어요. 다시 시도해 주세요.`
    - `'입사자별 탭에서는 내려받기 버튼이 없고, 행이 없으면 둘 다 비활성'`
- [ ] **Step 2:** `npm run test:web -- export OpsInbox` → FAIL
- [ ] **Step 3:** 의존성을 설치하고 설치된 버전의 README·타입을 읽은 뒤 `toCsv`·`toXlsx`·`downloadBlob`을 구현하고 버튼 둘을 연결한다. 내려받기 머리글·행 만드는 부분은 두 형식이 함께 쓴다.
- [ ] **Step 4:** `npm run test:web` PASS, `bash scripts/check-design.sh` PASS
- [ ] **Step 5:** `npm --prefix apps/web run build`로 `write-excel-file`이 별도 청크로 나뉘는지 확인 → 커밋 `feat(web): 부서 업무함 Excel·CSV 내려받기`

---

### Task 6: 화면 검토와 PR

- [ ] **Step 1:** `npm run dev:web`(로컬 Supabase가 켜져 있을 때)로 신입 계정과 총무 계정에서 S2·S9를 직접 확인한다(데스크톱과 모바일 폭).
- [ ] **Step 2:** `/design-review`로 바뀐 화면을 검토한다. blocker가 남아 있으면 고친다.
- [ ] **Step 3:** 수정 전→후 스크린샷을 만든다(`scripts/design/README.md`, orphan 브랜치 `pr-screenshots`).
- [ ] **Step 4:** `git diff --cached`로 비밀값과 실명이 없는지 확인한 뒤 push하고 PR을 연다(`feat(web): 기한 신호 — 지금 할 일 D-N, 업무함 기한 초과 탭·내려받기`). 공통 영역은 바꾸지 않았다는 점, 새 의존성 `write-excel-file`을 들인 이유(xlsx 선택 요청, 버튼을 누를 때만 로드), 스크린샷을 적는다.
- [ ] **Step 5:** Codex 리뷰 스레드를 확인하고 대응한다. 수정을 push한 뒤에는 `@codex review`를 남긴다. CI 5개가 통과하면 squash 머지한다.

## Verification

- `npm run test:web` 전체 통과(새 테스트: format 2개 파일, export, HomePage, OpsInboxPage), `npm --prefix apps/web run build` 통과
- `bash scripts/check-design.sh` 통과
- 로컬 확인 1: 신입 계정에서 기한 지남, 오늘 마감, D-N 표시와 인사 문구의 "기한 지남 K건"을 본다.
- 로컬 확인 2: 총무 계정에서 기한 초과 탭, 차례 열, 확인 대기 일수, 요약 4카드를 보고, 내려받은 xlsx와 CSV를 Excel·Numbers에서 열어 한글과 특수문자(쉼표·따옴표·`=`로 시작하는 값)가 그대로 보이는지 확인한다.
- DB·에이전트 변경이 없으므로 `npm run db:test`·`test:agent`는 CI 결과만 확인한다.
