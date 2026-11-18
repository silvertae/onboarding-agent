# API·환경변수 계약

이 문서가 웹·에이전트·DB 사이의 기준이다. 바꿔야 하면 작업을 멈추고 보고한다(CLAUDE.md "작업 방식").
출처: 구현 계획 Task 1 Interfaces.

```
환경변수
  웹(빌드 시): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_AGENT_URL, VITE_ENV_LABEL(local|staging|prod)
  에이전트: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENAI_MODEL,
            ALLOWED_ORIGINS(쉼표 구분), ALLOWED_ORIGIN_REGEX(선택), GIT_SHA,
            CHAT_DAILY_LIMIT(기본 50), EXAM_DAILY_LIMIT(기본 10),
            OPENAI_EMBEDDING_MODEL(임베딩, 1536차원), DOCUMENT_DAILY_LIMIT(기본 20), DRAFT_DAILY_LIMIT(기본 30)
  부트스트랩: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL(기본 admin@demo.test), ADMIN_PASSWORD, DEMO_PASSWORD

에이전트 API (/health 외 모든 요청 Authorization: Bearer <Supabase access token>)
GET  /health          → {"ok":true,"version":string}
POST /chat            {message: string(1..1000), history: [{role:"user"|"assistant", text:string(..2000)}] (최대 10개)}
  → text/event-stream. 이벤트 data(JSON) 종류:
    {"type":"token","text":string}
    {"type":"sources","knowledge":[{"id":uuid,"question":string}],"tasks":[{"id":uuid,"code":string,"title":string}],
     "documents":[{"id":uuid,"document_title":string,"label":string,"heading":string,"body":string}]}
                                     # documents는 규정 조항 근거(2026-11-18 추가). 셋 중 하나라도 있으면 보낸다
    {"type":"unanswered"}            # 근거 없음. 기록하지 않는다(웹이 "담당자에게 등록 요청" 버튼을 보이고, 신입이 보내면 웹이 unanswered_questions에 넣는다)
    {"type":"error","message":string}
    {"type":"done"}
POST /exams/generate  {topic, difficulty:"beginner"|"intermediate", question_count:1..10, style?:string, new_hire_id?:uuid, avoid_prompts?:string[] (≤30, 각 ≤500자)}
  → 200 {title:string, questions:[ExamQuestion]}
POST /exams/regenerate-question {topic, difficulty, existing_prompts:string[], instruction?:string}
  → 200 ExamQuestion
ExamQuestion = {prompt:string, model_answer:string, rubric:string, points:int}
POST /documents/{id}/index           team_trainer·ops_staff, 한도 document. 문서를 조항으로 나누고 임베딩해 저장
  → 200 {status:"ready"|"failed", clause_count:int, error:string|null}   # 글자를 못 읽으면 failed
POST /knowledge/draft-answer         team_trainer·ops_staff, 한도 draft. {question: string(1..300)}
  → 200 {found:false} | {found:true, draft:{question, answer, category, clauses:[{id, document_title, label, heading}]}}
POST /knowledge/draft-from-document  team_trainer·ops_staff, 한도 draft. {document_id: uuid, count: 1..10 (기본 5)}
  → 200 {drafts:[{question, answer, category, clause_ids:[uuid]}]}    # 초안 API는 DB에 쓰지 않는다. 웹이 저장한다
POST /admin/users     {email, password(8자 이상), full_name, job_title,
                       role:"new_hire"|"team_trainer"|"ops_staff",
                       department?: ops_staff면 필수, team_id?: new_hire·team_trainer면 필수,
                       hire_date?: new_hire면 필수(YYYY-MM-DD), needs_hq_access?: 기본 true}
  → 201 {id: uuid}    # new_hire면 온보딩 과제까지 생성된 상태
오류: 401 토큰 없음/만료, 403 역할 불일치, 404 문서 없음·범위 밖, 409 이미 있는 메일, 422 입력 오류,
      429 {"detail":"오늘 사용 한도를 넘었어요"}, 502 모델 출력 오류 {"detail":"..."}
```

## 보충 (Leo 승인, 2026-11-17)

- 에이전트가 시작할 때 반드시 있어야 하는 값은 `SUPABASE_URL`, `SUPABASE_ANON_KEY`뿐이다. 둘 중 하나라도 없으면 시작하지 않는다.
  `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`은 그 값을 쓰는 경로에서 확인한다.
- 로컬에서는 `.env` 파일을 쓰지 않는다. npm 스크립트가 `supabase status`에서 Supabase 값을 받아 환경변수로 넘긴다.

## 과제 서식 저장소 (Leo 승인, 2026-11-18)

웹이 Supabase Storage와 테이블을 사용자 토큰으로 직접 쓴다. 에이전트 API와 환경변수는 바뀌지 않는다.

```
버킷      task-forms   비공개, 파일당 10MB, MIME 3종만
          application/pdf
          application/vnd.openxmlformats-officedocument.wordprocessingml.document   (.docx)
          application/vnd.openxmlformats-officedocument.spreadsheetml.sheet         (.xlsx)
경로      {org_id}/{template_id}/{uuid}.{pdf|docx|xlsx}     ASCII만. 원본 이름은 테이블에 둔다
테이블    task_template_files
          id uuid, org_id uuid, template_id uuid → task_templates, file_name text(원본 이름),
          storage_path text unique, size_bytes int, uploaded_by uuid → profiles, is_seed bool, created_at
          unique (template_id, file_name)
권한      조회·내려받기: 같은 조직
          올리기: 그 템플릿의 담당자(private.is_handler — 같은 부서 ops_staff, 같은 팀 team_trainer)
          지우기: 담당자(기본 서식 제외), 같은 조직 admin(데모 초기화)
          update 없음. 교체는 지우고 다시 올린다
올리기    1) 형식·크기 확인 2) storage upload(contentType을 확장자로 명시) 3) 테이블 insert, 실패하면 올린 객체 remove
지우기    1) 테이블 delete 2) storage remove
내려받기  createSignedUrl(storage_path, 60, { download: file_name })
```

## 규정 문서 저장소 (Leo 승인, 2026-11-18)

설계: `docs/superpowers/specs/2026-11-18-policy-docs-rag-design.md`. 마이그레이션 `0012`·`0013`(과제 템플릿·서식 작업이 `0008`~`0011` 예약).

```
버킷      policy-docs   비공개, 파일당 10MB, MIME 2종만
          application/pdf
          application/vnd.openxmlformats-officedocument.wordprocessingml.document   (.docx)
경로      {org_id}/{document_id}.{pdf|docx}
테이블    policy_documents  id, org_id, scope(company|team), team_id, title, file_path, file_type(pdf|docx),
                            status(processing|ready|failed), error, clause_count, uploaded_by, created_at
          document_clauses  id, org_id, document_id → policy_documents(cascade), ord, label, heading, body, embedding vector(1536)
          knowledge_items.origin  manual|ai_draft (기본 manual, 게시 뒤에도 유지)
          knowledge_sources (knowledge_id, clause_id)   담당자만 읽고 쓴다
권한      관리(올리기·지우기·색인·초안 저장, processing·failed 보기): 지식과 같은 범위
            ops_staff = 회사 공통, team_trainer = 자기 팀
          조항 읽기: 같은 조직, ready 문서, 회사 공통 + 내 팀 (신입·담당자 같음). 신입은 원본 파일을 받지 않는다
RPC       match_document_clauses(p_embedding, p_count=6)          invoker. 조항 + document_title + similarity
          replace_document_clauses(p_document_id, p_clauses jsonb, p_error=null)   invoker. 조항 교체 + status
          resolve_unanswered_with_sources(p_id, p_question, p_answer, p_category, p_clause_ids uuid[], p_origin)
          save_knowledge_drafts(p_items jsonb)                    invoker. draft·ai_draft로 최대 10개
          consume_quota kind 추가: document, draft
올리기    1) 형식·크기 확인 2) 행 insert(processing) 3) storage upload 4) POST /documents/{id}/index
지우기    1) 테이블 delete(조항 cascade) 2) storage remove
초기화    reset_demo는 규정 문서를 건드리지 않는다
```
