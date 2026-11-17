# 온보딩 에이전트

| 항목 | 내용 |
|---|---|
| 무엇 | 회사 계정 발급 이후 신입 온보딩을 한 타임라인으로 묶은 웹 서비스와, 지식 답변·시험 출제 에이전트 |
| 현재 | 19개 중 10개 완료 — 0단계는 Task 6(배포)만 남음, 1단계 신입·담당자 화면(A·B) 완료, 어시스턴트·시험 출제·관리자(C·D·E) 대기 |
| 데이터 | 화면은 회사 CI(Blueward), 사람·계정·업무 데이터는 전부 가상. 실명·민감정보 없음 |

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

상태: ✅ 완료(머지) · 🔍 PR 리뷰 중 · 🔨 작업 중 · ⏳ 대기 (기준: 2026-11-17, `main` `da32d35`)

### 0단계: 공통 기반과 배포 경로 (순차)

| Task | 내용 | 상태 | PR |
|---|---|---|---|
| 1 | 저장소 골격, 계약 문서, 에이전트 `/health` | ✅ | [#1](https://github.com/silvertae/onboarding-agent/pull/1) |
| 2 | 스키마, RLS, 상태 전이 함수, 사용 한도 | ✅ | [#2](https://github.com/silvertae/onboarding-agent/pull/2) |
| 3 | 데모 조직 데이터(Blueward), 데모 초기화, 계정 부트스트랩 | ✅ | [#6](https://github.com/silvertae/onboarding-agent/pull/6) |
| 4 | 웹 공통 골격 (로그인, 역할별 접근, 공통 훅) | ✅ | [#3](https://github.com/silvertae/onboarding-agent/pull/3) |
| 5 | 에이전트 서비스 기반 (인증, DB 클라이언트, 한도, CORS) | ✅ | [#7](https://github.com/silvertae/onboarding-agent/pull/7) |
| 6 | 배포 경로 (CI, 스테이징, 운영) | 🔨 | [#4](https://github.com/silvertae/onboarding-agent/pull/4) — 클라우드 설정값 입력 대기 |

### 1단계: 도메인별 병렬

| Task | 도메인 | 내용 | 상태 | PR |
|---|---|---|---|---|
| 7 | A 신입 화면 | 신입 홈 타임라인 (S2) | ✅ | [#8](https://github.com/silvertae/onboarding-agent/pull/8) |
| 8 | A 신입 화면 | 과제 상세 (S3) | ✅ | [#8](https://github.com/silvertae/onboarding-agent/pull/8) |
| 9 | B 담당자 화면 | 부서 업무함 (S9) | ✅ | [#9](https://github.com/silvertae/onboarding-agent/pull/9) |
| 10 | B 담당자 화면 | 팀 신입 현황과 신입 상세 (S5, S6) | ✅ | [#9](https://github.com/silvertae/onboarding-agent/pull/9) |
| 11 | B 담당자 화면 | 지식·미답변 관리 (S10) | ✅ | [#9](https://github.com/silvertae/onboarding-agent/pull/9) |
| 12 | C 어시스턴트 | 어시스턴트 도구와 `/chat` | ⏳ | |
| 13 | C 어시스턴트 | 채팅 패널 (S4) | ⏳ | |
| 14 | D 시험 출제 | 시험 출제 에이전트와 API | ⏳ | |
| 15 | D 시험 출제 | 시험 목록과 편집기 (S7) | ⏳ | |
| 16 | D 시험 출제 | 시험 인쇄 뷰 (S8) | ⏳ | |
| 17 | E 관리자 | 사용자 등록 API | ⏳ | |
| 18 | E 관리자 | 사용자 관리 화면 (S11) | ⏳ | |

### 2단계: 통합과 운영 반영

| Task | 내용 | 상태 |
|---|---|---|
| 19 | 통합, 스테이징 리허설, 운영 릴리스 | ⏳ |

### 다음 작업 (우선순위)

1. Task 6 배포 경로 마무리: 스테이징 설정값 입력 → CI 통과 → 스테이징 배포
2. 부트스트랩 개선: 배포 때 기본 계정 비밀번호가 바뀌지 않았으면 다시 설정하지 않기(재설정 시 기존 로그인 세션이 끊김)
3. Task 12 어시스턴트 `/chat` → Task 13 채팅 패널
4. Task 17·18 사용자 등록 API·화면
5. Task 14 → 15 → 16 시험 출제·편집·인쇄
6. Task 19 통합·리허설·운영 릴리스

### 로컬에서 볼 수 있는 화면

| 역할 (로컬 계정) | 화면 |
|---|---|
| 신입 `newhire@demo.test` | S2 타임라인, S3 과제 상세 |
| 경영지원 `hr@` · `ga@` · `acc@demo.test` | S9 부서 업무함, S10 지식 관리(회사 공통) |
| 교육 담당자 `trainer@demo.test` | S5 팀 신입 현황, S6 신입 상세, S10 지식 관리(AI팀) |
| 관리자 `admin@demo.test` | S11 자리표시(Task 18 전) |

채팅(S4), 시험 출제·인쇄(S7·S8), 사용자 관리(S11)는 아직 없습니다. 로컬 비밀번호는 `demo1234`입니다.

## 로컬 실행

필요한 도구: Node 22+, uv, Docker, Supabase CLI.

```bash
npm --prefix apps/web install          # 웹 의존성
(cd services/agent && uv sync)         # 에이전트 의존성
supabase start && npm run db:reset    # 로컬 Supabase + 기본 계정 6개(로컬 비밀번호 demo1234)
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
| [CLAUDE.md](CLAUDE.md) | 구현 에이전트(Claude Code) 작업 규칙과 명령어 |
| [AGENTS.md](AGENTS.md) | PR 리뷰 에이전트(Codex) 리뷰 기준 |
| [SECURITY.md](SECURITY.md) | 보안 제보 방법, 신뢰 경계, 보안 검토 기준 |
