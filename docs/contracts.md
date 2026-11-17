# API·환경변수 계약

이 문서가 웹·에이전트·DB 사이의 기준이다. 바꿔야 하면 작업을 멈추고 보고한다(CLAUDE.md "작업 방식").
출처: 구현 계획 Task 1 Interfaces.

```
환경변수
  웹(빌드 시): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_AGENT_URL, VITE_ENV_LABEL(local|staging|prod)
  에이전트: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENAI_MODEL,
            ALLOWED_ORIGINS(쉼표 구분), ALLOWED_ORIGIN_REGEX(선택), GIT_SHA,
            CHAT_DAILY_LIMIT(기본 50), EXAM_DAILY_LIMIT(기본 10)
  부트스트랩: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL(기본 admin@demo.test), ADMIN_PASSWORD, DEMO_PASSWORD

에이전트 API (/health 외 모든 요청 Authorization: Bearer <Supabase access token>)
GET  /health          → {"ok":true,"version":string}
POST /chat            {message: string(1..1000), history: [{role:"user"|"assistant", text:string(..2000)}] (최대 10개)}
  → text/event-stream. 이벤트 data(JSON) 종류:
    {"type":"token","text":string}
    {"type":"sources","knowledge":[{"id":uuid,"question":string}],"tasks":[{"id":uuid,"code":string,"title":string}]}
    {"type":"unanswered"}            # 미답변으로 기록됨
    {"type":"error","message":string}
    {"type":"done"}
POST /exams/generate  {topic, difficulty:"beginner"|"intermediate", question_count:1..10, style?:string, new_hire_id?:uuid}
  → 200 {title:string, questions:[ExamQuestion]}
POST /exams/regenerate-question {topic, difficulty, existing_prompts:string[], instruction?:string}
  → 200 ExamQuestion
ExamQuestion = {prompt:string, model_answer:string, rubric:string, points:int}
POST /admin/users     {email, password(8자 이상), full_name, job_title,
                       role:"new_hire"|"team_trainer"|"ops_staff",
                       department?: ops_staff면 필수, team_id?: new_hire·team_trainer면 필수,
                       hire_date?: new_hire면 필수(YYYY-MM-DD), needs_hq_access?: 기본 true}
  → 201 {id: uuid}    # new_hire면 온보딩 과제까지 생성된 상태
오류: 401 토큰 없음/만료, 403 역할 불일치, 409 이미 있는 메일, 422 입력 오류,
      429 {"detail":"오늘 사용 한도를 넘었어요"}, 502 모델 출력 오류 {"detail":"..."}
```

## 보충 (Leo 승인, 2026-11-17)

- 에이전트가 시작할 때 반드시 있어야 하는 값은 `SUPABASE_URL`, `SUPABASE_ANON_KEY`뿐이다. 둘 중 하나라도 없으면 시작하지 않는다.
  `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`은 그 값을 쓰는 경로에서 확인한다.
- 로컬에서는 `.env` 파일을 쓰지 않는다. npm 스크립트가 `supabase status`에서 Supabase 값을 받아 환경변수로 넘긴다.
