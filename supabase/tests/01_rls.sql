-- RLS·권한 테스트. 픽스처는 이 파일 안에서 만들고 끝나면 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ── 픽스처 (postgres 권한) ───────────────────────────────────────────
-- 조직 O, 팀 T(우리 팀)·T2(다른 팀). 사람은 모두 가상.
insert into public.orgs (id, name) values
  ('a1000000-0000-0000-0000-000000000001', '테스트 가상 조직');
insert into public.teams (id, org_id, name, org_line) values
  ('a1000000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000001', '팀T',  '{팀T,그룹,본부}'),
  ('a1000000-0000-0000-0000-0000000000a2', 'a1000000-0000-0000-0000-000000000001', '팀T2', '{팀T2,그룹,본부}');

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000101', 'new-a@rls.test'),
  ('a1000000-0000-0000-0000-000000000102', 'new-b@rls.test'),
  ('a1000000-0000-0000-0000-000000000103', 'new-c@rls.test'),
  ('a1000000-0000-0000-0000-000000000201', 'trainer@rls.test'),
  ('a1000000-0000-0000-0000-000000000301', 'ga@rls.test'),
  ('a1000000-0000-0000-0000-000000000302', 'hr@rls.test'),
  ('a1000000-0000-0000-0000-000000000401', 'admin@rls.test');

insert into public.profiles (id, org_id, email, full_name, job_title, role, department, team_id, hire_date) values
  ('a1000000-0000-0000-0000-000000000101', 'a1000000-0000-0000-0000-000000000001', 'new-a@rls.test',   '신입A', '사원', 'new_hire',     null, 'a1000000-0000-0000-0000-0000000000a1', current_date),
  ('a1000000-0000-0000-0000-000000000102', 'a1000000-0000-0000-0000-000000000001', 'new-b@rls.test',   '신입B', '사원', 'new_hire',     null, 'a1000000-0000-0000-0000-0000000000a1', current_date),
  ('a1000000-0000-0000-0000-000000000103', 'a1000000-0000-0000-0000-000000000001', 'new-c@rls.test',   '신입C', '사원', 'new_hire',     null, 'a1000000-0000-0000-0000-0000000000a2', current_date),
  ('a1000000-0000-0000-0000-000000000201', 'a1000000-0000-0000-0000-000000000001', 'trainer@rls.test', '교육',  '책임', 'team_trainer', null, 'a1000000-0000-0000-0000-0000000000a1', null),
  ('a1000000-0000-0000-0000-000000000301', 'a1000000-0000-0000-0000-000000000001', 'ga@rls.test',      '총무',  '대리', 'ops_staff',    'ga', null, null),
  ('a1000000-0000-0000-0000-000000000302', 'a1000000-0000-0000-0000-000000000001', 'hr@rls.test',      '인사',  '대리', 'ops_staff',    'hr', null, null),
  ('a1000000-0000-0000-0000-000000000401', 'a1000000-0000-0000-0000-000000000001', 'admin@rls.test',   '관리',  '관리자', 'admin',      null, null, null);

insert into public.task_templates (id, org_id, code, title, stage, department, team_id, kind, completion_mode) values
  ('a1000000-0000-0000-0000-000000000501', 'a1000000-0000-0000-0000-000000000001', 'R-G1',  '총무 과제', 'day1', 'ga', null, 'ops', 'confirm'),
  ('a1000000-0000-0000-0000-000000000502', 'a1000000-0000-0000-0000-000000000001', 'R-H1',  '인사 과제', 'day1', 'hr', null, 'ops', 'confirm'),
  ('a1000000-0000-0000-0000-000000000503', 'a1000000-0000-0000-0000-000000000001', 'R-A1',  '팀 읽기',   'day1', null, 'a1000000-0000-0000-0000-0000000000a1', 'read', 'self'),
  ('a1000000-0000-0000-0000-000000000504', 'a1000000-0000-0000-0000-000000000001', 'R-AS1', '팀 평가',   'week1', null, 'a1000000-0000-0000-0000-0000000000a1', 'assessment', 'staff_only'),
  ('a1000000-0000-0000-0000-000000000505', 'a1000000-0000-0000-0000-000000000001', 'R-C1',  '다른 팀',   'day1', null, 'a1000000-0000-0000-0000-0000000000a2', 'read', 'self');

-- 신입A 4개, 신입B 2개, 신입C 2개
insert into public.task_instances (org_id, template_id, new_hire_id, status) values
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000501', 'a1000000-0000-0000-0000-000000000101', 'todo'),
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000502', 'a1000000-0000-0000-0000-000000000101', 'todo'),
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000503', 'a1000000-0000-0000-0000-000000000101', 'todo'),
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000504', 'a1000000-0000-0000-0000-000000000101', 'todo'),
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000501', 'a1000000-0000-0000-0000-000000000102', 'todo'),
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000503', 'a1000000-0000-0000-0000-000000000102', 'todo'),
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000505', 'a1000000-0000-0000-0000-000000000103', 'todo'),
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000501', 'a1000000-0000-0000-0000-000000000103', 'todo');

insert into public.knowledge_items (org_id, scope, team_id, question, answer, status) values
  ('a1000000-0000-0000-0000-000000000001', 'company', null, '공통 게시', '답', 'published'),
  ('a1000000-0000-0000-0000-000000000001', 'company', null, '공통 초안', '답', 'draft'),
  ('a1000000-0000-0000-0000-000000000001', 'team', 'a1000000-0000-0000-0000-0000000000a1', '팀T 게시', '답', 'published'),
  ('a1000000-0000-0000-0000-000000000001', 'team', 'a1000000-0000-0000-0000-0000000000a1', '팀T 초안', '답', 'draft'),
  ('a1000000-0000-0000-0000-000000000001', 'team', 'a1000000-0000-0000-0000-0000000000a2', '팀T2 게시', '답', 'published');

insert into public.exams (id, org_id, team_id, title, topic, difficulty, created_by) values
  ('a1000000-0000-0000-0000-000000000601', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1',
   'JS 기초', 'JavaScript', 'beginner', 'a1000000-0000-0000-0000-000000000201');
insert into public.exam_questions (org_id, exam_id, position, prompt, model_answer, rubric, points) values
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000601', 1, '문제', '답', '기준', 10);

-- ── 신입A ───────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000101';

select results_eq('select count(*) from public.task_instances', array[4::bigint],
  '신입A: 본인 인스턴스 4개만 보인다');
select is_empty($$select 1 from public.task_instances where new_hire_id <> 'a1000000-0000-0000-0000-000000000101'$$,
  '신입A: 다른 신입 인스턴스 0행');
select is_empty('select 1 from public.exams', '신입A: exams 0행');
select is_empty('select 1 from public.exam_questions', '신입A: exam_questions 0행');
select is_empty($$select 1 from public.knowledge_items where status = 'draft'$$, '신입A: 초안 지식 0행');
select is_empty($$select 1 from public.knowledge_items where team_id = 'a1000000-0000-0000-0000-0000000000a2'$$,
  '신입A: 다른 팀 지식 0행');
select results_eq('select count(*) from public.knowledge_items', array[2::bigint],
  '신입A: 게시된 회사 공통 + 우리 팀 지식 2개');
select results_eq('select id from public.profiles', array['a1000000-0000-0000-0000-000000000101'::uuid],
  '신입A: profiles는 본인 1행');
-- 직접 update는 권한이 없다(상태 변경은 RPC로만)
select throws_ok($$update public.task_instances set status = 'done'$$, '42501', null,
  '신입A: task_instances 직접 update 불가');

-- ── 총무(ga) ────────────────────────────────────────────────────────
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000301';
select results_eq('select count(*) from public.task_instances', array[3::bigint],
  'ga: 총무 템플릿 인스턴스 3개');
select is_empty($$select 1 from public.task_instances i join public.task_templates t on t.id = i.template_id
                  where t.department is distinct from 'ga'$$,
  'ga: 보이는 인스턴스의 부서가 전부 ga');
select is_empty($$select 1 from public.task_instances i join public.task_templates t on t.id = i.template_id
                  where t.kind = 'assessment'$$,
  'ga: assessment 과제 0행');
select results_eq($$select question from public.knowledge_items where scope = 'company' order by question$$,
  array['공통 게시', '공통 초안'], 'ga: 회사 공통 지식은 초안까지 보인다');

-- ── 교육 담당자(팀T) ────────────────────────────────────────────────
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000201';
select results_eq('select count(*) from public.task_instances', array[3::bigint],
  'trainer: 우리 팀 템플릿 인스턴스 3개');
select is_empty($$select 1 from public.task_instances i join public.task_templates t on t.id = i.template_id
                  where t.team_id is distinct from 'a1000000-0000-0000-0000-0000000000a1'$$,
  'trainer: 보이는 인스턴스의 팀이 전부 우리 팀');
select results_eq('select count(*) from public.profiles', array[3::bigint],
  'trainer: 본인 + 우리 팀 신입 2명');
select results_eq($$select question from public.knowledge_items where scope = 'team' order by question$$,
  array['팀T 게시', '팀T 초안'], 'trainer: 우리 팀 지식은 초안까지, 다른 팀은 안 보인다');
select results_eq('select count(*) from public.exam_questions', array[1::bigint],
  'trainer: 우리 팀 시험 문항이 보인다');

-- ── 관리자 ──────────────────────────────────────────────────────────
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000401';
select results_eq('select count(*) from public.profiles', array[7::bigint],
  'admin: 같은 조직 전체 사용자 7명(다른 조직 사용자는 안 보인다)');
select is_empty('select 1 from public.task_instances', 'admin: task_instances 0행');
select is_empty('select 1 from public.exams', 'admin: exams 0행');

-- ── anon ────────────────────────────────────────────────────────────
set local role anon;
select throws_ok('select 1 from public.profiles', '42501', null, 'anon: profiles 권한 없음');
select throws_ok('select 1 from public.task_instances', '42501', null, 'anon: task_instances 권한 없음');
select throws_ok('select 1 from public.knowledge_items', '42501', null, 'anon: knowledge_items 권한 없음');

select * from finish();
rollback;
