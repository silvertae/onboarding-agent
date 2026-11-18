# 온보딩 플랜 관리 (과제 템플릿 편집·한 사람 추가) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 순서·번호·서식 통합은 `2026-11-18-onboarding-tasks-and-forms.md`를 따른다.

**Goal:** 교육 담당자와 경영지원 담당자가 자기 범위의 온보딩 과제 템플릿을 만들고·고치고·보관하며, 새 신입에게 자동으로 들어가게 하고, 특정 신입에게만 과제를 추가할 수 있게 한다.

**Architecture:** 템플릿 쓰기는 전부 새 RPC(security definer)가 맡고 담당 범위·사용 중 잠금을 DB에서 확인한다. `_start_onboarding`은 보관·한 사람용 템플릿을 빼고 복사한다. 웹은 새 "온보딩 과제" 화면(S12 자리)과 S6·S9의 "과제 추가" 대화 상자를 더한다. 단계는 지금의 세 단계(enum)를 그대로 쓰고, 에이전트는 바꾸지 않는다.

**Tech Stack:** Postgres(Supabase) + pgTAP, React + Vite + TS + TanStack Query + Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-18-onboarding-plan-design.md`

## Global Constraints

- `CLAUDE.md` 절대 규칙을 모두 따른다. 마이그레이션은 추가만(컬럼·테이블 삭제·이름 변경 금지), 새 테이블·컬럼에 RLS와 명시적 `grant`, `anon` 권한 없음, `task_instances` 직접 update 금지.
- 단계는 `task_stage` enum(`day1`·`week1`·`month1`) 그대로 쓴다. 단계 시작일: `day1` 0일, `week1` 5일, `month1` 30일. 템플릿의 `due_offset_days` = 단계 시작일 + "단계 시작 후 며칠"(0~60).
- 사용 중 잠금: `task_instances`가 하나라도 있는 템플릿은 `title`·`description`만 바꿀 수 있다. 나머지 칸을 바꾸면 거부한다.
- 템플릿·한 사람용 과제는 지우지 않는다. 보관(`archived_at`)만 한다.
- 담당 범위: `team_trainer`는 `team_id = 내 팀`, `ops_staff`는 `department = 내 부서`. `admin`과 `new_hire`는 템플릿을 쓰지 않는다.
- 새로 만들 수 있는 종류: `ops`(안내), `read`(읽기), `practice`(실습), `setup`(체크리스트), `assessment`(평가, `team_trainer`만, 완료 방식은 `staff_only`로 고정). `input`은 새로 만들 수 없다.
- 로컬 Supabase는 공유한다. `supabase db reset`·`npm run db:reset`·`supabase stop` 금지. 새 마이그레이션은 `supabase migration up`으로 적용한다.
- 마이그레이션 번호: 작업 시작 때 `origin/main`의 `supabase/migrations/` 다음 번호부터 쓴다(지금 `0008`). 다른 PR이 먼저 그 번호를 쓰면 뒤로 민다. 이 플랜에서는 `00NN_task_template_admin.sql`, `00NN+1_task_template_rpc.sql`, `00NN+2_task_template_reset.sql`로 부른다.
- 화면 문구는 이 플랜의 표를 `docs/screens.md`에 옮긴 것과 글자까지 같아야 한다. UI는 `.interface-design/system.md`, 공통 컴포넌트, 의미 토큰.
- UI Task는 CLAUDE.md "UI 작업" 순서를 따른다: 시안 확인 → 테스트 먼저 → 구현 → `bash scripts/check-design.sh` → `/design-review`(blocker 0) → PR 설명에 수정 전·후 스크린샷.
- S12 과제 서식(`task-forms`)은 아직 구현 전이다. 이 플랜이 S12 화면을 "온보딩 과제" 관리 화면으로 먼저 만들고, 서식 칸은 자리만 둔다. 웹 Task를 시작할 때 `main`에 서식 화면(`/forms`)이 이미 머지돼 있으면, 새 화면을 만들지 말고 그 화면을 넓힌다(라우트는 `/tasks`로 옮기고 `/forms`는 `/tasks`로 보냄). 판단이 서지 않으면 멈추고 Leo에게 묻는다.
- 브랜치·PR (Conventional Commits, 태그·rebase·강제 푸시 금지):
  - ① `feat/task-template-db`: Task 1~3
  - 시안 `docs/task-template-mockups`: Task 4. ①과 병행. Leo 확인 전에는 웹 Task를 시작하지 않는다.
  - ② `feat/task-template-web`: Task 5~7. ①이 머지되고 시안이 확인된 뒤 `main`에서 시작한다.
  - ③ `docs/task-template-demo`: Task 8. ②가 머지된 뒤.

## Review Focus

1. **사용 중 템플릿의 구조 변경**: 신입이 진행 중인 체크리스트 과제에 항목을 추가·제거하거나 완료 방식·단계·선행을 바꾸는 요청 → `22023`으로 거부, 템플릿은 그대로. 제목·안내문만 바꾸면 성공. (Task 2)
2. **범위 밖 쓰기**: 다른 팀 교육 담당자, 다른 부서 경영지원, 관리자, 신입이 남의 템플릿을 저장·보관하거나 남의 팀 신입에게 과제를 추가 → `42501`. (Task 2)
3. **한 사람용 과제 노출**: 신입A에게 추가한 과제가 신입B의 화면·조회, 기본 목록, 이후 `_start_onboarding`에 나오지 않는다. 신입B는 그 템플릿 행도 볼 수 없다. (Task 1, 2)
4. **보관 후 새 신입**: 보관한 템플릿은 새 신입에게 안 들어가고, 이미 진행 중인 신입의 그 과제는 그대로 제출·확인된다. 보관된 템플릿을 선행으로 둔 과제는 새 신입에게 잠기지 않는다. (Task 1, 2)
5. **저장 버튼 연타·재시도**: 새 과제 저장을 두 번 누르거나 실패 후 다시 시도 → 템플릿이 하나만 생긴다(화면에서 1회만 호출, 실패 시 입력 유지). (Task 6, 7)

---

## File Structure

```
supabase/migrations/
  00NN_task_template_admin.sql     컬럼 추가, 시드 표시·사본, RLS 교체, _start_onboarding 교체
  00NN+1_task_template_rpc.sql     save / archive / restore / add_task_for_hire, 코드 부여
  00NN+2_task_template_reset.sql   reset_demo 교체
supabase/tests/
  07_task_templates.sql            Task 1~2
  04_demo_data.sql                 Task 3 (수정)
apps/web/src/features/templates/
  templates.ts                     조회 훅, 저장·보관·추가 함수, 잠금 판단
  stage.ts                         단계 시작일, 기한 계산
  TemplatesPage.tsx                S12 온보딩 과제 화면
  TemplateForm.tsx                 편집 칸 (화면과 대화 상자가 함께 씀)
  AddTaskDialog.tsx                "이 신입에게 과제 추가"
  *.test.ts(x)
apps/web/src/app/App.tsx, Layout.tsx   라우트·메뉴 (공통 영역, PR에 이유)
apps/web/src/features/staff/HireDetailPage.tsx, OpsInboxPage.tsx   추가 버튼·배지
docs/design/onboarding-design/screens/S12-tasks.html, S6-hire-detail.html, S9-ops.html (+png)
docs/screens.md, docs/contracts.md, docs/architecture.md, docs/demo-script.md, docs/judge-guide.md
```

---

## ① DB

### Task 1: 템플릿 관리 컬럼·권한·시작 함수

**Files:**
- Create: `supabase/migrations/00NN_task_template_admin.sql`
- Create: `supabase/tests/07_task_templates.sql`

**Interfaces:**
- Produces (컬럼):
  - `task_templates.archived_at timestamptz null`
  - `task_templates.assigned_to uuid null references profiles(id)` — 한 사람용 과제의 대상 신입
  - `task_templates.created_by uuid null references profiles(id)`
  - `task_templates.is_seed boolean not null default false` — 마이그레이션에서 기존 행 전부 `true`
  - `teams.task_code_prefix text null` — 마이그레이션에서 `name = 'AI팀'`인 팀에 `'AI'`
- Produces: `private.task_template_seed` — 기존 시드 템플릿의 사본 테이블(`template_id` PK, `title`, `description`, `kind`, `completion_mode`, `stage`, `due_offset_days`, `allow_na`, `requires_hq_access`, `prerequisite_codes`, `checklist`, `form_schema`, `sort_order`). 마이그레이션이 `is_seed` 행에서 채운다. `authenticated`·`anon` 권한 없음.
- Produces: `private.stage_start_days(public.task_stage) returns int` — immutable. `day1` 0, `week1` 5, `month1` 30.
- Produces (RLS 교체): `task_templates`의 "같은 조직" select 정책을 지우고 새 정책 "같은 조직, 한 사람용은 본인·담당자" — `org_id = my_org()` 그리고 (`assigned_to is null` 또는 `assigned_to = auth.uid()` 또는 `my_role() in ('team_trainer','ops_staff','admin')`). 정책 교체는 테이블·컬럼 변경이 아니므로 허용, PR에 이유를 적는다.
- Produces: `create or replace function public._start_onboarding` — 기존 본문에서 템플릿 조건에 `and t.archived_at is null and t.assigned_to is null`만 더한다.

- [ ] **Step 1: 실패하는 pgTAP 작성** (`07_task_templates.sql`, 픽스처: 조직 1, 팀 T(AI팀)·T2, 신입A·B(팀 T), 교육 담당자(T)·(T2), 경영지원(hr)·(ga), 관리자)
  - 기존 시드 템플릿 31개가 모두 `is_seed = true`, `private.task_template_seed` 31행
  - `private.stage_start_days('week1') = 5`, `'month1' = 30`
  - 팀 T 템플릿 하나에 `archived_at = now()`를 넣은 뒤 신입C를 만들고 `_start_onboarding` → 그 템플릿의 인스턴스 없음, 생성 수 30
  - `assigned_to = 신입A`인 템플릿을 직접 넣은 뒤 신입C `_start_onboarding` → 그 템플릿 인스턴스 없음
  - 보관한 템플릿을 선행(`prerequisite_codes`)으로 둔 템플릿의 신입C 인스턴스가 `todo`(잠기지 않음)
  - 신입B로 `task_templates` select → `assigned_to = 신입A`인 행 0개, 일반 템플릿은 보임; 신입A로 → 그 행 보임; 교육 담당자·경영지원으로 → 보임
  - `anon`으로 `task_templates` select → 권한 오류
- [ ] **Step 2: 실패 확인** — `npm run db:test` → 컬럼·함수 없음으로 실패.
- [ ] **Step 3: 마이그레이션 작성** — Interfaces 그대로. `_start_onboarding`은 최신 본문을 복사해 조건 두 개만 더한다.
- [ ] **Step 4: 적용·통과 확인** — `supabase migration up` 후 `npm run db:test` PASS(기존 테스트 포함).
- [ ] **Step 5: 커밋** — `feat(db): add template archive, one-off assignment and seed snapshot`

### Task 2: 템플릿 쓰기 RPC

**Files:**
- Create: `supabase/migrations/00NN+1_task_template_rpc.sql`
- Modify: `supabase/tests/07_task_templates.sql`

**Interfaces:**
- Consumes: Task 1의 컬럼, `private.stage_start_days`, 기존 `private.my_role()`·`my_team()`·`my_department()`·`my_org()`·`private.lock_hire_of_task`·`private.hire_lock_key`·`private.unlock_ready`.
- Produces (모두 security definer, `set search_path = ''`, `revoke ... from public, anon`, `grant execute ... to authenticated`):
  - `private.next_task_code(p_org uuid, p_prefix text, p_one_off boolean) returns text` — 같은 조직에서 `^<prefix>-(\d+)$`(한 사람용은 `^<prefix>-P(\d+)$`) 최대 번호 + 1, 두 자리 이상 0 채움. 예: `AI-11`, `GA-09`, `HR-P01`. 접두어: 부서 `hr`→`HR`, `ga`→`GA`, `accounting`→`AC`, 팀은 `teams.task_code_prefix`, 없으면 `TM`. 같은 조직 템플릿 생성은 `pg_advisory_xact_lock`으로 직렬화해 번호 충돌을 막는다.
  - `public.save_task_template(p_id uuid, p_title text, p_description text, p_kind public.task_kind, p_completion_mode public.completion_mode, p_stage public.task_stage, p_days_in_stage int, p_allow_na boolean, p_checklist jsonb, p_prerequisite_codes text[]) returns public.task_templates`
    - `p_id is null`이면 새 템플릿(담당은 호출자의 팀 또는 부서, `created_by = auth.uid()`, `sort_order` = 같은 담당·단계의 최댓값 + 10, 없으면 10, `requires_hq_access = false`, `form_schema = null`).
    - `p_id`가 있으면 수정. 없거나 범위 밖·한 사람용이면 `P0002` / `42501`. 보관된 템플릿이면 `22023`.
    - 검증(`22023`): 제목 앞뒤 공백 제거 1~60자, 안내문 2000자 이하, `p_days_in_stage` 0~60, 새 템플릿의 `p_kind = 'input'` 거부, `assessment`는 `team_trainer`만(아니면 `42501`)이고 `p_completion_mode = 'staff_only'`여야 함, `setup`이면 `p_checklist`가 1~20개의 문자열 배열이고 각 항목 공백 제거 1~60자, `setup`이 아니면 `p_checklist`는 null, 선행 0~3개이며 각 코드가 같은 담당 범위의 보관되지 않은 일반 템플릿이고 자기 자신이 아니며 순환하지 않음.
    - `due_offset_days = stage_start_days(p_stage) + p_days_in_stage`.
    - 사용 중 잠금: 그 템플릿의 `task_instances`가 있으면 `kind`·`completion_mode`·`stage`·`due_offset_days`·`allow_na`·`checklist`·`prerequisite_codes` 중 하나라도 기존 값과 다르면 `22023`(메시지 `진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다`). 시드의 `input` 템플릿은 이 규칙으로 제목·안내문만 고쳐진다.
  - `public.archive_task_template(p_id uuid) returns public.task_templates` — 범위 확인 후 `archived_at = coalesce(archived_at, now())`. 한 사람용은 `22023`(해당 없음으로 처리하라는 메시지).
  - `public.restore_task_template(p_id uuid) returns public.task_templates` — 범위 확인 후 `archived_at = null`.
  - `public.add_task_for_hire(p_new_hire uuid, p_title text, p_description text, p_kind public.task_kind, p_completion_mode public.completion_mode, p_stage public.task_stage, p_days_in_stage int, p_allow_na boolean, p_checklist jsonb) returns public.task_instances`
    - `pg_advisory_xact_lock(private.hire_lock_key(p_new_hire))` 먼저.
    - 대상이 같은 조직 `new_hire`가 아니면 `P0002`. 호출자가 `team_trainer`면 대상이 같은 팀이어야 하고, `ops_staff`면 조직의 신입 누구나. 그 외 `42501`.
    - 검증은 `save_task_template`와 같다(선행 없음).
    - 템플릿을 `assigned_to = p_new_hire`, 코드 `<접두어>-P<번호>`로 만들고, 인스턴스를 `status = 'todo'`, `due_date = greatest(hire_date + due_offset_days, 오늘(Asia/Seoul))`로 만든다.

- [ ] **Step 1: 실패하는 pgTAP 추가**
  - 교육 담당자(T)가 새 `practice` 템플릿 저장(`week1`, 2일) → `code = 'AI-11'`, `team_id = T`, `due_offset_days = 7`, `is_seed = false`; 다시 하나 저장 → `AI-12`
  - 경영지원(ga) 새 템플릿 → `GA-09`, `department = 'ga'`; 경영지원(hr) 한 사람용 → `HR-P01`
  - 교육 담당자(T2)가 T 템플릿 수정 → `42501`; 경영지원(hr)이 ga 템플릿 보관 → `42501`; 관리자·신입A가 저장 → `42501`  *(Review Focus 2)*
  - 경영지원이 `assessment` 저장 → `42501`; 교육 담당자가 `assessment` + `confirm` → `22023`; 새 `input` → `22023`
  - `setup`에 체크리스트 0개·21개·빈 항목 → `22023`; `read`에 체크리스트 → `22023`; 제목 공백 → `22023`; 61자 → `22023`; `p_days_in_stage` 61 → `22023`
  - 선행: 다른 담당 범위 코드·보관된 코드·자기 코드·4개 → `22023`; A→B 선행인 상태에서 B를 A 선행으로 → `22023`(순환)
  - 사용 중 잠금: 신입A가 진행 중인 AI-09(setup)의 체크리스트 항목 추가 → `22023`, 템플릿 `checklist` 그대로; `completion_mode`·`stage`·`p_days_in_stage` 변경 → 각각 `22023`; 제목·안내문만 변경 → 성공, 신입A 인스턴스 조회에 새 제목  *(Review Focus 1)*
  - 사용 전 템플릿은 모든 칸 변경 성공
  - 보관 → 다시 보관(같은 결과), 보관된 템플릿 수정 → `22023`, 복원 후 수정 성공; 신입A의 그 과제는 보관 뒤에도 `submit_task` 성공  *(Review Focus 4)*
  - `add_task_for_hire(신입A, …)` 교육 담당자(T) → 인스턴스 `todo`, 템플릿 `assigned_to = 신입A`; 교육 담당자(T2) → `42501`; 경영지원(hr) → 성공; 신입B 인스턴스 수 변화 없음; 이후 신입C `_start_onboarding`에 그 템플릿 없음  *(Review Focus 3)*
  - 입사일이 40일 전인 신입에게 `day1`·0일 과제 추가 → `due_date = 오늘`
  - 한 사람용 템플릿을 `save_task_template`·`archive_task_template`로 → `42501` / `22023`
- [ ] **Step 2: 실패 확인** — `npm run db:test`.
- [ ] **Step 3: 함수 작성** — Interfaces 그대로.
- [ ] **Step 4: 적용·통과 확인** — `supabase migration up` 후 `npm run db:test` PASS.
- [ ] **Step 5: 타입 재생성·커밋** — `npm run types`; `feat(db): add task template write RPCs`

### Task 3: 데모 초기화

**Files:**
- Create: `supabase/migrations/00NN+2_task_template_reset.sql`
- Modify: `supabase/tests/04_demo_data.sql`

**Interfaces:**
- Produces: `create or replace function public.reset_demo()` — 지금 `main`의 최신 본문(문제은행 시드 포함)을 복사하고, 지식 시드 다음·신입 루프 전에 추가:
  1. 시드 템플릿의 편집 칸을 `private.task_template_seed` 값으로 되돌리고 `archived_at = null`.
  2. 시드가 아닌 템플릿(한 사람용 포함)은 `archived_at = coalesce(archived_at, now())`. 지우지 않는다.

- [ ] **Step 1: 실패하는 테스트 추가** — 교육 담당자로 새 템플릿 1개 저장·시드 AI-02 제목 변경·AI-03 보관, 경영지원으로 기본 신입에게 한 사람용 과제 추가 → 관리자 `reset_demo()` → 시드 31개 모두 원래 제목·보관 아님, 새 템플릿·한 사람용 템플릿 보관됨, 기본 신입 인스턴스 31개; 관리자가 만든 신입의 한 사람용 과제 인스턴스는 그대로.
- [ ] **Step 2: 실패 확인** — `npm run db:test`.
- [ ] **Step 3: `reset_demo` 교체 작성.**
- [ ] **Step 4: 적용·통과 확인** — `supabase migration up` 후 `npm run db:test` PASS.
- [ ] **Step 5: 커밋** — `feat(db): restore task templates on demo reset`. PR ①을 연다.

---

## 시안

### Task 4: S12 온보딩 과제, S6·S9 과제 추가 대화 상자

**Files:**
- Create: `docs/design/onboarding-design/screens/S12-tasks.html` (+`png/`)
- Modify: `docs/design/onboarding-design/screens/S6-hire-detail.html`, `S9-ops.html` (+`png/`), `docs/screens.md`

- [ ] **Step 1:** `.interface-design/system.md`, 견본 `S0-system`, 기존 `S12-forms.html`을 읽는다.
- [ ] **Step 2: S12 시안** — 아래 "화면 명세"대로. 상태 3가지(새 과제 편집, 사용 중인 과제 편집(잠금 안내), 보관 보기)를 한 파일 안에 나란히 둔다.
- [ ] **Step 3: S6·S9 시안** — "이 신입에게 과제 추가" 버튼, 대화 상자, 목록의 "이 신입만" 배지.
- [ ] **Step 4:** `docs/screens.md`의 S12를 아래 명세로 바꾸고 S6·S9에 추가 기능과 배지를 적는다. 메뉴 표기도 고친다. 시연 흐름에 7번을 더한다(Task 8 내용).
- [ ] **Step 5:** PR을 열고 Leo 확인을 기다린다. 커밋 `docs(design): onboarding task management mockups`.

**화면 명세 (screens.md에 그대로 옮긴다)**

S12. 온보딩 과제 `/tasks`
- 누가: 교육 담당자(우리 팀 과제), 경영지원 담당자(우리 부서 과제). 메뉴: 교육 담당자 "팀 신입 현황 · 시험 출제 · 문제은행 · 온보딩 과제 · 지식 관리", 경영지원 "부서 업무함 · 온보딩 과제 · 지식 관리".
- 머리말: "○○ 신입에게 들어갈 온보딩 과제를 관리해요. 새로 만든 과제는 이후 온보딩을 시작하는 신입부터 들어가요." 오른쪽에 "과제 추가"(주요 동작).
- 왼쪽 목록: 단계(입사일 / 첫 주 / 첫 달)별 묶음, 행마다 코드·제목·"진행 중 N명". 위에 "사용 중 / 보관" 보기 전환. 선택한 과제는 `?template=<code>`.
- 오른쪽 패널(편집): 제목, 안내문, 종류(안내 / 읽기 / 실습 / 체크리스트 / 평가), 완료 방식(신입이 완료 / 담당자 확인 / 담당자만 처리), 단계, 기한("단계 시작 후 N일"), 해당 없음 허용, 체크리스트 항목(체크리스트일 때), 선행 과제(최대 3개). 아래 "서식" 영역(과제 서식 기능 자리), 동작 "저장"·"보관"(보관 보기면 "다시 사용").
- 평가 종류는 교육 담당자에게만 보이고, 고르면 완료 방식이 "담당자만 처리"로 고정된다. 입력 양식 과제(기본 과제)는 종류를 바꿀 수 없다.
- 사용 중인 과제: 제목·안내문 외 칸은 읽기 전용, 패널 위 안내.

| 상황 | 문구 |
|---|---|
| 불러오는 중 | 불러오는 중… |
| 불러오기 실패 | 과제를 불러오지 못했어요. 다시 시도해 주세요. |
| 비어 있음 | 아직 과제가 없어요. "과제 추가"로 첫 과제를 만들어 보세요. |
| 사용 중 잠금 | 신입 N명이 진행 중이라 제목과 안내문만 고칠 수 있어요. 다른 칸을 바꾸려면 보관하고 새로 만들어 주세요. |
| 새 과제 저장 | 과제를 추가했어요. 이후 온보딩을 시작하는 신입부터 들어가요. |
| 저장 | 저장했어요 |
| 저장 실패 | 저장하지 못했어요. 잠시 후 다시 시도해 주세요. |
| 체크리스트 없음 | 체크리스트 항목을 하나 이상 넣어 주세요. |
| 보관 확인 | '제목' 과제를 보관할까요? / 이후 온보딩을 시작하는 신입에게 들어가지 않아요. 진행 중인 신입의 과제는 그대로예요. / 취소 · 보관 |
| 보관함 | 보관했어요 |
| 다시 사용 | 다시 사용해요. 이후 온보딩을 시작하는 신입부터 들어가요. |

S6·S9 과제 추가
- S6(교육 담당자): 팀 과제 표 위 "이 신입에게 과제 추가". S9(경영지원): 입사자 필터로 한 명을 고른 상태에서만 같은 버튼.
- 대화 상자 제목 "'이름'님에게 과제 추가", 안내 "이 신입에게만 들어가고, 바로 할 일로 보여요." 칸은 S12 편집 칸에서 선행 과제를 뺀 것. 동작 "취소"·"추가".
- 추가된 과제는 목록에서 "이 신입만" 배지. 빼려면 해당 없음으로 처리한다.

| 상황 | 문구 |
|---|---|
| 추가함 | 추가했어요 |
| 추가 실패 | 추가하지 못했어요. 다시 시도해 주세요. |

---

## ② 웹

### Task 5: 데이터 계층 — `templates.ts`, `stage.ts`

**Files:**
- Create: `apps/web/src/features/templates/templates.ts`, `stage.ts`, `templates.test.ts`, `stage.test.ts`

**Interfaces:**
- Consumes: Task 2의 RPC, `npm run types`로 생긴 타입, `@/lib/tasks`의 `TaskTemplate`, `@/lib/errors`의 `DbError`.
- Produces:
  - `stage.ts`: `STAGE_START_DAYS: Record<TaskStage, number>`(0/5/30), `daysInStage(t: TaskTemplate): number`(= `due_offset_days - STAGE_START_DAYS[t.stage]`, 0 미만이면 0).
  - `templates.ts`:
    - `type TemplateInput = { title: string; description: string; kind: TaskKind; completionMode: CompletionMode; stage: TaskStage; daysInStage: number; allowNa: boolean; checklist: string[] | null; prerequisiteCodes: string[] }`
    - `useManagedTemplates(view: 'active' | 'archived'): UseQueryResult<TaskTemplate[]>` — 내 담당 범위(`team_id = profile.team_id` 또는 `department = profile.department`), `assigned_to is null`, 보관 여부로 거른다. 정렬 `stage`, `sort_order`.
    - `useTemplateUsage(): UseQueryResult<Map<string, number>>` — 보이는 `task_instances`의 `template_id`별 신입 수.
    - `saveTemplate(id: string | null, input: TemplateInput): Promise<TaskTemplate>`
    - `archiveTemplate(id: string): Promise<TaskTemplate>` / `restoreTemplate(id: string): Promise<TaskTemplate>`
    - `addTaskForHire(hireId: string, input: Omit<TemplateInput, 'prerequisiteCodes'>): Promise<TaskInstance>`
    - `isLocked(usage: number): boolean`(= `usage > 0`), `lockedFieldsChanged(before: TaskTemplate, input: TemplateInput): boolean`
    - `templateFromForm` 없이 RPC 인자 이름은 `p_title`… 그대로 매핑. 성공 후 `['templates']`, `['template-usage']`, `['tasks']` 쿼리 무효화.

- [ ] **Step 1: 실패하는 테스트**
  - `daysInStage({stage:'week1', due_offset_days: 7})` = 2; `month1`, 25 → 0
  - `saveTemplate(null, input)` → `supabase.rpc('save_task_template', { p_id: null, p_title, …, p_days_in_stage: 2, p_checklist: null, p_prerequisite_codes: [] })` 호출
  - 체크리스트 `['SAP 계정', 'cf cli']` → `p_checklist`가 같은 배열
  - RPC 오류 → `DbError`(code 보존)
  - `lockedFieldsChanged`: 제목만 다름 → false; 체크리스트 항목 하나 다름 → true; `daysInStage`만 다름 → true
  - `addTaskForHire` → `add_task_for_hire` 인자에 `p_new_hire`
- [ ] **Step 2: 실패 확인** — `npm run test:web -- templates stage`.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `feat(web): task template data layer`

### Task 6: S12 온보딩 과제 화면

**Files:**
- Create: `apps/web/src/features/templates/TemplatesPage.tsx`, `TemplateForm.tsx`, `TemplatesPage.test.tsx`
- Modify: `apps/web/src/app/App.tsx`(`/tasks` 라우트, `team_trainer`·`ops_staff`), `apps/web/src/app/Layout.tsx`(메뉴 "온보딩 과제") — 공통 영역, PR에 이유

**Interfaces:**
- Consumes: Task 5 전부, `STAGE_LABEL`, `useAuth`.
- Produces: `TemplateForm({ value, onChange, lockedFields: boolean, allowAssessment: boolean, showPrerequisites: boolean, prerequisiteOptions: TaskTemplate[] })` — Task 7이 재사용.

- [ ] **Step 1: 실패하는 테스트** (데이터 훅 목)
  - 교육 담당자: 목록이 단계 3묶음, 행에 "진행 중 2명"; 종류에 "평가" 있음. 경영지원: "평가" 없음
  - "과제 추가" → 빈 편집 칸; 제목 비우면 "저장" 비활성; 체크리스트 종류에 항목 0개면 비활성 + "체크리스트 항목을 하나 이상 넣어 주세요."
  - 평가 선택 → 완료 방식이 "담당자만 처리"로 바뀌고 비활성
  - 새 과제 저장 → `saveTemplate(null, …)` 1회, "과제를 추가했어요. 이후 온보딩을 시작하는 신입부터 들어가요."; 저장 버튼 두 번 클릭 → 1회만 호출  *(Review Focus 5)*
  - 사용 중(usage 2) 과제 선택 → 잠금 문구 "신입 2명이 진행 중이라…", 종류·완료 방식·단계·기한·체크리스트·선행·해당 없음 칸 비활성; 제목 수정 후 저장 → `saveTemplate(id, …)`
  - 저장 실패 → "저장하지 못했어요. 잠시 후 다시 시도해 주세요.", 입력값 유지  *(Review Focus 5)*
  - "보관" → 확인 창 문구 → 확인 시 `archiveTemplate`, "보관했어요"; 보관 보기에서 "다시 사용" → `restoreTemplate`
  - 선행 과제 후보에 자기 자신과 보관된 과제가 없다; 4번째 선택 불가
  - `?template=AI-09`로 들어오면 그 과제가 선택된 상태
  - 신입이 `/tasks` → `/me`로 이동, 관리자 → `/admin/users`
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — 시안 그대로. "서식" 영역은 과제 서식 기능이 아직 없으면 렌더링하지 않는다.
- [ ] **Step 4: 통과 확인** — `npm run test:web`, `bash scripts/check-design.sh`.
- [ ] **Step 5:** `/design-review` blocker 0, 스크린샷 준비. 커밋 `feat(web): onboarding task management page (S12)`

### Task 7: S6·S9 "이 신입에게 과제 추가"

**Files:**
- Create: `apps/web/src/features/templates/AddTaskDialog.tsx`, `AddTaskDialog.test.tsx`
- Modify: `apps/web/src/features/staff/HireDetailPage.tsx`, `OpsInboxPage.tsx` (+ 각 테스트)

**Interfaces:**
- Consumes: `TemplateForm`(`showPrerequisites=false`), `addTaskForHire`, `Hire`.
- Produces: `AddTaskDialog({ hire: Hire, open: boolean, onOpenChange(open: boolean): void, allowAssessment: boolean })`.

- [ ] **Step 1: 실패하는 테스트**
  - 대화 상자 제목 "'김신입'님에게 과제 추가", 안내 "이 신입에게만 들어가고, 바로 할 일로 보여요."; 선행 칸 없음
  - "추가" → `addTaskForHire(hire.id, …)` 1회(두 번 클릭해도 1회), 닫히고 "추가했어요"
  - 실패 → "추가하지 못했어요. 다시 시도해 주세요.", 대화 상자 열린 채 입력 유지
  - S6: 버튼 보임, 평가 종류 있음; `template.assigned_to`가 있는 과제 행에 "이 신입만" 배지
  - S9: 입사자 필터가 "전체"면 버튼 없음, 한 명 고르면 보임; 평가 종류 없음; 한 사람용 과제 행에 배지
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — `npm run test:web`, `bash scripts/check-design.sh`.
- [ ] **Step 5:** `/design-review` blocker 0. 커밋 `feat(web): add a task for one new hire from S6 and S9`. PR ②를 연다.

---

## ③ 문서·시연

### Task 8: 계약·아키텍처·시연 대본, 스테이징 확인

**Files:**
- Modify: `docs/contracts.md`(RPC 4개와 오류 코드), `docs/architecture.md`(ER에 새 컬럼, 템플릿 관리 흐름), `docs/demo-script.md`, `docs/judge-guide.md`

- [ ] **Step 1:** `contracts.md`에 Task 2 RPC의 인자·반환·오류(`42501` 범위 밖, `22023` 검증·잠금, `P0002` 없음)를 적는다.
- [ ] **Step 2:** `architecture.md` ER과 "과제 상태" 절 아래에 "템플릿 관리" 짧은 절(사용 중 잠금, 보관, 한 사람용)을 더한다.
- [ ] **Step 3:** `demo-script.md`에 "7. 교육 담당자·인사: 온보딩 과제 관리"를 더한다:
  1. 교육 담당자 → 온보딩 과제 → "과제 추가": "사내 위키 둘러보기"(실습, 첫 주, 2일) 저장 → `AI-11`
  2. 진행 중인 AI-09 체크리스트를 고치려 하면 잠금 안내, 제목만 고쳐 저장
  3. 관리자 → 신입 계정 등록 → 그 신입 타임라인 첫 주에 "사내 위키 둘러보기"
  4. 교육 담당자 → 신입 상세 → "이 신입에게 과제 추가": "React 기초 보충 학습" → 신입 화면에 바로 할 일, 다른 신입에게는 없음
  5. 인사 담당자 → 부서 업무함에서 입사자 선택 → 과제 추가
  6. 관리자 → 데모 데이터 초기화 → 시드 과제로 돌아옴
- [ ] **Step 4:** `judge-guide.md`의 체험 순서에 위 3~4를 한 줄로 더한다.
- [ ] **Step 5:** 스테이징에서 Step 3 흐름을 실제로 돌려 결과를 `demo-script.md` "리허설 기록"에 남긴다.
- [ ] **Step 6:** 커밋 `docs: onboarding task management contracts and demo`. PR ③.
