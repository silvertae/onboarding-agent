# 온보딩 에이전트 — 디자인 시스템

기준 시안은 `docs/design/onboarding-design/`이다(`assets/ui.css`, `screens/S0-system.html`). 이 문서는 그 결정을 요약하고 코드(`apps/web/src/index.css`)와의 대응을 적는다. 시안과 이 문서가 다르면 시안을 따른다.

## 방향

- **사용자:** 입사 첫 주의 신입은 노트북과 휴대폰으로 "오늘 뭘 해야 하지"를 확인한다. 교육 담당자와 경영지원 담당자는 데스크톱에서 확인 대기를 처리한다.
- **느낌:** 회사 CI(Blueward)의 차분한 Apple 계열이다. 밝은 회색 캔버스 위에 흰 카드를 올리고, 색은 상태와 동작에만 쓴다.
- **화면별 초점**
  - 신입 홈: "지금 할 일"
  - 업무함·신입 현황: 확인 대기
  - 과제 상세: 제출 버튼
  - 한 화면에 초점은 하나다.

## 색

- **강조색:** `--primary #06479a` 하나만 쓴다. 채운 버튼, 링크, 진행 막대, 포커스 링에 쓴다.
- **검정 칩:** 선택된 필터 칩, 탭의 개수 배지, 역할 배지는 `--foreground`(검정)로 칠한다. 시안에서 정한 것이다.
- **새 색 금지:** 화면에서 색을 새로 만들지 않는다. hex를 직접 쓰는 것은 인쇄 화면(`ExamPrintPage`)과 명함 미리보기(`BusinessCard`)만 허용한다.

| 묶음 | 토큰 (`:root`) | Tailwind 유틸리티 | 용도 |
|---|---|---|---|
| 면 | `--background` `#f5f5f7` / `--card` `#fff` | `bg-background` / `bg-card` | 캔버스 / 카드·패널 |
| 면 | `--surface-subtle` `#fafafc` | `bg-surface-subtle` | 표 머리, 단계 머리, 행 hover, 펼친 폼 바탕 |
| 면 | `--selected` `#eef3fa` (= `--accent`) | `bg-accent` | 선택 행 |
| 면 | `--track` `#e8e8ed` | `bg-track` | 진행 막대 바탕, 비활성 원형 버튼 |
| 글자 | `--foreground` › `--text-secondary` › `--muted-foreground` › `--tertiary` | `text-foreground` › `text-[var(--text-secondary)]` › `text-muted-foreground` › `text-tertiary` | 본문·값 › 보조 설명 › 메타 › 장식 아이콘·비어 있음 |
| 상태 | `--st-{blocked,todo,submitted,rework,done,na}-{bg,fg,border}` | `bg-st-rework-bg`, `text-st-done-fg` … | 상태 배지, 보완 요청 행, 기한 지남, 성공 문구 |
| 알림 | `--alert-{info,warn,err,ok}-{bg,border,fg}` | `Alert variant="info / warning / destructive / success"` | 안내 / 한도·AI 검토·미답변 / 오류·보완 사유 / 성공 |
| 담당 | `--own-team-{bg,border,fg}` | `OwnerBadge`가 처리 | 소속 팀 과제는 파란 틴트, 경영지원 부서는 테두리형 |
| 기타 | `--avatar`, `--demo`, `--destructive` | `bg-avatar`, `bg-demo`, `text-destructive` | 이니셜 원, 데모 표시 점, 삭제·행 오류 문구 |

**상태 배지 6종**
- 문구는 `docs/screens.md`의 표를 따르고, 색은 README의 표를 따른다. 바꾸지 않는다.
- 글자색 6px 점을 앞에 찍는다. blocked·na는 점 대신 테두리를 쓴다(blocked는 실선, na는 점선).

## 깊이·라운드·간격

- **깊이:** 테두리로만 표현한다(`border-border` `#e3e3e8`, 입력은 `#d2d2d7`). 그림자는 세그먼트 탭과 라디오의 선택 표시에만 쓴다(`shadow-sm`). 모바일 "에이전트에게 묻기" 떠 있는 버튼은 예외다.
- **라운드**
  - 카드 18px(`rounded-[18px]`)
  - 알림·작은 면 12px(`rounded-lg`)
  - 입력 8px
  - 버튼·칩·배지는 pill
  - 담당 배지는 6px(`rounded-md`)
- **간격:** 기준은 4px이다.
  - 카드 안쪽: 24px(모바일 20px)
  - 카드 머리: 20×24px
  - 섹션 사이: 24px
  - 과제 행: 14×24px

## 글자

- 글꼴은 SF Pro → Apple SD Gothic Neo → Noto Sans KR이다.
- 제목(h1~h3)은 굵기 600, 자간 -0.3px, `text-wrap: balance`다. 본문은 자간 -0.2px, antialiased다(`index.css` base). 굵기 700(`font-bold`)은 개수 배지 말고 쓰지 않는다.
- 한글은 낱말 사이에서만 줄을 바꾼다(`body`에 `word-break: keep-all`). 메일·주소처럼 긴 낱말은 넘칠 때만 끊는다(`overflow-wrap: break-word`). 좁은 칸에 이름표처럼 쓰는 짧은 글자(단계 이름 등)는 `whitespace-nowrap`과 `shrink-0`으로 줄어들지 않게 한다.
- 크기는 아래 단계만 쓴다. `text-[13px]` 같은 임의 값은 쓰지 않는다. 예외는 로그인 소개 제목(48)과 인쇄·명함 미리보기다.
- 바뀌는 숫자(진행률, 건수, 표의 시각·기한)는 `tabular-nums`를 쓴다. `table`에는 기본으로 걸려 있다.

| 단계 | 크기/굵기 | 유틸리티 | 쓰는 곳 |
|---|---|---|---|
| page | 28 / 600 | `text-page` | 페이지 h1(`PageHeader`), 요약 카드 숫자 |
| title | 22 / 600 | `text-title` | 모바일 h1, 진행률 숫자, 로그인 카드 제목, 시험 제목 |
| section | 18 / 600 | `text-section` | 카드 묶음 제목("지금 할 일", "전체 과제") |
| lead | 17 / 600 | `text-lead` | 패널 머리, 평가 카드 제목, 로그인 소개 문단 |
| row | 15 / 500 | `text-row` | 과제 행 제목, 과제 상세 소제목·안내문, 채팅 머리 |
| body | 14 / 400 | `text-sm` | 표 셀, 설명 |
| label | 13 / 600 | `text-label` | 폼 라벨, 칩, 문항 본문(mono) |
| caption | 12 / 400 | `text-xs` | 메타, 표 머리, 배지 |
| micro | 11 / 700 | `text-micro` | 탭·카드의 개수 배지 |

## 버튼·입력 크기

| 높이 | 버튼 | 입력 | 쓰는 곳 |
|---|---|---|---|
| 44 | `size="lg"` | `size="lg"` | 신입 화면(S2~S4)의 모든 동작과 양식, 로그인, 화면당 주요 동작 하나(초안 만들기, 이 신입 기준으로 시험 만들기, 계정 만들기) |
| 40 | — | 기본 | 담당자 화면의 입력·select |
| 36 | 기본 | — | 패널·폼 동작(확인, 보완 요청, 저장, 인쇄), 페이지 머리 동작 |
| 32 | `size="sm"` | — | 표 행 안의 동작(완료 처리, 처리, 답 등록), 카드 도구 줄(문항 수정·다시 만들기). 신입 화면에는 쓰지 않는다 |

- **높이 덮어쓰기 금지:** `className="h-11 px-5"`처럼 높이·좌우 여백을 덮어쓰지 않고 `size`를 고른다.
- **비활성 주 버튼:** 흐린 파랑이 아니라 회색(`bg-track`, `text-disabled-foreground`)이다.
- **칩:** 보이는 높이는 36(`h-9`)이고, `after:-inset-y-1`로 누르는 영역을 44까지 넓힌다. 칩 사이 줄 간격은 8 이상으로 두어 누르는 영역이 겹치지 않게 한다. 가로 스크롤 상자 안이면 상자에 `py-1`을 줘서 넓힌 영역이 잘리지 않게 한다.
- **폼 컨트롤:** `components/ui`의 `Input`, `NativeSelect`, `Textarea`, `Checkbox`만 쓴다. `NativeSelect`는 브라우저 기본 select에 Input과 같은 테두리와 화살표를 입힌 것이고, `className`은 바깥 상자(너비)에 붙는다. 입력 스타일 문자열을 화면 파일에 복사하지 않는다.
- **체크리스트 행:** 신입 화면에서는 한 줄 높이를 44(`min-h-11`), 체크박스를 18px로 한다.

## 상태(로딩·빈·오류)

시안 `S0-system`의 "상태 · 로딩과 오류" 절이 기준이다.

- **로딩:** "불러오는 중…" 글자만 띄우지 않는다. 데이터가 올 자리와 같은 배치·크기로 `components/ui/skeleton.tsx`(`bg-secondary` pulse, `motion-reduce:animate-none`)를 그린다.
  - `components/LoadingStatus.tsx`의 `LoadingStatus`로 감싼다. 스켈레톤은 `aria-hidden`이고, 화면 읽기 프로그램에는 `role="status"`의 "불러오는 중…"만 알린다.
  - 표는 `TableSkeleton`(실제 표와 같은 머리 글자 + 칸 모양 `line`·`two-line`·`badge`·`button`)을 쓴다. 카드·과제 행처럼 화면마다 다른 모양은 그 화면 파일 안에 작은 스켈레톤 조각으로 둔다.
  - 페이지 머리(제목·설명·요약 카드)처럼 데이터 없이 그릴 수 있는 부분은 로딩 중에도 그대로 그린다. 페이지 여백(`main`)도 같다.
- **빈 목록:** 패널 안 가운데 한 줄(`EmptyState`, "아직 …이 없어요").
- **목록·화면 오류:** `components/LoadError.tsx`(`Alert variant="destructive"` + "다시 불러오기" 버튼 → `query.refetch`). 다시 불러오는 동안(`isFetching`)은 버튼을 막는다. 신입 화면은 `size="lg"`. 목록 오류는 그 패널 안, 화면 전체 오류는 페이지 머리(뒤로 가기 링크) 아래에 둔다.
  - 문구는 "…을 불러오지 못했어요. 다시 시도해 주세요."로 끝낸다. 바로 옆에 "다시 불러오기" 버튼이 있으니 "새로고침해 주세요"라고 쓰지 않는다.
- **동작 오류:** 저장·처리 실패(`useGuardedAction` 등)는 버튼 옆 인라인 문구(`staff/ui`의 `ErrorText`)로 둔다. `LoadError`를 쓰지 않는다.

## 컴포넌트

- **`StatusBadge`:** `Badge`의 variant 6종을 쓴다. 상태 문구는 `lib/labels.ts`에서만 가져온다.
- **`OwnerBadge`:** 팀이면 own-team 토큰, 부서면 테두리형이다.
- **`Alert`:** 의미 4종 variant를 쓰고 직접 색을 칠한 상자를 만들지 않는다. `role`은 상황에 맞게 지정한다.
  - 오류: `alert`
  - 한도·결과 알림: `status`
  - 보완 사유·검토 안내처럼 처음부터 보이는 안내: `note`
- **선택 컨트롤 3종:** 겉모습이 비슷해도 하는 일에 따라 역할을 나눈다. 모양은 `bg-secondary p-[3px] rounded-[10px]`, 선택 시 `bg-card font-semibold shadow-sm`, 키보드 포커스는 `ring-2 ring-ring`이다.

| 하는 일 | 컴포넌트 | 키보드 | 쓰는 곳 |
|---|---|---|---|
| 패널을 바꾼다 | `components/ui/tabs.tsx`(Radix Tabs). 화면에서는 `staff/ui.tsx`의 `SegmentTabs` › `SegmentTabList` + `SegmentTabPanel`로 쓴다 | ←/→ 이동과 동시에 선택, Tab은 선택된 탭에만 멈춘다 | S9 업무함, S10 지식 관리. 탭 목록은 패널 머리에 둔다 |
| 값 하나를 고른다 | `components/SegmentedRadio.tsx`(네이티브 radio) | ←/→ 선택 | S6 평가 결과, S11 역할 |
| 목록을 거른다 | `components/FilterChips.tsx`(버튼 + `aria-pressed`) | Tab 이동, Enter/Space | S2 담당 필터, S11 역할 필터 |

`role="tab"`이나 `role="radio"`를 붙인 `button`을 직접 만들지 않는다.

- **표 선택 행:** 선택·처리 중·새로 만든 행은 `components/tableRow.ts`의 `ROW_SELECTED`를 쓴다(시안 `.tbl tr.sel td`). `tr`에 `bg-accent`를 직접 주지 않는다.
  - 이유: 자동 표 배치는 칸 경계가 소수점(예: 915.27px)이라, Chrome이 행 배경을 칸마다 그리며 경계 픽셀을 반만 칠한다. 창을 띄운 Chrome 1440px에서 칸 사이에 밝은 1px 세로줄이 보였다. 배경을 `td`로 옮기는 것만으로는 사라지지 않아서, 같은 색 `1px` 오른쪽 그림자로 이음새를 덮는다.
  - hover(`ROW_HOVER`)는 선택되지 않은 행에만 준다. 같이 주면 hover가 선택 색을 덮는다. 키보드 포커스 행은 `ROW_FOCUS`(선택과 같은 색).
- **편집 화면 머리(S7):** 왼쪽에 뒤로 가기 · 제목 · 상태 배지를 붙여 묶고, 오른쪽에 동작 버튼을 묶는다. 고칠 수 있는 제목 입력은 `field-sizing-content`로 글자 길이만큼만 넓히고(최소 `min-w-24`, 최대 `max-w-xl`), `flex-1`을 주지 않는다. 배지가 머리 가운데 떠 있지 않게 하려는 것이다.

- **S2 초점 패턴(지금 할 일):**
  - 정렬은 보완 요청 → 기한 이른 순(기한 없음은 뒤) → 단계 → 순서다.
  - 처음 5건만 보이고 "나머지 N건 보기"(44px 고스트 버튼, `aria-expanded`)로 펼친다.
  - 기한이 지났으면 신입이 할 차례(todo·rework, staff_only 제외)일 때만 메타 끝에 "· **지남**"(`text-st-rework-fg`)을 붙인다.
- **단계 접기(전체 과제):**
  - 단계 머리는 `h3` 안의 Radix Collapsible 버튼이다.
  - 좁은 화면(sm 미만)에서는 두 줄이다: 1줄은 화살표·단계 이름·남은 일(오른쪽), 2줄은 날짜·완료 수(단계 이름 아래, `pl-6`). sm부터 한 줄이다.
  - 처음에는 날짜상 진행 중인 단계만 펼친다. 단계 안 마지막 기한이 오늘 이후인 첫 단계이고, 기한이 없는 단계는 진행 중으로 본다.
  - 머리 왼쪽에는 날짜와 완료 수를 둔다. 날짜는 기한이 하루면 "11월 17일", 여러 날이면 "~ 11월 22일"이다.
  - 머리 오른쪽에는 남은 일 요약("할 일 N · 보완 요청 N · 확인 대기 N")을 둔다. 접혀 있어도 남은 일이 보이게 하려는 것이다.
  - 계산은 `features/newhire/stages.ts`에 있다.
- **채팅 빈 상태(S4 대화 전):**
  - 대화가 없으면 본문 가운데에 심볼(44px), 제목 "온보딩에 대해 물어보세요"(`text-lead` 600), 설명 "등록된 사내 지식과 내 과제로 답해요"(`text-sm` muted)를 둔다.
  - 추천 질문은 그 아래에 패널 너비를 채우는 카드형 버튼(44px, `rounded-lg`, `border-border`, 오른쪽 chevron)으로 둔다. 누르면 바로 보낸다. 시안 클래스는 `.suggest`다.
  - 대화 전에는 입력창 위 칩 줄을 숨긴다. 첫 메시지 뒤에는 칩 줄(36px 칩, 누르는 영역 44)이 돌아오고 본문 카드는 사라진다. 같은 질문 버튼이 두 곳에 동시에 있지 않다.
  - 데스크톱 고정 패널과 모바일 전체 화면이 같은 빈 상태를 쓴다.

## 모션

- **시간·곡선:** UI 전환은 `duration-150`과 `ease-out-ui`(`cubic-bezier(0.23,1,0.32,1)`, `index.css` `@theme`)를 쓴다. 시안은 같은 값을 `.15s cubic-bezier(.23,1,.32,1)`로 쓴다.
- **전환할 속성은 이름으로 적는다:** `transition-all`은 쓰지 않는다. 버튼은 `transition-[background-color,border-color,color,box-shadow,scale]`, 배지는 `transition-[background-color,border-color,color,box-shadow]`, 회전·이동은 `transition-transform`이다. Tailwind v4의 `scale-*`·`rotate-*`·`translate-*`는 `transform`이 아니라 개별 속성(`scale` 등)을 바꾸므로, 직접 속성을 적을 때는 그 이름(`scale`)을 넣는다.
- **누름:** 버튼은 누르는 동안 `active:scale-[0.97]`로 줄어든다. 메뉴를 여는 버튼(`aria-haspopup`)은 줄이지 않는다.
- **레이아웃 속성은 애니메이션하지 않는다:** width·height·top·left 대신 transform과 opacity만 움직인다. 진행 막대(`components/ProgressBar.tsx`)는 꽉 찬 채움을 `translateX(-남은%)`로 밀어 바탕 밖으로 숨긴다. `scaleX`는 끝의 둥근 모서리까지 눌리므로 쓰지 않는다.
- **동작 줄이기:** 움직임이 있는 전환에는 `motion-reduce:transition-none`을 붙인다. 버튼은 `motion-reduce:active:scale-100`으로 누름 축소도 끈다. 로딩 표시의 `animate-pulse`(투명도만 바뀜)는 그대로 둔다.
- **진행 막대:** 이름과 값은 `ProgressBar`의 `label`·`value`·`max`가 `role="progressbar"`에 그대로 붙는다. 신입 홈은 0~100(%), 팀 신입 현황은 끝난 과제 수/전체, 체크리스트는 체크 수/항목 수다. 높이는 기본 8px, 카드 안 체크리스트는 `size="sm"`(6px)이다.
