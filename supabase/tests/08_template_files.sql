-- 과제 서식 저장소 테스트(버킷, task_template_files 테이블·RLS, storage.objects 정책). 픽스처를 더해 확인하고 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(80);

-- ── 픽스처 ──────────────────────────────────────────────────────────
-- 시드 조직 O, AI팀(T), 다른 팀 T2, 다른 조직 X. 사람·문서는 모두 가상.
insert into public.orgs (id, name) values
  ('a8000000-0000-0000-0000-0000000000f1', '다른 가상 조직');
insert into public.teams (id, org_id, name, org_line) values
  ('a8000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', '팀T2', '{팀T2}');

insert into auth.users (id, email) values
  ('a8000000-0000-0000-0000-000000000101', 'new-a@forms.test'),
  ('a8000000-0000-0000-0000-000000000102', 'new-b@forms.test'),
  ('a8000000-0000-0000-0000-000000000201', 'trainer@forms.test'),
  ('a8000000-0000-0000-0000-000000000202', 'trainer2@forms.test'),
  ('a8000000-0000-0000-0000-000000000301', 'hr@forms.test'),
  ('a8000000-0000-0000-0000-000000000302', 'ga@forms.test'),
  ('a8000000-0000-0000-0000-000000000401', 'admin@forms.test'),
  ('a8000000-0000-0000-0000-000000000501', 'other@forms.test');

insert into public.profiles (id, org_id, email, full_name, role, department, team_id, hire_date) values
  ('a8000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'new-a@forms.test', '신입A', 'new_hire', null, '00000000-0000-0000-0000-000000000002', date '2026-11-02'),
  ('a8000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'new-b@forms.test', '신입B', 'new_hire', null, '00000000-0000-0000-0000-000000000002', date '2026-11-02'),
  ('a8000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'trainer@forms.test', '교육', 'team_trainer', null, '00000000-0000-0000-0000-000000000002', null),
  ('a8000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', 'trainer2@forms.test', '교육2', 'team_trainer', null, 'a8000000-0000-0000-0000-0000000000a2', null),
  ('a8000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'hr@forms.test', '인사', 'ops_staff', 'hr', null, null),
  ('a8000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', 'ga@forms.test', '총무', 'ops_staff', 'ga', null, null),
  ('a8000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 'admin@forms.test', '관리', 'admin', null, null, null),
  ('a8000000-0000-0000-0000-000000000501', 'a8000000-0000-0000-0000-0000000000f1', 'other@forms.test', '타사', 'admin', null, null, null);

-- 템플릿: 팀 T 일반(601), ga(602), 팀 T 보관(603), 팀 T 신입A 전용(604), 다른 조직(605)
insert into public.task_templates (id, org_id, code, title, stage, department, team_id, kind, completion_mode, archived_at, assigned_to) values
  ('a8000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000001', 'F8-T1', '팀 서식 과제', 'day1', null,
   '00000000-0000-0000-0000-000000000002', 'read', 'self', null, null),
  ('a8000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000001', 'F8-G1', '총무 서식 과제', 'day1', 'ga',
   null, 'ops', 'confirm', null, null),
  ('a8000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000001', 'F8-T2', '보관된 과제', 'day1', null,
   '00000000-0000-0000-0000-000000000002', 'read', 'self', now(), null),
  ('a8000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000001', 'F8-P1', '신입A만 과제', 'day1', null,
   '00000000-0000-0000-0000-000000000002', 'read', 'self', null, 'a8000000-0000-0000-0000-000000000101'),
  ('a8000000-0000-0000-0000-000000000605', 'a8000000-0000-0000-0000-0000000000f1', 'F8-O1', '다른 조직 과제', 'day1', 'hr',
   null, 'ops', 'confirm', null, null);

-- 영향받은 행 수(현재 역할·RLS로 실행)
create function pg_temp.affected(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 버킷·권한 ───────────────────────────────────────────────────────
select results_eq(
  $$select name, public, file_size_limit, array(select m from unnest(allowed_mime_types) as m order by m)
      from storage.buckets where id = 'task-forms'$$,
  $$values ('task-forms'::text, false, 10485760::bigint,
            array['application/pdf',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])$$,
  '버킷 task-forms: 비공개, 10MB, MIME 3종');
select ok((select relrowsecurity from pg_class where oid = 'public.task_template_files'::regclass),
  'task_template_files: RLS 켜짐');
select ok(not has_table_privilege('anon', 'public.task_template_files',
  'select, insert, update, delete, truncate, references, trigger'), 'task_template_files: anon 권한 없음');
select ok(has_table_privilege('authenticated', 'public.task_template_files', 'select')
  and has_table_privilege('authenticated', 'public.task_template_files', 'insert')
  and has_table_privilege('authenticated', 'public.task_template_files', 'delete'),
  'task_template_files: authenticated select·insert·delete');
select ok(not has_table_privilege('authenticated', 'public.task_template_files', 'update, truncate, references, trigger'),
  'task_template_files: authenticated update 등 없음');
select ok(has_function_privilege('authenticated', 'private.is_handler(public.task_templates)', 'execute'),
  'is_handler: authenticated 실행 가능(정책에서 부른다)');
select ok(not has_function_privilege('anon', 'private.is_handler(public.task_templates)', 'execute'),
  'is_handler: anon 실행 불가');

-- 보관된 템플릿의 기존 서식, 신입A 전용 템플릿의 서식(행·객체)
insert into public.task_template_files (id, org_id, template_id, file_name, storage_path, size_bytes, uploaded_by) values
  ('a8000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000603',
   '보관 전 서식.pdf', '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000603/a8000000-0000-0000-0000-00000000c010.pdf',
   1000, 'a8000000-0000-0000-0000-000000000201'),
  ('a8000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000604',
   '신입A 서식.pdf', '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000604/a8000000-0000-0000-0000-00000000c030.pdf',
   1000, 'a8000000-0000-0000-0000-000000000201');
insert into storage.objects (bucket_id, name) values
  ('task-forms', '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000604/a8000000-0000-0000-0000-00000000c030.pdf'),
  ('task-forms', '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c001.docx');

-- 기본 서식(is_seed)은 service_role로 넣는다
set local role service_role;
insert into public.task_template_files (id, org_id, template_id, file_name, storage_path, size_bytes, is_seed) values
  ('a8000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601',
   '기본 서식.pdf', '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c020.pdf',
   2000, true);
insert into storage.objects (bucket_id, name) values
  ('task-forms', '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c020.pdf');
reset role;

-- ══ task_template_files: 추가 ═══════════════════════════════════════
set local role authenticated;

set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select lives_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '신청서.docx',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c001.docx',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  '교육 담당자(T)가 팀 T 템플릿에 서식 추가 → 성공');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '신청서.docx',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c002.docx',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  '23505', null, '같은 템플릿에 같은 file_name 다시 → 23505');

-- 범위 밖·위장 추가 → RLS 거부
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000101';  -- 신입A
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '신입 서식.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c003.pdf',
          1000, 'a8000000-0000-0000-0000-000000000101')$$,
  '42501', null, '신입A가 서식 추가 → 42501');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000202';  -- 교육 담당자(T2)
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '남의 팀 서식.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c004.pdf',
          1000, 'a8000000-0000-0000-0000-000000000202')$$,
  '42501', null, '교육 담당자(T2)가 팀 T 템플릿에 추가 → 42501');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000301';  -- 경영지원(hr)
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '인사 서식.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c005.pdf',
          1000, 'a8000000-0000-0000-0000-000000000301')$$,
  '42501', null, '경영지원(hr)이 팀 T 템플릿에 추가 → 42501');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000602', '인사 서식.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000602/a8000000-0000-0000-0000-00000000c006.pdf',
          1000, 'a8000000-0000-0000-0000-000000000301')$$,
  '42501', null, '경영지원(hr)이 ga 템플릿에 추가 → 42501');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000302';  -- 경영지원(ga)
select lives_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000602', '총무 서식.xlsx',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000602/a8000000-0000-0000-0000-00000000c007.xlsx',
          1000, 'a8000000-0000-0000-0000-000000000302')$$,
  '경영지원(ga)이 ga 템플릿에 추가 → 성공');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000401';  -- 관리자
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '관리자 서식.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c008.pdf',
          1000, 'a8000000-0000-0000-0000-000000000401')$$,
  '42501', null, '관리자가 서식 추가 → 42501(올리기는 담당자만)');

set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by, is_seed)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '가짜 기본.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c011.pdf',
          1000, 'a8000000-0000-0000-0000-000000000201', true)$$,
  '42501', null, 'is_seed = true로 추가 → 42501');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '남의 이름.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c012.pdf',
          1000, 'a8000000-0000-0000-0000-000000000202')$$,
  '42501', null, '남의 uploaded_by로 추가 → 42501');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '이름 없음.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c016.pdf',
          1000, null)$$,
  '42501', null, 'uploaded_by 비움 → 42501');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('a8000000-0000-0000-0000-0000000000f1', 'a8000000-0000-0000-0000-000000000601', '다른 조직.pdf',
          'a8000000-0000-0000-0000-0000000000f1/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c013.pdf',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  '42501', null, '다른 조직 org_id로 추가 → 42501');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000605', '다른 조직 템플릿.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000605/a8000000-0000-0000-0000-00000000c014.pdf',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  '42501', null, '다른 조직 템플릿에 추가 → 42501');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000603', '보관 후 서식.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000603/a8000000-0000-0000-0000-00000000c015.pdf',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  '42501', null, '보관된 템플릿에 추가 → 42501');

-- 형식 검사(Review Focus 4)
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '빈 파일.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c021.pdf',
          0, 'a8000000-0000-0000-0000-000000000201')$$,
  '23514', null, 'size_bytes 0 → 23514');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '큰 파일.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c022.pdf',
          10485761, 'a8000000-0000-0000-0000-000000000201')$$,
  '23514', null, 'size_bytes 10485761 → 23514');
select lives_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '딱 10MB.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c023.pdf',
          10485760, 'a8000000-0000-0000-0000-000000000201')$$,
  'size_bytes 10485760 → 성공');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', 'a.exe',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c024.pdf',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  '23514', null, 'file_name a.exe → 23514');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '노트',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c025.pdf',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  '23514', null, 'file_name 확장자 없음 → 23514');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', repeat('가', 117) || '.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c026.pdf',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  '23514', null, 'file_name 121자 → 23514');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '경로 틀림.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000602/a8000000-0000-0000-0000-00000000c027.pdf',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  '23514', null, 'storage_path가 다른 템플릿 폴더 → 23514');
select throws_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '한글 경로.pdf',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/한글 경로.pdf',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  '23514', null, 'storage_path에 원본 이름 → 23514');
select lives_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '신청서.PDF',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c028.pdf',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  'file_name 신청서.PDF(대문자 확장자) → 성공');
select lives_ok($$insert into public.task_template_files (org_id, template_id, file_name, storage_path, size_bytes, uploaded_by)
  values ('00000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000601', '보고서.final.xlsx',
          '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c029.xlsx',
          1000, 'a8000000-0000-0000-0000-000000000201')$$,
  'file_name 보고서.final.xlsx(점 여러 개) → 성공');

-- update 권한 없음
select throws_ok($$update public.task_template_files set file_name = '바꾼 이름.pdf'
                    where id = 'a8000000-0000-0000-0000-000000000703'$$,
  '42501', null, '교육 담당자 update → 권한 오류');

-- ══ task_template_files: 조회 ═══════════════════════════════════════
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000101';  -- 신입A
select is((select count(*)::int from public.task_template_files where template_id = 'a8000000-0000-0000-0000-000000000601'), 5,
  '신입A: 일반 템플릿 서식 5개가 보인다');
select is((select count(*)::int from public.task_template_files where template_id = 'a8000000-0000-0000-0000-000000000604'), 1,
  '신입A: 본인 전용 템플릿 서식이 보인다');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000102';  -- 신입B
select is((select count(*)::int from public.task_template_files where template_id = 'a8000000-0000-0000-0000-000000000601'), 5,
  '신입B: 일반 템플릿 서식 5개가 보인다');
select is_empty($$select 1 from public.task_template_files where template_id = 'a8000000-0000-0000-0000-000000000604'$$,
  '신입B: 신입A 전용 템플릿 서식은 0행 (Review Focus 1)');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select is((select count(*)::int from public.task_template_files where template_id = 'a8000000-0000-0000-0000-000000000604'), 1,
  '교육 담당자(T, 담당): 신입A 전용 템플릿 서식이 보인다');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000202';  -- 교육 담당자(T2)
select is_empty($$select 1 from public.task_template_files where template_id = 'a8000000-0000-0000-0000-000000000604'$$,
  '다른 팀 교육 담당자(T2): 신입A 전용 템플릿 서식은 0행');
select is((select count(*)::int from public.task_template_files where template_id = 'a8000000-0000-0000-0000-000000000601'), 5,
  '다른 팀 교육 담당자(T2): 일반 템플릿 서식 5개는 그대로 보인다');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000301';  -- 경영지원(hr)
select is_empty($$select 1 from public.task_template_files where template_id = 'a8000000-0000-0000-0000-000000000604'$$,
  '경영지원(hr, 담당 아님): 신입A 전용 템플릿 서식은 0행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000401';  -- 관리자
select is((select count(*)::int from public.task_template_files where template_id = 'a8000000-0000-0000-0000-000000000604'), 1,
  '관리자: 신입A 전용 템플릿 서식이 보인다(데모 초기화 정리용)');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000501';  -- 다른 조직
select is_empty($$select 1 from public.task_template_files$$, '다른 조직 사용자: 서식 0행');

-- ══ task_template_files: 삭제 ═══════════════════════════════════════
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select is(pg_temp.affected($$delete from public.task_template_files where id = 'a8000000-0000-0000-0000-000000000703'$$), 0,
  '교육 담당자가 기본 서식 행 delete → 0행');
select is(pg_temp.affected($$delete from public.task_template_files where id = 'a8000000-0000-0000-0000-000000000701'$$), 1,
  '교육 담당자가 보관된 템플릿의 서식 delete → 1행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000202';  -- 교육 담당자(T2)
select is(pg_temp.affected($$delete from public.task_template_files where file_name = '보고서.final.xlsx'$$), 0,
  '교육 담당자(T2)가 팀 T 서식 delete → 0행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000101';  -- 신입A
select is(pg_temp.affected($$delete from public.task_template_files where file_name = '보고서.final.xlsx'$$), 0,
  '신입A가 서식 delete → 0행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000401';  -- 관리자
select is(pg_temp.affected($$delete from public.task_template_files where id = 'a8000000-0000-0000-0000-000000000703'$$), 0,
  '관리자가 기본 서식 행 delete → 0행');
select is(pg_temp.affected($$delete from public.task_template_files where file_name = '보고서.final.xlsx'$$), 1,
  '관리자가 담당자 서식 delete → 1행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000501';  -- 다른 조직 관리자
select is(pg_temp.affected($$delete from public.task_template_files where file_name = '신청서.PDF'$$), 0,
  '다른 조직 관리자가 서식 delete → 0행');

reset role;
select is((select count(*)::int from public.task_template_files where id = 'a8000000-0000-0000-0000-000000000703'), 1,
  '기본 서식 행은 그대로');

-- ══ storage.objects ═════════════════════════════════════════════════
set local role authenticated;

-- 올리기
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000101';  -- 신입A
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-forms',
  '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c101.pdf')$$,
  '42501', null, 'storage: 신입A 올리기 → 42501');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000202';  -- 교육 담당자(T2)
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-forms',
  '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c106.pdf')$$,
  '42501', null, 'storage: 교육 담당자(T2)가 팀 T 폴더에 올리기 → 42501');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000401';  -- 관리자
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-forms',
  '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c107.pdf')$$,
  '42501', null, 'storage: 관리자 올리기 → 42501');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select lives_ok($$insert into storage.objects (bucket_id, name) values ('task-forms',
  '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c102.pdf')$$,
  'storage: 교육 담당자(T)가 {org}/{T 템플릿}/에 올리기 → 성공');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-forms',
  '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000602/a8000000-0000-0000-0000-00000000c103.pdf')$$,
  '42501', null, 'storage: 교육 담당자(T)가 ga 템플릿 폴더에 올리기 → 42501');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-forms',
  'a8000000-0000-0000-0000-0000000000f1/a8000000-0000-0000-0000-000000000605/a8000000-0000-0000-0000-00000000c104.pdf')$$,
  '42501', null, 'storage: 교육 담당자(T)가 다른 조직 폴더에 올리기 → 42501');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-forms',
  'a8000000-0000-0000-0000-0000000000f1/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c108.pdf')$$,
  '42501', null, 'storage: 교육 담당자(T)가 다른 조직 이름 아래 자기 템플릿 폴더에 올리기 → 42501');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-forms',
  '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000603/a8000000-0000-0000-0000-00000000c105.pdf')$$,
  '42501', null, 'storage: 교육 담당자(T)가 보관된 템플릿 폴더에 올리기 → 42501');
select is(pg_temp.affected($$update storage.objects set metadata = '{}'::jsonb where bucket_id = 'task-forms'
  and name = '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c102.pdf'$$), 0,
  'storage: update(덮어쓰기) 정책 없음 → 0행');

-- 조회(서명 URL도 같은 select 정책을 따른다)
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000101';  -- 신입A
select is((select count(*)::int from storage.objects where bucket_id = 'task-forms'
            and name like '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000604/%'), 1,
  'storage: 신입A는 본인 전용 템플릿 폴더 객체가 보인다');
select is((select count(*)::int from storage.objects where bucket_id = 'task-forms'
            and name like '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/%'), 3,
  'storage: 신입A는 일반 템플릿 폴더 객체 3개가 보인다');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000102';  -- 신입B
select is_empty($$select 1 from storage.objects where bucket_id = 'task-forms'
                   and name like '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000604/%'$$,
  'storage: 신입B는 신입A 전용 템플릿 폴더 객체 0행 (Review Focus 1)');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select is((select count(*)::int from storage.objects where bucket_id = 'task-forms'
            and name like '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000604/%'), 1,
  'storage: 교육 담당자(T, 담당)는 신입A 전용 템플릿 폴더 객체가 보인다');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000202';  -- 교육 담당자(T2)
select is_empty($$select 1 from storage.objects where bucket_id = 'task-forms'
                   and name like '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000604/%'$$,
  'storage: 다른 팀 교육 담당자(T2)는 신입A 전용 템플릿 폴더 객체 0행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000301';  -- 경영지원(hr)
select is_empty($$select 1 from storage.objects where bucket_id = 'task-forms'
                   and name like '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000604/%'$$,
  'storage: 경영지원(hr, 담당 아님)은 신입A 전용 템플릿 폴더 객체 0행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000401';  -- 관리자
select is((select count(*)::int from storage.objects where bucket_id = 'task-forms'
            and name like '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000604/%'), 1,
  'storage: 관리자는 신입A 전용 템플릿 폴더 객체가 보인다');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000501';  -- 다른 조직
select is_empty($$select 1 from storage.objects where bucket_id = 'task-forms'$$,
  'storage: 다른 조직 사용자 0행');

-- 지우기(Ruling A: 직접 삭제 보호 트리거를 이 트랜잭션에서만 푼다. 정책에 걸리면 0행)
set local storage.allow_delete_query = 'true';
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select is(pg_temp.affected($$delete from storage.objects where bucket_id = 'task-forms'
  and name = '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c020.pdf'$$), 0,
  'storage: 담당자가 기본 서식 객체 delete → 0행 (Review Focus 2)');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000401';  -- 관리자
select is(pg_temp.affected($$delete from storage.objects where bucket_id = 'task-forms'
  and name = '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c020.pdf'$$), 0,
  'storage: 관리자가 기본 서식 객체 delete → 0행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000101';  -- 신입A
select is(pg_temp.affected($$delete from storage.objects where bucket_id = 'task-forms'
  and name = '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c001.docx'$$), 0,
  'storage: 신입A가 객체 delete → 0행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000202';  -- 교육 담당자(T2)
select is(pg_temp.affected($$delete from storage.objects where bucket_id = 'task-forms'
  and name = '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c001.docx'$$), 0,
  'storage: 교육 담당자(T2)가 팀 T 객체 delete → 0행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000501';  -- 다른 조직 관리자
select is(pg_temp.affected($$delete from storage.objects where bucket_id = 'task-forms'
  and name = '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c001.docx'$$), 0,
  'storage: 다른 조직 관리자가 객체 delete → 0행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select is(pg_temp.affected($$delete from storage.objects where bucket_id = 'task-forms'
  and name = '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c102.pdf'$$), 1,
  'storage: 담당자가 자기가 올린 객체 delete → 1행');
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000401';  -- 관리자
select is(pg_temp.affected($$delete from storage.objects where bucket_id = 'task-forms'
  and name = '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c001.docx'$$), 1,
  'storage: 관리자가 담당자 서식 객체 delete → 1행');

-- 올리기 경로 형식: {org}/{template}/{uuid}.{pdf|docx|xlsx}만(폴더 두 단계, 파일 이름은 uuid). 테이블 storage_path 검사와 같다.
-- (위 개수 확인에 섞이지 않게 맨 뒤에서 한다)
set local request.jwt.claim.sub = 'a8000000-0000-0000-0000-000000000201';  -- 교육 담당자(T)
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-forms',
  '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/sub/a8000000-0000-0000-0000-00000000c110.pdf')$$,
  '42501', null, 'storage: 담당자가 템플릿 폴더 아래 하위 폴더에 올리기 → 42501');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-forms',
  '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/신청서.pdf')$$,
  '42501', null, 'storage: 담당자가 uuid가 아닌 파일 이름으로 올리기 → 42501');

reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'task-forms'
            and name = '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c020.pdf'), 1,
  'storage: 기본 서식 객체는 그대로');

-- ── anon ────────────────────────────────────────────────────────────
set local role anon;
select throws_ok('select 1 from public.task_template_files', '42501', null, 'anon: task_template_files 권한 오류');
select is_empty($$select 1 from storage.objects where bucket_id = 'task-forms'$$, 'anon: storage 서식 객체 0행');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-forms',
  '00000000-0000-0000-0000-000000000001/a8000000-0000-0000-0000-000000000601/a8000000-0000-0000-0000-00000000c109.pdf')$$,
  '42501', null, 'anon: storage 올리기 → 42501');

select * from finish();
rollback;
