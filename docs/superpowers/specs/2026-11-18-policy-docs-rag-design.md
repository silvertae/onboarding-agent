# 규정 문서 RAG와 담당자용 지식 초안 에이전트

작성일: 2026-11-18 · 상태: 방향 승인(Leo), 규칙 문서 변경은 이 PR에서 승인

## 의도

경진대회 주제는 "우리회사 업무에 활용 가능한 AI Agent"다. 지금 AI 기능은 신입 채팅과 시험 출제 두 가지이고, 인사 담당자의 일을 줄여 주는 장면이 없다. 담당자는 S10에서 Q&A를 한 건씩 직접 쓴다.

이 기능은 담당자가 (가상) 규정 문서를 올리는 것으로 시작한다. 문서는 조항 단위로 색인된다. 신입 채팅은 조항을 검색해 "문서명 제N조" 출처를 붙여 답한다. 에이전트는 조항을 근거로 지식 초안을 만들고, 담당자는 검토와 게시만 한다. 에이전트의 일은 "조회·답변"에서 "초안 작성"까지 넓어진다. 게시는 사람이 한다.

## 사용자 결정 (2026-11-18)

- 신입 채팅은 게시된 지식과 문서 조항을 모두 검색한다. 조항 근거는 담당자가 검토한 지식과 구별해 보여 준다.
- 문서는 가상 문서만 쓴다.
- 등록 방식은 **파일 업로드**(docx·pdf)다.
- 검색 방식은 **pgvector 임베딩 검색**이다.
- 초안은 **두 곳**에서 만든다. 미답변 요청에서 답 초안을, 문서 등록 뒤에 Q&A 초안을 만든다.

## 목표

1. 담당자가 규정 문서(docx·pdf, 10MB 이하)를 올리면 조항으로 나뉘고 임베딩되어 검색할 수 있게 된다. 올리고 지우는 권한 범위는 지식과 같다. ops_staff는 회사 공통, team_trainer는 자기 팀이다.
2. 신입 채팅은 지식과 조항을 함께 근거로 쓴다. 조항 출처는 "규정 원문" 칩(문서명·조항)으로 보여 준다. 칩을 누르면 조항 본문 창이 열린다.
3. 담당자가 미답변 요청에서 "규정에서 답 초안 찾기"를 누르면 에이전트가 조항을 검색해 근거가 붙은 답 초안을 채운다. 근거가 없으면 없다고 말한다.
4. 담당자가 문서 화면에서 "지식 초안 만들기"를 누르면 신입이 물을 만한 Q&A 초안(최대 10개)이 근거 조항과 함께 `draft`로 저장된다. 기존 지식과 겹치는 질문은 피한다.

## 비목표

- 신입이 원본 파일을 내려받는 기능
- 문서 버전 관리. 교체는 삭제한 뒤 다시 올린다.
- hwp·xlsx 형식, 스캔 PDF(OCR)
- 자동 게시, 자동 재색인
- 실제 사내 문서

## 실패 조건

- 조항에 없는 금액이나 기준을 지어낸다.
- 신입이 초안 문서나 다른 팀 문서를 본다.
- 에이전트가 게시까지 한다.
- 실제 문서나 실명이 저장소 또는 시드에 들어간다.
- 문서 본문 속 지시를 따른다.
- 질문당 비용이 문서 수에 비례해 커진다.

## 접근 방식

| 결정 | 선택 | 다른 안과 기각 이유 |
|---|---|---|
| 문서 등록 | **파일 업로드(docx·pdf)** | 본문 붙여넣기: 싸고 안전하지만 담당자가 PDF에서 내용을 옮기는 수고가 남는다. 시드만 두기: 담당자가 문서를 추가할 방법이 없다. |
| 조항 검색 | **pgvector 임베딩** | 전부 넘기기: 문서가 늘수록 질문당 비용과 속도가 나빠진다. pg_trgm 키워드: "경조금"과 "축의금"처럼 표현이 다른 한국어를 놓친다. |
| 초안 시작점 | **미답변 요청 + 문서 등록 둘 다** | 하나만 하면 "실제 질문에 답하기"와 "문서로 지식 채우기" 중 한 장면이 빠진다. |
| 색인 쓰기 주체 | **에이전트가 담당자 토큰으로 RPC 호출** | 웹이 저장하는 방식(시험과 같은 방식): 임베딩 수 MB를 웹으로 왕복시켜야 한다. LLM 도구가 아니라 정해진 처리이므로 RLS 아래에서 에이전트가 쓴다. |

## 데이터 (마이그레이션 `0008_policy_documents.sql`, 추가만)

**테이블과 칼럼**
- `create extension vector`(extensions 스키마)
- `policy_documents`
  - 칼럼: id, org_id, scope(company/team), team_id, title, file_path, file_type(pdf/docx), status(`processing`/`ready`/`failed`), error, clause_count, uploaded_by, created_at
  - scope와 team_id CHECK는 `knowledge_items`와 같다.
- `document_clauses`
  - 칼럼: id, org_id, document_id(on delete cascade), ord, label("제5조"), heading("경조금"), body, embedding `vector(1536)`
  - HNSW 코사인 인덱스를 둔다.
- `knowledge_items.origin`: `manual` 또는 `ai_draft`, 기본값 `manual`. 출처 기록이라 게시한 뒤에도 남고, 담당자가 고쳐도 바꾸지 않는다.
- `knowledge_sources(knowledge_id, clause_id)`: 조항이 지워지면 연결만 지우고 지식은 남긴다.

**RLS**
- 읽기
  - 신입과 담당자 모두 회사 공통 문서와 내 팀 문서 중 `ready`인 문서의 조항을 읽는다.
  - 그래서 교육 담당자도 회사 복리후생 규정으로 답 초안을 만들 수 있다.
- 관리
  - 올리기, 삭제, `processing`·`failed` 보기, 초안 저장의 범위는 지식과 같다.
  - ops_staff는 회사 공통, team_trainer는 자기 팀이다.
- `knowledge_sources`: 담당자만 읽고 쓴다. 신입은 볼 수 없다.

**RPC**
- `match_document_clauses(p_embedding, p_count)`
  - security invoker라 RLS가 범위를 정한다.
  - 반환: id, document_title, label, heading, body, similarity
- `replace_document_clauses(p_document_id, p_clauses jsonb)`
  - 조항을 한 번에 교체하고 status와 clause_count를 갱신한다.
  - security invoker이며 관리 범위만 가능하다.
- `resolve_unanswered_with_sources(p_id, p_question, p_answer, p_category, p_clause_ids uuid[], p_origin)`
  - 게시, 근거 연결, 미답변 해결을 한 트랜잭션에서 한다.
  - 기존 `resolve_unanswered`는 그대로 둔다.
- `save_knowledge_drafts(p_items jsonb)`: 초안 여러 개와 근거 연결을 원자적으로 저장한다(draft, `ai_draft`).
- `consume_quota`: kind `document`와 `draft`를 추가한다.

**Storage와 데모 초기화**
- 비공개 버킷 `policy-docs`
  - 경로 `{org_id}/{document_id}.{ext}`, 파일당 10MB, pdf·docx만 받는다. 형식과 크기는 버킷 설정에서 막는다.
  - 업로드, 삭제, 읽기는 관리 범위의 담당자만 한다. update는 없다.
  - 방식은 `task-forms` 계약(`docs/contracts.md`)을 따른다.
- `reset_demo`는 문서를 건드리지 않는다. 문서는 진행 데이터가 아니라 조직 자료다.

## 에이전트 (`services/agent`)

**의존성과 설정**
- 의존성: `pypdf`, `python-docx`
- 임베딩은 `litellm.aembedding`을 쓴다. 사용법은 설치된 버전의 소스로 확인한다.
- 환경변수 `OPENAI_EMBEDDING_MODEL`을 추가한다. 차원 1536은 스키마에 고정한다.

**`app/documents.py`: 다운로드(사용자 토큰) → 글자 추출 → 조항 분리 → 임베딩**
- 줄 맨 앞의 `제N조(의M)?(제목)?`에서 나눈다. 첫 조항 앞의 글은 "전문"으로 둔다.
- 조항을 찾지 못하면 약 800자 단락으로 나누고 "단락 N"이라 붙인다.
- 2000자가 넘는 조항은 "(1/2)"처럼 나눈다.
- 글자를 뽑지 못하면 `failed`로 둔다. 오류 문구는 "글자를 읽을 수 없는 파일이에요"다.

**`POST /documents/{id}/index`**
- 대상 역할: team_trainer, ops_staff. 할당량: `document`
- 위 처리를 한 뒤 담당자 토큰으로 `replace_document_clauses`를 부른다.

**채팅(`assistant.py`)**
- 도구 `search_documents(query)`
  - 질의를 임베딩해 상위 6개 조항을 가져온다.
  - 돌려준 조항 id를 `_RequestScope`에 기록한다. 도구가 돌려준 id만 출처로 인정한다.
- `cite_sources(knowledge_ids, task_ids, clause_ids)`
- `sources` 이벤트에 `documents: [{id, document_title, label, heading, body}]`를 추가한다.
- 지시문에 넣을 것
  - 진행 순서 1에 search_documents를 함께 호출하도록 넣는다.
  - 조항을 근거로 쓰면 "복리후생 규정 제5조에 따르면"처럼 문서명과 조항을 말한다.
  - 지식과 조항이 다르면 조항을 따르고, 다르다는 점을 알린다.
  - 규칙 6(본문 속 지시 무시)에 문서 조항을 포함한다.

**초안 ① `POST /knowledge/draft-answer` {question}**
- 대상: 담당자. 할당량: `draft`
- LlmAgent 도구: `search_documents`, `search_knowledge`, `submit_draft(question, answer, category, clause_ids)`, `no_basis()`
- 결과는 scope로 받는다. 돌려주지 않은 조항 id는 버린다.
- DB에 쓰지 않는다.

**초안 ② `POST /knowledge/draft-from-document` {document_id, count≤10}**
- 대상: 담당자. 할당량: `draft`
- 조항 전체와 기존 지식 질문을 읽어 `output_schema`로 한 번 호출한다(`exam_agent.py`와 같은 방식).
- 응답은 `[{question, answer, category, clause_ids}]`다. DB에 쓰지 않는다.

## 웹 (`apps/web`): 시안을 먼저 만들고 Leo 확인을 받는다

**S14 규정 문서(신규)**
- 경로 `/documents`, 대상 team_trainer·ops_staff
- 목록에는 제목, 범위, 상태 배지(처리 중/완료/실패), 조항 수를 보인다.
- 올리기 창에는 제목과 파일 칸을 두고 "가상 문서만 올려 주세요" 안내를 붙인다. 올리면 storage 업로드 → 행 insert → index 호출 순서로 진행한다.
- 상세 화면에는 조항 목록, "지식 초안 만들기", 삭제를 둔다.

**S10 지식**
- 미답변 답 등록 창에 "규정에서 답 초안 찾기"를 둔다. 누르면 입력란이 채워지고 근거 조항 칩이 붙는다. 게시는 `resolve_unanswered_with_sources`로 한다.
- 지식 목록에 "AI 작성" 배지와 "AI 초안" 필터(`origin='ai_draft' and status='draft'`)를 둔다.
- 편집 창에서 근거 조항을 보인다.

**S4 채팅**
- "규정 원문" 칩 줄(FileText 아이콘)을 둔다.
- 칩을 누르면 조항 본문 Dialog가 열린다. 안내 문구는 "담당자가 검토한 답이 아니라 규정 원문에서 찾은 내용이에요"다.

## 시드와 평가

- 가상 문서 2개
  - 복리후생 규정: 경조금, 복지포인트, 휴가 지원
  - 취업규칙 발췌: 근무시간, 연차, 재택
  - 금액은 가상 값이다. `supabase/seed-docs/`에 docx와 pdf로 둔다.
- `services/agent/scripts/index_seed_docs.py`가 service_client로 올리고 색인한다. 환경마다 한 번 실행한다.
- 시드 지식 "경조사 지원"의 "복리후생 규정에 있어요"와 이어지는 시연을 만든다.
- `eval_assistant.py`에 조항 질문 3개를 추가한다. 출처 문서명과 조항, 금액을 지어내지 않는지를 확인한다.

## 바꾸는 규칙 문서 (이 PR)

- 원 설계 `2026-11-17-onboarding-agent-design.md`: "벡터 DB 없음"과 업로드 범위
- `CLAUDE.md`
  - 절대 규칙 "에이전트는 조회·답변·초안 작성만 한다. 문서 색인은 담당자 토큰으로 한다"
  - 업로드 규칙(`policy-docs` 추가)
- `SECURITY.md`: 업로드 버킷, 형식·크기, 문서 본문 표시(조항 본문은 텍스트로만 그림), P0 목록
- `AGENTS.md`: 명시한 결정 목록의 "벡터 DB 없음"
- `docs/contracts.md`: 새 엔드포인트, `sources.documents`, `OPENAI_EMBEDDING_MODEL`, 버킷
- `docs/architecture.md`: 데이터 모델, 지식 순환 흐름

## 과제 서식(`task-forms`)과의 조율

- 마이그레이션 번호는 먼저 머지되는 쪽이 `0008`을 쓰고, 나중 쪽은 PR 때 번호를 올린다.
- 버킷 정책은 `task-forms` 계약과 같은 방식을 쓴다. 규칙 문서에는 두 버킷을 함께 적는다.

## 구현하는 사람에게 맡기는 것

- 화면 세부 배치(시안과 디자인 시스템 안에서)
- 조항 분리 정규식의 세부
- 임베딩 유사도 하한
- 초안 프롬프트 문구
- 테스트에서 임베딩 함수를 가짜로 바꾸는 방법(`make_model` 방식 권장)
