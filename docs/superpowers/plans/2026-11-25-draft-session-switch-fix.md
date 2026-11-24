# 규정 문서 초안 저장 시 계정 전환 버그 수정 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "지식 초안 만들기"를 누른 사람과 다른 계정으로 초안이 저장되지 않게 하고, 초안 범위를 항상 원본 문서의 범위에 묶는다.

**Architecture:** 웹은 초안 요청을 시작한 사용자 id를 기억하고, 저장 직전에 현재 세션 사용자와 비교해 다르면 저장하지 않는다(1차 방어). DB는 문서 id를 받는 `save_knowledge_drafts` 오버로드를 추가하고, 호출자가 그 문서를 관리할 수 있는지와 범위가 문서와 같은지 확인한다(2차 방어). 기존 함수는 지우지 않는다(마이그레이션은 추가만).

**Tech Stack:** React + TS + Vitest(`apps/web`), Postgres plpgsql + pgTAP(`supabase`), supabase-js

**Spec:** `docs/contracts.md`(`POST /knowledge/draft-from-document`, `save_knowledge_drafts`), `docs/screens.md` S14 규정 문서, `SECURITY.md`

## 발견 경위 (Bombadil v0.8.0, 2026-11-25, v0.2.1 = `bdee8b2`)

- 로컬 환경에서 Bombadil로 23분간 무작위 탐색(기본 속성 + 앱 속성 8개)을 했다. 화면 속성 위반은 없었지만, 같은 시간대 DB 로그에 `지식 초안을 저장할 권한이 없습니다`가 남았다.
- 재현(Playwright): 인사 계정으로 회사 공통 문서 "지식 초안 만들기" → 0.15초 뒤 로그아웃 → 교육 담당자 로그인 → 4.2초 뒤 `save_knowledge_drafts`가 **교육 담당자 토큰으로** 호출 → 초안 5개가 `scope=team, team=AI팀, updated_by=교육 담당자`로 저장됨.
- 원인: `apps/web/src/features/documents/documents.ts:178-188` `makeKnowledgeDrafts`가 에이전트 응답(LLM, 수 초) 뒤 전역 `supabase` 클라이언트의 **그 시점 세션**으로 RPC를 부른다. RPC는 범위를 호출자 역할에서 정하고 원본 문서를 모른다(`save_knowledge_drafts(p_items)`).
- 영향: 다른 사람 이름으로 초안이 생기고, 회사 공통 문서 내용이 팀 지식으로(반대로 팀 문서가 회사 공통으로) 섞인다. 같은 역할(예: 인사 → 총무)로 바꾸면 RPC가 통과하므로 DB 검사만으로는 막을 수 없다. 심사 기간에 계정을 바꿔 가며 쓰는 심사위원에게 그대로 노출된다.

## Global Constraints

- 마이그레이션은 추가만 한다. `save_knowledge_drafts(jsonb)`를 지우거나 이름을 바꾸지 않는다.
- 새 함수에도 `revoke ... from public, anon` / `grant execute ... to authenticated`를 명시한다.
- 화면 문구는 한국어, "…못했어요" 계열 실패 문구 형식을 따른다.
- 테스트 먼저. `supabase/`, `docs/contracts.md` 변경은 PR 설명에 이유를 적는다.
- 로컬 DB에 마이그레이션은 롤백 드라이런으로 먼저 확인한 뒤 한 번 적용한다(공유 DB).

## Review Focus

- 같은 역할 다른 계정으로 전환(인사 → 총무): RPC가 통과하는 경우다. 웹 검사가 반드시 막아야 한다 → Task 1 테스트 `does not save when the user changed (same role)`.
- 로그아웃만 하고 아무도 로그인하지 않음: 세션이 없을 때 RPC를 부르지 않고 조용히 끝나야 한다(anon 호출 금지) → Task 1 테스트 `does not save after sign-out`.
- 교육 담당자가 회사 공통 문서로 초안 요청: 새 RPC가 `42501`로 거부해야 한다 → Task 2 pgTAP.
- 다른 조직·없는 문서 id: 거부(`42501`), 아무 행도 생기지 않아야 한다 → Task 2 pgTAP.
- 저장이 막혔을 때 이미 바뀐 화면(새 계정)에 이전 계정의 성공·실패 알림이 뜨지 않아야 한다 → Task 1 Step 6 수동 확인.

---

### Task 1: 웹 — 요청한 사용자와 저장하는 사용자가 같을 때만 저장

**Files:**
- Modify: `apps/web/src/features/documents/documents.ts:177-188`
- Test: `apps/web/src/features/documents/documents.test.ts`(기존 `vi.mock('@/lib/supabase')`의 `auth`에 `getSession` 추가)

**Interfaces:**
- Produces: `export class SessionChangedError extends Error` (message `'계정이 바뀌어 초안을 저장하지 않았어요.'`), `makeKnowledgeDrafts(documentId: string, count = 5): Promise<number>`(시그니처 그대로)

- [ ] **Step 1: 실패하는 테스트 작성** — `getSession` 목이 호출 순서대로 다른 사용자를 돌려주게 한다.

```ts
it('does not save when the user changed while drafting (same role)', async () => {
  getSession.mockResolvedValueOnce(session('u-hr')).mockResolvedValueOnce(session('u-ga'))
  agentFetch.mockResolvedValueOnce(json({ drafts: [draft()] }))
  await expect(makeKnowledgeDrafts('d1')).rejects.toBeInstanceOf(SessionChangedError)
  expect(calls.some((c) => c.table === 'rpc:save_knowledge_drafts')).toBe(false)
})
it('does not save after sign-out', async () => {
  getSession.mockResolvedValueOnce(session('u-hr')).mockResolvedValueOnce({ data: { session: null } })
  agentFetch.mockResolvedValueOnce(json({ drafts: [draft()] }))
  await expect(makeKnowledgeDrafts('d1')).rejects.toBeInstanceOf(SessionChangedError)
  expect(calls.some((c) => c.table === 'rpc:save_knowledge_drafts')).toBe(false)
})
it('saves when the same user is still signed in', async () => {
  getSession.mockResolvedValue(session('u-hr'))
  agentFetch.mockResolvedValueOnce(json({ drafts: [draft()] }))
  results.set('rpc:save_knowledge_drafts', { data: 1, error: null, status: 200 })
  await expect(makeKnowledgeDrafts('d1')).resolves.toBe(1)
})
```

- [ ] **Step 2: 실패 확인** — `npm run test:web -- documents.test.ts` → 앞의 두 테스트 FAIL(RPC가 호출됨).
- [ ] **Step 3: 구현** — `makeKnowledgeDrafts` 첫 줄에서 `supabase.auth.getSession()`으로 시작 사용자 id를 잡고(없으면 `SessionChangedError`), RPC 직전에 다시 읽어 다르거나 없으면 `SessionChangedError`를 던진다. 빈 배열(`drafts.length === 0`)이면 비교 없이 0을 돌려주는 기존 동작은 그대로 둔다.
- [ ] **Step 4: 통과 확인** — `npm run test:web -- documents.test.ts` → PASS, `npm run test:web` 전체 PASS.
- [ ] **Step 5: `DocumentsPage`에서 `SessionChangedError`는 알림 없이 무시** — `DocumentsPage.test.tsx`에 `makeKnowledgeDrafts`가 `SessionChangedError`로 거부될 때 실패 알림(`role="alert"`)이 없다는 테스트를 먼저 넣고 통과시킨다.
- [ ] **Step 6: 수동 재현으로 확인** — 로컬에서 인사 → "지식 초안 만들기" → 즉시 로그아웃 → 교육 담당자 로그인. 10초 뒤 `select count(*) from knowledge_items where origin='ai_draft' and updated_at > now() - interval '1 minute'` = 0, 교육 담당자 화면에 알림 없음.
- [ ] **Step 7: Commit** — `fix(web): 초안 생성 중 계정이 바뀌면 저장하지 않는다`

### Task 2: DB — 초안 저장을 원본 문서 범위에 묶는 RPC 추가

**Files:**
- Create: `supabase/migrations/<timestamp>_save_knowledge_drafts_for_document.sql`
- Modify: `supabase/tests/09_policy_documents.sql`, `docs/contracts.md:139` 근처, `apps/web/src/features/documents/documents.ts`(새 RPC 호출), `apps/web/src/lib/database.types.ts`(`npm run types`)

**Interfaces:**
- Consumes: `public.can_manage_document(uuid)`, 기존 `save_knowledge_drafts(jsonb)` 본문 규칙(1~10개, 질문·답변 필수, `draft`·`ai_draft`)
- Produces: `public.save_knowledge_drafts(p_document_id uuid, p_items jsonb) returns int` — invoker. `can_manage_document(p_document_id)`가 거짓이면 `42501 '이 문서로 초안을 저장할 권한이 없습니다'`. 범위·팀은 호출자 역할이 아니라 **문서 행의 `scope`·`team_id`**를 쓴다. `knowledge_sources`에는 그 문서의 조항 id만 넣는다(`c.document_id = p_document_id`).

- [ ] **Step 1: 실패하는 pgTAP 작성** — (a) 인사가 회사 문서로 저장 → 1행, `scope='company'`; (b) 교육 담당자가 회사 문서로 저장 → `throws_ok(..., '42501')`; (c) 다른 문서의 조항 id를 섞어 보내면 그 출처는 저장 안 됨; (d) 없는 문서 id → `42501`; (e) `anon`은 실행 권한 없음.
- [ ] **Step 2: 실패 확인** — `npm run db:test` → 새 테스트 FAIL(함수 없음).
- [ ] **Step 3: 마이그레이션 작성 후 롤백 드라이런** — `docker exec -i supabase_db_onboarding-agent psql -U postgres -v ON_ERROR_STOP=1 -c 'begin' -f - -c 'rollback' < <파일>` 오류 없음 확인 → `supabase migration up`으로 한 번 적용.
- [ ] **Step 4: 통과 확인** — `npm run db:test` PASS.
- [ ] **Step 5: 웹이 새 RPC를 쓰도록 변경** — `makeKnowledgeDrafts`가 `supabase.rpc('save_knowledge_drafts', { p_document_id: documentId, p_items: drafts })`를 부른다. 기존 테스트의 기대 인자를 먼저 바꾸고(FAIL) 구현(PASS). `npm run types`로 타입 갱신.
- [ ] **Step 6: 계약 문서** — `docs/contracts.md`에 새 시그니처와 "범위는 문서를 따른다"를 적고, 기존 `(jsonb)`는 "웹에서 쓰지 않음(호환용으로 남김)"으로 표시.
- [ ] **Step 7: Commit** — `fix(db): 지식 초안 저장을 원본 문서 범위에 묶는다` (PR 설명에 공통 영역 변경 이유)

### Task 3 (선택, Leo 확인 후): Bombadil 회귀 실행을 저장소에 남기기

계획에 없던 도구 추가이므로 Leo가 원할 때만 한다. 원하면 이번에 쓴 명세(`noFailureMessage`, `loadingResolves`, `chatAnswerArrives`, `noHorizontalOverflow`(모바일은 `/me`만), `controlsHaveNames`, `dialogsHaveTitles`, 기본 4개)를 `scripts/bombadil/spec.ts`로 옮기고, `docs/deploy.md`에 로컬 실행 방법과 "공유 DB를 바꾼다(문서 삭제·문항 수정·채팅 한도 소모)"는 주의를 적는다. CI에는 넣지 않는다.

---

## 이번 실행에서 확인했지만 고치지 않는 것

| 관찰 | 판단 |
|---|---|
| 로그아웃 순간 Realtime 구독이 `anon` 권한으로 다시 검사되어 DB 로그에 `invalid column for filter new_hire_id`(10분에 2회) | 이미 떠나는 채널이라 화면 영향 없음. 원인 추정만 했고 확정하지 않음 |
| 무작위 탐색 중 DB 로그의 `permission denied for table …`(anon 조회) | 정상 속도·빠른 로그아웃 모두 재현 안 됨. 화면 영향 없음 |
| 담당자 화면이 390px에서 가로로 넘침(`/team/hires/:id`, `/team/exams/:id`) | `docs/screens.md`상 모바일은 신입 화면만 대상이라 버그 아님 |
| 채팅 `429`가 많음 | 하루 한도(50회)를 무작위 입력이 소진한 것. 설계대로 |
