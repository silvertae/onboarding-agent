-- 규정 문서·조항 스키마, RLS, 버킷 테스트. 픽스처는 이 파일 안에서 만들고 끝나면 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- ── 픽스처 (postgres 권한) ───────────────────────────────────────────
-- 조직 O(팀 T·T2)와 다른 조직 O2. 사람·문서는 모두 가상.
insert into public.orgs (id, name) values
  ('a9000000-0000-0000-0000-000000000001', '테스트 가상 조직'),
  ('a9000000-0000-0000-0000-0000000000f1', '다른 가상 조직');
insert into public.teams (id, org_id, name, org_line) values
  ('a9000000-0000-0000-0000-0000000000a1', 'a9000000-0000-0000-0000-000000000001', '팀T',  '{팀T}'),
  ('a9000000-0000-0000-0000-0000000000a2', 'a9000000-0000-0000-0000-000000000001', '팀T2', '{팀T2}');

insert into auth.users (id, email) values
  ('a9000000-0000-0000-0000-000000000101', 'new-a@docs.test'),
  ('a9000000-0000-0000-0000-000000000201', 'trainer@docs.test'),
  ('a9000000-0000-0000-0000-000000000202', 'trainer2@docs.test'),
  ('a9000000-0000-0000-0000-000000000301', 'ga@docs.test');

insert into public.profiles (id, org_id, email, full_name, job_title, role, department, team_id, hire_date) values
  ('a9000000-0000-0000-0000-000000000101', 'a9000000-0000-0000-0000-000000000001', 'new-a@docs.test',    '신입A',  '사원', 'new_hire',     null, 'a9000000-0000-0000-0000-0000000000a1', current_date),
  ('a9000000-0000-0000-0000-000000000201', 'a9000000-0000-0000-0000-000000000001', 'trainer@docs.test',  '교육',   '책임', 'team_trainer', null, 'a9000000-0000-0000-0000-0000000000a1', null),
  ('a9000000-0000-0000-0000-000000000202', 'a9000000-0000-0000-0000-000000000001', 'trainer2@docs.test', '교육2',  '책임', 'team_trainer', null, 'a9000000-0000-0000-0000-0000000000a2', null),
  ('a9000000-0000-0000-0000-000000000301', 'a9000000-0000-0000-0000-000000000001', 'ga@docs.test',       '총무',   '대리', 'ops_staff',    'ga', null, null);

-- 문서 여섯: 조직 O의 회사 ready(d1)·회사 failed(d2)·팀T ready(d3)·팀T2 ready(d4), 조직 O2의 회사 ready(d5)·failed(d6)
insert into public.policy_documents (id, org_id, scope, team_id, title, file_path, file_type, status, clause_count) values
  ('a9000000-0000-0000-0000-0000000000d1', 'a9000000-0000-0000-0000-000000000001', 'company', null,
   '회사 규정', 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000d1.pdf', 'pdf', 'ready', 2),
  ('a9000000-0000-0000-0000-0000000000d2', 'a9000000-0000-0000-0000-000000000001', 'company', null,
   '실패한 회사 규정', 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000d2.pdf', 'pdf', 'failed', 0),
  ('a9000000-0000-0000-0000-0000000000d3', 'a9000000-0000-0000-0000-000000000001', 'team', 'a9000000-0000-0000-0000-0000000000a1',
   '팀T 규정', 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000d3.docx', 'docx', 'ready', 1),
  ('a9000000-0000-0000-0000-0000000000d4', 'a9000000-0000-0000-0000-000000000001', 'team', 'a9000000-0000-0000-0000-0000000000a2',
   '팀T2 규정', 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000d4.pdf', 'pdf', 'ready', 1),
  ('a9000000-0000-0000-0000-0000000000d5', 'a9000000-0000-0000-0000-0000000000f1', 'company', null,
   'O2 규정', 'a9000000-0000-0000-0000-0000000000f1/a9000000-0000-0000-0000-0000000000d5.pdf', 'pdf', 'ready', 1),
  ('a9000000-0000-0000-0000-0000000000d6', 'a9000000-0000-0000-0000-0000000000f1', 'company', null,
   'O2 실패 규정', 'a9000000-0000-0000-0000-0000000000f1/a9000000-0000-0000-0000-0000000000d6.pdf', 'pdf', 'failed', 0);

-- 조항: d1 둘(c1·c2), d3 하나(c3), d4 하나(c4), d5 하나(c5), failed였다가 남은 d2 조항 하나(c6, 보이면 안 된다)
insert into public.document_clauses (id, org_id, document_id, ord, label, heading, body) values
  ('a9000000-0000-0000-0000-000000000c01', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000d1', 1, '제1조', '목적', '가상 규정 본문 1'),
  ('a9000000-0000-0000-0000-000000000c02', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000d1', 2, '제2조', '범위', '가상 규정 본문 2'),
  ('a9000000-0000-0000-0000-000000000c03', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000d3', 1, '제1조', '팀 규칙', '가상 팀 규정 본문'),
  ('a9000000-0000-0000-0000-000000000c04', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000d4', 1, '제1조', '다른 팀 규칙', '가상 다른 팀 본문'),
  ('a9000000-0000-0000-0000-000000000c05', 'a9000000-0000-0000-0000-0000000000f1', 'a9000000-0000-0000-0000-0000000000d5', 1, '제1조', '다른 조직', '가상 다른 조직 본문'),
  ('a9000000-0000-0000-0000-000000000c06', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000d2', 1, '제1조', '실패 문서', '가상 실패 문서 본문');

-- 원본 파일 객체 (문서마다 하나)
insert into storage.objects (bucket_id, name) values
  ('policy-docs', 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000d1.pdf'),
  ('policy-docs', 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000d3.docx'),
  ('policy-docs', 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000d4.pdf');

-- 지식 둘: 팀T(k1), 회사 공통(k2)
insert into public.knowledge_items (id, org_id, scope, team_id, question, answer) values
  ('a9000000-0000-0000-0000-0000000000b1', 'a9000000-0000-0000-0000-000000000001', 'team', 'a9000000-0000-0000-0000-0000000000a1', '팀 질문', '팀 답'),
  ('a9000000-0000-0000-0000-0000000000b2', 'a9000000-0000-0000-0000-000000000001', 'company', null, '회사 질문', '회사 답');

-- ════ 스키마 ═════════════════════════════════════════════════════════
select has_table('public', 'policy_documents', '규정 문서 테이블');
select has_table('public', 'document_clauses', '조항 테이블');
select has_table('public', 'knowledge_sources', '지식 출처 테이블');
select has_column('public', 'knowledge_items', 'origin', 'knowledge_items.origin');
select is((select origin from public.knowledge_items where id = 'a9000000-0000-0000-0000-0000000000b1'), 'manual',
  'knowledge_items.origin 기본값은 manual');
select throws_ok(
  $$insert into public.policy_documents (org_id, scope, title, file_path, file_type)
    values ('a9000000-0000-0000-0000-000000000001', 'company', '경로 불일치', 'a9000000-0000-0000-0000-000000000001/other.pdf', 'pdf')$$,
  '23514', null, 'file_path가 {org}/{id}.{ext} 모양이 아니면 거부');

select results_eq(
  $$select file_size_limit, allowed_mime_types, public from storage.buckets where id = 'policy-docs'$$,
  $$values (10485760::bigint,
            array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[],
            false)$$,
  'policy-docs 버킷: 10MB, pdf·docx, 비공개');

-- ── 신입A(팀T) ──────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000101';

select results_eq('select count(*) from public.document_clauses', array[3::bigint],
  '신입A: 회사 ready(2) + 팀T ready(1) 조항만 보인다');
select results_eq('select id from public.policy_documents order by id',
  $$values ('a9000000-0000-0000-0000-0000000000d1'::uuid), ('a9000000-0000-0000-0000-0000000000d3'::uuid)$$,
  '신입A: 읽기 범위의 ready 문서 메타데이터 2행만 보인다');
select is_empty('select 1 from public.knowledge_sources', '신입A: knowledge_sources 0행');
select is_empty($$select 1 from storage.objects where bucket_id = 'policy-docs'$$, '신입A: 원본 파일은 받을 수 없다');

-- ── 교육 담당자(T) ──────────────────────────────────────────────────
set local request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000201';

select is((select count(*) from public.document_clauses where id = 'a9000000-0000-0000-0000-000000000c01'), 1::bigint,
  'trainer: 회사 ready 조항을 읽을 수 있다');
select is_empty($$select 1 from public.policy_documents where id = 'a9000000-0000-0000-0000-0000000000d2'$$,
  'trainer: 회사 failed 문서 행은 관리 범위 밖이라 안 보인다');
select is_empty($$select 1 from public.document_clauses where id = 'a9000000-0000-0000-0000-000000000c06'$$,
  'trainer: failed 문서의 조항은 안 보인다');
select is_empty($$select 1 from public.policy_documents where id = 'a9000000-0000-0000-0000-0000000000d4'$$,
  'trainer: 팀T2 문서는 안 보인다');
select results_eq($$select count(*) from storage.objects where bucket_id = 'policy-docs'$$, array[1::bigint],
  'trainer: 원본 파일은 팀T 문서 것만 받을 수 있다');

select throws_ok(
  $$insert into public.policy_documents (id, org_id, scope, title, file_path, file_type)
    values ('a9000000-0000-0000-0000-0000000000e1', 'a9000000-0000-0000-0000-000000000001', 'company', '회사 문서',
            'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000e1.pdf', 'pdf')$$,
  '42501', null, 'trainer: 회사 문서 insert 불가');
select lives_ok(
  $$insert into public.policy_documents (id, org_id, scope, team_id, title, file_path, file_type)
    values ('a9000000-0000-0000-0000-0000000000e2', 'a9000000-0000-0000-0000-000000000001', 'team', 'a9000000-0000-0000-0000-0000000000a1', '팀T 새 문서',
            'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000e2.pdf', 'pdf')$$,
  'trainer: 팀T 문서 insert');
select throws_ok(
  $$insert into public.policy_documents (id, org_id, scope, team_id, title, file_path, file_type)
    values ('a9000000-0000-0000-0000-0000000000e3', 'a9000000-0000-0000-0000-000000000001', 'team', 'a9000000-0000-0000-0000-0000000000a2', '팀T2 새 문서',
            'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000e3.pdf', 'pdf')$$,
  '42501', null, 'trainer: 팀T2 문서 insert 불가');
select throws_ok('update public.policy_documents set status = ''ready''', '42501', null,
  'trainer: policy_documents update 권한 없음(상태는 RPC만)');

-- 원본 파일 업로드
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('policy-docs', 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000e2.pdf', 'a9000000-0000-0000-0000-000000000201')$$,
  'trainer: 팀T 문서 파일 업로드');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('policy-docs', 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000d4.pdf', 'a9000000-0000-0000-0000-000000000201')$$,
  '42501', null, 'trainer: 팀T2 문서 경로로 업로드 불가');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('policy-docs', 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000d1.pdf', 'a9000000-0000-0000-0000-000000000201')$$,
  '42501', null, 'trainer: 회사 문서 경로로 업로드 불가');

-- knowledge_sources
select lives_ok(
  $$insert into public.knowledge_sources (knowledge_id, clause_id, org_id)
    values ('a9000000-0000-0000-0000-0000000000b1', 'a9000000-0000-0000-0000-000000000c01', 'a9000000-0000-0000-0000-000000000001')$$,
  'trainer: 팀T 지식에 회사 ready 조항 연결');
select results_eq('select count(*) from public.knowledge_sources', array[1::bigint], 'trainer: 연결이 보인다');
select throws_ok(
  $$insert into public.knowledge_sources (knowledge_id, clause_id, org_id)
    values ('a9000000-0000-0000-0000-0000000000b2', 'a9000000-0000-0000-0000-000000000c01', 'a9000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'trainer: 회사 지식 연결 불가');
select throws_ok(
  $$insert into public.knowledge_sources (knowledge_id, clause_id, org_id)
    values ('a9000000-0000-0000-0000-0000000000b1', 'a9000000-0000-0000-0000-000000000c04', 'a9000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'trainer: 팀T2 문서 조항 연결 불가');

-- ── 교육 담당자2(T2): 남의 팀 연결·문서 접근 ────────────────────────
set local request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000202';
select is_empty('select 1 from public.knowledge_sources', 'trainer2: 팀T 지식 연결은 안 보인다');
select is_empty($$select 1 from public.policy_documents where id in ('a9000000-0000-0000-0000-0000000000d3', 'a9000000-0000-0000-0000-0000000000e2')$$,
  'trainer2: 팀T 문서는 안 보인다');
select results_eq('delete from public.policy_documents where id = ''a9000000-0000-0000-0000-0000000000e2'' returning 1', 'select 1 where false',
  'trainer2: 팀T 문서 delete는 0행');

-- ── 총무(ops) ───────────────────────────────────────────────────────
set local request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000301';
select is((select count(*) from public.policy_documents where id = 'a9000000-0000-0000-0000-0000000000d2'), 1::bigint,
  'ga: 회사 failed 문서 행을 볼 수 있다');
select is_empty($$select 1 from public.policy_documents where org_id = 'a9000000-0000-0000-0000-0000000000f1'$$,
  'ga: 다른 조직 문서는 안 보인다');
select is_empty($$select 1 from public.document_clauses where org_id = 'a9000000-0000-0000-0000-0000000000f1'$$,
  'ga: 다른 조직 조항은 안 보인다');
select throws_ok(
  $$insert into public.policy_documents (id, org_id, scope, title, file_path, file_type)
    values ('a9000000-0000-0000-0000-0000000000e4', 'a9000000-0000-0000-0000-0000000000f1', 'company', '남의 조직',
            'a9000000-0000-0000-0000-0000000000f1/a9000000-0000-0000-0000-0000000000e4.pdf', 'pdf')$$,
  '42501', null, 'ga: 다른 조직에 회사 문서 insert 불가');
select results_eq(
  $$delete from public.policy_documents where id in ('a9000000-0000-0000-0000-0000000000d5', 'a9000000-0000-0000-0000-0000000000d6') returning 1$$,
  'select 1 where false', 'ga: 다른 조직 문서 delete는 0행');
select lives_ok(
  $$insert into public.knowledge_sources (knowledge_id, clause_id, org_id)
    values ('a9000000-0000-0000-0000-0000000000b2', 'a9000000-0000-0000-0000-000000000c01', 'a9000000-0000-0000-0000-000000000001')$$,
  'ga: 회사 지식 연결 insert');
select results_eq('select count(*) from public.knowledge_sources', array[1::bigint], 'ga: 회사 지식 연결만 보인다(팀 지식 연결은 관리 범위 밖)');
select results_eq(
  $$delete from public.knowledge_sources where knowledge_id = 'a9000000-0000-0000-0000-0000000000b2' returning 1$$,
  'select 1', 'ga: 회사 지식 연결 delete');
select is((select count(*) from storage.objects where bucket_id = 'policy-docs'), 1::bigint,
  'ga: 원본 파일은 회사 문서 것만 받을 수 있다');
select results_eq(
  $$delete from public.policy_documents where id = 'a9000000-0000-0000-0000-0000000000d2' returning 1$$,
  'select 1', 'ga: 회사 문서 delete');

-- ── anon ────────────────────────────────────────────────────────────
set local role anon;
select throws_ok('select 1 from public.policy_documents', '42501', null, 'anon: 문서 권한 없음');
select throws_ok('select 1 from public.document_clauses', '42501', null, 'anon: 조항 권한 없음');
select throws_ok('select 1 from public.knowledge_sources', '42501', null, 'anon: 지식 출처 권한 없음');
reset role;

select * from finish();
rollback;
