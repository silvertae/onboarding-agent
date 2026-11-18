# 규정 문서 RAG — 웹(S4·S14·S10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신입 채팅에 "규정 원문" 출처와 조항 창(S4)을 넣는다. 담당자용 규정 문서 화면(S14)을 새로 만든다. 지식 관리(S10)에는 AI 답 초안과 AI 작성 표시를 더한다.

**Architecture:**
- 웹은 지금처럼 사용자 토큰으로 Supabase(테이블·RPC·Storage)를 직접 쓴다. 에이전트 API는 `agentFetch`로 부른다.
- 화면 상태는 TanStack Query와 `useGuardedAction`으로 관리한다.
- 계약은 `docs/contracts.md` "규정 문서 저장소"와 `/chat`·`/documents`·`/knowledge` 엔드포인트를 따른다.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind v4, shadcn/ui(`components/ui`), supabase-js, TanStack Query, react-router, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-11-18-policy-docs-rag-design.md`. 화면 문구와 상태는 `docs/screens.md`의 S4, S10, S14를 따르고, 시안은 `docs/design/onboarding-design/screens/S14-documents.html`, `S10-knowledge.html`, `S4-chat-sources.html`이다. 디자인 규칙은 `.interface-design/system.md`(채팅 출처 줄, AI 작성 배지, 문서 상태 배지)를 따른다.

**순서와 선행 조건:**

| PR | Task | 선행 조건 |
|---|---|---|
| A | 1 (S4 채팅 출처) | 없음. `sources.documents`가 오지 않으면 지금과 같게 보이므로 지금 시작할 수 있다 |
| B | 2, 3 (S14) | 백엔드 계획 Task 1~2(DB)가 main에 있고 `npm run types`로 타입을 만든 뒤. 에이전트 색인·초안 API(백엔드 Task 5, 8)는 테스트에서 가짜로 바꾼다 |
| C | 4 (S10) | B와 같음. 백엔드 Task 7(답 초안 API)도 테스트에서는 가짜로 바꾼다 |

## Global Constraints

- 화면 문구는 `docs/screens.md` S4, S10, S14의 문구를 글자까지 그대로 쓴다. 이 계획에 인용한 문구도 같다.
- UI는 `.interface-design/system.md`를 따른다.
  - `components/ui`와 공통 컴포넌트, 의미 토큰만 쓴다.
  - 색 hex, 임의 글자 크기, `font-bold`, 직접 만든 탭·라디오는 쓰지 않는다.
  - 버튼 높이는 `size`로 고른다. 신입 화면은 `lg`, 표 행 동작은 `sm`, 패널 동작은 기본이다.
  - `bash scripts/check-design.sh`를 통과해야 한다.
- 로딩은 `LoadingStatus`와 스켈레톤으로, 목록 오류는 `LoadError`로, 동작 오류는 `ErrorText`로, 빈 목록은 `EmptyState`로 보인다.
- 조항 본문과 파일 이름은 텍스트로만 그린다. `dangerouslySetInnerHTML`과 마크다운 렌더러는 쓰지 않는다. 원본 파일 내용은 화면에 그리지 않는다.
- 파일 형식과 크기 검사
  - docx(`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)와 pdf(`application/pdf`)만 받는다. 파일당 10MB(10485760 바이트)까지다.
  - 거절 문구: "'{파일 이름}'은 올릴 수 없어요. docx, pdf 파일만 올릴 수 있어요." / "'{파일 이름}'이 10MB를 넘어요. 10MB 이하로 줄여서 올려 주세요."
  - 브라우저 검사는 안내용이다. 실제 제한은 버킷이 한다.
- 저장소 경로는 `{org_id}/{document_id}.{pdf|docx}`다. `document_id`는 `crypto.randomUUID()`로 웹에서 만든다. 업로드 때 `contentType`을 확장자로 명시하고 `upsert: false`로 둔다.
- 올리는 순서: 행 insert(`processing`) → storage upload(실패하면 행 delete) → `POST /documents/{id}/index`. 지우는 순서: storage remove → 행 delete.
- 에이전트 오류 문구는 `AgentError.message`를 쓴다. 429는 "{message}. 내일 다시 이용해 주세요."로 바꾼다(시험 출제 `generateError`와 같은 규칙).
- 인증 오류(`isAuthError`)면 `supabase.auth.signOut()` 뒤 다시 던진다(`knowledge.ts`의 `fail`과 같다).
- UI PR마다 `/design-review`를 받고 막는 문제를 0으로 만든다. PR 설명에는 수정 전·후 스크린샷을 넣는다(`scripts/design/README.md`).

## Review Focus

- **업로드 도중 실패**: 행은 들어갔는데 storage 업로드가 실패하면 그 행을 지워서 "처리 중" 고아 행이 남지 않는다. 오류는 창 안에 보이고 입력은 유지된다(Task 2).
- **색인 호출 실패(연결 실패나 502)**: 문서는 `processing`으로 남는다. 상세에 오류 문구와 "다시 처리"가 보여 다시 부를 수 있다. 목록이 "처리 중"에 갇히지 않는다(Task 2, 3).
- **AI 버튼 연타**: "지식 초안 만들기"와 "규정에서 답 초안 찾기"를 두 번 눌러도 에이전트 호출은 한 번이다(Task 3, 4).
- **조항 본문에 HTML처럼 보이는 글자**: `<b>굵게</b>` 같은 본문이 그대로 글자로 보인다(Task 1).
- **교육 담당자가 회사 공통 문서를 볼 때**: 읽기만 할 수 있다. 지우기 버튼과 "지식 초안 만들기"가 없다(Task 3).

---

### Task 1: S4 채팅 — "규정 원문" 출처와 조항 창

**Files:**
- Modify: `apps/web/src/features/chat/useChatStream.ts`(`Sources`, `StreamEvent`, 112~113행 조립)
- Modify: `apps/web/src/features/chat/testStream.ts`(`StreamEvent`의 sources에 `documents?`)
- Modify: `apps/web/src/features/chat/ChatPanel.tsx`(`AssistantMessage` 출처 줄)
- Create: `apps/web/src/features/chat/ClauseDialog.tsx`
- Test: `apps/web/src/features/chat/ChatPanel.test.tsx`, `apps/web/src/features/chat/useChatStream.test.ts`

**Interfaces:**
- Produces
  - `export type ClauseSource = { id: string; document_title: string; label: string; heading: string; body: string }`
  - `Sources = { knowledge: ...; tasks: ...; documents: ClauseSource[] }`. 이벤트에 `documents`가 없으면 `[]`로 채운다(지금의 에이전트와 호환).
  - `ClauseDialog({ clause, open, onOpenChange }: { clause: ClauseSource | null; open: boolean; onOpenChange(open: boolean): void })`

- [ ] **Step 1: 실패하는 테스트**
  - `useChatStream.test.ts`
    - `sources 이벤트의 documents를 메시지에 담는다`
    - `documents가 없는 sources 이벤트는 documents를 빈 배열로 둔다`
  - `ChatPanel.test.tsx`
    - `규정 원문 칩을 근거·관련 과제보다 위에 "문서명 제N조 제목"으로 보인다`: 순서는 DOM 순서로 확인한다. 칩 이름은 `복리후생 규정(가상) 제8조 경조금`이다.
    - `규정 원문 칩을 누르면 조항 창에 문서명, 조항 제목, 본문, 안내 문구가 보이고 닫기로 닫힌다`
      - 창 제목은 `제8조 경조금`이고, 위의 caption은 `복리후생 규정(가상)`이다.
      - 안내는 "담당자가 검토한 답이 아니라 규정 원문에서 찾은 내용이에요. 정확한 적용은 담당 부서에 확인해 주세요."이다.
      - 버튼은 "닫기"이고 `size="lg"`다.
    - `조항 본문은 글자로만 보인다`: 본문 `<b>굵게</b>`가 그대로 텍스트로 보이고 `b` 요소가 없다.
    - `documents가 없으면 규정 원문 줄이 없다`
- [ ] **Step 2: `npm run test:web -- src/features/chat`로 실패 확인**
- [ ] **Step 3: 구현**
  - 출처 줄 순서는 규정 원문 → 근거 → 관련 과제다.
  - 규정 원문 칩은 `button`(`aria-haspopup="dialog"`, `FileText` 아이콘, 본문색)이고 모양은 지식 칩과 같다. 누르는 영역은 `after:` 의사 요소로 위아래로 넓힌다(system.md 칩 규칙).
  - `ClauseDialog`는 `components/ui/dialog`를 쓴다. 모바일(sm 미만)에서는 `DialogContent`를 화면 아래에 붙인 시트 모양(위쪽만 둥근 모서리, 꽉 찬 너비)으로 두고, sm부터는 가운데 창으로 둔다. 본문은 `whitespace-pre-wrap`, `bg-surface-subtle`, 테두리로 그린다. 안내는 `Alert variant="info"` `role="note"`다.
  - 창 caption은 문서명만 쓴다(범위는 이벤트에 없다).
- [ ] **Step 4: `npm run test:web`, `bash scripts/check-design.sh`, `npm --prefix apps/web run build` 통과**
- [ ] **Step 5: `/design-review`(S4 데스크톱·모바일). `page.route`로 `/chat` 응답을 흉내 내 수정 전·후 스크린샷을 찍는다(DB에 쓰지 않는다)**
- [ ] **Step 6: 커밋.** `feat(web): show policy clause sources and a clause dialog in chat`

### Task 2: 규정 문서 데이터 계층 `documents.ts`

**Files:**
- Create: `apps/web/src/features/documents/documents.ts`
- Create: `apps/web/src/features/documents/documents.test.ts`
- Modify: `apps/web/src/lib/database.types.ts`(`npm run types`로 다시 만든다. 직접 고치지 않는다)

**Interfaces:**
- Consumes
  - 테이블 `policy_documents`, `document_clauses`
  - RPC `save_knowledge_drafts`, `can_manage_document`
  - storage 버킷 `policy-docs`
  - 에이전트 `POST /documents/{id}/index`, `POST /knowledge/draft-from-document`(`docs/contracts.md`)
- Produces
  - `export type PolicyDocument = Tables<'policy_documents'>`, `export type DocumentClause = Pick<Tables<'document_clauses'>, 'id' | 'ord' | 'label' | 'heading' | 'body'>`
  - `export const DOC_TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } as const`, `export const DOC_MAX_BYTES = 10485760`
  - `export function checkDocumentFile(file: File): string | null`: 거절 문구를 돌려주고, 통과하면 null
  - `export function canManage(profile: Profile | null, doc: Pick<PolicyDocument, 'org_id' | 'scope' | 'team_id'>): boolean`: 화면에서 버튼을 숨기는 데만 쓴다. 권한 판단은 DB가 한다. 규칙은 `manageScope`(features/staff/knowledge.ts)와 같고 조직도 비교한다.
  - `export function useDocuments(): UseQueryResult<PolicyDocument[]>`: RLS가 보여 주는 문서 전부를 `created_at` 내림차순으로 가져온다. 키는 `['documents', profile.id]`다.
  - `export function useDocumentClauses(documentId: string | null): UseQueryResult<DocumentClause[]>`: `ord` 오름차순이다.
  - `export async function uploadDocument(profile: Profile, title: string, file: File): Promise<{ document: PolicyDocument; indexError: string | null }>`: Global Constraints의 순서를 따른다. insert·upload 실패는 던진다. 색인 호출 실패는 던지지 않고 `indexError`에 문구를 담는다(문서는 이미 저장됐고 "다시 처리"로 이어 갈 수 있다).
  - `export async function indexDocument(documentId: string): Promise<{ status: 'ready' | 'failed'; clause_count: number; error: string | null }>`
  - `export async function deleteDocument(doc: Pick<PolicyDocument, 'id' | 'file_path'>): Promise<void>`
  - `export async function makeKnowledgeDrafts(documentId: string, count = 5): Promise<number>`: `/knowledge/draft-from-document` → `rpc('save_knowledge_drafts', { p_items })` 순서로 부르고, 저장한 개수를 돌려준다.
  - 실패는 `DbError`나 `AgentError`로 던진다(인증 오류는 signOut 뒤에 던진다).

- [ ] **Step 1: 실패하는 테스트**(`features/exam/exams.test.ts`의 체이닝 `builder`와 `vi.mock('@/lib/agent')` 방식으로 쓰고, `storage.from().upload/remove`도 가짜로 만든다)
  - `checkDocumentFile`
    - `.jpg`면 형식 거절 문구다.
    - 10485761 바이트면 크기 거절 문구다.
    - `.PDF`(대문자)는 통과한다.
  - `uploadDocument`
    - 순서는 insert → upload → agentFetch(`/documents/{id}/index`)다.
    - 경로는 `org-1/{id}.pdf`, `contentType`은 `application/pdf`, `upsert: false`다.
    - insert 행에는 id, org_id, scope, team_id(`manageScope`), title, file_path, file_type, uploaded_by가 들어간다.
  - `uploadDocument: 업로드가 실패하면 넣은 행을 지우고 던진다`(Review Focus 1)
  - `uploadDocument: 색인 호출이 실패하면 문서를 돌려주고 indexError에 문구를 담는다`(Review Focus 2)
  - `deleteDocument: storage remove 다음에 행 delete. remove가 실패하면 행을 지우지 않고 던진다`
  - `makeKnowledgeDrafts`
    - 응답의 `drafts`를 그대로 `p_items`로 넘기고 개수를 돌려준다.
    - 에이전트 429면 `AgentError`를 던진다.
  - `canManage`
    - ops_staff는 같은 조직의 company 문서만 true다.
    - team_trainer는 같은 팀의 team 문서만 true다.
    - 다른 조직이면 false다.
- [ ] **Step 2: `npm run test:web -- src/features/documents`로 실패 확인**
- [ ] **Step 3: 구현**
  - 오류 처리는 `knowledge.ts`의 `fail` 방식을 따른다.
  - 쿼리 무효화 키: 올리기·지우기·색인은 `['documents']`와 `['clauses', id]`, 초안은 `['knowledge']`다.
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋.** `feat(web): data layer for policy documents`

### Task 3: S14 규정 문서 화면

**Files:**
- Create: `apps/web/src/features/documents/DocumentsPage.tsx`, `UploadDocumentDialog.tsx`, `DeleteDocumentDialog.tsx`
- Create: `apps/web/src/features/documents/DocumentsPage.test.tsx`
- Modify: `apps/web/src/app/App.tsx`(`['team_trainer','ops_staff']` 묶음에 `/documents`)
- Modify: `apps/web/src/app/Layout.tsx`(`NAV_BY_ROLE`의 두 역할 끝에 `{ to: '/documents', label: '규정 문서' }`), 그리고 메뉴를 단언하는 `Layout.test.tsx`

**Interfaces:**
- Consumes: Task 2의 모든 export
- Produces: `export function DocumentsPage()`

- [ ] **Step 1: 실패하는 테스트**(`KnowledgePage.test.tsx`처럼 `./documents` 훅 계층을 `vi.mock`으로 바꾼다)
  - 표에는 문서 이름과 "형식 · 올린 사람 · 시각", 범위, 상태 배지, 조항 수가 보인다.
    - 상태 배지는 처리 중 `submitted`, 사용 중 `done`, 처리 실패 `rework`이고 문구는 "처리 중"/"사용 중"/"처리 실패"다.
    - 조항 수는 처리 중이거나 실패면 "—"다.
  - 행을 누르면 오른쪽 패널에 범위·상태 배지, 이름, 파일 정보, "조항 N개" 목록(번호·제목·본문 두 줄)이 보인다.
  - 올리기 창
    - 파일을 고르면 "문서 이름"이 파일 이름(확장자 제외)으로 채워진다.
    - `.jpg`를 고르면 거절 문구가 보이고 "올리기"가 비활성이다.
    - 성공하면 창이 닫히고 새 문서가 선택된다.
  - 업로드 실패: 창 안에 `ErrorText`가 보이고 입력이 유지된다.
  - 처리 중: "문서를 조항으로 나누고 있어요. 1분쯤 걸려요."(`role="status"`)와 스켈레톤이 보인다.
  - 처리 실패
    - 문서의 `error` 문구가 `Alert variant="destructive"` `role="note"`로 보이고, "다시 처리"와 "지우기"가 있다.
    - "다시 처리"는 `indexDocument`를 한 번 부른다.
  - 색인 호출 실패(`indexError`): 상세에 그 문구와 "다시 처리"가 보인다(Review Focus 2).
  - 지식 초안 만들기(Review Focus 3)
    - 누르면 "초안 만드는 중…"(비활성)이 되고, 두 번 눌러도 `makeKnowledgeDrafts`는 1회만 불린다.
    - 성공하면 "지식 초안 5개를 만들었어요. 검토하고 게시해야 신입에게 보여요."와 링크 "지식 관리에서 검토하기"(`/knowledge`)가 보인다.
    - 실패하면 "초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요."가 보인다.
  - 지우기 확인
    - 제목 "'복리후생 규정(가상)'을 지울까요?", 설명 "조항 18개가 함께 지워지고, 채팅은 더 이상 이 문서로 답하지 않아요. 이 문서로 만든 지식은 남아요."
    - "지우기"를 누르면 `deleteDocument`를 부른다.
  - 교육 담당자가 회사 공통 문서를 고르면 지우기 아이콘과 "지식 초안 만들기"가 없다(Review Focus 5).
  - 빈 목록: "아직 올린 규정 문서가 없어요." / "복리후생 규정이나 취업규칙을 올리면 신입 채팅이 조항을 찾아 답해요." + "문서 올리기"
  - 로딩 중에는 `TableSkeleton`, 오류면 `LoadError`와 "다시 불러오기"가 보인다.
  - `Layout.test.tsx`: 교육 담당자와 경영지원 메뉴 끝에 "규정 문서"가 있다.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**
  - 배치는 시안 `S14-documents`를 따른다. `grid lg:grid-cols-[1fr_minmax(380px,460px)]`, 왼쪽 `Panel` 표, 오른쪽 상세 `aside`.
  - 페이지 머리는 `PageHeader`다.
    - 설명: 경영지원은 "회사 공통 규정 문서를 올리면 조항으로 나눠 두고, 신입 채팅이 조항을 찾아 출처와 함께 답해요.", 교육 담당자는 "우리 팀 규정 문서를 올리면 조항으로 나눠 두고, 신입 채팅이 조항을 찾아 출처와 함께 답해요."
    - 동작: "문서 올리기"(`variant="outline"`, 기본 크기).
  - "지식 초안 만들기"는 `size="lg"`이고 `Sparkles` 아이콘을 붙인다.
  - 선택 행은 `ROW_SELECTED`, 동작 잠금은 `useGuardedAction`으로 한다.
  - 올리기 창
    - 범위는 글자로만 보인다: "회사 공통 · 경영지원 담당자가 관리해요" / "{팀 이름} · 교육 담당자가 관리해요"
    - 안내 "docx, pdf · 파일당 10MB까지 · 글자가 있는 파일만 읽을 수 있어요(스캔본 제외)"와 경고 "가상 문서만 올려 주세요. 실명·연락처 같은 개인정보나 실제 사내 규정은 올리지 않아요."를 둔다.
    - 파일 입력은 `Input type="file" accept=".docx,.pdf"`다.
  - 처리 중 문서는 5초마다 다시 불러온다(`refetchInterval`, 처리 중 문서가 있을 때만).
- [ ] **Step 4: `npm run test:web`, `bash scripts/check-design.sh`, build 통과**
- [ ] **Step 5: `/design-review`(S14). 스크린샷은 로컬 Supabase의 가상 문서로 찍는다**
- [ ] **Step 6: 커밋.** `feat(web): policy documents page (S14)`

### Task 4: S10 지식 관리 — 규정에서 답 초안 찾기, AI 작성 표시

**Files:**
- Modify: `apps/web/src/features/staff/knowledge.ts`, `KnowledgeForm.tsx`, `KnowledgePage.tsx`
- Test: `apps/web/src/features/staff/KnowledgePage.test.tsx`, Create `apps/web/src/features/staff/knowledge.test.ts`

**Interfaces:**
- Consumes
  - 에이전트 `POST /knowledge/draft-answer`
  - RPC `resolve_unanswered_with_sources`
  - 테이블 `knowledge_sources`(조항 정보는 `document_clauses`와 `policy_documents(title)` 조인)
  - Task 2의 `useDocuments`(읽을 수 있는 ready 문서가 있는지)
- Produces
  - `export type DraftClause = { id: string; document_title: string; label: string; heading: string }`
  - `export async function draftAnswer(question: string): Promise<{ answer: string; category: string; clauses: DraftClause[] } | null>`: `found:false`면 null을 돌려준다.
  - `useKnowledgeActions().resolve(unansweredId, values, source?: { clauseIds: string[]; origin: 'manual' | 'ai_draft' })`
    - `source`가 있으면 `rpc('resolve_unanswered_with_sources', { p_id, p_question, p_answer, p_category, p_clause_ids, p_origin })`, 없으면 지금처럼 `resolve_unanswered`를 부른다.
  - `export function useKnowledgeSources(knowledgeId: string | null): UseQueryResult<DraftClause[]>`
  - `KnowledgeForm`의 새 props: `onDraft?: () => Promise<void>`(resolve 모드에서만), `clauses?: DraftClause[]`, `aiDraft?: boolean`, `draftDisabledReason?: 'no-documents' | null`

- [ ] **Step 1: 실패하는 테스트**
  - `knowledge.test.ts`
    - `draftAnswer`가 `/knowledge/draft-answer`에 `{question}`을 보내고, `found:false`면 null이다.
    - `resolve`에 `source`가 있으면 `resolve_unanswered_with_sources`를 부르고, 없으면 `resolve_unanswered`를 부른다.
  - `KnowledgePage.test.tsx`
    - 미답변 "답 등록" → 폼의 "답변" 라벨 오른쪽에 "규정에서 답 초안 찾기"(`size="sm"`, Sparkles)가 있다.
    - 누르면 "찾는 중…"(비활성)과 "규정 조항에서 근거를 찾고 있어요."(`role="status"`)가 보이고, 두 번 눌러도 1회만 호출된다(Review Focus 3).
    - 찾으면 답변·분류 칸이 채워진다. "근거 조항" 칩 `복리후생 규정(가상) 제14조 야근 식대`와 경고 "AI가 규정 조항으로 만든 초안이에요. 금액·기준이 조항과 맞는지 확인하고 게시해 주세요."(`role="note"`)가 보인다. 게시하면 `resolve`가 `{ clauseIds: [id], origin: 'ai_draft' }`와 함께 불린다.
    - 근거가 없으면 "올린 규정 문서에서 근거를 찾지 못했어요. 답을 직접 써 주세요."(`role="status"`)가 보이고 칸은 그대로다.
    - 실패하면 "초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요."가 보인다.
    - 읽을 수 있는 ready 문서가 없으면 버튼이 비활성이다. "올린 규정 문서가 없어요. 규정 문서에서 먼저 올려 주세요."의 "규정 문서"는 `/documents` 링크다.
    - 초안을 받은 뒤 담당자가 답을 고쳐도 origin은 `ai_draft` 그대로다.
    - 지식 목록 탭
      - 표 머리 아래에 `FilterChips` "전체 N" / "AI 초안 N"이 있다. "AI 초안"은 `origin='ai_draft' && status='draft'`만 보인다.
      - AI 작성 지식의 질문 아래에 `Badge variant="secondary"` "AI 작성"(Sparkles)이 있다. 게시된 AI 작성 지식에도 있다.
    - 지식 "수정" 폼에서는 근거 조항 칩이 보인다(`useKnowledgeSources`).
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**
  - 분류는 초안이 비어 있으면 기존 값을 둔다.
  - "근거" 칸을 따로 두지 않는다. 조항 번호는 AI 초안 필터에서 질문 아래 배지 옆에 caption으로 둔다(시안의 "근거" 열은 표 폭 때문에 이렇게 바꾼다. Ruling은 PR에 적는다).
- [ ] **Step 4: `npm run test:web`, check-design, build 통과**
- [ ] **Step 5: `/design-review`(S10). 수정 전·후 스크린샷**
- [ ] **Step 6: 커밋.** `feat(web): AI answer drafts from policy clauses and AI badges in S10`

### Task 5: 문서와 시연 정리

**Files:**
- Modify: `docs/judge-guide.md:47`("에이전트는 조회·답변·시험 초안만 맡고"를 "조회·답변·초안(시험·지식) 작성만 맡고, 게시와 과제 상태는 사람이 바꿉니다"로), `docs/demo-script.md`(S14·S10·S4 흐름), `README.md`(AI 기능 소개에 규정 문서 검색·지식 초안)

- [ ] **Step 1: 고친다. 문구가 `docs/screens.md`·시안과 같은지 대조한다**
- [ ] **Step 2: 커밋.** `docs: describe policy document search and knowledge drafts for judges`
