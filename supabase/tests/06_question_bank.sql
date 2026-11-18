-- 문제은행·응시 기록 테스트. 픽스처는 이 파일 안에서 만들고 끝나면 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- ── 픽스처 (postgres 권한) ───────────────────────────────────────────
-- 조직 O, 팀 T(우리 팀)·T2(다른 팀). 사람은 모두 가상.
insert into public.orgs (id, name) values
  ('a6000000-0000-0000-0000-000000000001', '테스트 가상 조직');
insert into public.teams (id, org_id, name, org_line) values
  ('a6000000-0000-0000-0000-0000000000a1', 'a6000000-0000-0000-0000-000000000001', '팀T',  '{팀T}'),
  ('a6000000-0000-0000-0000-0000000000a2', 'a6000000-0000-0000-0000-000000000001', '팀T2', '{팀T2}');

insert into auth.users (id, email) values
  ('a6000000-0000-0000-0000-000000000101', 'new-a@bank.test'),
  ('a6000000-0000-0000-0000-000000000201', 'trainer@bank.test'),
  ('a6000000-0000-0000-0000-000000000202', 'trainer2@bank.test'),
  ('a6000000-0000-0000-0000-000000000301', 'ga@bank.test'),
  ('a6000000-0000-0000-0000-000000000401', 'admin@bank.test');

insert into public.profiles (id, org_id, email, full_name, job_title, role, department, team_id, hire_date) values
  ('a6000000-0000-0000-0000-000000000101', 'a6000000-0000-0000-0000-000000000001', 'new-a@bank.test',    '신입A',  '사원', 'new_hire',     null, 'a6000000-0000-0000-0000-0000000000a1', current_date),
  ('a6000000-0000-0000-0000-000000000201', 'a6000000-0000-0000-0000-000000000001', 'trainer@bank.test',  '교육',   '책임', 'team_trainer', null, 'a6000000-0000-0000-0000-0000000000a1', null),
  ('a6000000-0000-0000-0000-000000000202', 'a6000000-0000-0000-0000-000000000001', 'trainer2@bank.test', '교육2',  '책임', 'team_trainer', null, 'a6000000-0000-0000-0000-0000000000a2', null),
  ('a6000000-0000-0000-0000-000000000301', 'a6000000-0000-0000-0000-000000000001', 'ga@bank.test',       '총무',   '대리', 'ops_staff',    'ga', null, null),
  ('a6000000-0000-0000-0000-000000000401', 'a6000000-0000-0000-0000-000000000001', 'admin@bank.test',    '관리',   '관리자', 'admin',      null, null, null);

insert into public.task_templates (id, org_id, code, title, stage, department, team_id, kind, completion_mode) values
  ('a6000000-0000-0000-0000-000000000501', 'a6000000-0000-0000-0000-000000000001', 'B-AS1', '팀 평가', 'week1', null,
   'a6000000-0000-0000-0000-0000000000a1', 'assessment', 'staff_only'),
  ('a6000000-0000-0000-0000-000000000502', 'a6000000-0000-0000-0000-000000000001', 'B-R1',  '팀 읽기', 'day1', null,
   'a6000000-0000-0000-0000-0000000000a1', 'read', 'self');

insert into public.task_instances (id, org_id, template_id, new_hire_id, status) values
  ('a6000000-0000-0000-0000-000000000551', 'a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000501',
   'a6000000-0000-0000-0000-000000000101', 'todo'),
  ('a6000000-0000-0000-0000-000000000552', 'a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000502',
   'a6000000-0000-0000-0000-000000000101', 'todo');

-- 응시 기록이 하나라도 있어야 "0행" 단언이 의미가 있다
insert into public.exams (id, org_id, team_id, title, topic, difficulty, status) values
  ('a6000000-0000-0000-0000-000000000600', 'a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a1',
   '픽스처 시험', '픽스처', 'beginner', 'final');
insert into public.exam_sittings (org_id, exam_id, task_instance_id) values
  ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000600', 'a6000000-0000-0000-0000-000000000551');

-- ════ Task 1: 스키마·RLS ════════════════════════════════════════════
select has_table('public', 'question_bank_items', '문제은행 테이블');
select has_table('public', 'exam_sittings', '응시 기록 테이블');
select has_column('public', 'exam_questions', 'bank_item_id', 'exam_questions.bank_item_id');

-- ── 교육 담당자(T) ──────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-0000-0000-000000000201';

select lives_ok(
  $$insert into public.question_bank_items (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
    values ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a1',
            '주제', 'beginner', 'a  b', '답', '기준', 10, 'manual')$$,
  'trainer: 우리 팀 은행 insert');
select results_eq('select count(*) from public.question_bank_items', array[1::bigint],
  'trainer: 우리 팀 은행 select');
select results_eq(
  $$update public.question_bank_items set status = 'hidden' where prompt = 'a  b' returning status::text$$,
  array['hidden'], 'trainer: 우리 팀 은행 update');
select results_eq('select created_by from public.question_bank_items',
  array['a6000000-0000-0000-0000-000000000201'::uuid], 'trainer: 은행 created_by는 본인');
select throws_ok(
  $$insert into public.question_bank_items (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
    values ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a2',
            '주제', 'beginner', '다른 팀 문제', '답', '기준', 10, 'manual')$$,
  '42501', null, 'trainer: 다른 팀 은행 insert 불가');
select throws_ok(
  $$insert into public.question_bank_items (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
    values ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a1',
            '주제', 'beginner', ' a b ', '답', '기준', 10, 'manual')$$,
  '23505', null, 'trainer: 공백만 다른 같은 문제는 같은 팀에 두 번 못 넣는다');
select throws_ok(
  $$insert into public.exam_sittings (org_id, exam_id, task_instance_id)
    values ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000600',
            'a6000000-0000-0000-0000-000000000552')$$,
  '42501', null, 'trainer: exam_sittings 직접 insert 불가');
select throws_ok('delete from public.question_bank_items', '42501', null, 'trainer: 은행 delete 권한 없음');

-- ── 교육 담당자2(T2), 신입A, 총무, 관리자: 은행·응시 기록 0행 ────────
set local request.jwt.claim.sub = 'a6000000-0000-0000-0000-000000000202';
select is_empty('select 1 from public.question_bank_items', 'trainer2: 다른 팀 은행 0행');
select is_empty('select 1 from public.exam_sittings', 'trainer2: 다른 팀 응시 기록 0행');
-- 다른 팀에는 같은 문제를 넣을 수 있다
select lives_ok(
  $$insert into public.question_bank_items (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
    values ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a2',
            '주제', 'beginner', 'a  b', '답', '기준', 10, 'manual')$$,
  'trainer2: 다른 팀에 같은 문제 insert');

set local request.jwt.claim.sub = 'a6000000-0000-0000-0000-000000000101';
select is_empty('select 1 from public.question_bank_items union all select 1 from public.exam_sittings',
  '신입A: 은행·응시 기록 0행');

set local request.jwt.claim.sub = 'a6000000-0000-0000-0000-000000000301';
select is_empty('select 1 from public.question_bank_items union all select 1 from public.exam_sittings',
  'ga: 은행·응시 기록 0행');

set local request.jwt.claim.sub = 'a6000000-0000-0000-0000-000000000401';
select is_empty('select 1 from public.question_bank_items union all select 1 from public.exam_sittings',
  'admin: 은행·응시 기록 0행');

-- ── anon ────────────────────────────────────────────────────────────
set local role anon;
select throws_ok('select 1 from public.question_bank_items', '42501', null, 'anon: 은행 권한 없음');
reset role;

select * from finish();
rollback;
