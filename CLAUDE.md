# 온보딩 에이전트

사내 AI Agent 경진대회 출품작. 신입 온보딩을 신입·교육 담당자·경영지원·관리자가 함께 처리하는 웹 서비스와, 지식 답변·시험 출제 에이전트. 공개 URL로 한 달간 심사위원이 직접 쓰고, 채택되면 실제 도입으로 확장한다. 화면은 회사 CI(Blueward), 사람·계정·업무 데이터는 전부 가상이다.

## 문서

| 문서 | 언제 보나 |
|---|---|
| `docs/contracts.md` | API·환경변수 계약. 웹·에이전트·DB 사이의 기준 |
| `docs/architecture.md` | 아키텍처, 데이터 모델, 권한, 배포 구조 |
| `docs/screens.md` | 화면 S1~S13과 상태 문구 |
| `docs/design/onboarding-design/README.md` | 디자인 토큰(색·라운드·글꼴), 화면 시안 |
| `.interface-design/system.md` | 디자인 시스템 규칙(색·글자·크기·상태·컴포넌트). UI를 만들거나 고치기 전에 읽는다 |
| `docs/deploy.md` | 클라우드 준비, 배포 흐름, 되돌리기, 운영 점검 |
| `docs/superpowers/specs/2026-11-17-onboarding-agent-design.md` | 목표·비목표·실패 조건 |

계약·설계와 코드가 다르면 멈추고 묻는다. 계획에 없는 기능은 만들지 않는다.

## 구조

| 폴더 | 내용 | 배포 |
|---|---|---|
| `apps/web` | React + Vite + TS, Tailwind + shadcn/ui, supabase-js, TanStack Query | Firebase Hosting |
| `services/agent` | Python + FastAPI + Google ADK(LiteLLM으로 OpenAI) | Cloud Run `asia-northeast3` |
| `supabase` | 스키마, RLS, RPC(업무 규칙), 가상 조직 데이터 | Supabase 무료 플랜 + `keepalive` |
| `.github/workflows` | CI, 스테이징·운영 배포, keepalive | GitHub Actions |

환경: 로컬 → 스테이징(`main` 머지 시 자동) → 운영(`v*` 태그 + Leo 승인). 스테이징과 운영은 서로 다른 GCP 프로젝트다.

## 절대 규칙

- 과제 상태는 Postgres RPC로만 바꾼다. 웹에서 `task_instances`를 직접 update하지 않는다.
- 에이전트는 조회·답변·시험 초안만 한다. 과제 상태를 바꾸는 도구를 만들지 않는다.
- 에이전트는 사용자의 Supabase 토큰으로 데이터를 읽는다(RLS 적용). `service_client()`는 `services/agent/app/admin_routes.py`와 `services/agent/scripts/`에서만 쓴다.
- 모든 테이블에 `org_id`, RLS 활성화, 필요한 `grant`를 마이그레이션에 명시. `anon`에는 권한 없음. 공개 가입 끔.
- 마이그레이션은 추가만 한다. 컬럼·테이블 삭제나 이름 변경 금지.
- 에이전트 서비스는 상태를 갖지 않는다. 채팅 내용은 저장하거나 로그에 남기지 않는다.
- 모델 이름은 `OPENAI_MODEL` 환경변수. 특정 모델 전용 기능은 구조화 출력 외에 쓰지 않는다.
- ADK·LiteLLM·OpenAI·Supabase 사용법은 설치된 버전의 문서·소스로 확인한다. 기억에 의존하지 않는다.
- 화면 문구는 한국어, 상태 문구는 `docs/screens.md` 표를 따른다. UI는 `.interface-design/system.md`를 따르고 `components/ui`·공통 컴포넌트와 의미 토큰으로 만든다. 색 hex, 임의 글자 크기, 직접 만든 탭·라디오는 쓰지 않는다(`scripts/check-design.sh`가 CI에서 막는다).

## 데이터·비밀값

- 회사 CI는 화면 브랜딩과 시드 조직명에만 쓴다. 실명·주민번호·계좌·카드번호·지문 관련 값, 실제 내부 업무 문서는 넣지 않는다. 파일 업로드는 담당자가 과제 템플릿에 서식(docx·xlsx·pdf, 10MB 이하)을 올리는 기능만 있다(`task-forms` 버킷, Leo 승인 2026-11-18). 시드 서식도 가상 내용만 담는다.
- `.env*` 파일을 만들거나 읽지 않는다. 비밀값은 Secret Manager와 GitHub Secrets에만 두고, 웹 번들에는 `VITE_*` 공개 값만 넣는다.
- 키·비밀번호가 필요하면 출력하지 않고 스테이징 Secret Manager에서 바로 넘긴다. 예: `OPENAI_API_KEY="$(gcloud secrets versions access latest --secret openai-api-key --project blueward-onboarding-stg)"`. 없는 값은 이름만 말하고 Leo에게 맡긴다.
- 로그인 화면의 데모 계정 버튼은 개발 모드(`import.meta.env.DEV`)에서만.
- 저장소는 공개다. 커밋 전 `git diff --cached`로 비밀값·실명이 없는지 확인한다.

## 작업 방식

- 테스트 먼저: 실패하는 테스트 → 구현 → 통과. 테스트 결과를 보여 주기 전에는 완료라고 말하지 않는다.
- 공통 영역(`supabase/`, `apps/web/src/lib`, `apps/web/src/app`, `services/agent/app/{main,auth,db,quota,config}.py`, `.github/`, `docs/contracts.md`)을 고칠 때는 PR 설명에 이유를 적는다. 여러 세션이 동시에 작업할 때는 맡은 폴더만 고친다.
- UI 작업(새 화면·기능 포함):
  1. `.interface-design/system.md`와 시안(`docs/design/onboarding-design`, 견본 `S0-system`)을 먼저 본다. 규칙에 없는 결정이 필요하면 시안과 system.md를 먼저 고친다.
  2. 화면 구성이 새로 생기거나 크게 바뀌면 시안(`screens/*.html`과 `png/`)을 먼저 만들어 Leo에게 확인받은 뒤 구현한다.
  3. 테스트 먼저 → 구현. `bash scripts/check-design.sh`를 통과시킨다.
  4. PR 전에 `/design-review`로 바뀐 화면을 검토한다. 막는 문제(blocker)가 남아 있으면 PR을 열지 않는다.
  5. PR 설명에 바뀐 부분의 수정 전 → 후 스크린샷을 넣는다(`scripts/design/README.md`).
- 로컬 Supabase는 여러 worktree가 함께 쓴다. `supabase stop`, `supabase db reset`, `npm run db:reset`은 Leo가 요청할 때만 한다.

## Git·PR

- `main`은 보호돼 있다. 브랜치에서 작업하고 PR로만 반영한다. Conventional Commits(`feat`, `fix`, `test`, `docs`, `chore`, `ci`).
- 머지 조건: CI 5개 통과(문서만 바뀐 PR은 건너뛴 상태가 통과다), 최신 `main` 반영, 리뷰 스레드 모두 해결, PR 자체 변경의 마지막 커밋까지 Codex 리뷰 완료(`main`을 반영한 병합 커밋은 다시 리뷰받지 않아도 된다). 조건을 모두 갖추면 Claude가 머지한다(`gh pr merge <번호> --squash`, 브랜치 자동 삭제). 시안처럼 Leo 확인이 필요한 PR은 확인을 받은 뒤 머지한다.
- `main`이 앞서면 `git merge origin/main`으로 따라간다. rebase, 강제 푸시, `git reset --hard`, `git tag`는 하지 않는다.
- Codex가 모든 PR을 리뷰한다. 지적이 타당하면 고치고 스레드에 답글을 단 뒤 해결 처리한다. 수정을 푸시한 뒤에는 PR에 `@codex review` 코멘트를 남겨야 다시 리뷰한다.

## 명령어

루트에서 실행한다. 로컬 Supabase 값은 `scripts/with-local-env.sh`가 넘긴다.

| 명령 | 하는 일 |
|---|---|
| `supabase start` | 로컬 Supabase(Docker) 켜기 |
| `npm run dev:web` / `npm run dev:agent` | 웹 `localhost:5173` / 에이전트 `localhost:8000` |
| `npm run test:web` | Vitest (`apps/web`) |
| `npm run test:agent` | pytest (`services/agent`, 일부는 로컬 Supabase 필요) |
| `npm run db:test` | pgTAP (`supabase/tests`) |
| `bash scripts/tests/smoke_test.sh` 등 | 배포 스크립트 테스트(`scripts/tests/`) |
| `bash scripts/check-design.sh` | 디자인 규칙 검사(CI와 같음). 꼭 필요한 예외는 그 줄에 `design-allow: <이유>` |
| `/design-review`, `/design-deslop` | 화면 디자인 리뷰 / 생성형 UI 티 지우기(`.claude/commands`, 스킬 `interface-design`) |
| `npm --prefix scripts/design ci` | PR 전·후 스크린샷 도구 설치(`scripts/design/README.md`) |
| `npm run types` | `apps/web/src/lib/database.types.ts` 생성 |

의존성 추가: 웹 `npm --prefix apps/web install <pkg>`, 에이전트 `cd services/agent && uv add <pkg>`. shadcn CLI로 컴포넌트를 추가하면 `cn` 패키지가 끼어드는 버그가 있으니 `package.json`을 확인한다.
