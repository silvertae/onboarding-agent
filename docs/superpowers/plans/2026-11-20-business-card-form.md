# 명함 신청(GA-07) 실제 양식 반영 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GA-07이 영문 이름·직급·부문(목록)·이메일 아이디·연락처 5칸을 받고, 입력값으로 명함 미리보기를 그리며, 같은 구조의 가상 엑셀 서식을 첨부한다.

**Architecture:** 입력 칸 정의(`form_schema`)에 `select`·`suffix`·`hint`·`english`·`format`을 더하고, 새 마이그레이션으로 GA-07 칸과 시드 사본을 바꾼다. 웹은 칸 정의 해석을 `lib/formSchema.ts` 한 곳에 두고, 신입 입력 화면(FormBody)과 담당자 제출 내용(SubmittedResult)이 같은 명함 값 계산(`businessCardProps`)과 `BusinessCard`를 쓴다. 엑셀은 저장소의 생성 스크립트로 만들고 `bootstrap_forms.py`가 기본 서식으로 올린다.

**Tech Stack:** Supabase Postgres + pgTAP, React + Vitest + Testing Library, Python + openpyxl(dev) + pytest.

**Spec:** `docs/superpowers/specs/2026-11-20-business-card-form-design.md`

## Global Constraints

- 실제 조직명·실제 직급표·실제 표기 규정·실명·실제 메일·휴대폰·팩스번호를 어디에도 넣지 않는다. 부문 목록과 직급표는 설계 4.1·4.2의 가상 값만.
- 마이그레이션은 추가만(새 파일 `supabase/migrations/0015_business_card_form.sql`). 컬럼·테이블 변경 없음, 데이터 갱신만.
- 과제 상태는 RPC로만 바꾼다(이번 작업은 상태를 바꾸지 않는다). `submit_task`는 고치지 않는다.
- 화면 문구는 한국어. 폼 컨트롤은 `components/ui`의 `Input`·`NativeSelect`·`Textarea`·`Label`만. 색 hex·임의 글자 크기는 `BusinessCard.tsx` 안에서만(system.md 예외). `bash scripts/check-design.sh` 통과.
- 이메일 도메인 `@blueward.co.kr` 고정, 연락처 필수 + placeholder `010-0000-0000` + hint "공개 데모라 가상 번호를 입력해 주세요".
- 공통 영역(`supabase/`, `apps/web/src/lib`)을 고치므로 PR 설명에 이유를 적는다.
- 로컬 Supabase는 공유. `supabase db reset`·`npm run db:reset` 금지. 마이그레이션은 메모리 `shared-db-migration-dry-run` 방식(롤백되는 docker psql로 반복 확인 후 한 번 적용).

## Review Focus

1. **옛 제출 기록**(`result = { english_name }`만)을 S9에서 열 때: 표는 새 칸을 "—"로, 미리보기는 프로필의 직급·팀·메일로 그린다 → Task 5 테스트.
2. **보완 요청 후 다시 입력**: 옛 결과(`english_name`만)인 rework 과제를 새 칸 정의로 열면 영문 이름만 채워져 있고 나머지 4칸이 비어 제출 불가 → Task 4 테스트.
3. **담당자가 고친 안내문**이 마이그레이션으로 덮어써지지 않는다(시드 사본은 새 문구) → Task 2 pgTAP.
4. **데모 초기화(`reset_demo`) 뒤**에도 GA-07이 새 칸 정의를 유지한다 → Task 2 pgTAP.
5. **목록에 없는 값·앞뒤 공백**: 직급 `" 책임 "`은 Senior Manager로 맞고, 목록에 없는 부문 값(옛 값·조작된 값)은 영문 없이 원래 글자만 보이고 깨지지 않는다 → Task 3 테스트.

---

### Task 1: 시안 수정과 설계 PR (Leo 확인 관문)

**Files:**
- Modify: `docs/design/onboarding-design/screens/S3-task-detail.html` (명함 입력 5칸 + 미리보기)
- Modify: `docs/design/onboarding-design/screens/S9-ops.html` (상세 패널의 제출 내용 5칸 + 미리보기)
- Modify: `docs/design/onboarding-design/png/S3-task-detail.png`, `png/S9-ops.png`
- Add: `docs/superpowers/specs/2026-11-20-business-card-form-design.md`, 이 계획 파일

- [ ] **Step 1:** `.interface-design/system.md`, `S0-system.html`을 읽고 S3 시안의 입력 영역을 바꾼다: 영문 이름(placeholder Haneul Kim), 직급(placeholder 사원, hint "첨부 양식의 직급 표기를 따릅니다"), 부문(select, 빈 첫 줄 "골라 주세요"), 이메일 아이디(오른쪽에 `@blueward.co.kr` 붙임), 연락처(placeholder 010-0000-0000, hint). 기존 "명함 표기 순서" 칸은 지운다. 미리보기 명함: 로고 / **김하늘** 사원 / Haneul Kim · Associate / AI 그룹 / AI본부 · Artificial Intelligence Group / haneul.kim@blueward.co.kr / 010-0000-0000. 예시 값은 모두 가상.
- [ ] **Step 2:** S9 시안 상세 패널의 제출 내용을 같은 5칸 + 같은 명함 미리보기로 바꾼다.
- [ ] **Step 3:** `scripts/design/README.md`대로 두 시안의 png를 다시 찍는다.
- [ ] **Step 4:** 커밋하고 PR을 연다. 커밋 전 `git diff --cached`로 실명·실제 조직명이 없는지 확인.

```bash
git add docs/superpowers/specs/2026-11-20-business-card-form-design.md docs/superpowers/plans/2026-11-20-business-card-form.md docs/design/onboarding-design
git commit -m "docs(design): business card form with five fields and virtual divisions"
gh pr create --title "docs(design): 명함 신청 5칸 입력 설계와 시안" --body "..."
```

- [ ] **Step 5:** Codex 리뷰 대응 + **Leo 확인을 받은 뒤** 머지. 시안에서 미리보기 배치가 바뀌면 Task 3의 `BusinessCard` 그리기를 그 배치에 맞춘다. 이 확인 전에는 Task 2 이후를 시작하지 않는다.

---

### Task 2: GA-07 칸 정의 마이그레이션

**Files:**
- Create: `supabase/migrations/0015_business_card_form.sql`
- Create: `supabase/tests/11_business_card_form.sql`

**Interfaces:**
- Produces: GA-07 `form_schema`(아래 JSON). Task 3~6이 이 키(`english_name`, `job_title`, `division`, `email_id`, `phone`)와 속성을 쓴다.

GA-07 `form_schema` (값은 설계 4.1~4.3 그대로):

```json
{"fields":[
 {"key":"english_name","label":"영문 이름","type":"text","required":true,"placeholder":"Haneul Kim"},
 {"key":"job_title","label":"직급","type":"text","required":true,"placeholder":"사원","hint":"첨부 양식의 직급 표기를 따릅니다",
  "english":{"사원":"Associate","대리":"Assistant Manager","과장":"Manager","차장":"Deputy General Manager","부장":"General Manager","선임":"Senior Associate","책임":"Senior Manager","수석":"Principal","팀장":"Team Leader","그룹장":"Group Leader","본부장":"Head of Division","부문장":"Head of Sector","대표이사":"CEO"}},
 {"key":"division","label":"부문","type":"select","required":true,"options":[
  {"value":"공란","english":""},
  {"value":"AI 부문","english":"Artificial Intelligence Sector"},
  {"value":"AI 그룹 / AI본부","english":"Artificial Intelligence Group"},
  {"value":"플랫폼 본부","english":"Platform Division"},
  {"value":"클라우드 사업부 / 플랫폼본부","english":"Cloud Business Unit"},
  {"value":"데이터 사업부 / 플랫폼본부","english":"Data Business Unit"},
  {"value":"산업솔루션 본부","english":"Industrial Solution Division"},
  {"value":"스마트팩토리 사업부 / 산업솔루션본부","english":"Smart Factory Business Unit"},
  {"value":"전략컨설팅 본부","english":"Strategy Consulting Division"},
  {"value":"경영지원 본부","english":"Corporate Support Division"},
  {"value":"인사총무팀 / 경영지원본부","english":"HR & General Affairs Team"}]},
 {"key":"email_id","label":"이메일 아이디","type":"text","required":true,"placeholder":"haneul.kim","suffix":"@blueward.co.kr","format":"email_local"},
 {"key":"phone","label":"연락처","type":"text","required":true,"placeholder":"010-0000-0000","hint":"공개 데모라 가상 번호를 입력해 주세요","format":"tel"}
]}
```

옛 안내문: `명함에 들어갈 영문 이름을 입력해 주세요. 이름·직급·팀·메일은 프로필에서 자동으로 채워집니다.`
새 안내문: `명함에 들어갈 영문 이름·직급·부문·이메일 아이디·연락처를 입력해 주세요. 한글 이름은 프로필에서 채워집니다. 실제 신청 양식은 첨부한 엑셀을 참고하세요.`

- [ ] **Step 1: pgTAP 테스트 작성** (`11_business_card_form.sql`, `begin; … rollback;`, 시드 조직 `00000000-0000-0000-0000-000000000001`)
  - `is(jsonb_array_length(form_schema->'fields'), 5)` — GA-07 칸 5개
  - `is(array(select f->>'key' from jsonb_array_elements(form_schema->'fields') f), '{english_name,job_title,division,email_id,phone}')`
  - `is(jsonb_array_length((form_schema->'fields'->2)->'options'), 11)`, 첫 옵션 `value = '공란'`
  - `is(form_schema->'fields'->3->>'suffix', '@blueward.co.kr')`
  - 템플릿과 `private.task_template_seed`의 GA-07 `form_schema`가 같다(`is distinct from` 없음)
  - seed 사본의 `description` = 새 안내문
  - 템플릿 `description` = 새 안내문 (시드 DB에서는 담당자 수정이 없으므로)
  - **조건부 갱신(Review Focus 3):** 템플릿 description을 `'담당자가 고친 안내'`로 바꾼 뒤 `select private.apply_business_card_form();`를 다시 불러도 `'담당자가 고친 안내'`가 남고, `form_schema`는 5칸 그대로다(멱등).
  - **Review Focus 4:** `reset_demo()`를 관리자 JWT로 부른 뒤(기존 `04_demo_data.sql`의 호출 방식) GA-07 `form_schema`가 5칸이다.
- [ ] **Step 2: 실패 확인** — 롤백되는 docker psql로 테스트만 실행. Expected: 칸 5개 단언 FAIL(현재 1개).
- [ ] **Step 3: `0015_business_card_form.sql` 작성** — `create function private.apply_business_card_form() returns void language plpgsql security definer set search_path = ''`: 위 JSON을 상수로 두고 (1) `public.task_templates`의 `org_id = 시드 조직, code = 'GA-07'` 행의 `form_schema` 덮어쓰기, `description`은 옛 안내문과 같을 때만 새 안내문 (2) 그 템플릿의 `private.task_template_seed` 행 `form_schema`·`description` 덮어쓰기. `revoke all on function … from public, anon, authenticated;`. 끝에서 `select private.apply_business_card_form();`.
- [ ] **Step 4: 통과 확인** — 롤백 dry run으로 `0015` + 테스트 통과 확인 후 공유 DB에 한 번 적용(`supabase migration up`), `npm run db:test` 전체 통과. 기존 `04_demo_data.sql`의 "시드 템플릿은 시드 값" 단언도 통과해야 한다.
- [ ] **Step 5: 커밋** `feat(db): GA-07 business card form with five fields`

---

### Task 3: 칸 정의 해석과 명함 그리기

**Files:**
- Create: `apps/web/src/lib/formSchema.ts`, `apps/web/src/lib/formSchema.test.ts`
- Modify: `apps/web/src/components/BusinessCard.tsx`, `apps/web/src/components/BusinessCard.test.tsx`
- Create: `apps/web/src/components/businessCardProps.ts`, `apps/web/src/components/businessCardProps.test.ts`

**Interfaces:**
- Produces (`lib/formSchema.ts`):
  - `type FormOption = { value: string; english?: string }`
  - `type FormField = { key: string; label: string; type: 'text' | 'textarea' | 'select'; required?: boolean; placeholder?: string; hint?: string; suffix?: string; format?: 'tel' | 'email_local'; options?: FormOption[]; english?: Record<string, string> }`
  - `readFormFields(schema: unknown): FormField[]` — `fields`가 배열이 아니면 `[]`, 레코드가 아닌 원소는 버림
  - `englishOf(field: FormField, value: string): string` — 값을 trim해 `select`면 일치하는 옵션의 `english ?? ''`, `text`면 `english?.[값] ?? ''`, 없으면 `''`
  - `formatError(field: FormField, value: string): string | null` — 빈 값은 `null`. `tel`: `/^[0-9][0-9-]{6,}$/` 아니면 `'숫자와 하이픈(-)만 입력해 주세요'`. `email_local`: `/^[A-Za-z0-9._-]+$/` 아니면 `'영문·숫자·점(.)·밑줄(_)·하이픈(-)만 입력해 주세요'`
- Produces (`components/BusinessCard.tsx`): `BusinessCardProps = { name?: string | null; jobTitle?: string | null; englishName: string; englishTitle?: string; division?: string | null; englishDivision?: string; email?: string | null; phone?: string }`
- Produces (`components/businessCardProps.ts`):
  - `type CardProfile = { full_name?: string | null; job_title?: string | null; team_name?: string | null; email?: string | null }`
  - `businessCardProps(fields: FormField[], values: Record<string, unknown>, profile: CardProfile): BusinessCardProps | null` — `english_name` 칸이 없으면 `null`. `values`에 `job_title` 키가 없으면 **옛 기록**: 직급=프로필 직급, division=프로필 팀, email=프로필 메일, 나머지 빈 값. 있으면 입력값: jobTitle·englishTitle(`englishOf`), division(`'공란'`이면 `null`)·englishDivision, email=`email_id`가 비지 않으면 `email_id + suffix`, phone.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `formSchema.test.ts`: `readFormFields(null)` → `[]`; `readFormFields({ fields: [1, { key: 'a', label: 'A', type: 'text' }] })` 길이 1; `englishOf(직급칸, ' 책임 ')` → `'Senior Manager'`; `englishOf(직급칸, '인턴')` → `''`; `englishOf(부문칸, 'AI 그룹 / AI본부')` → `'Artificial Intelligence Group'`; `englishOf(부문칸, '없는 부문')` → `''`; `formatError(tel칸, '010-0000-0000')` → `null`; `formatError(tel칸, '010 공공')` → 안내 문구; `formatError(email칸, 'haneul.kim')` → `null`; `formatError(email칸, 'a@b')` → 안내 문구; 빈 값 → `null`.
  - `businessCardProps.test.ts` (Task 2 JSON을 픽스처로): 새 값 `{ english_name:'Haneul Kim', job_title:'사원', division:'AI 그룹 / AI본부', email_id:'haneul.kim', phone:'010-0000-0000' }` → `{ jobTitle:'사원', englishTitle:'Associate', division:'AI 그룹 / AI본부', englishDivision:'Artificial Intelligence Group', email:'haneul.kim@blueward.co.kr', phone:'010-0000-0000' }` 포함; `division:'공란'` → `division: null`; 옛 값 `{ english_name:'KIM HANEUL' }` + 프로필 `{ job_title:'사원', team_name:'AI팀', email:'newhire@demo.test' }` → jobTitle `'사원'`, division `'AI팀'`, email `'newhire@demo.test'`; `english_name` 칸 없는 칸 정의 → `null`.
  - `BusinessCard.test.tsx`: 새 props로 그리면 `김하늘`, `사원`, `Haneul Kim`, `Associate`, `AI 그룹 / AI본부`, `Artificial Intelligence Group`, `haneul.kim@blueward.co.kr`, `010-0000-0000`이 보인다; `division` 없으면 부문 줄이 없다; 영문 이름 공백이면 `'영문 이름'` 자리 문구(기존 테스트 유지).
- [ ] **Step 2: 실패 확인** — `npm run test:web -- formSchema businessCardProps BusinessCard` → 모듈 없음/텍스트 없음으로 FAIL.
- [ ] **Step 3: 구현** — 위 시그니처대로. `BusinessCard`의 배치는 Task 1에서 확정된 시안을 따른다(텍스트 단위는 테스트와 같게 각각의 요소로).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `bash scripts/check-design.sh` PASS.
- [ ] **Step 5: 커밋** `feat(web): parse select fields and draw the five-field business card`

---

### Task 4: 신입 입력 화면 (FormBody)

**Files:**
- Modify: `apps/web/src/features/newhire/taskBodies/FormBody.tsx`
- Modify: `apps/web/src/features/newhire/TaskDetailPage.test.tsx` (`ga07Form`을 Task 2 JSON으로 바꾸고 GA-07 테스트 갱신)

**Interfaces:**
- Consumes: `readFormFields`, `formatError` (`@/lib/formSchema`), `businessCardProps` (`@/components/businessCardProps`), `BusinessCard`.

- [ ] **Step 1: 실패하는 테스트 작성** (TaskDetailPage.test.tsx)
  - `GA-07: 5칸을 모두 채워야 제출되고 submit(id, 5칸 값)` — 영문 이름·직급 입력, `getByLabelText(/부문/)`에서 `selectOptions('AI 그룹 / AI본부')`, 이메일 아이디 `haneul.kim`, 연락처 `010-0000-0000` 전에는 제출 비활성, 모두 채우면 `submit`이 `{ english_name:'Haneul Kim', job_title:'사원', division:'AI 그룹 / AI본부', email_id:'haneul.kim', phone:'010-0000-0000' }`로 불림.
  - `GA-07: 부문 select는 빈 선택지 "골라 주세요"와 11개 선택지` — options 길이 12, 첫 option 글자 `골라 주세요`.
  - `GA-07: 이메일 아이디 칸 옆에 @blueward.co.kr가 보인다`.
  - `GA-07: 연락처에 글자가 섞이면 안내 문구가 보이고 제출 비활성` — `010 공공` 입력 → `'숫자와 하이픈(-)만 입력해 주세요'`.
  - `GA-07: 입력값이 미리보기에 반영` — figure `명함 자동 채움 미리보기`에 프로필 이름 `가상하늘`, 입력한 `Associate`, `Artificial Intelligence Group`, `haneul.kim@blueward.co.kr`.
  - **Review Focus 2:** `GA-07 보완 요청: 옛 결과(english_name만)로 열면 영문 이름만 채워지고 제출 비활성` — result `{ english_name: 'Haneul Kim' }`, status `rework`.
  - 기존 AI-04(text/textarea) 테스트는 그대로 통과해야 한다.
- [ ] **Step 2: 실패 확인** — `npm run test:web -- TaskDetailPage` FAIL.
- [ ] **Step 3: 구현** — `readFields`·로컬 `Field` 타입을 `readFormFields`로 교체. `select`는 `NativeSelect size="lg"`에 빈 첫 `<option value="">골라 주세요</option>`. `suffix`는 Input 오른쪽에 `text-muted-foreground` 글자로. `hint`와 `formatError` 문구는 칸 아래 한 줄(오류는 `text-destructive`, `aria-describedby`로 연결, 오류가 있으면 hint 대신 오류). `ready` = 필수 칸이 모두 비지 않음 **그리고** 모든 칸 `formatError === null`. 미리보기는 `businessCardProps(fields, values, { full_name, job_title, team_name, email })`가 `null`이 아닐 때만 그린다(`team_name`은 기존 `useTeamName`).
- [ ] **Step 4: 통과 확인** — `npm run test:web` 전체 PASS, `bash scripts/check-design.sh` PASS.
- [ ] **Step 5: 커밋** `feat(web): five-field business card input with division select`

---

### Task 5: 담당자 제출 내용 (SubmittedResult)

**Files:**
- Modify: `apps/web/src/features/staff/SubmittedResult.tsx`
- Modify: `apps/web/src/features/staff/OpsInboxPage.test.tsx` (GA-07 픽스처에 새 칸 정의·새 결과 1건 + 옛 결과 1건)

**Interfaces:**
- Consumes: `readFormFields`, `businessCardProps`, `BusinessCard`, `Hire`(`full_name`, `job_title`, `team.name`, `email`).

- [ ] **Step 1: 실패하는 테스트 작성**
  - `GA-07 새 제출: 5칸 표와 미리보기` — 표에 `부문` / `AI 그룹 / AI본부`, `이메일 아이디` / `haneul.kim@blueward.co.kr`(suffix 붙여 표시), figure `명함 미리보기`에 `Associate`.
  - **Review Focus 1:** `GA-07 옛 제출(english_name만): 새 칸은 "—", 미리보기는 프로필 직급·팀·메일` — 표의 `부문` 행 값 `—`, figure에 `AI팀`과 hire 메일.
- [ ] **Step 2: 실패 확인** — `npm run test:web -- OpsInboxPage` FAIL.
- [ ] **Step 3: 구현** — `fieldsOf`를 `readFormFields`로 교체. 표 값: `suffix`가 있고 값이 있으면 `값 + suffix`. 미리보기는 `result.english_name`이 문자열일 때 `businessCardProps(fields, result, { full_name: hire?.full_name, job_title: hire?.job_title, team_name: hire?.team?.name, email: hire?.email })`.
- [ ] **Step 4: 통과 확인** — `npm run test:web` PASS, `bash scripts/check-design.sh` PASS.
- [ ] **Step 5: 커밋** `feat(web): show the five business card fields in the ops inbox`

---

### Task 6: 가상 명함 신청서 엑셀과 기본 서식 등록

**Files:**
- Create: `services/agent/scripts/make_business_card_form.py`
- Create: `supabase/seed-forms/GA-07/명함 신청서.xlsx` (스크립트 결과, 커밋)
- Create: `services/agent/tests/test_business_card_form.py`
- Modify: `services/agent/scripts/bootstrap_forms.py` (`SEED_FORMS`에 `("GA-07", "명함 신청서.xlsx")`, 문서 문자열 "기본 서식 4개")
- Modify: `services/agent/tests/test_bootstrap_forms.py` (`SEED_FORMS` 4개, `test_three_seed_rows_after_two_runs` → `test_four_seed_rows_after_two_runs`)
- Modify: `services/agent/pyproject.toml`·`uv.lock` (`uv add --dev openpyxl`)

**Interfaces:**
- Consumes: Task 2 GA-07 `form_schema` (테스트가 로컬 DB에서 읽어 엑셀과 비교).
- Produces: `make_business_card_form.py` — `build(path: Path) -> None`, `main()`이 `supabase/seed-forms/GA-07/명함 신청서.xlsx`에 쓴다. 부문·직급 표는 스크립트 안 상수(설계 4.1·4.2).

엑셀 구조 (설계 4.6):
- 시트 `명함참고`: 1.1 직급표(직급/영문직급, 4.2 13행), 1.2 조직 단위표(조직명/영문: 본부 Division, 부문 Sector, 사업부 Business Unit, 그룹 Group, 센터 Center, 팀 Team), 2.1 부문표(부문/영문명/영문 부문; 영문 부문은 `=C{r}&" "&{1.2의 단위 셀}` 수식, "공란"은 빈 값, "인사총무팀 / 경영지원본부"는 영문명 `HR & General Affairs` + 팀), 2.2 표시 참고사항(설계 4.6 가상 문구).
- 시트 `명함신청양식`: B3부터 머리 `이름, 영문이름, 직급, 외부용 직급, 영문직급, 자격증명, 부문, 영문부문, 이메일아이디, 휴대폰, 팩스번호`; 4행 예시 `김하늘, Haneul Kim, 사원, , =VLOOKUP(직급, 1.1표, 2, FALSE), , AI 그룹 / AI본부, =VLOOKUP(부문, 2.1표, 3, FALSE), haneul.kim, 010-0000-0000, (비움)`; 부문 칸(H4:H20)에 2.1 표 부문 범위를 가리키는 목록 데이터 유효성; 범례 필수입력·자동선택·선택입력.

- [ ] **Step 1: 실패하는 테스트 작성** (`test_business_card_form.py`, openpyxl로 파일을 연다)
  - `test_sheets_and_header`: 시트 이름 `['명함참고', '명함신청양식']`, 머리 11개가 위 순서.
  - `test_division_dropdown_matches_ga07_schema` (로컬 Supabase 필요, `admin` 픽스처는 `test_bootstrap_forms.py`와 같은 방식): 데이터 유효성 목록 범위의 셀 값들 == GA-07 `division` options의 `value` 목록.
  - `test_english_division_matches_schema`: 2.1 표 각 행의 영문 부문을 수식 `=C{r}&" "&D${u}` 형태만 직접 풀어 계산한 값 == options의 `english`(공란은 `''`).
  - `test_job_titles_match_schema`: 1.1 표 == GA-07 `job_title.english`.
  - `test_example_row_is_virtual`: 4행 `B='김하늘'`, `J='haneul.kim'`, `K='010-0000-0000'`, 팩스 칸 비어 있음, 시트 전체에 `@`가 들어간 셀 없음.
- [ ] **Step 2: 실패 확인** — `npm run test:agent -- tests/test_business_card_form.py` → 파일 없음 FAIL.
- [ ] **Step 3: 구현** — 스크립트 작성 후 `cd services/agent && uv run python scripts/make_business_card_form.py`로 파일 생성. `bootstrap_forms.py`·기존 테스트 갱신.
- [ ] **Step 4: 통과 확인** — `npm run test:agent` 전체 PASS(`test_bootstrap_forms` 포함). 파일 크기 10MB 이하(`test_seed_files_are_small`).
- [ ] **Step 5: 커밋** `feat(forms): virtual business card request workbook as a GA-07 seed form`

---

### Task 7: 문서 갱신, 디자인 검토, 구현 PR

**Files:**
- Modify: `docs/superpowers/specs/2026-11-17-onboarding-agent-design.md` (7절 GA-07 줄 → "명함 과제(GA-07)는 영문 이름·직급·부문·이메일 아이디·연락처 입력과 미리보기까지만(2026-11-20, `2026-11-20-business-card-form-design.md`)")
- Modify: `docs/superpowers/plans/2026-11-17-onboarding-agent.md` (GA-07 줄 `form: english_name, job_title, division, email_id, phone`)
- Modify: `docs/screens.md` (48행 예시 "명함 5칸 + 미리보기", 133행 "명함 입력 5칸과 미리보기", 268행 "명함 정보 제출")
- Modify: `docs/demo-script.md` 1-3 ("영문 이름·직급·부문·이메일 아이디·연락처(가상 번호) 입력 → 제출"), `docs/judge-guide.md` 34행 같은 취지

- [ ] **Step 1:** 위 문서를 고친다.
- [ ] **Step 2:** `npm run test:web`, `npm run test:agent`, `npm run db:test`, `bash scripts/check-design.sh` 모두 PASS 확인(출력 첨부).
- [ ] **Step 3:** `/design-review`로 S3(GA-07)·S9 상세를 검토, blocker 0.
- [ ] **Step 4:** `scripts/design/README.md`대로 S3·S9 수정 전→후 스크린샷.
- [ ] **Step 5:** `git diff --cached`로 실명·실제 조직명 없는지 확인 후 커밋 `docs: business card form in screens, demo script and judge guide`, PR 생성. PR 설명에 공통 영역(`supabase/migrations/0015`, `apps/web/src/lib/formSchema.ts`) 변경 이유와 배포 후 `bootstrap_forms.py` 실행이 GA-07 서식을 올린다는 점을 적는다.
- [ ] **Step 6:** Codex 리뷰 대응 → 조건 충족 시 `gh pr merge <번호> --squash`.
