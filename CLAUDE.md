# 온보딩 에이전트

사내 AI Agent 경진대회 출품작. 회사 계정 발급 이후 신입 온보딩을 신입·교육 담당자·경영지원·관리자가 함께 처리하는 웹 서비스와, 지식 답변·시험 출제 에이전트.
공개 URL로 배포해 심사위원이 한 달간 직접 써 보고, 채택되면 실제 도입으로 확장한다. 화면은 회사 CI(Blueward)를 쓰고, 사람·계정·업무 데이터는 전부 가상이다.

## 먼저 읽을 문서

- 설계(목표·비목표·실패 조건): @docs/superpowers/specs/2026-11-17-onboarding-agent-design.md
- 구현 계획(Task 1~19, 인터페이스·테스트): docs/superpowers/plans/2026-11-17-onboarding-agent.md
- 화면 명세(S1~S11): docs/screens.md
- API·환경변수 계약: docs/contracts.md (Task 1에서 생성. 생기면 이 문서가 기준)

계획과 코드가 다르면 멈추고 묻는다. 계획에 없는 기능은 만들지 않는다.

## 구조

| 폴더 | 내용 | 배포 |
|---|---|---|
| `apps/web` | React + Vite + TS, Tailwind + shadcn/ui, supabase-js, TanStack Query | Firebase Hosting |
| `services/agent` | Python + FastAPI + Google ADK(LiteLLM으로 OpenAI) | Cloud Run `asia-northeast3` |
| `supabase` | 스키마, RLS, RPC(업무 규칙), 가상 조직 데이터 | Supabase(운영·스테이징 무료 플랜 + keepalive) |
| `.github/workflows` | CI, 스테이징·운영 배포 | GitHub Actions |

환경: 로컬 → 스테이징(`main` 머지 시 자동) → 운영(`v*` 태그 시, 태그는 Leo만).

## 절대 규칙

- 과제 상태는 Postgres RPC로만 바꾼다. 웹에서 `task_instances`를 직접 update하지 않는다.
- 에이전트는 조회·답변·시험 초안만 한다. 과제 상태를 바꾸는 도구를 만들지 않는다.
- 에이전트는 사용자의 Supabase 토큰으로 데이터를 읽는다(RLS 적용). `service_client()`는 `services/agent/app/admin_routes.py`와 `services/agent/scripts/`에서만 쓴다.
- 모든 테이블에 `org_id`, RLS 활성화, 필요한 `grant`를 마이그레이션에 명시. `anon`에는 권한 없음. 공개 가입 끔.
- 마이그레이션은 추가만 한다. 컬럼·테이블 삭제나 이름 변경 금지.
- 에이전트 서비스는 상태를 갖지 않는다. 채팅 내용은 저장하거나 로그에 남기지 않는다.
- 모델 이름은 `OPENAI_MODEL` 환경변수. 특정 모델 전용 기능은 구조화 출력 외에 쓰지 않는다.
- ADK·LiteLLM·OpenAI·Supabase 사용법은 설치된 버전의 공식 문서로 확인하고 쓴다. 기억에 의존하지 않는다. LiteLLM 경유 스트리밍·구조화 출력이 안 되면 멈추고 보고한다.
- 화면 문구는 한국어. 상태 문구는 `docs/screens.md` 표를 따른다.

## 디자인
- 화면 시안과 토큰: @docs/design/onboarding-design/README.md
- 화면 명세: docs/screens.md (시안 HTML은 구조·문구 참고)
- UI는 shadcn/ui로 구현하고, 색·라운드는 README의 토큰을 따른다.

## 데이터·비밀값

- 회사 CI(회사명 Blueward, 로고, 테마 색상)는 화면 브랜딩과 시드 조직명에만 쓴다. 사람 이름·계정·과제·지식 내용은 가상이며, 실명·주민번호·계좌·카드번호·지문 관련 필드나 값, 실제 내부 업무 문서는 넣지 않는다. 파일 업로드 기능 없음.
- 경영지원 원본 업무 문서는 저장소에 넣지 않는다.
- `.env*` 파일을 읽거나 출력하지 않는다. 키·비밀번호가 필요하면 환경변수 이름만 말하고 Leo에게 맡긴다.
- 비밀값은 Secret Manager와 GitHub Secrets에만 둔다. 웹 번들에는 `VITE_*` 공개 값만.
- 로그인 화면에 데모 계정 버튼은 개발 모드(`import.meta.env.DEV`)에서만.

## 작업 방식

- 테스트 먼저: 실패하는 테스트 → 구현 → 통과. 테스트 결과를 보여주기 전에는 완료라고 말하지 않는다.
- 병렬 단계에서는 자기 도메인 폴더만 수정한다.
  - A `features/newhire`, B `features/staff`, C `assistant*`·`chat_routes.py` + `features/chat`, D `exam*` + `features/exam`, E `admin*` + `features/admin`
  - `supabase/`, `src/lib/`, `src/app/`, `services/agent/app/{main,auth,db,quota,config}.py`, `.github/`, `docs/contracts.md`를 고쳐야 하면 멈추고 보고한다(라우터 등록 한 줄, Layout의 ChatPanel 한 줄은 예외).

## Git

- `main` 직접 커밋·푸시 금지. Task마다 `feat/task-N` 또는 도메인 브랜치.
- Conventional Commits(`feat`, `fix`, `test`, `docs`, `chore`, `ci`). 테스트 통과 후에만 커밋.
- PR → CI 통과(`gh pr checks`) → squash 머지 → 브랜치 삭제. CI 실패 시 머지 금지.
- 머지 전 최신 `main`으로 rebase. 강제 푸시, `git reset --hard`, `git tag` 금지.
- 커밋 전 `git diff --cached`로 비밀값·실명이 없는지 확인.

## 명령어

루트에서 실행한다. 로컬 Supabase 값은 `scripts/with-local-env.sh`가 `supabase status`에서 받아 넘긴다(`.env` 파일 없음).

| 명령 | 하는 일 |
|---|---|
| `supabase start` / `supabase stop` | 로컬 Supabase(Docker) 켜기·끄기 |
| `npm run dev:web` | 웹 개발 서버 `localhost:5173` |
| `npm run dev:agent` | 에이전트 개발 서버 `localhost:8000` |
| `npm run test:web` | Vitest (`apps/web`) |
| `npm run test:agent` | pytest (`services/agent`, 일부 테스트는 로컬 Supabase 필요) |
| `npm run db:test` | pgTAP (`supabase/tests`) |
| `npm run db:reset` | 로컬 DB 초기화 + 기본 계정 6개 생성 |
| `npm run types` | `apps/web/src/lib/database.types.ts` 생성 |
| `docker build services/agent` | 에이전트 이미지 빌드 확인 |

의존성 추가: 웹 `npm --prefix apps/web install <pkg>`, 에이전트 `cd services/agent && uv add <pkg>`.
