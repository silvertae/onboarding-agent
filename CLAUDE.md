# 온보딩 에이전트

사내 AI Agent 경진대회 출품작. 신입 온보딩을 신입·교육 담당자·경영지원·관리자가 함께 처리하는 웹 서비스와, 지식 답변·시험 출제 에이전트. 공개 URL로 한 달간 심사위원이 직접 쓰고, 채택되면 실제 도입으로 확장한다. 화면은 회사 CI(Blueward), 사람·계정·업무 데이터는 전부 가상이다.

## 문서

| 문서 | 언제 보나 |
|---|---|
| `docs/contracts.md` | API·환경변수 계약. 웹·에이전트·DB 사이의 기준 |
| `docs/architecture.md` | 아키텍처, 데이터 모델, 권한, 배포 구조 |
| `docs/screens.md` | 화면 S1~S12와 상태 문구 |
| `docs/design/onboarding-design/README.md` | 디자인 토큰(색·라운드·글꼴), 화면 시안 |
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
- 화면 문구는 한국어, 상태 문구는 `docs/screens.md` 표를 따른다. UI는 shadcn/ui와 디자인 토큰으로 만든다.

## 데이터·비밀값

- 회사 CI는 화면 브랜딩과 시드 조직명에만 쓴다. 실명·주민번호·계좌·카드번호·지문 관련 값, 실제 내부 업무 문서는 넣지 않는다. 파일 업로드는 담당자가 과제 템플릿에 서식(docx·xlsx·pdf, 10MB 이하)을 올리는 기능만 있다(`task-forms` 버킷, Leo 승인 2026-11-18). 시드 서식도 가상 내용만 담는다.
- `.env*` 파일을 만들거나 읽지 않는다. 비밀값은 Secret Manager와 GitHub Secrets에만 두고, 웹 번들에는 `VITE_*` 공개 값만 넣는다.
- 키·비밀번호가 필요하면 출력하지 않고 스테이징 Secret Manager에서 바로 넘긴다. 예: `OPENAI_API_KEY="$(gcloud secrets versions access latest --secret openai-api-key --project blueward-onboarding-stg)"`. 없는 값은 이름만 말하고 Leo에게 맡긴다.
- 로그인 화면의 데모 계정 버튼은 개발 모드(`import.meta.env.DEV`)에서만.
- 저장소는 공개다. 커밋 전 `git diff --cached`로 비밀값·실명이 없는지 확인한다.

## 작업 방식

- 테스트 먼저: 실패하는 테스트 → 구현 → 통과. 테스트 결과를 보여 주기 전에는 완료라고 말하지 않는다.
- 공통 영역(`supabase/`, `apps/web/src/lib`, `apps/web/src/app`, `services/agent/app/{main,auth,db,quota,config}.py`, `.github/`, `docs/contracts.md`)을 고칠 때는 PR 설명에 이유를 적는다. 여러 세션이 동시에 작업할 때는 맡은 폴더만 고친다.
- 로컬 Supabase는 여러 worktree가 함께 쓴다. `supabase stop`, `supabase db reset`, `npm run db:reset`은 Leo가 요청할 때만 한다.

## Git·PR

- `main`은 보호돼 있다. 브랜치에서 작업하고 PR로만 반영한다. Conventional Commits(`feat`, `fix`, `test`, `docs`, `chore`, `ci`).
- 머지 조건: CI 5개 통과, 최신 `main` 반영, 리뷰 스레드 모두 해결. 머지는 Leo가 한다(squash, 브랜치 자동 삭제).
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
| `npm run types` | `apps/web/src/lib/database.types.ts` 생성 |

의존성 추가: 웹 `npm --prefix apps/web install <pkg>`, 에이전트 `cd services/agent && uv add <pkg>`. shadcn CLI로 컴포넌트를 추가하면 `cn` 패키지가 끼어드는 버그가 있으니 `package.json`을 확인한다.
