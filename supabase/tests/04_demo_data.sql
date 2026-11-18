-- 데모 조직 데이터·초기화 테스트. 시드 조직(Blueward)에 픽스처 사용자를 더해 확인하고 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

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
select is((select count(*)::int from public.question_bank_items
            where org_id = '00000000-0000-0000-0000-000000000001'
              and team_id = '00000000-0000-0000-0000-000000000002'), 8,
  'AI팀 문제은행 시드 8개');
select is(public.seed_demo_bank('00000000-0000-0000-0000-000000000001'), 0,
  '은행이 이미 있으면 seed_demo_bank는 아무것도 넣지 않는다(재실행 안전)');
select ok(not has_function_privilege('authenticated', 'public.seed_demo_bank(uuid)', 'execute'),
  'seed_demo_bank: authenticated 실행 불가');

-- ── 픽스처: 시드 신입(is_seed), 관리자가 만든 신입, 관리자, 교육 담당자, 경영지원(hr) ───
insert into auth.users (id, email) values
  ('a4000000-0000-0000-0000-000000000101', 'seed-new@demo-data.test'),
  ('a4000000-0000-0000-0000-000000000102', 'made-new@demo-data.test'),
  ('a4000000-0000-0000-0000-000000000201', 'trainer@demo-data.test'),
  ('a4000000-0000-0000-0000-000000000301', 'hr@demo-data.test'),
  ('a4000000-0000-0000-0000-000000000401', 'admin@demo-data.test');
insert into public.profiles (id, org_id, email, full_name, role, team_id, hire_date, is_seed) values
  ('a4000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'seed-new@demo-data.test', '시드 신입',
   'new_hire', '00000000-0000-0000-0000-000000000002', date '2026-11-01', true),
  ('a4000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'made-new@demo-data.test', '등록 신입',
   'new_hire', '00000000-0000-0000-0000-000000000002', date '2026-11-01', false),
  ('a4000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'trainer@demo-data.test', '교육',
   'team_trainer', '00000000-0000-0000-0000-000000000002', null, true);
insert into public.profiles (id, org_id, email, full_name, role, department, is_seed) values
  ('a4000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'hr@demo-data.test', '인사',
   'ops_staff', 'hr', true),
  ('a4000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 'admin@demo-data.test', '관리자',
   'admin', null, true);

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
insert into public.exams (id, org_id, team_id, title, topic, difficulty, status)
  values ('a4000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002', '시험', 'JS', 'beginner', 'final');
-- 문제은행: 문항 하나 추가, 하나 숨김, 은행 문항이 든 시험을 평가 과제에 연결
insert into public.question_bank_items (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
          'JavaScript 기초', 'beginner', '심사위원이 추가한 문항', '답', '기준', 10, 'manual');
update public.question_bank_items set status = 'hidden'
 where id = (select id from public.question_bank_items
              where org_id = '00000000-0000-0000-0000-000000000001' and source = 'seed' order by id limit 1);
insert into public.exam_questions (org_id, exam_id, position, prompt, model_answer, rubric, points, bank_item_id)
  select org_id, 'a4000000-0000-0000-0000-000000000601', 1, prompt, model_answer, rubric, points, id
    from public.question_bank_items
   where org_id = '00000000-0000-0000-0000-000000000001' and source = 'seed' order by id limit 1;
insert into public.exam_sittings (org_id, exam_id, task_instance_id, bank_item_ids)
  select i.org_id, 'a4000000-0000-0000-0000-000000000601', i.id,
         array(select bank_item_id from public.exam_questions where exam_id = 'a4000000-0000-0000-0000-000000000601')
    from public.task_instances i join public.task_templates t on t.id = i.template_id
   where t.code = 'AI-10' and i.new_hire_id = 'a4000000-0000-0000-0000-000000000101';
update public.task_instances set status = 'done'
 where id in (select i.id from public.task_instances i join public.task_templates t on t.id = i.template_id
               where t.code = 'GA-08' and i.new_hire_id in ('a4000000-0000-0000-0000-000000000101',
                                                             'a4000000-0000-0000-0000-000000000102'));

-- 과제 템플릿·서식: 새 템플릿, 시드 제목 변경·보관, 한 사람용 과제, 담당자 서식, 기본 서식
-- 예전에 보관한 비시드 템플릿(보관 시각이 그대로인지 본다)
insert into public.task_templates (id, org_id, code, title, stage, team_id, kind, completion_mode, archived_at) values
  ('a4000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000001', 'DEMO-OLD', '예전에 보관한 과제', 'day1',
   '00000000-0000-0000-0000-000000000002', 'read', 'self', timestamptz '2026-01-02 09:00+09');

set local role authenticated;
set local request.jwt.claim.sub = 'a4000000-0000-0000-0000-000000000201';  -- trainer
select lives_ok($$select public.save_task_template(null, '심사위원이 만든 과제', '', 'practice', 'self', 'week1', 2, false,
                  null, '{}')$$,
  '교육 담당자: 새 템플릿 저장');
select lives_ok($$select public.save_task_template(t.id, '심사위원이 바꾼 제목', t.description, t.kind, t.completion_mode,
                  t.stage, t.due_offset_days - private.stage_start_days(t.stage), t.allow_na, t.checklist,
                  t.prerequisite_codes)
                  from public.task_templates t
                 where t.org_id = '00000000-0000-0000-0000-000000000001' and t.code = 'AI-02'$$,
  '교육 담당자: 시드 AI-02 제목 변경');
select lives_ok($$select public.archive_task_template(t.id) from public.task_templates t
                 where t.org_id = '00000000-0000-0000-0000-000000000001' and t.code = 'AI-03'$$,
  '교육 담당자: 시드 AI-03 보관');
select lives_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
                  select t.org_id, t.id, '심사위원 서식.pdf',
                         t.org_id || '/' || t.id || '/a4000000-0000-0000-0000-00000000c001.pdf', 1000,
                         'a4000000-0000-0000-0000-000000000201'
                    from public.task_templates t
                   where t.org_id = '00000000-0000-0000-0000-000000000001' and t.code = 'AI-01'$$,
  '교육 담당자: AI-01에 서식 추가');
set local request.jwt.claim.sub = 'a4000000-0000-0000-0000-000000000301';  -- 경영지원(hr)
select lives_ok($$select public.add_task_for_hire('a4000000-0000-0000-0000-000000000101', '시드 신입 한 사람용', '', 'ops',
                  'self', 'day1', 0, false, null)$$,
  '경영지원: 시드 신입에게 한 사람용 과제 추가');
select lives_ok($$select public.add_task_for_hire('a4000000-0000-0000-0000-000000000102', '등록 신입 한 사람용', '', 'ops',
                  'self', 'day1', 0, false, null)$$,
  '경영지원: 등록 신입에게 한 사람용 과제 추가');
reset role;

set local role service_role;  -- 기본 서식은 service_role로 넣는다
select lives_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, is_seed)
                  select t.org_id, t.id, '기본 서식.pdf',
                         t.org_id || '/' || t.id || '/a4000000-0000-0000-0000-00000000c002.pdf', 2000, true
                    from public.task_templates t
                   where t.org_id = '00000000-0000-0000-0000-000000000001' and t.code = 'AI-01'$$,
  'service_role: AI-01에 기본 서식 추가');
reset role;

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
select is((select count(*)::int from public.question_bank_items
            where org_id = '00000000-0000-0000-0000-000000000001'), 8,
  '초기화 후 문제은행 8개');
select is_empty(
  $$select 1 from public.question_bank_items
     where org_id = '00000000-0000-0000-0000-000000000001' and (status <> 'active' or source <> 'seed')$$,
  '초기화 후 문제은행은 모두 게시된 시드 문항');
select results_eq(
  $$select count(*)::int, count(*) filter (where status = 'done')::int,
           bool_and(due_date >= (now() at time zone 'Asia/Seoul')::date)
      from public.task_instances where new_hire_id = 'a4000000-0000-0000-0000-000000000101'$$,
  $$values (31, 0, true)$$,
  '시드 신입: 인스턴스 31개, done 0, 입사일이 오늘로 바뀌어 기한도 오늘 이후');
select is(pg_temp.st('GA-08', 'a4000000-0000-0000-0000-000000000102'), 'done',
  '관리자가 만든 신입(is_seed=false)의 done 과제는 그대로');

-- ── 과제 템플릿 초기화 ──────────────────────────────────────────────
select is_empty(
  $$select 1 from public.task_templates t join private.task_template_seed s on s.template_id = t.id
     where t.archived_at is not null
        or (t.title, t.description, t.kind, t.completion_mode, t.stage, t.due_offset_days, t.allow_na,
            t.requires_hq_access, t.prerequisite_codes, t.checklist, t.form_schema, t.sort_order)
           is distinct from
           (s.title, s.description, s.kind, s.completion_mode, s.stage, s.due_offset_days, s.allow_na,
            s.requires_hq_access, s.prerequisite_codes, s.checklist, s.form_schema, s.sort_order)$$,
  '시드 템플릿은 모두 시드 값으로 돌아가고 보관 아님');
select is((select count(*)::int from public.task_templates
            where org_id = '00000000-0000-0000-0000-000000000001' and is_seed and archived_at is null), 31,
  '보관되지 않은 시드 템플릿 31개');
select is((select t.title from public.task_templates t
            where t.org_id = '00000000-0000-0000-0000-000000000001' and t.code = 'AI-02'),
          (select s.title from private.task_template_seed s join public.task_templates t on t.id = s.template_id
            where t.org_id = '00000000-0000-0000-0000-000000000001' and t.code = 'AI-02'),
  'AI-02 제목이 원래대로');
select is((select t.archived_at from public.task_templates t
            where t.org_id = '00000000-0000-0000-0000-000000000001' and t.code = 'AI-03'), null,
  'AI-03 보관 해제');
select is_empty(
  $$select 1 from public.task_templates
     where org_id = '00000000-0000-0000-0000-000000000001' and not is_seed and archived_at is null$$,
  '시드가 아닌 템플릿(한 사람용 포함)은 모두 보관됨');
select ok((select archived_at is not null from public.task_templates
            where org_id = '00000000-0000-0000-0000-000000000001' and title = '심사위원이 만든 과제'
              and created_by = 'a4000000-0000-0000-0000-000000000201'),
  '새로 만든 템플릿은 보관됨(지우지 않음)');
select is((select count(*)::int from public.task_templates
            where org_id = '00000000-0000-0000-0000-000000000001' and archived_at is not null
              and assigned_to in ('a4000000-0000-0000-0000-000000000101', 'a4000000-0000-0000-0000-000000000102')), 2,
  '한 사람용 템플릿 2개 보관됨');
select is((select archived_at from public.task_templates where id = 'a4000000-0000-0000-0000-000000000701'),
  timestamptz '2026-01-02 09:00+09', '이미 보관된 템플릿은 보관 시각 그대로');
select is((select i.status::text from public.task_instances i join public.task_templates t on t.id = i.template_id
            where i.new_hire_id = 'a4000000-0000-0000-0000-000000000102'
              and t.assigned_to = 'a4000000-0000-0000-0000-000000000102'), 'todo',
  '관리자가 만든 신입의 한 사람용 과제 인스턴스는 그대로');

-- ── 서식 초기화(객체는 웹이 Storage API로 먼저 지운다) ───────────────
select is((select count(*)::int from public.task_template_files
            where org_id = '00000000-0000-0000-0000-000000000001' and not is_seed), 0,
  '담당자가 올린 서식 행 0');
select is((select count(*)::int from public.task_template_files
            where org_id = '00000000-0000-0000-0000-000000000001' and is_seed and file_name = '기본 서식.pdf'), 1,
  '기본 서식 행은 그대로');

select * from finish();
rollback;
