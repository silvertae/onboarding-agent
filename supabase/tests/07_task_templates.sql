-- 과제 템플릿 관리 테스트(보관·한 사람용·시드 사본·조회 정책·쓰기 RPC). 시드 조직에 픽스처를 더해 확인하고 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(128);

-- ── 픽스처 ──────────────────────────────────────────────────────────
-- 시드 조직 O, AI팀(T), 다른 팀 T2. 사람은 모두 가상.
-- 로컬 DB는 여러 세션이 함께 쓴다. 이 트랜잭션 안에서만 시드 템플릿을 시드 값으로 되돌리고,
-- 앞서 만든 비시드 템플릿의 코드는 비켜 둔다(코드 번호가 시드 기준으로 매겨지게). 끝에 롤백한다.
update public.task_templates t
   set title = s.title, description = s.description, kind = s.kind, completion_mode = s.completion_mode,
       stage = s.stage, due_offset_days = s.due_offset_days, allow_na = s.allow_na,
       requires_hq_access = s.requires_hq_access, prerequisite_codes = s.prerequisite_codes,
       checklist = s.checklist, form_schema = s.form_schema, sort_order = s.sort_order, archived_at = null
  from private.task_template_seed s
 where s.template_id = t.id;
update public.task_templates set code = 'TEST-' || id
 where org_id = '00000000-0000-0000-0000-000000000001' and not is_seed;

insert into public.teams (id, org_id, name, org_line) values
  ('a7000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', '팀T2', '{팀T2}');

insert into auth.users (id, email) values
  ('a7000000-0000-0000-0000-000000000101', 'new-a@tpl.test'),
  ('a7000000-0000-0000-0000-000000000102', 'new-b@tpl.test'),
  ('a7000000-0000-0000-0000-000000000103', 'new-c@tpl.test'),
  ('a7000000-0000-0000-0000-000000000104', 'new-d@tpl.test'),
  ('a7000000-0000-0000-0000-000000000105', 'new-e@tpl.test'),
  ('a7000000-0000-0000-0000-000000000106', 'new-f@tpl.test'),
  ('a7000000-0000-0000-0000-000000000201', 'trainer@tpl.test'),
  ('a7000000-0000-0000-0000-000000000202', 'trainer2@tpl.test'),
  ('a7000000-0000-0000-0000-000000000301', 'hr@tpl.test'),
  ('a7000000-0000-0000-0000-000000000302', 'ga@tpl.test'),
  ('a7000000-0000-0000-0000-000000000401', 'admin@tpl.test');

-- 신입E는 입사 40일 전(기한이 오늘로 당겨지는지), 신입F는 한 사람용 과제를 만든 뒤에 시작한다
insert into public.profiles (id, org_id, email, full_name, role, department, team_id, hire_date) values
  ('a7000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'new-a@tpl.test', '신입A', 'new_hire', null, '00000000-0000-0000-0000-000000000002', date '2026-11-02'),
  ('a7000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'new-b@tpl.test', '신입B', 'new_hire', null, '00000000-0000-0000-0000-000000000002', date '2026-11-02'),
  ('a7000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'new-c@tpl.test', '신입C', 'new_hire', null, '00000000-0000-0000-0000-000000000002', date '2026-11-02'),
  ('a7000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'new-d@tpl.test', '신입D', 'new_hire', null, '00000000-0000-0000-0000-000000000002', date '2026-11-02'),
  ('a7000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 'new-e@tpl.test', '신입E', 'new_hire', null, '00000000-0000-0000-0000-000000000002', (now() at time zone 'Asia/Seoul')::date - 40),
  ('a7000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000001', 'new-f@tpl.test', '신입F', 'new_hire', null, '00000000-0000-0000-0000-000000000002', date '2026-11-02'),
  ('a7000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'trainer@tpl.test', '교육', 'team_trainer', null, '00000000-0000-0000-0000-000000000002', null),
  ('a7000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', 'trainer2@tpl.test', '교육2', 'team_trainer', null, 'a7000000-0000-0000-0000-0000000000a2', null),
  ('a7000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'hr@tpl.test', '인사', 'ops_staff', 'hr', null, null),
  ('a7000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', 'ga@tpl.test', '총무', 'ops_staff', 'ga', null, null),
  ('a7000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 'admin@tpl.test', '관리', 'admin', null, null, null);

-- 테스트 편의 함수(RLS 우회): 시드 조직에서 코드로 템플릿·인스턴스 조회
create function pg_temp.tpl(p_code text) returns public.task_templates language sql security definer as $$
  select * from public.task_templates where org_id = '00000000-0000-0000-0000-000000000001' and code = p_code $$;
create function pg_temp.tid(p_code text) returns uuid language sql security definer as $$
  select id from public.task_templates where org_id = '00000000-0000-0000-0000-000000000001' and code = p_code $$;
create function pg_temp.inst(p_code text, p_hire uuid) returns public.task_instances language sql security definer as $$
  select i.* from public.task_instances i join public.task_templates t on t.id = i.template_id
   where t.org_id = '00000000-0000-0000-0000-000000000001' and t.code = p_code and i.new_hire_id = p_hire $$;

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

-- 기대 수는 공유 DB에 있을 수 있는 다른 템플릿까지 세어 정한다(보관·한 사람용·다른 팀 제외)
select is(public._start_onboarding('a7000000-0000-0000-0000-000000000103'),
  (select count(*)::int from public.task_templates
    where org_id = '00000000-0000-0000-0000-000000000001'
      and (department is not null or team_id = '00000000-0000-0000-0000-000000000002')
      and archived_at is null and assigned_to is null),
  '보관·한 사람용을 뺀 템플릿만 생성');
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

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000202';
select is((select count(*)::int from public.task_templates where assigned_to = 'a7000000-0000-0000-0000-000000000101'), 1,
  '다른 팀 교육 담당자(T2): 한 사람용 행이 보인다');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000301';
select is((select count(*)::int from public.task_templates where assigned_to = 'a7000000-0000-0000-0000-000000000101'), 1,
  '경영지원: 한 사람용 행이 보인다');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000401';
select is((select count(*)::int from public.task_templates where assigned_to = 'a7000000-0000-0000-0000-000000000101'), 1,
  '관리자: 한 사람용 행이 보인다');

-- ══ 템플릿 쓰기 RPC ═════════════════════════════════════════════════
reset role;

-- ── 실행 권한 ───────────────────────────────────────────────────────
select ok(not has_function_privilege('anon',
  'public.save_task_template(uuid, text, text, public.task_kind, public.completion_mode, public.task_stage, int, boolean, jsonb, text[])',
  'execute'), 'save_task_template: anon 실행 불가');
select ok(not has_function_privilege('anon', 'public.archive_task_template(uuid)', 'execute'),
  'archive_task_template: anon 실행 불가');
select ok(not has_function_privilege('anon', 'public.restore_task_template(uuid)', 'execute'),
  'restore_task_template: anon 실행 불가');
select ok(not has_function_privilege('anon',
  'public.add_task_for_hire(uuid, text, text, public.task_kind, public.completion_mode, public.task_stage, int, boolean, jsonb)',
  'execute'), 'add_task_for_hire: anon 실행 불가');
select ok(not has_function_privilege('anon', 'private.next_task_code(uuid, text, boolean)', 'execute'),
  'next_task_code: anon 실행 불가');
select ok(
  has_function_privilege('authenticated',
    'public.save_task_template(uuid, text, text, public.task_kind, public.completion_mode, public.task_stage, int, boolean, jsonb, text[])',
    'execute')
  and has_function_privilege('authenticated', 'public.archive_task_template(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.restore_task_template(uuid)', 'execute')
  and has_function_privilege('authenticated',
    'public.add_task_for_hire(uuid, text, text, public.task_kind, public.completion_mode, public.task_stage, int, boolean, jsonb)',
    'execute'),
  '쓰기 RPC 4개: authenticated 실행 가능');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname || '.' || p.proname in ('public.save_task_template', 'public.archive_task_template',
                    'public.restore_task_template', 'public.add_task_for_hire', 'private.next_task_code')
              and p.prosecdef and p.proconfig = array['search_path=""']), 5,
  '쓰기 RPC 4개와 next_task_code: security definer, search_path 비움');

-- 신입A·B 온보딩 시작: A는 사용 중 잠금, B는 한 사람용 과제가 안 들어가는지 확인에 쓴다
select ok(public._start_onboarding('a7000000-0000-0000-0000-000000000101') > 0, '신입A 온보딩 시작');
select ok(public._start_onboarding('a7000000-0000-0000-0000-000000000102') > 0, '신입B 온보딩 시작');
create temp table hire_b_before as
  select count(*)::int as n from public.task_instances where new_hire_id = 'a7000000-0000-0000-0000-000000000102';

set local role authenticated;

-- ── 새 템플릿·코드 부여 ─────────────────────────────────────────────
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select is((public.save_task_template(null, '새 실습 과제', '실습 안내', 'practice', 'self', 'week1', 2, false, null, '{}')).code,
  'AI-11', '교육 담당자(T) 새 practice 템플릿 → AI-11');
select is((pg_temp.tpl('AI-11')).team_id, '00000000-0000-0000-0000-000000000002'::uuid, 'AI-11 담당 = 팀 T');
select is((pg_temp.tpl('AI-11')).department, null::public.ops_department, 'AI-11 부서 없음');
select is((pg_temp.tpl('AI-11')).due_offset_days, 7, 'week1 + 2일 → due_offset_days 7');
select is((pg_temp.tpl('AI-11')).is_seed, false, '새 템플릿 is_seed = false');
select is((pg_temp.tpl('AI-11')).created_by, 'a7000000-0000-0000-0000-000000000201'::uuid, 'created_by = 호출자');
select is((pg_temp.tpl('AI-11')).sort_order,
  (select max(sort_order) + 10 from public.task_templates
    where team_id = '00000000-0000-0000-0000-000000000002' and stage = 'week1' and code <> 'AI-11'),
  'sort_order = 같은 팀·단계 최댓값 + 10(시드만 있으면 410)');
select is((pg_temp.tpl('AI-11')).requires_hq_access, false, '새 템플릿 requires_hq_access = false');
select is((public.save_task_template(null, '두 번째 실습', '', 'practice', 'self', 'week1', 0, false, null, '{}')).code,
  'AI-12', '다시 저장 → AI-12');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000302';  -- 경영지원(ga)
select is((public.save_task_template(null, '총무 안내 읽기', '', 'read', 'self', 'day1', 0, false, null, '{}')).code,
  'GA-09', '경영지원(ga) 새 템플릿 → GA-09');
select is((pg_temp.tpl('GA-09')).department, 'ga'::public.ops_department, 'GA-09 담당 = ga');
select is((pg_temp.tpl('GA-09')).team_id, null::uuid, 'GA-09 팀 없음');

-- ── 범위 밖 쓰기 (Review Focus 2) ───────────────────────────────────
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000202';  -- 교육 담당자(T2)
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-11'), '남의 팀 수정', '', 'practice', 'self', 'week1', 2,
                   false, null, '{}')$$,
  '42501', null, '교육 담당자(T2)가 팀 T 템플릿 수정 → 42501');
select throws_ok($$select public.archive_task_template(pg_temp.tid('AI-11'))$$,
  '42501', null, '교육 담당자(T2)가 팀 T 템플릿 보관 → 42501');
select throws_ok($$select public.restore_task_template(pg_temp.tid('AI-11'))$$,
  '42501', null, '교육 담당자(T2)가 팀 T 템플릿 복원 → 42501');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000301';  -- 경영지원(hr)
select throws_ok($$select public.archive_task_template(pg_temp.tid('GA-02'))$$,
  '42501', null, '경영지원(hr)이 ga 템플릿 보관 → 42501');
select throws_ok($$select public.save_task_template(pg_temp.tid('GA-09'), '남의 부서 수정', '', 'read', 'self', 'day1', 0,
                   false, null, '{}')$$,
  '42501', null, '경영지원(hr)이 ga 템플릿 수정 → 42501');
select throws_ok($$select public.save_task_template(gen_random_uuid(), '없는 과제', '', 'read', 'self', 'day1', 0,
                   false, null, '{}')$$,
  'P0002', null, '없는 템플릿 수정 → P0002');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000401';  -- 관리자
select throws_ok($$select public.save_task_template(null, '관리자 과제', '', 'ops', 'self', 'day1', 0, false, null, '{}')$$,
  '42501', null, '관리자가 새 템플릿 저장 → 42501');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-11'), '관리자 수정', '', 'practice', 'self', 'week1', 2,
                   false, null, '{}')$$,
  '42501', null, '관리자가 템플릿 수정 → 42501');
select throws_ok($$select public.archive_task_template(pg_temp.tid('AI-11'))$$,
  '42501', null, '관리자가 보관 → 42501');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000101';  -- 신입A
select throws_ok($$select public.save_task_template(null, '신입 과제', '', 'ops', 'self', 'day1', 0, false, null, '{}')$$,
  '42501', null, '신입A가 새 템플릿 저장 → 42501');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-11'), '신입 수정', '', 'practice', 'self', 'week1', 2,
                   false, null, '{}')$$,
  '42501', null, '신입A가 템플릿 수정 → 42501');
select is((pg_temp.tpl('AI-11')).title, '새 실습 과제', '거부된 수정 뒤에도 AI-11 제목 그대로');

-- ── 종류 ────────────────────────────────────────────────────────────
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000302';  -- 경영지원(ga)
select throws_ok($$select public.save_task_template(null, '총무 평가', '', 'assessment', 'staff_only', 'week1', 0, false,
                   null, '{}')$$,
  '42501', null, '경영지원이 assessment 저장 → 42501');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select throws_ok($$select public.save_task_template(null, '팀 평가', '', 'assessment', 'confirm', 'week1', 0, false,
                   null, '{}')$$,
  '22023', null, '교육 담당자 assessment + confirm → 22023');
select throws_ok($$select public.save_task_template(null, '새 입력 양식', '', 'input', 'self', 'day1', 0, false, null, '{}')$$,
  '22023', null, '새 input 템플릿 → 22023');
select is((public.save_task_template(null, '팀 평가', '', 'assessment', 'staff_only', 'month1', 0, false, null, '{}')).code,
  'AI-13', '교육 담당자 assessment + staff_only → AI-13');

-- ── 칸 검증 ─────────────────────────────────────────────────────────
select throws_ok($$select public.save_task_template(null, '세팅', '', 'setup', 'self', 'week1', 0, false, '[]', '{}')$$,
  '22023', null, 'setup 체크리스트 0개 → 22023');
select throws_ok($$select public.save_task_template(null, '세팅', '', 'setup', 'self', 'week1', 0, false,
                   (select jsonb_agg('항목' || g order by g) from generate_series(1, 21) g), '{}')$$,
  '22023', null, 'setup 체크리스트 21개 → 22023');
select throws_ok($$select public.save_task_template(null, '세팅', '', 'setup', 'self', 'week1', 0, false,
                   '["SAP 계정", "  "]', '{}')$$,
  '22023', null, 'setup 체크리스트 빈 항목 → 22023');
select throws_ok($$select public.save_task_template(null, '세팅', '', 'setup', 'self', 'week1', 0, false,
                   '["SAP 계정", 1]', '{}')$$,
  '22023', null, 'setup 체크리스트에 문자열이 아닌 항목 → 22023');
select throws_ok($$select public.save_task_template(null, '세팅', '', 'setup', 'self', 'week1', 0, false, null, '{}')$$,
  '22023', null, 'setup 체크리스트 없음 → 22023');
select throws_ok($$select public.save_task_template(null, '읽기', '', 'read', 'self', 'week1', 0, false, '["항목"]', '{}')$$,
  '22023', null, 'read에 체크리스트 → 22023');
select throws_ok($$select public.save_task_template(null, '   ', '', 'read', 'self', 'week1', 0, false, null, '{}')$$,
  '22023', null, '제목 공백 → 22023');
select throws_ok($$select public.save_task_template(null, repeat('가', 61), '', 'read', 'self', 'week1', 0, false, null, '{}')$$,
  '22023', null, '제목 61자 → 22023');
select throws_ok($$select public.save_task_template(null, '읽기', repeat('가', 2001), 'read', 'self', 'week1', 0, false,
                   null, '{}')$$,
  '22023', null, '안내문 2001자 → 22023');
select throws_ok($$select public.save_task_template(null, '읽기', '', 'read', 'self', 'week1', 61, false, null, '{}')$$,
  '22023', null, 'p_days_in_stage 61 → 22023');
select throws_ok($$select public.save_task_template(null, '읽기', '', 'read', 'self', 'week1', -1, false, null, '{}')$$,
  '22023', null, 'p_days_in_stage -1 → 22023');
-- 경계값: 제목 60자, 단계 시작 후 60일, 체크리스트 20개 × 60자. 앞뒤 공백은 지우고 저장한다
select is(
  (select row(t.code, char_length(t.title), t.due_offset_days, jsonb_array_length(t.checklist), t.checklist ->> 0)::text
     from public.save_task_template(null, '  ' || repeat('가', 60) || ' ', '', 'setup', 'self', 'week1', 60, false,
            (select jsonb_agg(' ' || repeat('나', 59) || (g % 10) || ' ' order by g) from generate_series(1, 20) g),
            '{}') t),
  row('AI-14', 60, 65, 20, repeat('나', 59) || '1')::text,
  '경계값(제목 60자·60일·체크리스트 20개×60자) 저장, 앞뒤 공백 제거');

-- ── 선행 과제 ───────────────────────────────────────────────────────
select throws_ok($$select public.save_task_template(null, '선행', '', 'read', 'self', 'week1', 0, false, null, '{GA-02}')$$,
  '22023', null, '선행에 다른 담당 범위 코드 → 22023');
select throws_ok($$select public.save_task_template(null, '선행', '', 'read', 'self', 'week1', 0, false, null, '{AI-02}')$$,
  '22023', null, '선행에 보관된 코드 → 22023');
select throws_ok($$select public.save_task_template(null, '선행', '', 'read', 'self', 'week1', 0, false, null, '{AI-X1}')$$,
  '22023', null, '선행에 한 사람용 코드 → 22023');
select throws_ok($$select public.save_task_template(null, '선행', '', 'read', 'self', 'week1', 0, false, null, '{AI-99}')$$,
  '22023', null, '선행에 없는 코드 → 22023');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-11'), '새 실습 과제', '실습 안내', 'practice', 'self',
                   'week1', 2, false, null, '{AI-11}')$$,
  '22023', '자기 자신을 선행 과제로 고를 수 없습니다', '선행에 자기 코드 → 22023');
select throws_ok($$select public.save_task_template(null, '선행', '', 'read', 'self', 'week1', 0, false, null,
                   '{AI-01,AI-03,AI-06,AI-07}')$$,
  '22023', '선행 과제는 3개까지 고를 수 있습니다', '선행 4개 → 22023');

-- ── 사용 전 템플릿: 모든 칸 변경 ────────────────────────────────────
select is(
  (select row(t.title, t.description, t.kind, t.completion_mode, t.stage, t.due_offset_days, t.allow_na, t.checklist,
              t.prerequisite_codes)::text
     from public.save_task_template(pg_temp.tid('AI-12'), '바뀐 제목', '바뀐 안내', 'setup', 'confirm', 'month1', 10, true,
            '["항목1", "항목2"]', '{AI-01}') t),
  row('바뀐 제목', '바뀐 안내', 'setup', 'confirm', 'month1', 40, true, '["항목1", "항목2"]'::jsonb, '{AI-01}'::text[])::text,
  '사용 전 템플릿은 종류·완료 방식·단계·기한·해당 없음·체크리스트·선행을 모두 바꿀 수 있다');

-- 순환: AI-11이 AI-12를 선행으로 둔 상태에서 AI-12에 AI-11을 선행으로
select is((public.save_task_template(pg_temp.tid('AI-11'), '새 실습 과제', '실습 안내', 'practice', 'self', 'week1', 2, false,
            null, '{AI-12}')).prerequisite_codes, '{AI-12}'::text[], 'AI-11의 선행 = AI-12');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-12'), '바뀐 제목', '바뀐 안내', 'setup', 'confirm', 'month1',
                   10, true, '["항목1", "항목2"]', '{AI-01,AI-11}')$$,
  '22023', '선행 과제가 서로를 기다리게 되어 고를 수 없습니다', 'AI-12에 AI-11을 선행으로 → 순환 22023');
select is((pg_temp.tpl('AI-12')).prerequisite_codes, '{AI-01}'::text[], '순환 거부 뒤 AI-12 선행 그대로');

-- ── 사용 중 잠금 (Review Focus 1): 신입A가 진행 중인 AI-09(setup) ──────
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-09'), 'BTP 개발 초기 세팅', '안내', 'setup', 'self',
                   'week1', 0, false, '["SAP 계정", "cf cli", "mbt", "cds cli", "git"]', '{}')$$,
  '22023', '진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다', '사용 중: 체크리스트 항목 추가 → 22023');
select is((pg_temp.tpl('AI-09')).checklist, '["SAP 계정", "cf cli", "mbt", "cds cli"]'::jsonb, '사용 중: 체크리스트 그대로');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-09'), 'BTP 개발 초기 세팅', '안내', 'setup', 'self',
                   'week1', 0, false, '["SAP 계정", "cf cli", "mbt"]', '{}')$$,
  '22023', '진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다', '사용 중: 체크리스트 항목 제거 → 22023');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-09'), 'BTP 개발 초기 세팅', '안내', 'setup', 'confirm',
                   'week1', 0, false, '["SAP 계정", "cf cli", "mbt", "cds cli"]', '{}')$$,
  '22023', '진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다', '사용 중: completion_mode 변경 → 22023');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-09'), 'BTP 개발 초기 세팅', '안내', 'setup', 'self',
                   'month1', 0, false, '["SAP 계정", "cf cli", "mbt", "cds cli"]', '{}')$$,
  '22023', '진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다', '사용 중: stage 변경 → 22023');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-09'), 'BTP 개발 초기 세팅', '안내', 'setup', 'self',
                   'week1', 1, false, '["SAP 계정", "cf cli", "mbt", "cds cli"]', '{}')$$,
  '22023', '진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다', '사용 중: p_days_in_stage 변경 → 22023');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-09'), 'BTP 개발 초기 세팅', '안내', 'setup', 'self',
                   'week1', 0, true, '["SAP 계정", "cf cli", "mbt", "cds cli"]', '{}')$$,
  '22023', '진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다', '사용 중: allow_na 변경 → 22023');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-09'), 'BTP 개발 초기 세팅', '안내', 'setup', 'self',
                   'week1', 0, false, '["SAP 계정", "cf cli", "mbt", "cds cli"]', '{AI-01}')$$,
  '22023', '진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다', '사용 중: 선행 변경 → 22023');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-09'), 'BTP 개발 초기 세팅', '안내', 'practice', 'self',
                   'week1', 0, false, null, '{}')$$,
  '22023', '진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다', '사용 중: 종류 변경 → 22023');
select is((public.save_task_template(pg_temp.tid('AI-09'), 'BTP 초기 세팅(수정)', '고친 안내', 'setup', 'self', 'week1', 0,
            false, '["SAP 계정", "cf cli", "mbt", "cds cli"]', '{}')).title,
  'BTP 초기 세팅(수정)', '사용 중: 제목·안내문만 바꾸면 성공');
-- 시드 input 템플릿(AI-04, 신입A 진행 중)도 제목·안내문은 고칠 수 있다
select is((public.save_task_template(pg_temp.tid('AI-04'), '기술스택·경력 조사(수정)', '고친 안내', 'input', 'self', 'day1', 0,
            false, null, '{}')).title,
  '기술스택·경력 조사(수정)', '사용 중 시드 input 템플릿: 제목·안내문 수정 성공');
select ok((pg_temp.tpl('AI-04')).form_schema is not null, '시드 input 템플릿의 form_schema 그대로');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000101';  -- 신입A
select is((select t.title from public.task_instances i join public.task_templates t on t.id = i.template_id
            where i.new_hire_id = 'a7000000-0000-0000-0000-000000000101' and t.code = 'AI-09'),
  'BTP 초기 세팅(수정)', '신입A의 과제 조회에 새 제목');

-- ── 보관·복원 (Review Focus 4) ──────────────────────────────────────
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select ok((public.archive_task_template(pg_temp.tid('AI-11'))).archived_at is not null, 'AI-11 보관');
reset role;
update public.task_templates set archived_at = timestamptz '2026-01-01 00:00:00+09' where id = pg_temp.tid('AI-11');
set local role authenticated;
select is((public.archive_task_template(pg_temp.tid('AI-11'))).archived_at, timestamptz '2026-01-01 00:00:00+09',
  '다시 보관 → 처음 보관 시각 그대로');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-11'), '보관 중 수정', '', 'practice', 'self', 'week1', 2,
                   false, null, '{AI-12}')$$,
  '22023', '보관된 과제는 고칠 수 없습니다. 먼저 복원해 주세요', '보관된 템플릿 수정 → 22023');
select is((public.restore_task_template(pg_temp.tid('AI-11'))).archived_at, null::timestamptz, '복원 → archived_at = null');
select is((public.save_task_template(pg_temp.tid('AI-11'), '복원 후 수정', '', 'practice', 'self', 'week1', 2, false, null,
            '{AI-12}')).title, '복원 후 수정', '복원 후 수정 성공');

-- 신입A가 진행 중인 HR-02를 보관해도 제출·확인·잠금 해제는 그대로
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000301';  -- 경영지원(hr)
select ok((public.archive_task_template(pg_temp.tid('HR-02'))).archived_at is not null, '경영지원(hr)이 HR-02 보관');
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000101';  -- 신입A
select is((public.submit_task((pg_temp.inst('HR-02', 'a7000000-0000-0000-0000-000000000101')).id)).status::text,
  'submitted', '보관 뒤에도 신입A가 HR-02 제출');
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000301';  -- 경영지원(hr)
select is((public.confirm_task((pg_temp.inst('HR-02', 'a7000000-0000-0000-0000-000000000101')).id)).status::text,
  'done', '보관 뒤에도 담당자가 HR-02 확인');
select is((pg_temp.inst('HR-03', 'a7000000-0000-0000-0000-000000000101')).status::text, 'todo',
  '선행 HR-02가 끝나 신입A의 HR-03이 열린다');

-- ── 한 사람용 과제 (Review Focus 3) ─────────────────────────────────
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select is((public.add_task_for_hire('a7000000-0000-0000-0000-000000000101', '신입A만 실습', '한 사람 안내', 'practice', 'self',
            'week1', 2, false, null)).status::text,
  'todo', '교육 담당자(T) → 신입A 한 사람용 과제 todo');
select is((pg_temp.tpl('AI-P01')).assigned_to, 'a7000000-0000-0000-0000-000000000101'::uuid,
  '템플릿 AI-P01, assigned_to = 신입A');
select is((pg_temp.tpl('AI-P01')).team_id, '00000000-0000-0000-0000-000000000002'::uuid, 'AI-P01 담당 = 팀 T');
select is((pg_temp.tpl('AI-P01')).prerequisite_codes, '{}'::text[], 'AI-P01 선행 없음');
select is((pg_temp.inst('AI-P01', 'a7000000-0000-0000-0000-000000000101')).due_date,
  greatest(date '2026-11-02' + 7, (now() at time zone 'Asia/Seoul')::date), '기한 = 입사일 + 7일, 오늘보다 이르면 오늘');
select is((public.add_task_for_hire('a7000000-0000-0000-0000-000000000105', '지난 입사자 과제', '', 'ops', 'self', 'day1', 0,
            false, null)).due_date,
  (now() at time zone 'Asia/Seoul')::date, '입사 40일 지난 신입에게 day1·0일 과제 → 기한 오늘');
select throws_ok($$select public.add_task_for_hire('a7000000-0000-0000-0000-000000000101', '입력', '', 'input', 'self', 'day1',
                   0, false, null)$$,
  '22023', null, '한 사람용 input → 22023');
select throws_ok($$select public.add_task_for_hire('a7000000-0000-0000-0000-000000000101', '세팅', '', 'setup', 'self', 'day1',
                   0, false, '[]')$$,
  '22023', null, '한 사람용 setup 체크리스트 0개 → 22023');
select throws_ok($$select public.save_task_template(pg_temp.tid('AI-P01'), '한 사람용 수정', '', 'practice', 'self', 'week1', 2,
                   false, null, '{}')$$,
  '42501', null, '한 사람용 템플릿을 save_task_template로 수정 → 42501');
select throws_ok($$select public.archive_task_template(pg_temp.tid('AI-P01'))$$,
  '22023', '한 사람용 과제는 보관하지 않습니다. 신입의 과제에서 해당 없음으로 처리해 주세요',
  '한 사람용 템플릿 보관 → 22023');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000202';  -- 교육 담당자(T2)
select throws_ok($$select public.add_task_for_hire('a7000000-0000-0000-0000-000000000101', '남의 팀 신입', '', 'ops', 'self',
                   'day1', 0, false, null)$$,
  '42501', null, '교육 담당자(T2) → 팀 T 신입에게 추가 42501');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000301';  -- 경영지원(hr)
select is((public.add_task_for_hire('a7000000-0000-0000-0000-000000000101', '인사 서류 보완', '', 'setup', 'confirm', 'week1', 0,
            false, '["서류 1", "서류 2"]')).status::text,
  'todo', '경영지원(hr) → 신입A 한 사람용 과제 추가 성공');
select is((pg_temp.tpl('HR-P01')).assigned_to, 'a7000000-0000-0000-0000-000000000101'::uuid,
  '경영지원(hr) 한 사람용 → HR-P01, assigned_to = 신입A');
select is((pg_temp.tpl('HR-P01')).department, 'hr'::public.ops_department, 'HR-P01 담당 = hr');
select throws_ok($$select public.add_task_for_hire('a7000000-0000-0000-0000-000000000101', '평가', '', 'assessment',
                   'staff_only', 'week1', 0, false, null)$$,
  '42501', null, '경영지원이 한 사람용 assessment → 42501');
select throws_ok($$select public.add_task_for_hire('a7000000-0000-0000-0000-000000000202', '대상 아님', '', 'ops', 'self',
                   'day1', 0, false, null)$$,
  'P0002', null, '신입이 아닌 대상 → P0002');
select throws_ok($$select public.add_task_for_hire(gen_random_uuid(), '없는 대상', '', 'ops', 'self', 'day1', 0, false, null)$$,
  'P0002', null, '없는 대상 → P0002');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000401';  -- 관리자
select throws_ok($$select public.add_task_for_hire('a7000000-0000-0000-0000-000000000101', '관리자 추가', '', 'ops', 'self',
                   'day1', 0, false, null)$$,
  '42501', null, '관리자 → 한 사람용 추가 42501');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000101';  -- 신입A
select throws_ok($$select public.add_task_for_hire('a7000000-0000-0000-0000-000000000101', '셀프 추가', '', 'ops', 'self',
                   'day1', 0, false, null)$$,
  '42501', null, '신입A 본인 → 한 사람용 추가 42501');
select is((select count(*)::int from public.task_instances i join public.task_templates t on t.id = i.template_id
            where i.new_hire_id = 'a7000000-0000-0000-0000-000000000101' and t.code in ('AI-P01', 'HR-P01')), 2,
  '신입A: 한 사람용 과제 2개가 보인다');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000102';  -- 신입B
select is((select count(*)::int from public.task_templates where code in ('AI-P01', 'HR-P01')), 0,
  '신입B: 신입A의 한 사람용 템플릿 행이 안 보인다');

reset role;
select is((select count(*)::int from public.task_instances where new_hire_id = 'a7000000-0000-0000-0000-000000000102'),
  (select n from hire_b_before), '신입B 인스턴스 수 변화 없음');
select ok(public._start_onboarding('a7000000-0000-0000-0000-000000000106') > 0, '신입F 온보딩 시작');
select is((select count(*)::int from public.task_instances i join public.task_templates t on t.id = i.template_id
            where i.new_hire_id = 'a7000000-0000-0000-0000-000000000106' and t.assigned_to is not null), 0,
  '이후 신입F _start_onboarding에 한 사람용 템플릿 없음');
select ok((pg_temp.inst('AI-12', 'a7000000-0000-0000-0000-000000000106')).id is not null,
  '새로 만든 AI-12는 신입F에게 들어간다');
select ok((pg_temp.inst('HR-02', 'a7000000-0000-0000-0000-000000000106')).id is null,
  '보관한 HR-02는 신입F에게 안 들어간다');
select is((pg_temp.inst('HR-03', 'a7000000-0000-0000-0000-000000000106')).status::text, 'todo',
  '보관한 HR-02를 선행으로 둔 HR-03은 신입F에게 잠기지 않는다');

-- ── anon ────────────────────────────────────────────────────────────
set local role anon;
select throws_ok('select count(*) from public.task_templates', '42501', null, 'anon: task_templates 읽기 권한 오류');

select * from finish();
rollback;
