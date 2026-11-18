-- 과제 템플릿 관리 테스트(보관·한 사람용·시드 사본·조회 정책). 시드 조직에 픽스처를 더해 확인하고 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- ── 픽스처 ──────────────────────────────────────────────────────────
-- 시드 조직 O, AI팀(T), 다른 팀 T2. 사람은 모두 가상.
insert into public.teams (id, org_id, name, org_line) values
  ('a7000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', '팀T2', '{팀T2}');

insert into auth.users (id, email) values
  ('a7000000-0000-0000-0000-000000000101', 'new-a@tpl.test'),
  ('a7000000-0000-0000-0000-000000000102', 'new-b@tpl.test'),
  ('a7000000-0000-0000-0000-000000000103', 'new-c@tpl.test'),
  ('a7000000-0000-0000-0000-000000000104', 'new-d@tpl.test'),
  ('a7000000-0000-0000-0000-000000000201', 'trainer@tpl.test'),
  ('a7000000-0000-0000-0000-000000000202', 'trainer2@tpl.test'),
  ('a7000000-0000-0000-0000-000000000301', 'hr@tpl.test'),
  ('a7000000-0000-0000-0000-000000000302', 'ga@tpl.test'),
  ('a7000000-0000-0000-0000-000000000401', 'admin@tpl.test');

insert into public.profiles (id, org_id, email, full_name, role, department, team_id, hire_date) values
  ('a7000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'new-a@tpl.test', '신입A', 'new_hire', null, '00000000-0000-0000-0000-000000000002', date '2026-11-02'),
  ('a7000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'new-b@tpl.test', '신입B', 'new_hire', null, '00000000-0000-0000-0000-000000000002', date '2026-11-02'),
  ('a7000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'new-c@tpl.test', '신입C', 'new_hire', null, '00000000-0000-0000-0000-000000000002', date '2026-11-02'),
  ('a7000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'new-d@tpl.test', '신입D', 'new_hire', null, '00000000-0000-0000-0000-000000000002', date '2026-11-02'),
  ('a7000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'trainer@tpl.test', '교육', 'team_trainer', null, '00000000-0000-0000-0000-000000000002', null),
  ('a7000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', 'trainer2@tpl.test', '교육2', 'team_trainer', null, 'a7000000-0000-0000-0000-0000000000a2', null),
  ('a7000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'hr@tpl.test', '인사', 'ops_staff', 'hr', null, null),
  ('a7000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', 'ga@tpl.test', '총무', 'ops_staff', 'ga', null, null),
  ('a7000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 'admin@tpl.test', '관리', 'admin', null, null, null);

-- ── 시드 사본·단계 시작일 ───────────────────────────────────────────
select is((select count(*)::int from public.task_templates
            where org_id = '00000000-0000-0000-0000-000000000001' and is_seed), 31, '기존 시드 템플릿 31개는 모두 is_seed');
select is((select count(*)::int from private.task_template_seed), 31, 'private.task_template_seed 31행');
select is(private.stage_start_days('day1'), 0, 'stage_start_days(day1) = 0');
select is(private.stage_start_days('week1'), 5, 'stage_start_days(week1) = 5');
select is(private.stage_start_days('month1'), 30, 'stage_start_days(month1) = 30');
select is((select task_code_prefix from public.teams where id = '00000000-0000-0000-0000-000000000002'), 'AI',
  'AI팀 task_code_prefix = AI');
select ok(not has_table_privilege('authenticated', 'private.task_template_seed', 'select'),
  'task_template_seed: authenticated 읽기 불가');
select ok(not has_table_privilege('anon', 'private.task_template_seed', 'select'),
  'task_template_seed: anon 읽기 불가');

-- ── 시작 함수: 보관·한 사람용 제외 ──────────────────────────────────
update public.task_templates set archived_at = now()
 where org_id = '00000000-0000-0000-0000-000000000001' and code = 'AI-02';
insert into public.task_templates (id, org_id, code, title, stage, team_id, kind, completion_mode, assigned_to, is_seed) values
  ('a7000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', 'AI-X1', '신입A만 과제', 'day1',
   '00000000-0000-0000-0000-000000000002', 'ops', 'self', 'a7000000-0000-0000-0000-000000000101', false);

select is(public._start_onboarding('a7000000-0000-0000-0000-000000000103'), 30,
  '보관·한 사람용 제외하고 30개 생성');
select is((select count(*)::int from public.task_instances i join public.task_templates t on t.id = i.template_id
            where i.new_hire_id = 'a7000000-0000-0000-0000-000000000103' and t.code = 'AI-02'), 0,
  '보관한 템플릿은 새 신입에게 안 들어간다');
select is((select count(*)::int from public.task_instances i join public.task_templates t on t.id = i.template_id
            where i.new_hire_id = 'a7000000-0000-0000-0000-000000000103' and t.code = 'AI-X1'), 0,
  '한 사람용 템플릿은 다른 신입에게 안 들어간다');

-- 보관한 템플릿(AI-02)을 선행으로 둔 템플릿은 잠기지 않는다
insert into public.task_templates (id, org_id, code, title, stage, team_id, kind, completion_mode, prerequisite_codes) values
  ('a7000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001', 'AI-X2', '선행이 보관된 과제', 'week1',
   '00000000-0000-0000-0000-000000000002', 'ops', 'self', '{AI-02}');
select public._start_onboarding('a7000000-0000-0000-0000-000000000104');
select is((select i.status::text from public.task_instances i join public.task_templates t on t.id = i.template_id
            where i.new_hire_id = 'a7000000-0000-0000-0000-000000000104' and t.code = 'AI-X2'), 'todo',
  '보관한 선행을 둔 과제는 todo(잠기지 않음)');

-- ── 조회 정책 ───────────────────────────────────────────────────────
set local role authenticated;

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000102';
select is((select count(*)::int from public.task_templates where assigned_to = 'a7000000-0000-0000-0000-000000000101'), 0,
  '신입B: 신입A의 한 사람용 행은 안 보인다');
select ok((select count(*) from public.task_templates where assigned_to is null) > 0, '신입B: 일반 템플릿은 보인다');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000101';
select is((select count(*)::int from public.task_templates where assigned_to = 'a7000000-0000-0000-0000-000000000101'), 1,
  '신입A: 본인 한 사람용 행이 보인다');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000201';
select is((select count(*)::int from public.task_templates where assigned_to = 'a7000000-0000-0000-0000-000000000101'), 1,
  '교육 담당자: 한 사람용 행이 보인다');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000301';
select is((select count(*)::int from public.task_templates where assigned_to = 'a7000000-0000-0000-0000-000000000101'), 1,
  '경영지원: 한 사람용 행이 보인다');

-- ── anon ────────────────────────────────────────────────────────────
reset role;
set local role anon;
select throws_ok('select count(*) from public.task_templates', '42501', null, 'anon: task_templates 읽기 권한 오류');

select * from finish();
rollback;
