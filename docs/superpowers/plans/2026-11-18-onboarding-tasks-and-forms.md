# 온보딩 과제 관리 + 과제 서식 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Context

지금 온보딩 과제 31개는 마이그레이션에 고정돼 있고, 담당자가 과제를 만들거나 서식을 붙이는 화면이 없다. 두 기능이 따로 계획돼 있었다.

- **과제 서식**(PR #28, 문서·시안만 머지): 담당자가 과제 템플릿에 docx·xlsx·pdf를 올리고 신입이 내려받는다. 계약 `docs/contracts.md` "과제 서식 저장소", 화면 `docs/screens.md` S2·S3·S12.
- **온보딩 플랜 관리**(Workday 착안, 미커밋 문서 2개): 담당자가 템플릿을 추가·수정·보관하고 한 신입에게만 과제를 추가한다. 설계 `docs/superpowers/specs/2026-11-18-onboarding-plan-design.md`, 계획 `docs/superpowers/plans/2026-11-18-onboarding-plan.md`.

둘은 같은 화면(S12), 같은 마이그레이션 번호(`0008`~), 같은 pgTAP 번호(`07`), 같은 `reset_demo`를 건드린다. 이 계획은 둘을 한 번에 순서를 맞춰 구현한다. 결과: 담당자가 "온보딩 과제" 화면 하나에서 과제를 만들고 서식을 붙이며, 신입은 과제 상세에서 서식을 받는다.

**Goal:** 담당자가 자기 범위의 온보딩 과제를 만들고·고치고·보관하고·서식을 붙이며, 한 신입에게만 과제를 추가하고, 신입은 과제에 붙은 서식을 내려받는다.

**Architecture:** 템플릿 쓰기는 security definer RPC, 서식은 웹이 사용자 토큰으로 Storage(`task-forms`)와 `task_template_files` 테이블을 직접 쓰고 RLS가 막는다. 서식 조회 권한은 템플릿 조회 권한을 그대로 따른다(한 사람용 템플릿의 서식은 다른 신입에게 안 보임). 화면은 S12 하나(`/tasks`)에 편집 칸과 서식 영역을 함께 둔다. 에이전트 서비스 코드는 바꾸지 않는다(시드 서식 스크립트만 추가).

**Tech Stack:** Postgres(Supabase) + Storage + pgTAP, React + Vite + TS + TanStack Query + Vitest + shadcn/ui, Python 스크립트(supabase-py).

**Spec:** `docs/superpowers/specs/2026-11-18-onboarding-plan-design.md`(템플릿 관리), `docs/contracts.md` "과제 서식 저장소" + `docs/screens.md` S2·S3·S12(서식). 템플릿 관리 Task의 세부 단계는 `docs/superpowers/plans/2026-11-18-onboarding-plan.md`(아래 "기존 계획")를 그대로 쓰고, 이 문서가 번호·순서·달라지는 점을 정한다. 둘이 다르면 이 문서가 우선한다.

## 두 계획을 합치며 정한 것

| 충돌 지점 | 결정 |
|---|---|
| S12 화면·주소·메뉴 | 화면 하나. 주소 `/tasks`, 메뉴 "온보딩 과제". 오른쪽 패널에 편집 칸 아래 "서식" 영역(S12-forms 시안의 파일 목록·업로드 영역). `/forms` 주소는 배포된 적이 없으므로 만들지 않고 리다이렉트도 두지 않는다(설계 5.4의 해당 문장을 Task 0에서 고친다) |
| 마이그레이션 번호 | `0009_task_template_admin` → `0010_task_template_rpc` → `0011_task_template_files`(서식 + `reset_demo` 교체). `0008`은 비워 둔다(공유 로컬 DB에 `0009`·`0010`이 먼저 적용됨). 함께 진행 중인 규정 문서 작업(`docs/policy-docs-rag`)은 `0012`·`0013`을 쓴다. 시작할 때 `origin/main`에 `0009` 이상이 이미 있으면 전부 뒤로 민다 |
| pgTAP 번호 | `07_task_templates.sql`(템플릿), `08_template_files.sql`(서식) |
| `reset_demo` | 한 번만 교체(`0011`, Task 3과 같은 파일). 템플릿 되돌리기 + 담당자가 올린 서식 행 삭제를 함께 넣는다 |
| 한 사람용 과제의 서식 | 이번에는 올리는 화면을 만들지 않는다(Leo 결정). DB 권한은 막지 않는다(담당자면 올릴 수 있음). 서식 조회는 템플릿 조회 정책을 따르므로 다른 신입에게 보이지 않는다 |
| 보관된 과제의 서식 | 목록·내려받기만. 올리기는 DB 정책과 화면 둘 다 막는다. 지우기는 허용 |
| 사용 중 잠금과 서식 | 서식은 잠금 대상이 아니다. 진행 중인 신입이 있어도 올리고 지울 수 있다 |
| 저장 전 새 과제 | 서식 영역 자리에 "과제를 저장하면 서식을 올릴 수 있어요." |
| 기존 계획 Task 6의 "서식 영역은 없으면 렌더링하지 않는다" | 삭제. 이 계획 Task 9가 서식 영역을 넣는다 |
| 리뷰 반영(2026-11-18) | A 한 사람용 템플릿 조회 정책은 대상 신입·`is_handler`·같은 조직 admin(서식도 따름), D `_start_onboarding` 재호출은 이미 시작한 신입에게 0(둘 다 `0009`) · B 선행은 바뀐 집합만 검사(새 코드에만 존재·범위·보관 검사, 조직 잠금), C `mark_na`로 담당자가 한 사람용 과제를 해당 없음 처리·`restore_task_template`은 한 사람용 거부, E `private.next_task_code` authenticated 실행 권한 회수(셋 다 `0010`) · E 서식 Storage 올리기 정책이 경로 모양(폴더 2단계, uuid 파일 이름)을 강제(`0011`) |
| 시안 | `S12-tasks.html`이 `S12-forms.html`을 대체한다(옛 파일과 png 삭제). S3 서식 시안 2개는 그대로 쓴다 |

## Global Constraints

- `CLAUDE.md` 절대 규칙 전부. 마이그레이션은 추가만, 새 테이블에 `org_id`·RLS·명시적 `grant`, `anon` 권한 없음, `task_instances` 직접 update 금지, `.env*` 금지, `service_client()`는 `admin_routes.py`와 `scripts/`에서만.
- 로컬 Supabase는 공유한다. `supabase db reset`·`npm run db:reset`·`supabase stop` 금지. 새 마이그레이션은 `supabase migration up`.
- 서식 값(계약 그대로): 버킷 `task-forms` 비공개, 파일당 `10485760`바이트, MIME 3종(`application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), 경로 `{org_id}/{template_id}/{uuid}.{pdf|docx|xlsx}`, 서명 URL 60초, `update` 없음.
- 템플릿 값(설계 그대로): 단계 시작일 0·5·30일, "단계 시작 후 N일" 0~60, 제목 1~60자, 안내문 0~2000자, 체크리스트 1~20개, 선행 0~3개. 오류 코드 `42501`(범위 밖)·`22023`(검증·잠금)·`P0002`(없음).
- 화면 문구는 `docs/screens.md`와 글자까지 같다. UI는 `.interface-design/system.md`, `components/ui`, 의미 토큰. UI Task는 테스트 먼저 → 구현 → `bash scripts/check-design.sh` → `/design-review`(blocker 0) → PR에 수정 전·후 스크린샷.
- 서식 파일 내용은 화면에 그리지 않는다(내려받기만). 파일 이름은 텍스트로만 그린다(SECURITY.md "파일" 절).
- 시드 서식·시안·테스트의 사람·문서는 전부 가상. 저장소가 공개이므로 커밋 전 `git diff --cached` 확인.
- Git: 브랜치 → PR → CI 5개 + Codex 리뷰 → `gh pr merge <번호> --squash`. rebase·강제 푸시·tag 금지. 공통 영역(`supabase/`, `apps/web/src/lib`, `apps/web/src/app`, `.github/`, `docs/contracts.md`)을 고친 PR은 설명에 이유를 적는다.

## PR 구성과 순서

```
⓪ docs/onboarding-tasks-mockups   Task 0        ─┐ (Leo 확인 후 머지. ①과 병행)
① feat/task-template-db           Task 1~4      ─┤
                                                  ├→ ② feat/task-forms-newhire     Task 5~6  (①만 필요)
                                                  ├→ ③ feat/task-template-web      Task 7~8  (①+⓪ 확인)
                                                  ├→ ⑤ feat/task-forms-seed        Task 11   (①만 필요)
②+③ → ④ feat/task-template-forms-web            Task 9~10
④+⑤ → ⑥ docs/onboarding-tasks-demo              Task 12
```

②·③·⑤는 서로 다른 폴더라 동시에 진행할 수 있다(③만 `app/App.tsx`·`Layout.tsx`를 고친다).

## Review Focus

1. **한 사람용 과제의 서식 노출**: 신입A 전용 템플릿에 붙은 서식 행·파일을 신입B가 목록 조회·서명 URL로 얻지 못한다. (Task 3)
2. **기본 서식 우회 삭제**: 담당자가 테이블을 거치지 않고 Storage API로 기본 서식 객체를 직접 지우려 하면 거부된다. (Task 3)
3. **올리기 중간 실패**: 객체 업로드 뒤 테이블 추가가 실패(같은 이름 등)하면 올린 객체가 지워지고, 화면은 "같은 이름" 문구를 보인다. (Task 5, 9)
4. **확장자와 내용 불일치·한글 파일 이름**: `신청서.PDF`(대문자), `보고서.final.xlsx`(점 여러 개), 확장자 없는 파일, 0바이트 파일 → 앞 둘은 올라가고 뒤 둘은 형식 거절. 저장 경로에는 한글이 들어가지 않는다. (Task 5)
5. **초기화 중 Storage 실패**: 담당자 서식 객체 삭제가 실패하면 `reset_demo`를 부르지 않고 오류를 보인다(행만 지워져 고아 객체가 남지 않게). (Task 4, 10)
6. 기존 계획의 Review Focus 1~5(사용 중 잠금, 범위 밖 쓰기, 한 사람용 노출, 보관 후 새 신입, 저장 연타)는 Task 1·2·8·10이 그대로 가진다.

---

## ⓪ 문서·시안

### Task 0: 통합 계획 반영과 시안

**Files:**
- Create: `docs/superpowers/plans/2026-11-18-onboarding-tasks-and-forms.md`(이 문서를 그대로 옮긴다)
- Add(미커밋 파일 커밋): `docs/superpowers/specs/2026-11-18-onboarding-plan-design.md`, `docs/superpowers/plans/2026-11-18-onboarding-plan.md`
- Create: `docs/design/onboarding-design/screens/S12-tasks.html` (+`png/S12-tasks.png`)
- Delete: `docs/design/onboarding-design/screens/S12-forms.html`, `png/S12-forms.png`
- Modify: `screens/S6-hire-detail.html`, `S9-ops.html` (+png), `docs/screens.md`, `docs/contracts.md`, `docs/design/onboarding-design/README.md`(시안 목록)

- [ ] **Step 1:** 기존 계획 머리에 한 줄을 넣는다: "순서·번호·서식 통합은 `2026-11-18-onboarding-tasks-and-forms.md`를 따른다." 설계 5.4의 "옛 `/forms`는 새 주소로 보냄"을 지우고, 3절 제약의 서식 문장과 7절 마지막 두 항목을 "서식 영역을 같은 화면에 함께 만든다"로 고친다. 5.3에 "한 사람용 과제의 서식 올리기 화면은 이번 범위 밖"을 더한다.
- [ ] **Step 2: S12 시안** — 기존 계획 Task 4의 "화면 명세" + `S12-forms.html`의 파일 행·업로드 영역(`ui.css`의 기존 스타일 재사용). 상태 4가지를 한 파일에 나란히: 새 과제 편집(서식 자리 안내), 저장된 과제(서식 2개 + 업로드 영역), 사용 중 잠금(서식은 활성), 보관 보기(서식 목록만).
- [ ] **Step 3: S6·S9 시안** — 기존 계획 Task 4 Step 3 그대로.
- [ ] **Step 4: `docs/screens.md`** — S12를 "온보딩 과제 `/tasks`"로 바꾼다. 기존 계획의 명세·문구 표를 넣고, 그 아래 "서식" 소절로 지금 S12의 파일 행·업로드 영역 설명과 상태 문구 표(올리는 중, 형식 거절, 크기 거절, 같은 이름, 지움 등 11행)를 그대로 옮긴다. 아래 3행을 더한다. S6·S9 추가 기능, 메뉴 표기, S3·S9 본문의 "S12에서 관리한다" 문구의 화면 이름을 고친다.

| 상황 | 문구 |
|---|---|
| 저장 전 새 과제 | 과제를 저장하면 서식을 올릴 수 있어요. |
| 보관된 과제 | 보관한 과제에는 서식을 올릴 수 없어요. |
| 서식 영역 안내 | 올린 서식은 이 과제를 받은 신입 모두에게 보여요. |

- [ ] **Step 5: `docs/contracts.md`** "과제 서식 저장소" 권한 줄을 고친다: 조회·내려받기 "같은 조직이고 그 템플릿을 볼 수 있는 사용자", 올리기 "담당자, 보관되지 않은 템플릿", 지우기의 admin "기본 서식 제외". 공통 영역이므로 PR에 이유.
- [ ] **Step 6:** 1440px·390px 렌더링 확인 후 PR ⓪을 열고 Leo 확인을 기다린다. 커밋 `docs(design): onboarding task management with forms mockups`.

---

## ① DB (`feat/task-template-db`)

### Task 1: 템플릿 관리 컬럼·권한·시작 함수

기존 계획 **Task 1** 그대로. 파일 `supabase/migrations/0009_task_template_admin.sql`, `supabase/tests/07_task_templates.sql`.

### Task 2: 템플릿 쓰기 RPC

기존 계획 **Task 2** 그대로. 파일 `supabase/migrations/0010_task_template_rpc.sql`. Step 5의 `npm run types`는 Task 3 뒤로 미룬다.

### Task 3: 서식 버킷·테이블·권한

**Files:**
- Create: `supabase/migrations/0011_task_template_files.sql`
- Create: `supabase/tests/08_template_files.sql`
- Modify: `apps/web/src/lib/database.types.ts`(`npm run types`)

**Interfaces:**
- Consumes: Task 1의 `task_templates.archived_at`·`assigned_to`와 새 select 정책, 기존 `private.is_handler(public.task_templates)`·`private.my_org()`·`private.my_role()`.
- Produces:
  - 버킷: `storage.buckets`에 `id = name = 'task-forms'`, `public = false`, `file_size_limit = 10485760`, `allowed_mime_types` = Global Constraints의 3종. `on conflict (id) do nothing`.
  - `grant execute on function private.is_handler(public.task_templates) to authenticated;`(0003에서 public 권한을 회수해 정책에서 못 부른다. PR에 이유)
  - 테이블 `public.task_template_files`: `id uuid pk default gen_random_uuid()`, `org_id uuid not null → orgs`, `template_id uuid not null → task_templates`, `file_name text not null`, `storage_path text not null unique`, `size_bytes int not null`, `uploaded_by uuid null → profiles on delete set null`, `is_seed boolean not null default false`, `created_at timestamptz not null default now()`, `unique (template_id, file_name)`.
    - check: `size_bytes between 1 and 10485760`; `char_length(file_name) between 1 and 120`; `file_name ~* '\.(pdf|docx|xlsx)$'`; `storage_path ~ ('^' || org_id || '/' || template_id || '/[0-9a-f-]{36}\.(pdf|docx|xlsx)$')`.
    - 트리거 없이 정책으로: insert 시 `org_id`가 템플릿의 `org_id`와 같아야 한다.
  - RLS(테이블), `grant select, insert, delete on public.task_template_files to authenticated`, `grant all ... to service_role`:
    - select: `org_id = my_org()` 그리고 `exists (select 1 from public.task_templates t where t.id = template_id)`(템플릿 RLS가 한 사람용을 가려 준다).
    - insert: `org_id = my_org()`, `uploaded_by = auth.uid()`, `is_seed = false`, 그리고 `exists (… t.id = template_id and t.org_id = org_id and t.archived_at is null and private.is_handler(t))`.
    - delete: `is_seed = false` 그리고 (`exists (… private.is_handler(t))` 또는 (`my_role() = 'admin'` 그리고 `org_id = my_org()`)).
  - `storage.objects` 정책(모두 `bucket_id = 'task-forms'`, `to authenticated`; 경로는 `storage.foldername(name)`의 `[1]` 조직, `[2]` 템플릿):
    - select: `[1] = my_org()::text` 그리고 보이는 템플릿 중 `id::text = [2]`가 있음.
    - insert: `[1] = my_org()::text` 그리고 `id::text = [2]`인 템플릿이 보관되지 않았고 `is_handler`. 경로 모양도 강제한다: `storage.foldername(name)`이 정확히 2단계이고 파일 이름(`storage.filename(name)`)이 `^[0-9a-f-]{36}\.(pdf|docx|xlsx)$`.
    - delete: (`is_handler`인 템플릿 또는 같은 조직 admin) 그리고 `not exists (select 1 from public.task_template_files f where f.storage_path = name and f.is_seed)`.
    - update 정책 없음.

- [ ] **Step 1: 실패하는 pgTAP** (`08_template_files.sql`. 픽스처는 `07`과 같은 구성: 팀 T·T2, 신입A·B, 교육 담당자(T)·(T2), 경영지원(hr)·(ga), 관리자, 다른 조직 사용자. Storage는 `storage.objects`에 직접 insert·delete·select로 정책을 확인한다)
  - 버킷 `task-forms`: `public = false`, `file_size_limit = 10485760`, `allowed_mime_types` 3개
  - 교육 담당자(T)가 T 템플릿에 행 insert → 성공; 같은 `file_name` 다시 → `23505`
  - 신입A, 교육 담당자(T2), 경영지원(hr)이 T 템플릿에 insert → RLS 거부(`42501`); 경영지원(hr)이 ga 템플릿에 → 거부
  - `is_seed = true`로 insert, 남의 `uploaded_by`로 insert, 다른 조직 `org_id`로 insert → 거부
  - `size_bytes` 0·10485761, `file_name` `a.exe`·`노트`(확장자 없음), `storage_path`가 다른 템플릿 폴더 → `23514`; `file_name` `신청서.PDF` → 성공  *(Review Focus 4)*
  - 보관된 템플릿에 insert → 거부; 그 템플릿의 기존 행 delete → 성공
  - `update` → 권한 오류
  - 기본 서식(`is_seed`, service_role로 넣음)을 담당자·관리자가 delete → 0행
  - 관리자가 담당자 서식 delete → 1행; 신입A가 delete → 0행
  - 신입A·B 모두 일반 템플릿의 서식 select → 보임; 다른 조직 사용자 → 0행
  - `assigned_to = 신입A`인 템플릿의 서식: 신입A 보임, 신입B 0행, 같은 팀 교육 담당자 보임, 다른 팀 교육 담당자 0행  *(Review Focus 1)*
  - `storage.objects`: 신입A insert 거부; 교육 담당자(T)가 `{org}/{T 템플릿}/…` insert 성공, `{org}/{ga 템플릿}/…` 거부, `{다른 org}/…` 거부; 경로 모양이 어긋난 insert(폴더 3단계, 파일 이름이 uuid 아님·허용 확장자 아님) 거부; 신입B가 신입A 전용 템플릿 폴더 객체 select 0행; 다른 조직 사용자 select 0행
  - `storage.objects` delete: 담당자가 기본 서식 객체 → 0행, 자기가 올린 객체 → 1행  *(Review Focus 2)*
  - `anon`으로 테이블 select → 권한 오류
- [ ] **Step 2: 실패 확인** — `npm run db:test` → 테이블 없음으로 실패.
- [ ] **Step 3: 마이그레이션 작성** — Interfaces 그대로. `storage.buckets`·`storage.objects`·`storage.foldername`의 컬럼과 사용법은 로컬에 설치된 버전(storage-api v1.96.0)의 스키마로 확인한다.
- [ ] **Step 4: 적용·통과 확인** — `supabase migration up` → `npm run db:test` PASS(기존 `01`~`07` 포함).
- [ ] **Step 5: 타입 재생성·커밋** — `npm run types`; `feat(db): add task form bucket, table and policies`

### Task 4: 데모 초기화 (템플릿 + 서식)

**Files:**
- Modify: `supabase/migrations/0011_task_template_files.sql`(Task 3과 같은 파일 끝에 `reset_demo` 교체를 더한다. Task 3·4는 한 번에 작성해 한 번만 적용한다)
- Modify: `supabase/tests/04_demo_data.sql`

**Interfaces:**
- Produces: `create or replace function public.reset_demo() returns void` — `0007_question_bank_seed.sql`의 본문을 복사하고, `seed_demo_bank` 다음·신입 루프 전에 순서대로 추가:
  1. `delete from public.task_template_files where org_id = v_org and not is_seed;`
  2. 시드 템플릿 편집 칸을 `private.task_template_seed` 값으로 되돌리고 `archived_at = null`.
  3. 시드가 아닌 템플릿(한 사람용 포함)은 `archived_at = coalesce(archived_at, now())`.
  - Storage 객체는 SQL로 지우지 않는다(storage-api가 직접 삭제를 막는다). 웹이 먼저 지운다(Task 10).

- [ ] **Step 1: 실패하는 테스트 추가** — 기존 계획 Task 3 Step 1의 시나리오에 더해: 교육 담당자가 서식 행 1개 추가, service_role로 기본 서식 행 1개 추가 → `reset_demo()` → 담당자 서식 0행, 기본 서식 1행 그대로.
- [ ] **Step 2: 실패 확인** — `npm run db:test`.
- [ ] **Step 3: `reset_demo` 교체 작성.**
- [ ] **Step 4: 적용·통과 확인** — `supabase migration up` → `npm run db:test` PASS.
- [ ] **Step 5: 커밋** — `feat(db): restore templates and clear uploaded forms on demo reset`. PR ①을 연다(설명에 공통 영역 이유, 정책 교체 이유).

---

## ② 신입 쪽 서식 (`feat/task-forms-newhire`)

### Task 5: 서식 데이터 계층 `taskFiles.ts`

**Files:**
- Create: `apps/web/src/lib/taskFiles.ts`, `apps/web/src/lib/taskFiles.test.ts` (공통 영역, PR에 이유: 신입 화면과 담당자 화면이 함께 쓴다)

**Interfaces:**
- Consumes: `supabase`(`@/lib/supabase`), `DbError`(`@/lib/errors`), `Tables<'task_template_files'>`.
- Produces:
  - `type TaskFile = Tables<'task_template_files'>`
  - `MAX_FORM_BYTES = 10 * 1024 * 1024`
  - `FORM_TYPES: Record<'pdf' | 'docx' | 'xlsx', { mime: string; label: 'PDF' | 'Word' | 'Excel' }>`
  - `formExt(fileName: string): 'pdf' | 'docx' | 'xlsx' | null` — 마지막 점 뒤, 소문자로.
  - `checkFormFile(file: File): 'ok' | 'type' | 'size'` — 확장자가 3종이 아니거나 0바이트면 `'type'`, 10MB 초과면 `'size'`.
  - `formatFileMeta(f: Pick<TaskFile, 'file_name' | 'size_bytes'>): string` — `"Excel · 48KB"`. 1MB 미만은 KB 올림 정수, 이상은 소수 1자리 MB(`"PDF · 2.4MB"`).
  - `useTemplateFiles(templateId: string | undefined): UseQueryResult<TaskFile[]>` — 쿼리 키 `['task-files', templateId]`, `is_seed` 내림차순 → `created_at` 내림차순.
  - `useFileCounts(): UseQueryResult<Map<string, number>>` — 보이는 행의 `template_id`별 개수, 키 `['task-files', 'counts']`.
  - `uploadTaskFile(template: { id: string; org_id: string }, file: File): Promise<TaskFile>` — 경로 `${org_id}/${id}/${crypto.randomUUID()}.${ext}`, `storage.from('task-forms').upload(path, file, { contentType: FORM_TYPES[ext].mime, upsert: false })` → 테이블 insert(`uploaded_by` = 세션 사용자) → insert 실패 시 `storage.remove([path])` 후 `DbError`를 던진다(`23505`가 같은 이름).
  - `deleteTaskFile(file: TaskFile): Promise<void>` — 테이블 delete(0행이면 `DbError`) → `storage.remove([storage_path])`.
  - `signedDownloadUrl(file: TaskFile): Promise<string>` — `createSignedUrl(storage_path, 60, { download: file_name })`.
  - `downloadTaskFile(file: TaskFile): Promise<void>` — 서명 URL로 `<a download>` 클릭.
  - 성공 후 `['task-files']` 무효화는 호출하는 컴포넌트가 한다.
  - supabase-js Storage 메서드 시그니처는 설치된 `@supabase/supabase-js`(^2.119) 소스로 확인한다.

- [ ] **Step 1: 실패하는 테스트** (supabase 목)
  - `formExt('신청서.PDF')` = `'pdf'`; `'보고서.final.xlsx'` = `'xlsx'`; `'노트'`·`'a.exe'` = `null`  *(Review Focus 4)*
  - `checkFormFile`: 0바이트 pdf → `'type'`; 10MB + 1바이트 docx → `'size'`; 정확히 10MB → `'ok'`
  - `formatFileMeta({file_name:'a.xlsx', size_bytes: 48_500})` = `'Excel · 48KB'`; 2_500_000 pdf → `'PDF · 2.4MB'`
  - `uploadTaskFile` → upload 경로가 `^org/tpl/[0-9a-f-]{36}\.xlsx$`(한글 없음), `contentType`이 xlsx MIME, insert 값에 `file_name` 원본·`size_bytes`·`uploaded_by`
  - insert가 `23505`로 실패 → `storage.remove`가 그 경로로 1회 호출되고 `DbError.code === '23505'`  *(Review Focus 3)*
  - upload 실패 → insert 호출 없음
  - `deleteTaskFile` → 테이블 delete가 먼저, 다음 `remove`; delete 0행이면 `remove` 호출 없음
  - `signedDownloadUrl` → `createSignedUrl(path, 60, { download: '법인카드 신청서.xlsx' })`
- [ ] **Step 2: 실패 확인** — `npm run test:web -- taskFiles`.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `feat(web): task form file data layer`

### Task 6: S3 "작성할 서식"과 S2 "서식 N"

**Files:**
- Create: `apps/web/src/features/forms/FileRow.tsx`, `TaskFormsSection.tsx`, `TaskFormsSection.test.tsx`
- Modify: `apps/web/src/features/newhire/TaskDetailPage.tsx`, `TaskRow.tsx`, `HomePage.tsx`(+ 각 테스트, `testFixtures.ts`)

**Interfaces:**
- Consumes: Task 5 전부. 시안 `S3-task-detail-forms.html`, `S3-task-detail-forms-mobile.html`.
- Produces:
  - `FileRow({ file: TaskFile, meta?: string, badge?: ReactNode, actions: ReactNode, error?: string })` — 형식 아이콘, 이름(가운데 줄임, 확장자 유지), 형식·크기. Task 9가 재사용.
  - `TaskFormsSection({ templateId: string })` — 서식이 0개이거나 불러오는 중이면 `null`. 제목 "작성할 서식", 행마다 "내려받기" 버튼(모바일은 44px 아이콘 버튼, `aria-label="'파일 이름' 내려받기"`).

- [ ] **Step 1: 실패하는 테스트**
  - 서식 0개 → 섹션 없음("작성할 서식" 텍스트 없음)
  - 서식 2개 → 행 2개, "Excel · 48KB"
  - "내려받기" 클릭 → `downloadTaskFile` 1회, 진행 중 그 버튼만 비활성(다른 행 버튼은 활성)
  - 내려받기 실패 → 그 행 아래 "파일을 내려받지 못했어요. 다시 시도해 주세요."
  - S3: 섹션이 "안내" 바로 아래. 잠긴 과제(`blocked`)·완료한 과제(`done`)에서도 보인다
  - S2: `useFileCounts`가 그 템플릿에 2를 주면 행에 "서식 2", 0이면 표시 없음
  - 파일 이름 `<img src=x>.pdf`가 텍스트로 그려진다(요소가 생기지 않음)
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — 시안 그대로, `ui.css`의 파일 행 스타일을 Tailwind 의미 토큰으로 옮긴다.
- [ ] **Step 4: 통과 확인** — `npm run test:web`, `bash scripts/check-design.sh`.
- [ ] **Step 5:** `/design-review` blocker 0, 스크린샷. 커밋 `feat(web): show task forms on S2 and S3`. PR ②.

---

## ③ 온보딩 과제 화면 (`feat/task-template-web`)

### Task 7: 템플릿 데이터 계층

기존 계획 **Task 5** 그대로(`features/templates/templates.ts`, `stage.ts`).

### Task 8: S12 온보딩 과제 화면

기존 계획 **Task 6** 그대로. 달라지는 점: Step 3의 "서식 영역" 문장을 지우고, `TemplatesPage`가 오른쪽 패널 편집 칸 아래에 `filesSlot?: ReactNode`를 그릴 자리를 둔다(이 Task에서는 비워 둔다). `/forms` 라우트는 만들지 않는다.

PR ③을 연다(⓪ Leo 확인 뒤).

---

## ④ 통합 (`feat/task-template-forms-web`)

### Task 9: S12 서식 영역

**Files:**
- Create: `apps/web/src/features/forms/TemplateFilesPanel.tsx`, `TemplateFilesPanel.test.tsx`
- Modify: `apps/web/src/features/templates/TemplatesPage.tsx`(+테스트)

**Interfaces:**
- Consumes: Task 5 전부, Task 6의 `FileRow`, Task 8의 `TemplatesPage` 서식 자리, `components/ui`의 확인 대화 상자·툴팁.
- Produces: `TemplateFilesPanel({ template: TaskTemplate | null, archived: boolean })`
  - `template === null`(저장 전) → "과제를 저장하면 서식을 올릴 수 있어요."만.
  - `archived` → 파일 목록(내려받기·지우기) + "보관한 과제에는 서식을 올릴 수 없어요.", 업로드 영역 없음.
  - 그 외 → 안내 "올린 서식은 이 과제를 받은 신입 모두에게 보여요.", 파일 목록, 업로드 영역(끌어다 놓기 + "파일 선택", `multiple`, `accept=".pdf,.docx,.xlsx"`), 안내 "docx, xlsx, pdf · 파일당 10MB까지", 경고 "가상 서식만 올려 주세요. 실명·연락처 같은 개인정보나 실제 사내 문서는 올리지 않아요."
  - 기본 서식은 "기본 서식" 배지, 지우기 버튼 없음. 사용 중 잠금과 무관하게 올리기·지우기 가능.
  - 문구는 `docs/screens.md` S12 "서식" 표 그대로.

- [ ] **Step 1: 실패하는 테스트**
  - 저장 전 → 안내 문구만, 업로드 영역 없음
  - 서식 없음 → "아직 올린 서식이 없어요. 신입이 작성해야 할 Word·Excel·PDF 양식을 올려 주세요."
  - 파일 2개 선택 → `uploadTaskFile` 2회, 진행 중 목록 맨 위에 "올리는 중" 행, 끝나면 "2개 올렸어요"
  - `메모.txt` 선택 → "'메모.txt' 파일은 올릴 수 없어요. docx, xlsx, pdf 파일만 올릴 수 있어요."(screens.md 문구와 같게), `uploadTaskFile` 호출 없음
  - 11MB 파일 → "'큰 파일.pdf' 파일이 10MB를 넘어요. 10MB 이하로 줄여서 올려 주세요."
  - `23505` → "'법인카드 신청서.xlsx' 서식이 이미 있어요. 바꾸려면 기존 서식을 지운 뒤 올려 주세요."  *(Review Focus 3)*
  - 그 밖의 실패 → 행에 "올리지 못했어요. 다시 시도해 주세요." + "다시 시도" → 같은 파일로 `uploadTaskFile` 재호출
  - 끌어 올린 상태 → "놓으면 바로 올려요"
  - 지우기 → 확인 창 "'파일 이름' 서식을 지울까요?" / "이 과제를 받은 신입 모두의 화면에서 사라져요." → 확인 시 `deleteTaskFile`, "지웠어요"
  - 기본 서식 행: "기본 서식" 배지, 지우기 버튼 없음
  - `archived` → 업로드 영역 없음, 보관 문구
  - `TemplatesPage`: 사용 중(잠금) 과제를 골라도 업로드 영역이 활성; "과제 추가" 직후에는 저장 전 문구; 새 과제를 저장하면 같은 패널에 업로드 영역이 나타난다
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — 시안 `S12-tasks.html` 그대로. 문구는 screens.md 표의 글자를 따른다(따옴표 이름 뒤에 "파일"·"서식"을 붙여 조사가 이름에 따라 바뀌지 않게 한다).
- [ ] **Step 4: 통과 확인** — `npm run test:web`, `bash scripts/check-design.sh`.
- [ ] **Step 5:** `/design-review` blocker 0. 커밋 `feat(web): manage task forms on the onboarding tasks page`

### Task 10: S6·S9 "이 신입에게 과제 추가" + 초기화 때 서식 파일 지우기

**Files:**
- 기존 계획 **Task 7**의 파일 전부(`AddTaskDialog.tsx` 등)
- Modify: `apps/web/src/features/admin/users.ts`, `UsersPage.test.tsx`(또는 `users.test.ts` 신규)

**Interfaces:**
- 기존 계획 Task 7 그대로(한 사람용 과제에 서식 올리는 자리는 만들지 않는다).
- Produces(변경): `resetDemo(): Promise<void>` — ① `task_template_files`에서 `is_seed = false`인 `storage_path`를 조회 ② 있으면 `storage.from('task-forms').remove(paths)` ③ `supabase.rpc('reset_demo')`. ①·②가 실패하면 ③을 부르지 않고 `DbError`를 던진다.

- [ ] **Step 1: 실패하는 테스트** — 기존 계획 Task 7 Step 1 전부에 더해:
  - `resetDemo`: 담당자 서식 2개 → `remove`가 두 경로로 1회 호출된 뒤 `rpc('reset_demo')`
  - 담당자 서식 0개 → `remove` 호출 없이 `rpc`
  - `remove` 실패 → `rpc` 호출 없음, 오류 던짐  *(Review Focus 5)*
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — `npm run test:web`, `bash scripts/check-design.sh`.
- [ ] **Step 5:** `/design-review` blocker 0, 스크린샷. 커밋 `feat(web): add a task for one new hire and clear uploaded forms on reset`. PR ④.

---

## ⑤ 기본 서식 (`feat/task-forms-seed`)

### Task 11: 시드 서식과 부트스트랩

**Files:**
- Create: `supabase/seed-forms/AC-01/법인카드 신청서.xlsx`, `supabase/seed-forms/AC-01/법인카드 사용 동의서.docx`, `supabase/seed-forms/HR-08/소득세 감면 신청서.pdf`
- Create: `services/agent/scripts/bootstrap_forms.py`, `services/agent/tests/test_bootstrap_forms.py`
- Modify: `package.json`(`bootstrap` 스크립트가 두 스크립트를 차례로 실행), `.github/workflows/deploy-staging.yml`, `deploy-prod.yml`("계정 부트스트랩" 다음에 "기본 서식 부트스트랩" 단계, 같은 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`) — 공통 영역, PR에 이유

**Interfaces:**
- Consumes: Task 3의 버킷·테이블. `bootstrap_accounts.py`의 `_require`·`ORG_ID` 패턴.
- Produces: `python scripts/bootstrap_forms.py` — 환경변수 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. `SEED_FORMS: list[tuple[str, str]]` = `[("AC-01", "법인카드 신청서.xlsx"), ("AC-01", "법인카드 사용 동의서.docx"), ("HR-08", "소득세 감면 신청서.pdf")]`. 파일은 `<repo>/supabase/seed-forms/<code>/<file_name>`.
  - 각 항목: 조직 `ORG_ID`의 그 코드 템플릿 id 조회 → 경로 `{org}/{template_id}/{uuid5(NAMESPACE_URL, f"{code}/{file_name}")}.{ext}` → 객체 업로드(upsert, 확장자에 맞는 `content-type`) → 테이블에 `(template_id, file_name)` 기준 upsert(`is_seed = true`, `uploaded_by = null`, `size_bytes` = 파일 크기).
  - 다시 실행해도 행·객체 수가 같다. 템플릿이나 파일이 없으면 이름을 출력하고 종료 코드 2.
- 서식 내용: 전부 가상. 회사명 "Blueward" 외에 사람 이름·연락처·번호를 넣지 않고 빈 칸 양식으로 만든다. 파일당 100KB 이하. 만드는 도구는 구현자가 고르고 산출물만 커밋한다(의존성 추가 없이 `uv run --with python-docx --with openpyxl` 같은 일회성 실행, PDF는 `scripts/design`의 Playwright로 HTML을 출력해도 된다).

- [ ] **Step 1: 실패하는 테스트** (`test_bootstrap.py`와 같은 방식: 로컬 Supabase, 스크립트를 두 번 실행)
  - 두 번 모두 종료 코드 0
  - `task_template_files`에 `is_seed = true` 3행, 파일 이름·`size_bytes`가 저장소 파일과 같다; 두 번째 실행 뒤에도 3행
  - 각 `storage_path`의 객체를 service 클라이언트로 내려받으면 바이트가 저장소 파일과 같다
  - `SUPABASE_SERVICE_ROLE_KEY` 없이 실행 → 종료 코드 2, 출력에 키 값 없음
  - 시드 서식 3개 모두 100KB 이하
- [ ] **Step 2: 실패 확인** — `npm run test:agent -- tests/test_bootstrap_forms.py`.
- [ ] **Step 3: 서식 파일 만들기·스크립트 구현.** supabase-py Storage 업로드 옵션은 설치된 버전 소스로 확인한다.
- [ ] **Step 4: 통과 확인** — `npm run test:agent`(`test_service_client_usage.py` 포함), `bash scripts/tests/*.sh` 중 워크플로를 읽는 테스트.
- [ ] **Step 5: 커밋** — `feat: seed task forms and bootstrap them on deploy`. `git diff --cached`로 실명·비밀값 확인. PR ⑤.

---

## ⑥ 문서·시연 (`docs/onboarding-tasks-demo`)

### Task 12: 계약·아키텍처·심사 안내·스테이징 확인

기존 계획 **Task 8** 전부에 더해:

- [ ] `docs/judge-guide.md`·`README.md`의 "파일 업로드 없음"·"S1~S11" 문구를 지금 기능에 맞게 고친다. 화면 목록에 S12 "온보딩 과제".
- [ ] `docs/deploy.md`: 무료 플랜 Storage 한도(1GB), 배포 흐름의 "기본 서식 부트스트랩" 단계, 되돌릴 때 버킷은 남는다는 점.
- [ ] `docs/architecture.md`: `task_template_files` 권한 설명을 Task 3 정책대로(템플릿 조회 권한을 따름), 데모 초기화 순서(웹이 객체 삭제 → `reset_demo`).
- [ ] `demo-script.md` 7번 흐름에 서식 단계를 끼운다: 1번 뒤 "새 과제에 '위키 체크리스트.xlsx' 올리기", 3번 뒤 "새 신입 과제 상세에서 서식 내려받기", 6번 뒤 "초기화 후 올린 서식은 사라지고 기본 서식 3개는 남음".
- [ ] 스테이징에서 위 흐름을 실제로 돌려 "리허설 기록"에 남긴다. 확인 항목: 경영지원(회계)으로 AC-01에 기본 서식 2개가 보이고 지우기 버튼이 없음, 신입으로 내려받은 파일 이름이 한글 원본, 다른 팀 교육 담당자 계정으로 `/tasks`에 AI팀 과제가 안 보임.
- [ ] 커밋 `docs: onboarding task management and forms contracts and demo`. PR ⑥.

---

## Verification

- DB: `npm run db:test` — `01`~`08` 전부 PASS(Task 1~4마다).
- 웹: `npm run test:web`, `bash scripts/check-design.sh`(Task 5~10마다).
- 에이전트 스크립트: `npm run test:agent`(Task 11).
- 로컬 끝에서 끝: `supabase migration up` → `npm run bootstrap` → `npm run dev:web`
  1. 교육 담당자: 온보딩 과제 → "과제 추가" → 저장 → 서식 올리기 → 목록에 "서식 1"
  2. 관리자: 신입 등록 → 그 신입으로 로그인 → 타임라인에 새 과제와 "서식 1" → 상세에서 내려받기(파일 이름 원본)
  3. 교육 담당자: 신입 상세 → "이 신입에게 과제 추가" → 다른 신입 화면에 없음
  4. 회계 담당자: AC-01에 기본 서식 2개, 지우기 버튼 없음
  5. 관리자: 데모 초기화 → 올린 서식 사라짐, 기본 서식 유지, 새 과제는 보관 보기로
- 스테이징: PR 머지 후 자동 배포 → Task 12의 리허설 기록.

## Self-Review 결과

- 설계(템플릿) 목표 1~7 → Task 1·2·4·7·8·10·12. 서식 계약·화면(S2·S3·S12)·시드·초기화 → Task 3·4·5·6·9·10·11.
- 이름 일치: `TaskFile`, `uploadTaskFile`, `deleteTaskFile`, `downloadTaskFile`, `useTemplateFiles`, `useFileCounts`, `FileRow`, `TemplateFilesPanel`, `resetDemo`가 Task 5·6·9·10에서 같은 이름·시그니처.
- 남은 위험: 금요일 기한에 PR 7개(⓪~⑥). ②·③·⑤를 동시에 진행해야 맞출 수 있다. 밀리면 ⑤(기본 서식)와 Task 10의 S9 쪽을 뒤로 미뤄도 시연 흐름은 성립한다.
