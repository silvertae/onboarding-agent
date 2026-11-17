-- 데모 조직 데이터·초기화 테스트. 시드 조직(Blueward)에 픽스처 사용자를 더해 확인하고 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ── 시드 데이터 ─────────────────────────────────────────────────────
select is((select name from public.orgs where id = '00000000-0000-0000-0000-000000000001'), 'Blueward',
  '시드 조직명 = 회사명 Blueward');
select is((select org_id from public.teams where id = '00000000-0000-0000-0000-000000000002'),
  '00000000-0000-0000-0000-000000000001'::uuid, 'AI팀 고정 ID');
select is((select count(*)::int from public.task_templates where org_id = '00000000-0000-0000-0000-000000000001'), 31,
  '템플릿 31개');
select is((select count(*)::int from public.knowledge_items
            where org_id = '00000000-0000-0000-0000-000000000001' and status = 'published'), 30,
  '게시 지식 30개');
select is((select count(*)::int from public.knowledge_items where question ilike '%가입비%'), 0,
  '"가입비" 지식은 일부러 없다(미답변 시연용)');
select is(public.seed_demo_knowledge('00000000-0000-0000-0000-000000000001'), 0,
  '지식이 이미 있으면 seed_demo_knowledge는 아무것도 넣지 않는다(재실행 안전)');
select ok(not has_function_privilege('authenticated', 'public.seed_demo_knowledge(uuid)', 'execute'),
  'seed_demo_knowledge: authenticated 실행 불가');

-- ── 픽스처: 시드 신입(is_seed), 관리자가 만든 신입, 관리자, 교육 담당자 ───
insert into auth.users (id, email) values
  ('a4000000-0000-0000-0000-000000000101', 'seed-new@demo-data.test'),
  ('a4000000-0000-0000-0000-000000000102', 'made-new@demo-data.test'),
  ('a4000000-0000-0000-0000-000000000201', 'trainer@demo-data.test'),
  ('a4000000-0000-0000-0000-000000000401', 'admin@demo-data.test');
insert into public.profiles (id, org_id, email, full_name, role, team_id, hire_date, is_seed) values
  ('a4000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'seed-new@demo-data.test', '시드 신입',
   'new_hire', '00000000-0000-0000-0000-000000000002', date '2026-11-01', true),
  ('a4000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'made-new@demo-data.test', '등록 신입',
   'new_hire', '00000000-0000-0000-0000-000000000002', date '2026-11-01', false),
  ('a4000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'trainer@demo-data.test', '교육',
   'team_trainer', '00000000-0000-0000-0000-000000000002', null, true);
insert into public.profiles (id, org_id, email, full_name, role, is_seed) values
  ('a4000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 'admin@demo-data.test', '관리자',
   'admin', true);

create function pg_temp.st(p_code text, p_hire uuid) returns text language sql security definer as $$
  select i.status::text from public.task_instances i join public.task_templates t on t.id = i.template_id
  where t.code = p_code and i.new_hire_id = p_hire $$;

select is(public._start_onboarding('a4000000-0000-0000-0000-000000000101'), 31, '시드 신입 _start_onboarding → 31');
select is(pg_temp.st('HR-03', 'a4000000-0000-0000-0000-000000000101'), 'blocked', 'HR-03 = blocked (선행 HR-02)');
select is(pg_temp.st('GA-08', 'a4000000-0000-0000-0000-000000000101'), 'todo', 'GA-08 = todo');
select public._start_onboarding('a4000000-0000-0000-0000-000000000102');

-- ── 데모 사용으로 상태를 바꾼다 ─────────────────────────────────────
create temp table original_answer as
  select id, answer from public.knowledge_items
   where org_id = '00000000-0000-0000-0000-000000000001' order by question limit 1;
update public.knowledge_items set answer = '심사위원이 바꾼 답'
 where id = (select id from original_answer);
insert into public.knowledge_items (org_id, scope, question, answer, status)
  values ('00000000-0000-0000-0000-000000000001', 'company', '심사위원이 추가한 질문', '답', 'published');
insert into public.unanswered_questions (org_id, asked_by, team_id, question)
  values ('00000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000101',
          '00000000-0000-0000-0000-000000000002', '동호회 가입비 얼마야?');
insert into public.exams (org_id, team_id, title, topic, difficulty)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '시험', 'JS', 'beginner');
update public.task_instances set status = 'done'
 where id in (select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
               where t.code = 'GA-08' and i.new_hire_id in ('a4000000-0000-0000-0000-000000000101',
                                                             'a4000000-0000-0000-0000-000000000102'));

-- ── 권한: 관리자만 초기화 ───────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = 'a4000000-0000-0000-0000-000000000201';  -- trainer
select throws_ok('select public.reset_demo()', null, null, 'trainer가 reset_demo → 예외');

set local request.jwt.claim.sub = 'a4000000-0000-0000-0000-000000000401';  -- admin
select lives_ok('select public.reset_demo()', 'admin이 reset_demo → 예외 없음');
reset role;

-- ── 초기화 결과 ─────────────────────────────────────────────────────
select is((select count(*)::int from public.knowledge_items
            where org_id = '00000000-0000-0000-0000-000000000001'), 30, '초기화 후 지식 30개');
select is((select k.answer from public.knowledge_items k join original_answer o using (id)), null,
  '수정된 지식 행은 지워지고');
select is((select k.answer from public.knowledge_items k
            where k.org_id = '00000000-0000-0000-0000-000000000001'
            order by k.question limit 1),
          (select answer from original_answer), '같은 질문이 수정 전 내용으로 다시 들어간다');
select is((select count(*)::int from public.unanswered_questions
            where org_id = '00000000-0000-0000-0000-000000000001'), 0, '초기화 후 미답변 0');
select is((select count(*)::int from public.exams where org_id = '00000000-0000-0000-0000-000000000001'), 0,
  '초기화 후 시험 0');
select results_eq(
  $$select count(*)::int, count(*) filter (where status = 'done')::int,
           bool_and(due_date >= (now() at time zone 'Asia/Seoul')::date)
      from public.task_instances where new_hire_id = 'a4000000-0000-0000-0000-000000000101'$$,
  $$values (31, 0, true)$$,
  '시드 신입: 인스턴스 31개, done 0, 입사일이 오늘로 바뀌어 기한도 오늘 이후');
select is(pg_temp.st('GA-08', 'a4000000-0000-0000-0000-000000000102'), 'done',
  '관리자가 만든 신입(is_seed=false)의 done 과제는 그대로');

select * from finish();
rollback;
