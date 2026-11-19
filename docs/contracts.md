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
POST /knowledge/index                team_trainer·ops_staff, 한도 없음. {} 관리 범위 게시 지식의 빠진 임베딩을 채운다
  → 200 {embedded:int}    # 웹이 지식 저장 뒤 기다리지 않고 부른다. 실패해도 된다(채팅이 임베딩 없는 지식을 함께 넣는다)
POST /admin/users     {email, password(8자 이상), full_name, job_title,
                       role:"new_hire"|"team_trainer"|"ops_staff",
                       department?: ops_staff면 필수, team_id?: new_hire·team_trainer면 필수,
                       hire_date?: new_hire면 필수(YYYY-MM-DD), needs_hq_access?: 기본 true}
  → 201 {id: uuid}    # new_hire면 온보딩 과제까지 생성된 상태
오류: 401 토큰 없음/만료, 403 역할 불일치, 404 문서 없음·관리 범위 밖, 409 이미 있는 메일, 422 입력 오류,
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
경로      {org_id}/{template_id}/{uuid}.{pdf|docx|xlsx}     ASCII만. 원본 이름은 테이블에 둔다 (Storage 정책이 폴더 2단계·uuid 파일 이름을 강제)
테이블    task_template_files
          id uuid, org_id uuid, template_id uuid → task_templates, file_name text(원본 이름),
          storage_path text unique, size_bytes int, uploaded_by uuid → profiles, is_seed bool, created_at
          unique (template_id, file_name)
권한      조회·내려받기: 같은 조직이고 그 템플릿을 볼 수 있는 사용자 (서식 공개 범위는 템플릿 조회 범위를 따른다.
                         기본 과제 템플릿은 같은 조직 전원, 한 사람용 템플릿은 그 신입·담당자·같은 조직 admin)
          올리기: 그 템플릿의 담당자(private.is_handler — 같은 부서 ops_staff, 같은 팀 team_trainer), 보관되지 않은 템플릿
          지우기: 담당자(기본 서식 제외), 같은 조직 admin(데모 초기화, 기본 서식 제외)
          update 없음. 교체는 지우고 다시 올린다
올리기    1) 형식·크기 확인 2) storage upload(contentType을 확장자로 명시) 3) 테이블 insert, 실패하면 올린 객체 remove
지우기    1) 테이블 delete 2) storage remove
내려받기  createSignedUrl(storage_path, 60, { download: file_name })
초기화    웹(admin)이 기본 서식이 아닌 객체를 Storage API로 먼저 지운 뒤 reset_demo를 부른다.
          reset_demo는 기본 서식이 아닌 서식 행을 지운다(Storage 객체는 SQL로 지우지 못한다). 기본 서식 3개는 남는다
기본 서식  supabase/seed-forms/{과제 코드}/ 의 가상 파일 3개: AC-01 "법인카드 신청서.xlsx"·"법인카드 사용 동의서.docx",
          HR-08 "소득세 감면 신청서.pdf". 배포의 "기본 서식 부트스트랩"(services/agent/scripts/bootstrap_forms.py)이 올리고
          is_seed = true로 등록한다. 객체 경로가 고정이라 다시 실행해도 같은 객체를 덮어쓴다
```

## 과제 템플릿 관리 (Leo 승인, 2026-11-18)

설계: `docs/superpowers/specs/2026-11-18-onboarding-plan-design.md`. 마이그레이션 `0009`(컬럼·조회 정책·잠금)·`0010`(RPC)·`0011`(서식·`reset_demo`).
웹은 템플릿 테이블을 직접 쓰지 않고 아래 RPC만 부른다(테이블 쓰기 권한·정책 없음). 모두 `security definer`, `authenticated`·`service_role`만 실행한다(`anon`·`public` 회수).

```
컬럼      task_templates: archived_at timestamptz(보관), assigned_to uuid → profiles(한 사람용), created_by uuid, is_seed bool
          teams.task_code_prefix text (AI팀 'AI')
RPC       save_task_template(p_id uuid|null, p_title, p_description, p_kind, p_completion_mode, p_stage,
                             p_days_in_stage int, p_allow_na bool, p_checklist jsonb, p_prerequisite_codes text[]) → task_templates
            p_id가 null이면 새로 만든다(교육 담당자는 자기 팀, 경영지원은 자기 부서 담당). 코드는 "<접두어>-<번호>"(AI-11, HR-09 …)
          archive_task_template(p_id) → task_templates      보관. 새 신입에게 들어가지 않는다. 진행 중인 신입의 과제는 그대로
          restore_task_template(p_id) → task_templates      보관 해제
          add_task_for_hire(p_new_hire uuid, p_title, p_description, p_kind, p_completion_mode, p_stage,
                            p_days_in_stage int, p_allow_na bool, p_checklist jsonb) → task_instances
            그 신입만 쓰는 숨은 템플릿(assigned_to)과 인스턴스(todo)를 만든다. 코드 "<접두어>-P<번호>", 선행 없음.
            기한 = 입사일 + 단계 시작일 + N일, 오늘(Asia/Seoul)보다 이르면 오늘
          mark_na(p_id, p_reason)                           한 사람용 과제는 담당자가 allow_na와 상관없이 해당 없음으로 뺄 수 있다(사유 필수)
          reset_demo()                                      admin만. 시드 템플릿은 시드 사본으로 되돌리고, 시드가 아닌 템플릿은 보관한다
입력 값   단계 시작일 day1 0일·week1 5일·month1 30일, "단계 시작 후 N일" 0~60 (due_offset_days = 시작일 + N)
          제목 1~60자, 안내문 0~2000자, 체크리스트(setup만) 1~20개·항목 1~60자, 선행 과제 0~3개
오류      42501 범위 밖(권한·담당 범위 밖, 한 사람용 과제 수정) / 22023 검증·잠금 / P0002 없음
조회      task_templates: 같은 조직. 한 사람용(assigned_to)은 그 신입·같은 팀 교육 담당자·같은 부서 경영지원·admin만
```

규칙:

- 사용 중(인스턴스가 하나라도 있는) 템플릿은 제목·안내문만 바뀐다. 종류·완료 방식·단계·기한·해당 없음 허용·체크리스트·선행이 달라지면 `22023`("진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다"). 서식은 사용 중 잠금과 관계없이 올리고 지운다.
- 입력 양식(`input`) 과제는 새로 만들 수 없고, 평가(`assessment`) 과제는 교육 담당자만 만들며 완료 방식은 담당자 처리여야 한다. 체크리스트는 `setup` 종류에만 넣는다.
- 선행 과제는 같은 담당 범위의 보관되지 않은 기본 과제만 고를 수 있고, 자기 자신·순환은 거부한다. 이미 걸려 있던 선행은 보관된 뒤에도 그대로 둘 수 있다.
- 보관된 템플릿은 수정할 수 없다(먼저 복원). 한 사람용 과제는 수정·보관·복원하지 않고 해당 없음으로만 뺀다.
- 온보딩 시작(`_start_onboarding`)은 보관·한 사람용 템플릿을 건너뛴다. 이미 시작한 신입(기본 과제 인스턴스가 있는 신입)에게 다시 불러도 0을 돌려주고 아무것도 더하지 않는다(배포마다 부트스트랩이 다시 불러도 안전하다).
- `reset_demo`: 시드 템플릿의 편집 칸을 시드 사본으로 되돌리고 보관을 풀며, 시드가 아닌 템플릿(한 사람용 포함)은 지우지 않고 보관한다. 기본 서식이 아닌 서식 행을 지우고, 시드 신입의 과제를 다시 만든다. 호출 순서는 서식 객체 삭제 → `reset_demo`.

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
          문서 정보·조항 읽기: 같은 조직, ready 문서, 회사 공통 + 내 팀 (신입·담당자 같음)
          원본 파일(storage): 관리 범위만. 신입은 원본 파일을 받지 않는다
          policy_documents update: 없음. 상태 갱신은 replace_document_clauses만
RPC       match_document_clauses(p_embedding, p_count=6)          invoker. 조항 + document_title + similarity
          replace_document_clauses(p_document_id, p_clauses jsonb, p_error=null)   definer, 함수 안에서 조직·관리 범위 검사. 조항 교체 + status
          resolve_unanswered_with_sources(p_id, p_question, p_answer, p_category, p_clause_ids uuid[], p_origin)
          save_knowledge_drafts(p_items jsonb)                    invoker. draft·ai_draft로 최대 10개
          can_manage_document(p_document_id) → boolean            invoker. 관리 범위인지. 색인·문서 초안이 다운로드 전에 확인(읽기 범위와 다르다)
          consume_quota kind 추가: document, draft
올리기    1) 형식·크기 확인 2) 행 insert(processing) 3) storage upload 4) POST /documents/{id}/index
지우기    1) storage remove(정책이 문서 행으로 범위를 확인하므로 행이 남아 있을 때) 2) 테이블 delete(조항 cascade)
초기화    reset_demo는 규정 문서를 건드리지 않는다
```

## 지식 임베딩 (Leo 승인, 2026-11-19)

설계: `docs/superpowers/specs/2026-11-19-knowledge-vector-search-design.md`. 마이그레이션 `0014`.

```
테이블    knowledge_embeddings  knowledge_id PK → knowledge_items(cascade), org_id, content_hash, embedding vector(1536), embedded_at
          content_hash = md5(question || '\n' || answer). 현재 본문의 해시와 다르면 "임베딩 없음"으로 본다
권한      읽기: 그 지식을 읽을 수 있으면(지식 RLS를 물려받는다). 신입은 게시된 회사 공통 + 내 팀 지식의 임베딩만
          쓰기: authenticated는 직접 쓸 수 없다. save_knowledge_embeddings만
RPC       match_knowledge(p_embedding, p_count=20)          invoker. 해시가 맞는 게시 지식 중 가까운 p_count건(1..50)
                                                            + 임베딩 없거나 낡은 게시 지식 전부. id, category, question, answer,
                                                            similarity(임베딩 없으면 null, 맨 뒤)
          knowledge_without_embedding(p_org=null)           invoker. 임베딩 없거나 낡은 게시 지식(id, question, answer), 오래된 순 100건.
                                                            담당자는 관리 범위만, service_role은 p_org 조직(null이면 모든 조직)
          save_knowledge_embeddings(p_items jsonb)          definer. [{id, question, answer, embedding}] 1..100개. 해시는 받은 본문으로 계산.
                                                            없는·다른 조직 지식은 건너뛰고, 관리 범위 밖이면 42501. 저장 개수를 돌려준다
채팅      질문(직전 사용자 질문 포함)을 한 번 임베딩해 match_knowledge(20)와 match_document_clauses(6)를 함께 부른다.
          임베딩이 실패하거나 4초를 넘기면 게시 지식 전부 + 조항 없음
채우기    웹: 지식 저장·게시·미답변 해결이 성공하면 POST /knowledge/index (기다리지 않음, 실패 무시)
          백필: services/agent/scripts/index_knowledge.py (환경별 1회, 초기화 뒤 선택. docs/deploy.md)
초기화    reset_demo가 지식을 지우면 임베딩도 cascade로 지워진다. 다시 시드된 지식은 임베딩 없이 채팅에 들어간다
```

