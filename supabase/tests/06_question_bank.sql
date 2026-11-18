-- 문제은행·응시 기록 테스트. 픽스처는 이 파일 안에서 만들고 끝나면 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

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
select lives_ok(
  $$insert into public.question_bank_items (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
    values ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a1',
            '주제', 'beginner', '문제', '답', '기준', 10, 'manual')$$,
  'trainer: 문제 insert');
select throws_ok(
  $$insert into public.question_bank_items (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
    values ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a1',
            '주제', 'beginner', E'\n문제\t', '답', '기준', 10, 'manual')$$,
  '23505', null, 'trainer: 앞뒤 줄바꿈·탭만 다른 같은 문제도 같은 팀에 두 번 못 넣는다');
select is(private.prompt_key(E'\n a  b\t'), private.prompt_key('a b'),
  'prompt_key: 줄바꿈·탭·연속 공백을 정리한 뒤 앞뒤를 지운다');
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
  $$insert into public.question_bank_items (id, org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
    values ('a6000000-0000-0000-0000-000000000702', 'a6000000-0000-0000-0000-000000000001',
            'a6000000-0000-0000-0000-0000000000a2', '주제', 'beginner', 'a  b', '답', '기준', 10, 'manual')$$,
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

-- ════ Task 2: 등록·뽑기·회피 목록·응시 연결 RPC ══════════════════════
-- 팀 T: 확정 E1(문항 3), 초안 E2, 확정 E3(E1 첫 문항과 공백만 다름). 팀 T2: 확정 E4.
insert into public.exams (id, org_id, team_id, title, topic, difficulty, status) values
  ('a6000000-0000-0000-0000-000000000601', 'a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a1',
   'E1', 'JavaScript 기초', 'beginner', 'final'),
  ('a6000000-0000-0000-0000-000000000602', 'a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a1',
   'E2', 'JavaScript 기초', 'beginner', 'draft'),
  ('a6000000-0000-0000-0000-000000000603', 'a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a1',
   'E3', 'JavaScript 기초', 'beginner', 'final'),
  ('a6000000-0000-0000-0000-000000000604', 'a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a2',
   'E4', 'JavaScript 기초', 'beginner', 'final');
insert into public.exam_questions (org_id, exam_id, position, prompt, model_answer, rubric, points) values
  ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000601', 1, 'let과 const의 차이를 쓰시오.', '답', '기준', 10),
  ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000601', 2, '== 와 === 의 차이를 쓰시오.', '답', '기준', 10),
  ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000601', 3, '배열 map의 반환값을 쓰시오.', '답', '기준', 10),
  ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000602', 1, '초안 문제', '답', '기준', 10),
  ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000603', 1, '  let과   const의 차이를 쓰시오. ', '답', '기준', 10),
  ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000604', 1, '다른 팀 문제', '답', '기준', 10);

-- ── 교육 담당자(T): 등록 ────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-0000-0000-000000000201';

select is(public.register_exam_to_bank('a6000000-0000-0000-0000-000000000601'), 3, 'register(E1) → 새 문항 3');
select is(public.register_exam_to_bank('a6000000-0000-0000-0000-000000000601'), 0, 'register(E1) 다시 → 0');
select is((select count(*)::int from public.question_bank_items where topic_key = 'javascript 기초'), 3,
  '다시 등록해도 은행 행 3개 유지');
select is_empty(
  $$select 1 from public.exam_questions
     where exam_id = 'a6000000-0000-0000-0000-000000000601' and bank_item_id is null$$,
  'E1 문항 모두 bank_item_id가 채워졌다');
select is(public.register_exam_to_bank('a6000000-0000-0000-0000-000000000603'), 0,
  'register(E3): 공백만 다른 같은 문제는 새로 넣지 않는다');
select is(
  (select bank_item_id from public.exam_questions where exam_id = 'a6000000-0000-0000-0000-000000000603'),
  (select bank_item_id from public.exam_questions where exam_id = 'a6000000-0000-0000-0000-000000000601' and position = 1),
  'E3 문항은 E1 문항과 같은 은행 행을 가리킨다');
select throws_ok($$select public.register_exam_to_bank('a6000000-0000-0000-0000-000000000602')$$,
  '22023', null, 'register(초안 시험) → 22023');

-- ── 교육 담당자(T): 문항 출처는 우리 팀 은행만 (FK 검사는 RLS를 보지 않는다) ──
select throws_ok(
  $$insert into public.exam_questions (org_id, exam_id, position, prompt, model_answer, rubric, points, bank_item_id)
    values ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000602', 2,
            '출처 위조', '답', '기준', 10, 'a6000000-0000-0000-0000-000000000702')$$,
  '42501', null, 'trainer: 다른 팀 은행 id로 문항 insert 불가');
select lives_ok(
  $$insert into public.exam_questions (org_id, exam_id, position, prompt, model_answer, rubric, points, bank_item_id)
    values ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000602', 2,
            'let과 const의 차이를 쓰시오.', '답', '기준', 10,
            (select id from public.question_bank_items where prompt = 'let과 const의 차이를 쓰시오.'))$$,
  'trainer: 우리 팀 은행 id로 문항 insert');
select throws_ok(
  $$update public.exam_questions set bank_item_id = 'a6000000-0000-0000-0000-000000000702'
     where exam_id = 'a6000000-0000-0000-0000-000000000602' and position = 2$$,
  '42501', null, 'trainer: 문항 출처를 다른 팀 은행 id로 update 불가');

-- ── 교육 담당자(T): 뽑기 ────────────────────────────────────────────
select is((select count(*)::int from public.pick_bank_items(' javascript 기초', 'beginner', 5)), 3,
  'pick: 주제 대소문자·앞뒤 공백 무시 → 3');
select is_empty($$select 1 from public.pick_bank_items('JavaScript_기초', 'beginner', 5)$$,
  'pick: _를 와일드카드로 읽지 않는다');
update public.question_bank_items set status = 'hidden' where prompt = '배열 map의 반환값을 쓰시오.';
select is((select count(*)::int from public.pick_bank_items('JavaScript 기초', 'beginner', 5)), 2,
  'pick: 숨긴 문항은 뽑히지 않는다');
update public.question_bank_items set status = 'active' where prompt = '배열 map의 반환값을 쓰시오.';
select is_empty(
  $$select 1 from public.pick_bank_items('JavaScript 기초', 'beginner', 5,
      array[(select id from public.question_bank_items where prompt = 'let과 const의 차이를 쓰시오.')]) p
     where p.prompt = 'let과 const의 차이를 쓰시오.'$$,
  'pick: p_exclude의 id는 뽑히지 않는다');
select is_empty(
  $$select 1 from public.pick_bank_items('JavaScript 기초', 'beginner', 5,
      p_exclude_prompts => array[' ==  와 === 의   차이를 쓰시오.']) p
     where p.prompt = '== 와 === 의 차이를 쓰시오.'$$,
  'pick: p_exclude_prompts와 공백만 다른 문항은 뽑히지 않는다');
select throws_ok($$select * from public.pick_bank_items('JavaScript 기초', 'beginner', 0)$$,
  '22023', null, 'pick: p_count 0 → 22023');
select throws_ok($$select * from public.pick_bank_items('JavaScript 기초', 'beginner', 11)$$,
  '22023', null, 'pick: p_count 11 → 22023');

-- E1과 무관한 문항 하나(주제 표기만 다름)
insert into public.question_bank_items (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
values ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a1',
        ' JAVASCRIPT 기초 ', 'beginner', '클로저 출력 예측', '답', '기준', 10, 'manual');

-- ── 교육 담당자(T): 응시 연결 ───────────────────────────────────────
select is(
  (select array(select unnest(s.bank_item_ids) order by 1)
     from public.assign_exam('a6000000-0000-0000-0000-000000000551', 'a6000000-0000-0000-0000-000000000601') s),
  (select array(select bank_item_id from public.exam_questions
                 where exam_id = 'a6000000-0000-0000-0000-000000000601' order by 1)),
  'assign_exam: 스냅샷 = E1 문항 3개의 은행 id');
select results_eq(
  $$select p.prompt from public.pick_bank_items('JavaScript 기초', 'beginner', 5,
      p_new_hire => 'a6000000-0000-0000-0000-000000000101') p$$,
  array['클로저 출력 예측'], 'pick(신입A): 이미 본 E1 문항은 빠진다');

-- 회귀: 연결 뒤 시험 문항을 지우고 일부만 다시 넣어도(출처 없이) 이미 본 문항은 계속 빠진다
delete from public.exam_questions where exam_id = 'a6000000-0000-0000-0000-000000000601';
insert into public.exam_questions (org_id, exam_id, position, prompt, model_answer, rubric, points) values
  ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000601', 1, '== 와 === 의 차이를 쓰시오.', '답', '기준', 10),
  ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000601', 2, '배열 map의 반환값을 쓰시오.', '답', '기준', 10);
select results_eq(
  $$select p.prompt from public.pick_bank_items('JavaScript 기초', 'beginner', 5,
      p_new_hire => 'a6000000-0000-0000-0000-000000000101') p$$,
  array['클로저 출력 예측'], 'pick(신입A): 시험 문항을 고친 뒤에도 연결 시점 스냅샷으로 뺀다');
select is(
  (select cardinality(s.bank_item_ids)
     from public.assign_exam('a6000000-0000-0000-0000-000000000551', 'a6000000-0000-0000-0000-000000000601') s),
  3, 'assign_exam 다시: 처음 스냅샷을 유지한다');
select is(
  (select count(*)::int from public.exam_sittings
    where exam_id = 'a6000000-0000-0000-0000-000000000601'
      and task_instance_id = 'a6000000-0000-0000-0000-000000000551'),
  1, 'assign_exam 같은 쌍 두 번 → 행 1개');
select throws_ok(
  $$select public.assign_exam('a6000000-0000-0000-0000-000000000552', 'a6000000-0000-0000-0000-000000000601')$$,
  '22023', null, 'assign_exam: 평가 과제가 아니면 22023');
select throws_ok(
  $$select public.assign_exam('a6000000-0000-0000-0000-000000000551', 'a6000000-0000-0000-0000-000000000602')$$,
  '22023', null, 'assign_exam: 초안 시험이면 22023');
select throws_ok(
  $$select public.assign_exam('a6000000-0000-0000-0000-000000000551', 'a6000000-0000-0000-0000-000000000604')$$,
  '22023', null, 'assign_exam: 다른 팀 시험이면 22023');

-- ── 신입A ───────────────────────────────────────────────────────────
set local request.jwt.claim.sub = 'a6000000-0000-0000-0000-000000000101';
select throws_ok(
  $$select public.assign_exam('a6000000-0000-0000-0000-000000000551', 'a6000000-0000-0000-0000-000000000601')$$,
  '42501', null, '신입A: assign_exam → 42501');
select is_empty($$select 1 from public.pick_bank_items('JavaScript 기초', 'beginner', 5)$$, '신입A: pick → 0행');
select is_empty($$select 1 from public.bank_prompts('JavaScript 기초', 'beginner')$$, '신입A: bank_prompts → 0행');
select throws_ok($$select public.register_exam_to_bank('a6000000-0000-0000-0000-000000000601')$$,
  'P0002', null, '신입A: register → P0002');

-- ── 교육 담당자2(T2) ────────────────────────────────────────────────
set local request.jwt.claim.sub = 'a6000000-0000-0000-0000-000000000202';
select throws_ok($$select public.register_exam_to_bank('a6000000-0000-0000-0000-000000000601')$$,
  'P0002', null, 'trainer2: 다른 팀 시험 register → P0002');
select throws_ok(
  $$select public.assign_exam('a6000000-0000-0000-0000-000000000551', 'a6000000-0000-0000-0000-000000000601')$$,
  '42501', null, 'trainer2: 다른 팀 과제 assign_exam → 42501');

-- ── 교육 담당자(T): 편집기에서 고친 은행 문항의 재등록 ──────────────
-- 위 회귀 구간에서 E1 문항을 출처 없이 다시 넣었으므로(== 와 ===, 배열 map) 먼저 기존 은행 행에 연결된다.
set local request.jwt.claim.sub = 'a6000000-0000-0000-0000-000000000201';
select is(public.register_exam_to_bank('a6000000-0000-0000-0000-000000000601'), 0,
  'register(E1): 출처 없이 다시 넣은 같은 문항은 기존 은행 행에 연결만 한다');
update public.exam_questions set prompt = '배열 filter의 반환값을 쓰시오.'
 where exam_id = 'a6000000-0000-0000-0000-000000000601' and prompt = '== 와 === 의 차이를 쓰시오.';
select is(public.register_exam_to_bank('a6000000-0000-0000-0000-000000000601'), 1,
  'register(E1): 은행 문항의 문장을 새 문제로 고치면 새 은행 행 1');
select is(
  (select bank_item_id from public.exam_questions
    where exam_id = 'a6000000-0000-0000-0000-000000000601' and prompt = '배열 filter의 반환값을 쓰시오.'),
  (select id from public.question_bank_items where prompt = '배열 filter의 반환값을 쓰시오.' and source = 'exam'),
  '고친 문항의 bank_item_id는 새 은행 행');
select is((select count(*)::int from public.question_bank_items where prompt = '== 와 === 의 차이를 쓰시오.'), 1,
  '원래 은행 행의 문장은 그대로');
update public.exam_questions set model_answer = '고친 답'
 where exam_id = 'a6000000-0000-0000-0000-000000000601' and prompt = '배열 map의 반환값을 쓰시오.';
select is(public.register_exam_to_bank('a6000000-0000-0000-0000-000000000601'), 0,
  'register(E1): 답안만 고친 문항은 대상이 아니다');
select is(
  (select bank_item_id from public.exam_questions
    where exam_id = 'a6000000-0000-0000-0000-000000000601' and prompt = '배열 map의 반환값을 쓰시오.'),
  (select id from public.question_bank_items where prompt = '배열 map의 반환값을 쓰시오.'),
  '답안만 고친 문항의 bank_item_id는 그대로');

-- ── bank_prompts 상한 ───────────────────────────────────────────────
reset role;
insert into public.question_bank_items (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
select 'a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-0000000000a1',
       'JavaScript 기초', 'beginner', '추가 문제 ' || g, '답', '기준', 10, 'manual'
  from generate_series(1, 35) g;
set local role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-0000-0000-000000000201';
select is((select count(*)::int from public.bank_prompts('JavaScript 기초', 'beginner', 100)), 30,
  'bank_prompts(..., 100) → 최대 30');
reset role;

select * from finish();
rollback;
