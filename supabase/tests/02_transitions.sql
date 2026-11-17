-- 상태 전이 RPC 테스트. 픽스처는 이 파일 안에서 만들고 끝나면 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ── 픽스처 ──────────────────────────────────────────────────────────
insert into public.orgs (id, name) values ('a2000000-0000-0000-0000-000000000001', '테스트 가상 조직');
insert into public.teams (id, org_id, name) values
  ('a2000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000001', '팀T'),
  ('a2000000-0000-0000-0000-0000000000a2', 'a2000000-0000-0000-0000-000000000001', '팀T2');

insert into auth.users (id, email) values
  ('a2000000-0000-0000-0000-000000000101', 'new@tr.test'),
  ('a2000000-0000-0000-0000-000000000102', 'new-nohq@tr.test'),
  ('a2000000-0000-0000-0000-000000000201', 'trainer@tr.test'),
  ('a2000000-0000-0000-0000-000000000301', 'hr@tr.test'),
  ('a2000000-0000-0000-0000-000000000302', 'ga@tr.test'),
  ('a2000000-0000-0000-0000-000000000401', 'admin@tr.test');

insert into public.profiles (id, org_id, email, full_name, role, department, team_id, hire_date, needs_hq_access) values
  ('a2000000-0000-0000-0000-000000000101', 'a2000000-0000-0000-0000-000000000001', 'new@tr.test',      '신입',     'new_hire',     null, 'a2000000-0000-0000-0000-0000000000a1', date '2026-11-16', true),
  ('a2000000-0000-0000-0000-000000000102', 'a2000000-0000-0000-0000-000000000001', 'new-nohq@tr.test', '신입2',    'new_hire',     null, 'a2000000-0000-0000-0000-0000000000a1', date '2026-11-16', false),
  ('a2000000-0000-0000-0000-000000000201', 'a2000000-0000-0000-0000-000000000001', 'trainer@tr.test',  '교육',     'team_trainer', null, 'a2000000-0000-0000-0000-0000000000a1', null, true),
  ('a2000000-0000-0000-0000-000000000301', 'a2000000-0000-0000-0000-000000000001', 'hr@tr.test',       '인사',     'ops_staff',    'hr', null, null, true),
  ('a2000000-0000-0000-0000-000000000302', 'a2000000-0000-0000-0000-000000000001', 'ga@tr.test',       '총무',     'ops_staff',    'ga', null, null, true),
  ('a2000000-0000-0000-0000-000000000401', 'a2000000-0000-0000-0000-000000000001', 'admin@tr.test',    '관리',     'admin',        null, null, null, true);

insert into public.task_templates
  (org_id, code, title, stage, department, team_id, kind, completion_mode, allow_na, requires_hq_access, prerequisite_codes, checklist, due_offset_days)
values
  ('a2000000-0000-0000-0000-000000000001', 'P1',   '선행1',   'day1',  'hr',         null, 'ops', 'confirm',    false, false, '{}',       null, 0),
  ('a2000000-0000-0000-0000-000000000001', 'P2',   '선행2',   'week1', 'hr',         null, 'ops', 'confirm',    false, false, '{P1}',     null, 5),
  ('a2000000-0000-0000-0000-000000000001', 'S1',   '셀프',    'day1',  'ga',         null, 'ops', 'self',       false, false, '{}',       null, 0),
  ('a2000000-0000-0000-0000-000000000001', 'ST1',  '담당자',  'week1', 'ga',         null, 'ops', 'staff_only', false, false, '{}',       null, 5),
  ('a2000000-0000-0000-0000-000000000001', 'N1',   '해당없음', 'week1', 'accounting', null, 'ops', 'confirm',    true,  false, '{}',       null, 5),
  ('a2000000-0000-0000-0000-000000000001', 'SET1', '세팅',    'week1', null, 'a2000000-0000-0000-0000-0000000000a1', 'setup', 'self', false, false, '{}',
     '["항목1", "항목2"]'::jsonb, 5),
  ('a2000000-0000-0000-0000-000000000001', 'AS1',  '평가',    'week1', null, 'a2000000-0000-0000-0000-0000000000a1', 'assessment', 'staff_only', false, false, '{}', null, 5),
  ('a2000000-0000-0000-0000-000000000001', 'HQ1',  '본사',    'day1',  'ga',         null, 'ops', 'staff_only', false, true,  '{}',       null, 0),
  ('a2000000-0000-0000-0000-000000000001', 'M1',   '선행 둘', 'month1', 'hr',        null, 'ops', 'confirm',    false, false, '{P1,S1}',  null, 30),
  -- 다른 팀 템플릿: 팀T 신입에게 만들어지지 않아야 한다
  ('a2000000-0000-0000-0000-000000000001', 'OT1',  '다른 팀', 'day1',  null, 'a2000000-0000-0000-0000-0000000000a2', 'read', 'self', false, false, '{}', null, 0);

-- 테스트 편의 함수: 코드로 인스턴스 id·상태 조회 (RLS 우회)
create function pg_temp.iid(p_code text, p_hire uuid default 'a2000000-0000-0000-0000-000000000101')
returns uuid language sql security definer as $$
  select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
  where t.code = p_code and i.new_hire_id = p_hire $$;
create function pg_temp.st(p_code text, p_hire uuid default 'a2000000-0000-0000-0000-000000000101')
returns text language sql security definer as $$
  select i.status::text from public.task_instances i join public.task_templates t on t.id = i.template_id
  where t.code = p_code and i.new_hire_id = p_hire $$;

-- ── 실행 권한 ───────────────────────────────────────────────────────
select ok(not has_function_privilege('authenticated', 'public._start_onboarding(uuid)', 'execute'),
  '_start_onboarding: authenticated 실행 불가');
select ok(not has_function_privilege('anon', 'public._start_onboarding(uuid)', 'execute'),
  '_start_onboarding: anon 실행 불가');
select ok(not has_function_privilege('anon', 'public.submit_task(uuid, jsonb)', 'execute'),
  'submit_task: anon 실행 불가');

-- ── start_onboarding ────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000301';  -- hr
select is(public.start_onboarding('a2000000-0000-0000-0000-000000000101'), 9, 'ops가 start_onboarding → 9개 생성');
select is(public.start_onboarding('a2000000-0000-0000-0000-000000000101'), 0, '다시 호출 → 0개');

set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000101';  -- 신입
select throws_ok($$select public.start_onboarding('a2000000-0000-0000-0000-000000000102')$$,
  null, null, '신입이 start_onboarding 호출 → 예외');

set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000401';  -- admin
select lives_ok($$select public.start_onboarding('a2000000-0000-0000-0000-000000000102')$$,
  'admin이 start_onboarding 호출 → 예외 없음');

select is(pg_temp.st('OT1'), null, '다른 팀 템플릿은 만들어지지 않는다');

-- ── 선행 관계와 confirm ─────────────────────────────────────────────
select is(pg_temp.st('P2'), 'blocked', 'P2 초기 상태 = blocked');
select is(pg_temp.st('P1'), 'todo', 'P1 초기 상태 = todo');

set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000101';  -- 신입 본인으로 조회
select is((select due_date from public.task_instances where id = pg_temp.iid('P2')), date '2026-11-21',
  'due_date = hire_date + due_offset_days');
select is((public.submit_task(pg_temp.iid('P1'))).status::text, 'submitted', 'P1 submit → submitted');
select is((public.submit_task(pg_temp.iid('P1'))).status::text, 'submitted',
  'submitted 과제에 submit 재호출 → 예외 없이 submitted');

set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000302';  -- ga
select throws_ok(format('select public.confirm_task(%L)', pg_temp.iid('P1')), null, null,
  '다른 부서(ga)가 P1 confirm → 예외');

set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000301';  -- hr
select is((public.confirm_task(pg_temp.iid('P1'))).status::text, 'done', 'hr가 P1 confirm → done');
select is(pg_temp.st('P2'), 'todo', 'P1 done → P2 = todo');
select is(pg_temp.st('M1'), 'blocked', 'M1: P1만 done이면 blocked');
select is((public.confirm_task(pg_temp.iid('P1'))).status::text, 'done',
  'done 과제에 confirm 재호출 → 예외 없이 done');

set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000101';  -- 신입
select is((public.submit_task(pg_temp.iid('S1'))).status::text, 'done', 'S1(self) submit → done');
select is(pg_temp.st('M1'), 'todo', 'M1: S1까지 done이면 todo');
select throws_ok(format('select public.submit_task(%L)', pg_temp.iid('ST1')), null, null,
  'staff_only 과제를 신입이 submit → 예외');

-- ── 해당 없음 ───────────────────────────────────────────────────────
select throws_ok(format('select public.mark_na(%L, %L)', pg_temp.iid('P2'), '사유'), null, null,
  'allow_na=false 과제 mark_na → 예외');
select throws_ok(format('select public.mark_na(%L, %L)', pg_temp.iid('N1'), ''), null, null,
  'mark_na 사유 공백 → 예외');
select is((public.mark_na(pg_temp.iid('N1'), '해당 없음')).status::text, 'na', 'mark_na 정상 → na');

-- ── 보완 요청 ───────────────────────────────────────────────────────
select is((public.submit_task(pg_temp.iid('M1'))).status::text, 'submitted', 'M1 submit → submitted');
set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000301';  -- hr
select throws_ok(format('select public.request_rework(%L, %L)', pg_temp.iid('M1'), '  '), null, null,
  'request_rework 사유 공백 → 예외');
select is((public.request_rework(pg_temp.iid('M1'), '서류를 다시 확인해 주세요')).status::text, 'rework',
  'request_rework → rework');
set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000101';  -- 신입
select is((public.submit_task(pg_temp.iid('M1'))).status::text, 'submitted', 'rework 후 재제출 → submitted');

-- ── setup 체크리스트 ────────────────────────────────────────────────
select throws_ok(format('select public.submit_task(%L, %L::jsonb)', pg_temp.iid('SET1'), '{"checked":["항목1"]}'),
  null, null, 'SET1: 체크 일부만 → 예외');
select is((public.submit_task(pg_temp.iid('SET1'), '{"checked":["항목1","항목2"]}')).status::text, 'done',
  'SET1: 전부 체크 → done');

-- ── 평가 기록 ───────────────────────────────────────────────────────
set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000301';  -- hr
select throws_ok(format('select public.record_assessment(%L, null, %L)', pg_temp.iid('AS1'), '메모'), null, null,
  'ops가 record_assessment → 예외');
set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000201';  -- trainer
select is((public.record_assessment(pg_temp.iid('AS1'), null, '일정 잡음',
           timestamptz '2026-11-20 10:00+09', '회의실 A')).status::text, 'todo',
  'trainer, result=null → 상태 유지');
select is((select scheduled_at from public.task_instances where id = pg_temp.iid('AS1')),
  timestamptz '2026-11-20 10:00+09', 'trainer, result=null → scheduled_at 저장');
select is((public.record_assessment(pg_temp.iid('AS1'), 'pass', '통과')).status::text, 'done',
  'trainer, result=pass → done');

-- ── 미답변 해결 ─────────────────────────────────────────────────────
set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000101';  -- 신입이 미답변 기록
insert into public.unanswered_questions (id, org_id, asked_by, team_id, question) values
  ('a2000000-0000-0000-0000-000000000701', 'a2000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000101', 'a2000000-0000-0000-0000-0000000000a1', '동호회 가입비는?');
set local request.jwt.claim.sub = 'a2000000-0000-0000-0000-000000000201';  -- trainer
select results_eq(
  $$select scope::text, status::text from public.resolve_unanswered(
      'a2000000-0000-0000-0000-000000000701', '동호회 가입비는?', '가상 값: 월 1만 원', '복지')$$,
  $$values ('team', 'published')$$,
  'trainer resolve_unanswered → team 범위 게시 지식');
select is((select status::text from public.unanswered_questions where id = 'a2000000-0000-0000-0000-000000000701'),
  'resolved', '미답변 status = resolved');

-- ── 본사 출입 대상 아님 ─────────────────────────────────────────────
select is(pg_temp.st('HQ1', 'a2000000-0000-0000-0000-000000000102'), 'na',
  'needs_hq_access=false 신입: HQ1 = na');

select * from finish();
rollback;
