# 온보딩 에이전트

| 항목 | 내용 |
|---|---|
| 무엇 | 회사 계정 발급 이후 신입 온보딩을 한 타임라인으로 묶은 웹 서비스와, 지식 답변·시험 출제 에이전트 |
| 현재 | 0단계 진행 중 — Task 1 PR 리뷰 중 (전체 19개 중 0개 완료) |
| 데이터 | 전부 가상 조직·가상 계정. 실제 회사명·실명·민감정보 없음 |

사내 AI Agent 경진대회 출품작입니다. 공개 URL로 배포해 심사위원이 한 달 동안 역할별 계정으로 직접 써 보는 것을 목표로 합니다.

## 프로그램 개요

### 누가 무엇을 하나

| 역할 | 하는 일 |
|---|---|
| 신입 | 입사일 / 첫 주 / 첫 달 타임라인에서 경영지원 과제 21개와 AI팀 과제 10개를 처리하고, 에이전트에게 질문합니다 |
| 교육 담당자 | 팀 신입의 진행을 확인하고 평가를 기록하며, AI 초안으로 시험지·답안지를 만듭니다 |
| 경영지원 담당자 (인사·총무·회계) | 자기 부서 과제를 확인하거나 보완을 요청하고, 담당자 처리 과제를 완료합니다 |
| 관리자 | 가상 계정을 등록하고(신입이면 온보딩 자동 시작), 데모 데이터를 초기화합니다 |

### 핵심 원칙

- **업무 상태는 DB가 관리합니다.** 과제 상태(`blocked → todo → submitted → rework → done`, 별도로 `na`)는 Postgres RPC로만 바뀝니다. 선행 과제가 끝나면 다음 과제가 자동으로 열립니다.
- **에이전트는 조회·답변·초안만 합니다.** 사용자의 토큰으로 데이터를 읽으므로 RLS가 그대로 적용되며, 과제 상태를 바꾸지 않습니다. 등록된 지식에 없는 질문은 지어내지 않고 미답변으로 기록합니다.
- **비밀값은 서버에만 둡니다.** OpenAI 키와 Supabase 관리자 키는 브라우저 코드와 저장소에 들어가지 않습니다.

### 구성

| 폴더 | 기술 | 배포 |
|---|---|---|
| `apps/web` | React 19 + Vite + TypeScript, Tailwind v4 + shadcn/ui, supabase-js, TanStack Query | Firebase Hosting |
| `services/agent` | Python 3.12 + FastAPI + Google ADK (LiteLLM으로 OpenAI) | Cloud Run (`asia-northeast3`) |
| `supabase` | 스키마, RLS, RPC, 가상 조직 데이터 | Supabase (운영 Pro, 스테이징 무료) |

환경: 로컬 → 스테이징(`main` 머지 시 자동 배포) → 운영(`v*` 태그 시 배포).

## 진행 상황

상태: ✅ 완료(머지) · 🔍 PR 리뷰 중 · 🔨 작업 중 · ⏳ 대기

### 0단계: 공통 기반과 배포 경로 (순차)

| Task | 내용 | 상태 | PR |
|---|---|---|---|
| 1 | 저장소 골격, 계약 문서, 에이전트 `/health` | 🔍 | [#1](https://github.com/silvertae/onboarding-agent/pull/1) |
| 2 | 스키마, RLS, 상태 전이 함수, 사용 한도 | ⏳ | |
| 3 | 가상 조직 데이터, 데모 초기화, 계정 부트스트랩 | ⏳ | |
| 4 | 웹 공통 골격 (로그인, 역할별 접근, 공통 훅) | ⏳ | |
| 5 | 에이전트 서비스 기반 (인증, DB 클라이언트, 한도, CORS) | ⏳ | |
| 6 | 배포 경로 (CI, 스테이징, 운영) | ⏳ | 클라우드 준비 후 진행 |

### 1단계: 도메인별 병렬

| Task | 도메인 | 내용 | 상태 |
|---|---|---|---|
| 7 | A 신입 화면 | 신입 홈 타임라인 (S2) | ⏳ |
| 8 | A 신입 화면 | 과제 상세 (S3) | ⏳ |
| 9 | B 담당자 화면 | 부서 업무함 (S9) | ⏳ |
| 10 | B 담당자 화면 | 팀 신입 현황과 신입 상세 (S5, S6) | ⏳ |
| 11 | B 담당자 화면 | 지식·미답변 관리 (S10) | ⏳ |
| 12 | C 어시스턴트 | 어시스턴트 도구와 `/chat` | ⏳ |
| 13 | C 어시스턴트 | 채팅 패널 (S4) | ⏳ |
| 14 | D 시험 출제 | 시험 출제 에이전트와 API | ⏳ |
| 15 | D 시험 출제 | 시험 목록과 편집기 (S7) | ⏳ |
| 16 | D 시험 출제 | 시험 인쇄 뷰 (S8) | ⏳ |
| 17 | E 관리자 | 사용자 등록 API | ⏳ |
| 18 | E 관리자 | 사용자 관리 화면 (S11) | ⏳ |

### 2단계: 통합과 운영 반영

| Task | 내용 | 상태 |
|---|---|---|
| 19 | 통합, 스테이징 리허설, 운영 릴리스 | ⏳ |

## 로컬 실행

필요한 도구: Node 22+, uv, Docker, Supabase CLI.

```bash
npm --prefix apps/web install          # 웹 의존성
(cd services/agent && uv sync)         # 에이전트 의존성
supabase start                         # 로컬 Supabase (Task 2부터)
npm run dev:web                        # http://localhost:5173
npm run dev:agent                      # http://localhost:8000/health
npm run test:web && npm run test:agent # 테스트
```

`.env` 파일은 쓰지 않습니다. 로컬 Supabase 값은 `scripts/with-local-env.sh`가 `supabase status`에서 받아 넘깁니다. 명령어 전체는 [CLAUDE.md](CLAUDE.md#명령어)를 참고하십시오.

## 문서

| 문서 | 내용 |
|---|---|
| [설계](docs/superpowers/specs/2026-11-17-onboarding-agent-design.md) | 목표, 비목표, 실패 조건, 결정된 구조 |
| [구현 계획](docs/superpowers/plans/2026-11-17-onboarding-agent.md) | Task 1~19, 인터페이스, 테스트 |
| [화면 명세](docs/screens.md) | 화면 S1~S11, 시연 흐름 |
| [API·환경변수 계약](docs/contracts.md) | 웹·에이전트·DB 사이의 기준 |
