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
- 제목은 굵기 600, 자간 -0.3px, 본문은 자간 -0.2px다.
- 크기 단계는 다음과 같다(P1-1에서 토큰화).

| 단계 | 크기/굵기 | 쓰는 곳 |
|---|---|---|
| 페이지 제목 | 28 / 600 | h1 |
| 섹션 제목 | 20 / 600 | 카드 묶음 제목 |
| 카드 제목 | 17 / 600 | 패널 머리 |
| 과제 행 | 15 / 500 | 과제 제목, 채팅 머리 |
| 본문 | 14 / 400 | 표 셀, 설명 |
| 라벨 | 13 / 600 | 폼 라벨, 칩 |
| 캡션 | 12 / 400 | 메타, 표 머리, 배지 |

## 컴포넌트

- **`StatusBadge`:** `Badge`의 variant 6종을 쓴다. 상태 문구는 `lib/labels.ts`에서만 가져온다.
- **`OwnerBadge`:** 팀이면 own-team 토큰, 부서면 테두리형이다.
- **`Alert`:** 의미 4종 variant를 쓰고 직접 색을 칠한 상자를 만들지 않는다. `role`은 상황에 맞게 지정한다.
  - 오류: `alert`
  - 한도·결과 알림: `status`
  - 보완 사유·검토 안내처럼 처음부터 보이는 안내: `note`
- **세그먼트 탭·라디오:** `bg-secondary p-1 rounded-xl`, 선택 시 `bg-card font-semibold shadow-sm`이다. 탭과 라디오는 각각 Radix Tabs와 네이티브 radio로 만든다(P0-2).

## 모션 (P1-6에서 적용)

- UI 전환은 150ms, `cubic-bezier(0.23,1,0.32,1)`를 쓴다.
- 누를 때 `scale(0.97)`이다.
- `transform`과 `opacity`만 애니메이션한다.
- `prefers-reduced-motion`을 존중한다.
