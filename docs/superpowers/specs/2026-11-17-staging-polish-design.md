# 스테이징 화면 점검 7개 항목 수정 설계 (2026-11-17, Leo 승인)

## Context
발표자료용 스테이징 캡처(세션 D) 중 실제 브라우저에서 7개 문제가 나왔다. 운영 배포·영상 녹화·심사위원 공개 전에 **7개 모두 다듬는다**(Leo 결정). 진행은 **PR 2개를 이 세션이 순서대로**: ① 에이전트 답변 정확도 → ② 웹 화면 다듬기. 끝난 뒤 세션 D가 영향받은 화면을 다시 캡처한다.

## 목표 / 비목표 / 실패 조건
- 목표: 발표·영상·심사위원 체험에서 틀린 안내나 어색한 화면이 보이지 않게 한다.
- 비목표: 새 기능, 디자인 개편, DB·RPC 변경(7b는 표시 문구만 바꾸고 `submit_task`의 `submitted_at` 기록은 그대로 둔다).
- 실패 조건: 고친 뒤에도 채팅이 담당자 처리 과제를 신입 할 일로 안내 / 인쇄물에 답이 새거나 코드 정렬이 깨짐 / 기존 테스트·접근 차단 동작이 깨짐.

## 접근 방식 (검토한 것)
| 방식 | 장단점 | 결정 |
|---|---|---|
| **PR 2개, 이 세션이 순서대로** | 공통 파일(`app/Layout.tsx`)을 한 곳에서만 고쳐 충돌 없음, 세션 추가 없음. 반나절~하루 | **선택** |
| 세션 2개 병렬 | 조금 빠르지만 지시문·조율 비용 | 제외 |
| 도메인별 PR 5개 | 리뷰는 작지만 명함·상태 표시처럼 여러 도메인에 걸친 변경이 갈리고 최신 main 반영 5번 반복 | 제외 |

## 표시 규칙 (조율 세션 결정, Leo가 바꿀 수 있음)
- 아바타 글자: 기본은 이름 **뒤 두 글자**(실명형 "강민재" → "민재"). 이름에 공백이 있거나 역할이 관리자면 **첫 단어 앞 두 글자**("관리자" → "관리", "심사 신입" → "심사", "리허설 신입" → "리허"). 한 글자 이름은 그대로.
- S5 0건: 카드에 흐린 글씨 "확인 대기 0", 상단에 흐린 글씨 "미답변 질문 없음". 1건 이상이면 지금처럼 강조 배지·배너.
- 7b: 신입이 직접 완료하는 과제(`completion_mode === 'self'`)는 "완료 {시각}", 확인이 필요한 과제는 지금처럼 "제출 {시각}".

## PR ① 에이전트 답변 정확도 (`fix/assistant-task-actor`)
- `services/agent/app/assistant_tools.py` `get_my_tasks`: select에 `completion_mode` 추가, 반환에 `handled_by`("신입"|"담당자", `staff_only`면 담당자)와 `my_turn`(상태 `todo|rework`이고 `staff_only`가 아님 — 웹 `features/newhire/HomePage.tsx` 17–27행 "지금 할 일" 정의와 동일) 추가.
- `services/agent/app/assistant.py`: 도구 설명(47행)에 새 필드, 규칙 추가 — "지금·오늘 할 일은 `my_turn`인 과제만 안내한다. `handled_by`가 담당자인 과제는 '담당자가 처리할 예정'으로 구분해 말한다."
- 테스트 먼저: `tests/test_tools.py` 반환 키 집합 갱신, GA-02 → `handled_by=담당자`, `my_turn=false`, self 과제 하나 → `my_turn=true`. `tests/test_chat.py` 지시문 규칙 확인에 새 규칙 추가.
- `tests/eval_assistant.py`: `todo_titles`에서 `staff_only` 제외, "오늘 뭐 해야 해?" 답에 담당자 처리 과제 제목(GA-02 등)이 나오면 실패.
- 실제 모델 평가: 스테이징 키(`gcloud secrets versions access … openai-api-key --project blueward-onboarding-stg`)로 eval 5문항 + 새 검사.
- 설계 문서 `docs/superpowers/specs/2026-11-17-staging-polish-design.md`(이 내용 요약)를 이 PR에 포함.

## PR ② 웹 화면 다듬기 (`fix/web-polish`)
| # | 파일 | 변경 | 테스트(먼저) |
|---|---|---|---|
| 1 | `features/exam/ExamPrintPage.tsx`(+`print.css`) | 시험지 문제를 답안지 131–133행처럼 flex로 감싸 배점 `shrink-0` 분리, 문제·답안지 문제에 `font-mono whitespace-pre-wrap` | `ExamPrintPage.test.tsx`: 문제 요소 안에 "(N점)"이 없고 별도 요소에 있음, 시험지에 답 없음 유지 |
| 2 | 새 `components/initials.ts`, `app/Layout.tsx` 81행, `features/staff/teamTasks.ts` 26–28행 | 위 규칙의 `initials(name, role?)` 하나로 통일 | `initials.test.ts`: 강민재→민재, 관리자(admin)→관리, 심사 신입→심사, 리허설 신입→리허, 한 글자 |
| 3 | `features/admin/UserForm.tsx` 276행, `features/staff/TaskReviewPanel.tsx` 95행 | 버튼 줄 `sticky bottom-0 bg-card` (+ 둥근 모서리 유지) | 브라우저 확인(1440×900 첫 화면에 버튼) |
| 4 | 새 `components/BusinessCard.tsx`, `features/newhire/taskBodies/FormBody.tsx` 22–46행, `features/staff/SubmittedResult.tsx` 21–35행 | 로고 이미지·카드 비율을 한 컴포넌트로, 각 화면은 자기 데이터만 넘김 | `BusinessCard.test.tsx` + 기존 두 화면 테스트 갱신 |
| 5 | `features/staff/TeamOverviewPage.tsx` 35–39·121행 | 0건 흐린 표시 | 기존 "미답변 없으면 숨김" 테스트를 "미답변 질문 없음" 표시로 변경, 확인 대기 0 표시 추가 |
| 7a | `features/staff/SubmittedResult.tsx` 52행 | 라벨 열 `break-keep` 또는 `max-content` | 브라우저 확인 |
| 7b | 새 헬퍼 `features/staff/format.ts`, `HireDetailPage.tsx` 30·202행, `TaskReviewPanel.tsx` 58행 | self 과제는 "완료 {시각}" | 헬퍼 단위 테스트 |
| 7c | `app/Layout.tsx` 51–92행 | 390px에서 부제·이름 블록 숨김, nav를 두 번째 줄 전체 폭 → 2줄 | 브라우저 확인(390×844) |
- `app/Layout.tsx`는 공통 영역이지만 이번 계획으로 Leo가 승인한 범위(2·7c)만 고친다.

## 확인 방법
- 각 PR: `npm run test:web` / `npm run test:agent`, `npm --prefix apps/web run lint`·`build`, CI 5개, Codex 리뷰(스레드 해결 후 `@codex review`).
- PR ①: 실제 모델 eval(스테이징 키, 출력에 키 없음) — "오늘 뭐 해야 해?"에 GA-02 등 담당자 처리 과제가 할 일로 나오지 않음.
- PR ② 로컬: 하네스(`~/Projects/oa-session-prompts/tools/pw/run.mjs`, `WEB=http://localhost:5173`)로 1440×900에서 계정 등록·업무함 상세 버튼이 첫 화면에 보임, 390×844 상단 바 2줄, 인쇄 화면 코드 정렬·배점 위치 캡처 확인.
- 머지 후: `deploy-staging` smoke 6단계 통과 → 스테이징에서 위 화면 재확인 → 세션 D에 재캡처 요청(S2-mobile, S3-card, S4-chat-mobile, S5, S6, S8 두 장, S9-detail, S11 세 장, 그리고 관리자·심사 계정 헤더가 보이는 장면).

## 남겨 두는 것 (빌더 재량)
- sticky 바 그림자·여백, 명함 컴포넌트 내부 구조, 흐린 표시의 정확한 색(토큰 `muted-foreground` 사용).
