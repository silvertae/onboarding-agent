# 온보딩 에이전트 — 화면 시안 (개발 전달용)

Claude Code에 이 폴더를 컨텍스트로 주고 구현을 요청할 때 쓰는 자료다.
원본 시안: claude.ai Design 캔버스 「온보딩 에이전트 — 사용자별 화면 시안」. 화면 명세는 `온보딩 에이전트 - 화면 명세.md`를 따른다.

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `screens/*.html` | 화면별 정적 HTML 시안. 브라우저로 바로 열린다. 구조·문구·상태의 기준 |
| `png/*.png` | 같은 화면의 스크린샷. 레이아웃 비교용 |
| `assets/ui.css` | 공통 UI 스타일(토큰 + 컴포넌트 클래스). shadcn 컴포넌트로 옮길 때 참고 |
| `assets/blueward-*.png` | 회사 CI 로고(전체 / 심볼 / 워드마크) |

## 화면 ↔ 라우트

| 시안 | 라우트 | 역할 |
|---|---|---|
| S0-system | — (토큰·배지·알림·글자 단계 견본) | 공통 |
| S1-login | `/login` | 전체 |
| S2-me, S2-me-mobile | `/me` | 신입 |
| S3-task-detail | `/me/tasks/:id` | 신입 |
| S3-task-detail-forms, S3-task-detail-forms-mobile | `/me/tasks/:id`의 "작성할 서식" 섹션 | 신입 |
| S4-chat-mobile, S4-chat-states | S2·S3 오른쪽 패널, 모바일은 전체 화면 | 신입 |
| S5-team | `/team` | 교육 담당자 |
| S6-hire-detail | `/team/hires/:id` | 교육 담당자 |
| S7-exam-editor | `/team/exams/:id` | 교육 담당자 |
| S8-print-paper / answers | `/team/exams/:id/print?variant=paper\|answers` | 교육 담당자 |
| S9-ops | `/ops` | 경영지원 |
| S10-knowledge | `/knowledge` | 교육 담당자·경영지원 |
| S11-admin-users | `/admin/users` | 관리자 |
| S12-forms | `/forms` | 교육 담당자·경영지원 |

## 디자인 토큰 (Blueward CI)

| 토큰 | 값 | 용도 |
|---|---|---|
| primary | `#06479a` | 채운 버튼, 포커스 링, 진행 막대, 링크 |
| primary-hover / pressed | `#053d85` / `#04336f` | 버튼 상태 |
| background (canvas) | `#f5f5f7` | 페이지 바탕 |
| card (surface) | `#ffffff` | 카드·패널 |
| foreground | `#1d1d1f` | 본문 |
| secondary / muted | `#515154` / `#6e6e73` | 보조 텍스트 |
| border | `#e3e3e8` (입력 `#d2d2d7`) | 구분선 |
| radius | 카드 18px · 입력 8px · 버튼 pill(980px) | |
| font | SF Pro → Apple SD Gothic Neo → Noto Sans KR | |

### 상태 배지 (전 화면 동일)

| 값 | 문구 | 배경 / 글자 |
|---|---|---|
| blocked | 선행 과제 대기 (+ 🔒 "○○ 완료 후 열림") | `#f2f2f4` / `#515154` |
| todo | 할 일 · staff_only는 "담당자 처리 예정" | `#e7eef8` / `#06479a` |
| submitted | 확인 대기 | `#fdf2dc` / `#7a4f00` |
| rework | 보완 요청 | `#fde8e6` / `#a1261c` |
| done | 완료 | `#e4f3e8` / `#1b6530` |
| na | 해당 없음 (점선 테두리) | 투명 / `#6e6e73` |

배지 앞에는 글자색과 같은 6px 점을 찍는다(blocked·na 제외). blocked는 `#e3e3e8` 테두리, na는 `#c7c7cc` 점선 테두리. 값은 `assets/ui.css`의 `--st-*` 변수로 쓴다.

### 의미 토큰 (`assets/ui.css` `:root`)

화면에서 색을 새로 만들지 않는다. 아래 변수 중 하나를 쓴다. 견본은 `S0-system`.

| 묶음 | 변수 | 용도 |
|---|---|---|
| 면 | `--surface-subtle` `#fafafc` · `--selected` `#eef3fa` · `--track` `#e8e8ed` · `--surface-chat` `#fbfbfd` | 표·단계 머리와 hover, 선택 행, 진행 막대 바탕, 채팅 본문 |
| 글자 4단계 | `--foreground` · `--secondary` · `--muted` · `--tertiary` `#aeaeb2` | 본문·값 / 보조 설명 / 메타 / 장식 아이콘·비어 있음 |
| 상태 | `--st-{blocked,todo,submitted,rework,done,na}-{bg,fg,border}` | 상태 배지, 보완 요청 행·기한 지남 글자 |
| 알림 | `--alert-{info,warn,err,ok}-{bg,border,fg}` | 안내 / 한도·AI 검토 안내·미답변 배너 / 오류·보완 사유 / 성공 |
| 담당 | `--own-team-{bg,border,fg}` | 소속 팀 과제 배지(파란 틴트). 경영지원 부서 배지는 테두리형 |
| 기타 | `--fill` `#ececf0` · `--avatar` `#e8eef8` · `--destructive` `#b3261e` · `--demo` `#b26a00` | 탭 바탕, 이니셜 원, 삭제 동작, 데모 표시 점 |

### shadcn `globals.css` 매핑 예시

```css
:root {
  --background: #f5f5f7;
  --foreground: #1d1d1f;
  --card: #ffffff;
  --card-foreground: #1d1d1f;
  --primary: #06479a;
  --primary-foreground: #ffffff;
  --secondary: #ececf0;
  --secondary-foreground: #1d1d1f;
  --muted: #f5f5f7;
  --muted-foreground: #6e6e73;
  --accent: #eef3fa;
  --accent-foreground: #06479a;
  --destructive: #b3261e;
  --border: #e3e3e8;
  --input: #d2d2d7;
  --ring: #06479a;
  --radius: 0.75rem;
}
```

컴포넌트 대응: 상단 바 → 공통 `AppHeader`, 상태 배지 → `Badge`에 `variant` 6종 추가, 버튼 → `Button`(rounded-full), 업무함·사용자 표 → `Table`, 오른쪽 상세 → `Sheet` 또는 고정 패널, 탭 → `Tabs`, 초기화 확인 → `AlertDialog`, 알림 → `Alert`.

## 구현 시 주의

- 상단 바에 항상 "데모 환경 · 가상 데이터" 표시. 계정 정보는 화면에 노출하지 않는다.
- 신입 화면(S2~S4)만 모바일 폭을 지원한다.
- 시안의 인물·데이터는 모두 가상이다. 문구는 그대로 써도 된다.
