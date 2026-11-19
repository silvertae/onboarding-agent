# SECURITY.md

## 보안 문제 제보

이 저장소는 사내 경진대회용 데모입니다. 데이터는 전부 가상이고, 실제 직원 정보나 업무 문서는 없습니다.
보안 문제를 발견하면 공개 이슈로 올리지 말고 저장소 소유자에게 직접 알려 주세요. GitHub의 "Report a vulnerability"(비공개 보안 제보)를 쓸 수 있으면 그쪽을 이용해 주세요.

## 구조와 신뢰 경계

```
브라우저 ──(사용자 토큰)──> Supabase          RLS와 RPC가 권한을 판단
브라우저 ──(사용자 토큰)──> 에이전트 서비스    토큰 확인 후 역할 검사
에이전트 ──(사용자 토큰)──> Supabase          RLS가 그대로 적용
에이전트 ──(관리자 키)────> Supabase          /admin/users와 services/agent/scripts/에서만
에이전트 ──(OpenAI 키)────> OpenAI            채팅·초안(모델), 색인·검색(임베딩)
```

- 관리자 키를 쓰는 곳: `/admin/users`(인증 계정·프로필 만들기, 온보딩 시작)와 `services/agent/scripts/`의 계정·기본 서식 부트스트랩(배포마다 실행), 시드 규정 문서 색인, 지식 임베딩 백필(환경마다 한 번).

- 브라우저는 신뢰하지 않는다. 권한은 항상 DB(RLS·RPC) 또는 에이전트 서비스가 판단한다.
- 사용자 입력, 지식 본문, 대화 이력, 신입이 제출한 내용, 담당자가 올린 서식 파일, 담당자가 올린 규정 문서와 그 조항 본문은 모두 신뢰하지 않는 데이터다. 모델에게는 지시가 아니라 자료로 넘긴다.
- 역할: `new_hire`, `team_trainer`, `ops_staff`(부서 `hr`·`ga`·`accounting`), `admin`.

## 리뷰에서 반드시 막을 것 (P0)

### 비밀값

- `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, DB 비밀번호, 계정 비밀번호가 코드·설정 파일·테스트·문서·로그·에러 메시지에 들어간다.
- 웹 코드(`apps/web`)가 `VITE_*` 공개 값 외의 비밀값을 참조한다. 웹 번들에 관리자 키가 들어갈 수 있는 경로가 생긴다.
- `.env*` 파일이 커밋된다(`.env.example`과 공개 값만 담은 `apps/web/.env.staging`·`.env.production` 제외).
- GitHub Actions에서 비밀값을 `echo`하거나, `pull_request_target`처럼 외부 PR 코드가 비밀값에 접근할 수 있는 방식으로 실행한다.
- `services/agent/scripts/`(부트스트랩, 색인·백필)가 비밀번호·키나 지식·문서 본문을 출력한다.

### 인증과 권한

- 에이전트 서비스 경로가 `/health` 외에 토큰 없이 동작한다. 토큰 확인을 `services/agent/app/auth.py` 밖에서 따로 구현한다.
- 역할 검사가 빠지거나 클라이언트가 보낸 값(요청 본문의 역할·조직·사용자 ID)을 믿는다. 역할과 조직은 항상 토큰으로 조회한 프로필에서 가져온다.
- 관리자 키(`service_client()`나 `SUPABASE_SERVICE_ROLE_KEY`로 직접 만든 클라이언트)를 `services/agent/app/admin_routes.py`와 `services/agent/scripts/` 밖에서 쓴다.
- `/admin/users`가 `admin` 역할을 만들 수 있거나, 다른 조직의 팀에 계정을 만들 수 있다.
- Supabase 공개 가입이 켜진다(`enable_signup`).
- `reset_demo`를 `admin` 외 역할이 실행할 수 있다. `_start_onboarding`, `seed_demo_knowledge`, `seed_demo_bank`를 `authenticated`가 실행할 수 있다.

### 데이터베이스

- 테이블에 RLS가 꺼져 있거나 정책 없이 `authenticated`에 쓰기 권한을 준다. `anon`에 어떤 권한이든 준다.
- `security definer` 함수가 호출자 확인(`auth.uid()`와 역할·부서·팀) 없이 다른 사람의 데이터를 바꾼다. `search_path`를 고정하지 않는다.
- SQL을 문자열 이어 붙이기로 만든다(동적 SQL에 사용자 입력).
- RLS 정책이 아래를 허용한다:
  - 신입이 다른 신입의 과제·제출 내용·평가 결과를 본다.
  - `team_trainer` 외 역할이 `exams`, `exam_questions`를 본다.
  - 같은 팀 `team_trainer` 외 역할이 문제은행(`question_bank_items`)을 보거나 쓴다. 다른 팀 은행 문항을 `exam_questions.bank_item_id`로 잇는다. `exam_sittings`를 `assign_exam` 밖에서 쓴다.
  - 담당 범위 밖 사용자(신입, 관리자, 다른 팀 교육 담당자, 다른 부서 경영지원)가 과제 템플릿을 만들거나 고치거나 보관한다. 진행 중인 신입이 있는 템플릿의 제목·안내문 외 항목이 바뀐다. 한 사람용 과제(`assigned_to`)를 다른 신입이나 담당 범위 밖 직원이 본다.
  - 경영지원 담당자가 다른 부서의 과제를 처리한다.
  - 신입이 초안(`draft`) 지식이나 다른 팀 지식을 본다.
  - 신입이나 담당 범위 밖 사용자(다른 부서 경영지원, 다른 팀 교육 담당자)가 과제 서식을 올리거나 지운다. 담당자가 기본 서식(`is_seed`)을 지운다.
  - 다른 조직 사용자가 과제 서식 목록을 보거나 파일을 내려받는다.
  - 신입이 규정 문서 원본 파일, 처리 중·실패한 문서의 조항, 다른 팀 문서의 조항, 지식의 근거 연결(`knowledge_sources`)을 본다.
  - 관리 범위 밖 사용자(신입, 다른 팀 교육 담당자, 팀 문서에 대한 경영지원)가 규정 문서를 올리거나 지우거나 색인한다.
  - 신입이 초안·다른 팀 지식의 임베딩(`knowledge_embeddings`)을 보거나 채팅 검색(`match_knowledge`)으로 받는다. 관리 범위 밖 사용자가 지식 임베딩을 쓴다. authenticated가 `knowledge_embeddings`에 직접 쓴다(저장은 `save_knowledge_embeddings` RPC로만).

### 파일 (과제 서식·규정 문서)

- `task-forms`, `policy-docs` 외의 버킷이나 업로드 경로를 만든다. 신입이 파일을 올리는 경로를 만든다.
- `task-forms`나 `policy-docs` 버킷이 공개(public)로 바뀐다. 내려받기에 서명 URL이 아닌 공개 URL을 쓴다.
- 버킷이나 정책이 정한 형식(`task-forms`는 docx·xlsx·pdf, `policy-docs`는 docx·pdf) 외의 파일이나 10MB를 넘는 파일을 받는다. 형식·크기 검사를 브라우저에서만 한다.
- 규정 문서 파싱에 크기 상한이 없다(압축을 푼 docx 30MB, 표 칸 2만 개, pdf 300쪽, 글자 100만 자, 조항 300개) — 압축 폭탄·거대 PDF로 서비스를 멈출 수 있다.
- `storage.objects` 정책이 테이블(`task_template_files`, `policy_documents`) 정책보다 넓다(경로의 조직·템플릿·문서를 확인하지 않는다).
- 서식 파일이나 규정 문서 파일을 화면에서 열어 그린다(서식은 내려받기만 허용). 규정 조항 본문과 파일 이름을 텍스트가 아닌 HTML로 그린다.

### LLM

- 모델 출력이나 도구 결과로 과제 상태를 바꾸거나, 지식을 게시하거나, 관리자 기능을 호출한다(지식 초안은 담당자가 확인한 뒤 웹이 저장한다).
- 사용자 입력, 지식 본문, 문서 조항을 시스템 지시문 자리에 넣는다(자료 블록으로 구분하지 않는다).
- 모델·임베딩 호출 전에 하루 사용 한도(chat·exam·document·draft) 확인이 없다(`/knowledge/index`는 빠진 임베딩만 채워 한도가 없다). 요청 크기 제한(질문 1000자, 이력 10개, 주제 200자, 문항 수 1~10, 초안 질문 300자, 문서 초안 10개, 문서 초안에 넣는 조항 6만 자)이나 임베딩 시간 제한(채팅 4초, 색인·초안 20초)이 빠진다.
- 에이전트가 사용자 토큰으로 색인 RPC(`replace_document_clauses`, `save_knowledge_embeddings`) 외의 쓰기를 한다.
- 채팅 내용, 질문, 모델 응답을 로그나 DB에 저장한다(신입이 "담당자에게 등록 요청"으로 직접 보낸 질문은 예외).
- 모델이 표시한 근거를 확인하지 않고 그대로 `sources`로 내보낸다(서버가 이번 요청에서 넘긴 자료의 키가 아니면 버려야 한다).

### 웹

- 모델 응답, 지식 본문, 사용자 입력을 `dangerouslySetInnerHTML`이나 마크다운 렌더러로 HTML로 그린다(텍스트로만 표시하거나, 쓰는 경우 정화 필수).
- 로그인 화면의 데모 계정 버튼과 비밀번호가 개발 모드(`import.meta.env.DEV`) 밖에서 렌더링되거나 번들에 들어간다.
- 401 응답에서 로그아웃하지 않고 이전 사용자 정보가 화면에 남는다.

### 배포 설정

- 에이전트 서비스 CORS가 `*`이거나 허용 목록 밖의 출처를 받는다.
- 운영 배포가 `v*` 태그 외의 계기로 실행된다.
- Cloud Run이나 Firebase 설정에 비밀값을 평문 환경변수로 넣는다(Secret Manager 참조만 허용).
- `noindex` 설정이 빠진다.

## 데이터 규칙

- 실명, 주민번호, 계좌번호, 카드번호, 지문 관련 필드나 값을 만들지 않는다. 회사 CI(회사명 Blueward·로고·테마 색상)는 화면 브랜딩과 시드 조직명에만 쓴다.
- 파일 업로드는 담당자의 과제 서식(docx·xlsx·pdf)과 가상 규정 문서(docx·pdf)만 허용한다(10MB 이하). 시드 서식(`supabase/seed-forms/`)과 시드 규정 문서(`supabase/seed-docs/`)도 가상 내용만 담는다. 업로드 영역에 "가상 서식만 올려 주세요", "가상 문서만 올려 주세요"를 안내한다.
- 경영지원 원본 업무 문서나 실제 사내 규정을 저장소, 시드, 스테이징·운영 데이터에 넣지 않는다.
- 이 중 하나라도 PR에 보이면 P0로 지적한다.