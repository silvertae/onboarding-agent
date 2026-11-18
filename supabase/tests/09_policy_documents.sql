-- 규정 문서·조항 스키마, RLS, 버킷 테스트. 픽스처는 이 파일 안에서 만들고 끝나면 롤백한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(105);

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

-- 검색 테스트용: 차원 n만 1인 단위 벡터(1536차원)와 조항 임베딩. c02는 임베딩 없음(검색에서 빠져야 한다).
create function public.t09_vec(p_n int) returns extensions.vector language sql immutable as $$
  select ('[' || string_agg(case when i = p_n then '1' else '0' end, ',') || ']')::extensions.vector
    from generate_series(1, 1536) i
$$;
update public.document_clauses set embedding = public.t09_vec(1)
 where id in ('a9000000-0000-0000-0000-000000000c01', 'a9000000-0000-0000-0000-000000000c04',
              'a9000000-0000-0000-0000-000000000c05', 'a9000000-0000-0000-0000-000000000c06');
update public.document_clauses set embedding = public.t09_vec(2) where id = 'a9000000-0000-0000-0000-000000000c03';

-- 미답변 질문 셋: 팀T 신입A의 질문(u1·u2·u3)
insert into public.unanswered_questions (id, org_id, asked_by, team_id, question) values
  ('a9000000-0000-0000-0000-0000000000f2', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000101', 'a9000000-0000-0000-0000-0000000000a1', '야근 수당은?'),
  ('a9000000-0000-0000-0000-0000000000f3', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000101', 'a9000000-0000-0000-0000-0000000000a1', '경조사 휴가는?'),
  ('a9000000-0000-0000-0000-0000000000f4', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000101', 'a9000000-0000-0000-0000-0000000000a1', '출장비 정산은?');

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

select throws_ok(
  $$insert into public.document_clauses (org_id, document_id, ord, body)
    values ('a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000d3', 9, '신입의 조항 추가')$$,
  '42501', null, '신입A: 조항 insert 불가');

-- RPC: 조항 검색은 읽기 범위만(팀T2·다른 조직·failed 문서 조항 제외, 임베딩 없는 조항 제외)
select results_eq(
  $$select id, document_title, similarity from public.match_document_clauses(public.t09_vec(1), 6)$$,
  $$values ('a9000000-0000-0000-0000-000000000c01'::uuid, '회사 규정'::text, 1::float8),
           ('a9000000-0000-0000-0000-000000000c03'::uuid, '팀T 규정'::text, 0::float8)$$,
  '신입A: match_document_clauses는 읽을 수 있는 조항만, 같은 벡터가 similarity 1로 첫째');
select is((select count(*) from public.match_document_clauses(public.t09_vec(1), 0)), 1::bigint,
  '신입A: p_count 0은 1로 올려서 자른다');
select is((select count(*) from public.match_document_clauses(public.t09_vec(1), 1000)), 2::bigint,
  '신입A: p_count가 커도 오류 없이 결과를 돌려준다');
select is(
  (select bool_or(public.can_manage_document(i)) from unnest(array[
    'a9000000-0000-0000-0000-0000000000d1', 'a9000000-0000-0000-0000-0000000000d3',
    'a9000000-0000-0000-0000-0000000000d5', 'a9000000-0000-0000-0000-0000000000ff']::uuid[]) i),
  false, '신입A: can_manage_document는 모두 false(보이는 문서·남의 조직·없는 문서)');
select throws_ok(
  $$select public.replace_document_clauses('a9000000-0000-0000-0000-0000000000d3', '[]'::jsonb)$$,
  '42501', null, '신입A: replace_document_clauses 불가');
select throws_ok(
  $$select public.save_knowledge_drafts('[{"question":"q","answer":"a","category":"","clause_ids":[]}]'::jsonb)$$,
  '42501', null, '신입A: save_knowledge_drafts 불가');
select throws_ok(
  $$select public.resolve_unanswered_with_sources('a9000000-0000-0000-0000-0000000000f2', 'q', 'a', '', null, 'manual')$$,
  '42501', null, '신입A: resolve_unanswered_with_sources 불가');

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
  $$insert into public.policy_documents (id, org_id, scope, title, file_path, file_type, status, uploaded_by)
    values ('a9000000-0000-0000-0000-0000000000e1', 'a9000000-0000-0000-0000-000000000001', 'company', '회사 문서',
            'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000e1.pdf', 'pdf', 'processing', 'a9000000-0000-0000-0000-000000000201')$$,
  '42501', null, 'trainer: 회사 문서 insert 불가');
select lives_ok(
  $$insert into public.policy_documents (id, org_id, scope, team_id, title, file_path, file_type, uploaded_by)
    values ('a9000000-0000-0000-0000-0000000000e2', 'a9000000-0000-0000-0000-000000000001', 'team', 'a9000000-0000-0000-0000-0000000000a1', '팀T 새 문서',
            'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000e2.pdf', 'pdf', 'a9000000-0000-0000-0000-000000000201')$$,
  'trainer: 팀T 문서 insert(processing, 본인 이름)');
select throws_ok(
  $$insert into public.policy_documents (id, org_id, scope, team_id, title, file_path, file_type, status, uploaded_by)
    values ('a9000000-0000-0000-0000-0000000000e5', 'a9000000-0000-0000-0000-000000000001', 'team', 'a9000000-0000-0000-0000-0000000000a1', '바로 ready',
            'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000e5.pdf', 'pdf', 'ready', 'a9000000-0000-0000-0000-000000000201')$$,
  '42501', null, 'trainer: status ready로 insert 불가');
select throws_ok(
  $$insert into public.policy_documents (id, org_id, scope, team_id, title, file_path, file_type, uploaded_by)
    values ('a9000000-0000-0000-0000-0000000000e6', 'a9000000-0000-0000-0000-000000000001', 'team', 'a9000000-0000-0000-0000-0000000000a1', '남의 이름',
            'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000e6.pdf', 'pdf', 'a9000000-0000-0000-0000-000000000202')$$,
  '42501', null, 'trainer: 다른 사람 이름(uploaded_by)으로 insert 불가');
select is(private.can_manage_scope('a9000000-0000-0000-0000-000000000001', 'team', null), false,
  'can_manage_scope: 팀 범위에 team null이면 null이 아니라 false');
select throws_ok(
  $$insert into public.document_clauses (org_id, document_id, ord, body)
    values ('a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000d1', 9, '회사 문서에 조항 추가')$$,
  '42501', null, 'trainer: 회사 문서에 조항 insert 불가');
select lives_ok(
  $$insert into public.document_clauses (org_id, document_id, ord, body)
    values ('a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000d3', 9, '팀T 문서에 조항 추가')$$,
  'trainer: 팀T 문서에 조항 insert');
select results_eq(
  $$delete from public.document_clauses where document_id = 'a9000000-0000-0000-0000-0000000000d4' returning 1$$,
  'select 1 where false', 'trainer: 팀T2 문서 조항 delete는 0행');
select throws_ok(
  $$insert into public.policy_documents (id, org_id, scope, team_id, title, file_path, file_type, status, uploaded_by)
    values ('a9000000-0000-0000-0000-0000000000e3', 'a9000000-0000-0000-0000-000000000001', 'team', 'a9000000-0000-0000-0000-0000000000a2', '팀T2 새 문서',
            'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000e3.pdf', 'pdf', 'processing', 'a9000000-0000-0000-0000-000000000201')$$,
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
select results_eq(
  $$delete from public.knowledge_sources where knowledge_id = 'a9000000-0000-0000-0000-0000000000b1' returning 1$$,
  'select 1 where false', 'trainer2: 팀T 지식 연결 delete는 0행');
-- storage의 직접 삭제 방지 트리거(origin 모드에서만 동작)를 이 단언에서만 끄고 삭제 정책 자체를 확인한다.
reset role;
set local session_replication_role = replica;
set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000202';
select results_eq(
  $$delete from storage.objects where bucket_id = 'policy-docs'
      and name = 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000d3.docx' returning 1$$,
  'select 1 where false', 'trainer2: 팀T 원본 파일 delete는 0행');
reset role;
set local session_replication_role = origin;
select is((select count(*) from storage.objects where bucket_id = 'policy-docs'
            and name = 'a9000000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-0000000000d3.docx'), 1::bigint,
  '팀T 원본 파일은 그대로 남아 있다');
set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000202';

-- ── 총무(ops) ───────────────────────────────────────────────────────
set local request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000301';
select is((select count(*) from public.policy_documents where id = 'a9000000-0000-0000-0000-0000000000d2'), 1::bigint,
  'ga: 회사 failed 문서 행을 볼 수 있다');
select is_empty($$select 1 from public.policy_documents where org_id = 'a9000000-0000-0000-0000-0000000000f1'$$,
  'ga: 다른 조직 문서는 안 보인다');
select is_empty($$select 1 from public.document_clauses where org_id = 'a9000000-0000-0000-0000-0000000000f1'$$,
  'ga: 다른 조직 조항은 안 보인다');
select throws_ok(
  $$insert into public.policy_documents (id, org_id, scope, title, file_path, file_type, status, uploaded_by)
    values ('a9000000-0000-0000-0000-0000000000e4', 'a9000000-0000-0000-0000-0000000000f1', 'company', '남의 조직',
            'a9000000-0000-0000-0000-0000000000f1/a9000000-0000-0000-0000-0000000000e4.pdf', 'pdf', 'processing', 'a9000000-0000-0000-0000-000000000301')$$,
  '42501', null, 'ga: 다른 조직에 회사 문서 insert 불가');
select throws_ok(
  $$insert into public.document_clauses (org_id, document_id, ord, body)
    values ('a9000000-0000-0000-0000-0000000000f1', 'a9000000-0000-0000-0000-0000000000d5', 9, '남의 조직 조항 추가')$$,
  '42501', null, 'ga: 다른 조직 문서에 조항 insert 불가');
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

-- ── 총무(ops): 지식 초안 일괄 저장 ──────────────────────────────────
select is(
  (select array_agg(public.can_manage_document(i) order by o) from unnest(array[
    'a9000000-0000-0000-0000-0000000000d1', 'a9000000-0000-0000-0000-0000000000d3',
    'a9000000-0000-0000-0000-0000000000d5']::uuid[]) with ordinality t(i, o)),
  array[true, false, false],
  'ga: can_manage_document 회사 true, 팀T false, 다른 조직 false');
select is(
  public.save_knowledge_drafts($$[
    {"question":"초안 질문1","answer":"초안 답1","category":"휴가","clause_ids":["a9000000-0000-0000-0000-000000000c01","a9000000-0000-0000-0000-000000000c02"]},
    {"question":"초안 질문2","answer":"초안 답2","category":"휴가","clause_ids":["a9000000-0000-0000-0000-000000000c01","a9000000-0000-0000-0000-000000000c03","a9000000-0000-0000-0000-000000000c05"]}
  ]$$::jsonb),
  2, 'ga: save_knowledge_drafts 2개 저장');
select results_eq(
  $$select scope::text, team_id, status::text, origin, updated_by from public.knowledge_items
     where question like '초안 질문%' order by question$$,
  $$values ('company'::text, null::uuid, 'draft'::text, 'ai_draft'::text, 'a9000000-0000-0000-0000-000000000301'::uuid),
           ('company'::text, null::uuid, 'draft'::text, 'ai_draft'::text, 'a9000000-0000-0000-0000-000000000301'::uuid)$$,
  'ga: 회사 공통 draft, origin ai_draft 2행');
select results_eq(
  $$select k.question, ks.clause_id from public.knowledge_sources ks join public.knowledge_items k on k.id = ks.knowledge_id
     where k.question like '초안 질문%' order by k.question, ks.clause_id$$,
  $$values ('초안 질문1'::text, 'a9000000-0000-0000-0000-000000000c01'::uuid),
           ('초안 질문1'::text, 'a9000000-0000-0000-0000-000000000c02'::uuid),
           ('초안 질문2'::text, 'a9000000-0000-0000-0000-000000000c01'::uuid)$$,
  'ga: 읽을 수 없는 조항(팀 조항·다른 조직)은 오류 없이 빠지고 나머지만 연결');
select is(
  public.save_knowledge_drafts($$[
    {"question":"느슨 질문1","answer":"답","category":"","clause_ids":null},
    {"question":"느슨 질문2","answer":"답","category":"","clause_ids":["not-a-uuid","a9000000-0000-0000-0000-000000000c01"]},
    {"question":"느슨 질문3","answer":"답","category":"","clause_ids":"abc"},
    {"question":"느슨 질문4","answer":"답","category":"","clause_ids":{}}
  ]$$::jsonb),
  4, 'ga: clause_ids가 null·문자열·객체이거나 uuid가 아닌 값이 섞여도 초안은 모두 저장된다');
select is((select count(*) from public.knowledge_sources ks join public.knowledge_items k on k.id = ks.knowledge_id
            where k.question like '느슨 질문%'), 1::bigint,
  'ga: 연결은 uuid 모양의 읽을 수 있는 조항 1건뿐');
select throws_ok($$select public.save_knowledge_drafts('[]'::jsonb)$$, '22023', null, 'ga: 빈 배열은 거부');
select throws_ok(
  $$select public.save_knowledge_drafts((select jsonb_agg(jsonb_build_object('question', 'q' || i, 'answer', 'a', 'category', '', 'clause_ids', '[]'::jsonb))
                                           from generate_series(1, 11) i))$$,
  '22023', null, 'ga: 11개는 거부');
select throws_ok(
  $$select public.save_knowledge_drafts('[{"question":"  ","answer":"a","category":"","clause_ids":[]}]'::jsonb)$$,
  '22023', null, 'ga: 질문이 비면 거부');
select is((select count(*) from public.knowledge_items where question like '초안 질문%'), 2::bigint,
  'ga: 거부된 호출은 아무것도 남기지 않는다');

-- ── 교육 담당자(T): 문서·지식 RPC ────────────────────────────────────
set local request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000201';

select is(
  (select array_agg(public.can_manage_document(i) order by o) from unnest(array[
    'a9000000-0000-0000-0000-0000000000d1', 'a9000000-0000-0000-0000-0000000000d3',
    'a9000000-0000-0000-0000-0000000000d4', 'a9000000-0000-0000-0000-0000000000d5']::uuid[]) with ordinality t(i, o)),
  array[false, true, false, false],
  'trainer: can_manage_document 회사 false, 팀T true, 팀T2 false, 다른 조직 false');
select throws_ok(
  $$select public.replace_document_clauses('a9000000-0000-0000-0000-0000000000d1', '[]'::jsonb)$$,
  '42501', null, 'trainer: 회사 문서 replace는 42501');
select throws_ok(
  $$select public.replace_document_clauses('a9000000-0000-0000-0000-0000000000d4', '[]'::jsonb)$$,
  '42501', null, 'trainer: 팀T2 문서 replace는 42501');
select throws_ok(
  $$select public.replace_document_clauses('a9000000-0000-0000-0000-0000000000d5', '[]'::jsonb)$$,
  'P0002', null, 'trainer: 다른 조직 문서 replace는 P0002');
select throws_ok(
  $$select public.replace_document_clauses('a9000000-0000-0000-0000-0000000000ff', '[]'::jsonb)$$,
  'P0002', null, 'trainer: 없는 문서 replace는 P0002');

-- 미답변 해결 + 근거 연결
select throws_ok(
  $$select public.resolve_unanswered_with_sources('a9000000-0000-0000-0000-0000000000f2', '야근 수당', '답', '근무', null, 'other')$$,
  '22023', null, 'trainer: origin이 manual|ai_draft가 아니면 거부');
select lives_ok(
  $$select public.resolve_unanswered_with_sources('a9000000-0000-0000-0000-0000000000f2', '야근 수당', '야근 수당 답', '근무',
      array['a9000000-0000-0000-0000-000000000c01', 'a9000000-0000-0000-0000-000000000c03', 'a9000000-0000-0000-0000-000000000c04',
            'a9000000-0000-0000-0000-000000000c05', 'a9000000-0000-0000-0000-000000000c06']::uuid[], 'ai_draft')$$,
  'trainer: resolve_unanswered_with_sources 호출');
select results_eq(
  $$select scope::text, team_id, status::text, origin from public.knowledge_items where question = '야근 수당'$$,
  $$values ('team'::text, 'a9000000-0000-0000-0000-0000000000a1'::uuid, 'published'::text, 'ai_draft'::text)$$,
  'trainer: 팀 범위 published 지식, origin ai_draft');
select results_eq(
  $$select ks.clause_id from public.knowledge_sources ks join public.knowledge_items k on k.id = ks.knowledge_id
     where k.question = '야근 수당' order by ks.clause_id$$,
  $$values ('a9000000-0000-0000-0000-000000000c01'::uuid), ('a9000000-0000-0000-0000-000000000c03'::uuid)$$,
  'trainer: 읽을 수 있는 조항(회사 c01·팀T c03)만 연결, 팀T2·다른 조직·failed 조항은 조용히 빠진다');
select results_eq(
  $$select status::text, resolved_knowledge_id = (select id from public.knowledge_items where question = '야근 수당')
      from public.unanswered_questions where id = 'a9000000-0000-0000-0000-0000000000f2'$$,
  $$values ('resolved'::text, true)$$,
  'trainer: 미답변이 resolved로 바뀌고 지식과 연결된다');
create temp table t09_before as
  select id, ctid::text as c from public.knowledge_items where question = '야근 수당';
select is(
  (select public.resolve_unanswered_with_sources('a9000000-0000-0000-0000-0000000000f2', '야근 수당', '야근 수당 답', '근무',
      array['a9000000-0000-0000-0000-000000000c01', 'a9000000-0000-0000-0000-000000000c03']::uuid[], 'ai_draft')),
  (select id from t09_before),
  'trainer: 같은 호출을 다시 불러도 같은 지식 id를 돌려준다(연타)');
select results_eq(
  $$select k.ctid::text = b.c from public.knowledge_items k join t09_before b on b.id = k.id$$,
  $$values (true)$$,
  'trainer: 다시 불러도 지식 행을 다시 쓰지 않는다(ctid 그대로: 같은 트랜잭션의 UPDATE도 ctid를 바꾼다)');
select results_eq(
  $$select (select count(*) from public.knowledge_items where question = '야근 수당'),
           (select count(*) from public.knowledge_sources ks join public.knowledge_items k on k.id = ks.knowledge_id where k.question = '야근 수당')$$,
  $$values (1::bigint, 2::bigint)$$,
  'trainer: 다시 불러도 지식 1행, 연결 2행 그대로');
select lives_ok(
  $$select public.resolve_unanswered_with_sources('a9000000-0000-0000-0000-0000000000f3', '경조사 휴가', '경조사 답', '휴가', null, 'manual')$$,
  'trainer: 조항 id 없이(null) manual로도 호출');
select results_eq(
  $$select origin, (select count(*) from public.knowledge_sources where knowledge_id = k.id)
      from public.knowledge_items k where question = '경조사 휴가'$$,
  $$values ('manual'::text, 0::bigint)$$,
  'trainer: origin manual, 연결 0');

-- 교육 담당자의 지식 초안: 팀 범위
select is(
  public.save_knowledge_drafts($$[{"question":"팀 초안","answer":"팀 초안 답","category":"","clause_ids":["a9000000-0000-0000-0000-000000000c03","a9000000-0000-0000-0000-000000000c04"]}]$$::jsonb),
  1, 'trainer: save_knowledge_drafts 1개');
select results_eq(
  $$select k.scope::text, k.team_id, k.status::text, k.origin, (select array_agg(clause_id) from public.knowledge_sources where knowledge_id = k.id)
      from public.knowledge_items k where k.question = '팀 초안'$$,
  $$values ('team'::text, 'a9000000-0000-0000-0000-0000000000a1'::uuid, 'draft'::text, 'ai_draft'::text,
            array['a9000000-0000-0000-0000-000000000c03']::uuid[])$$,
  'trainer: 팀T 범위 draft, 팀T2 조항은 연결되지 않는다');

-- 조항 교체: 같은 문서에 두 번 불러도 두 번째 입력 수만 남는다
select is(
  public.replace_document_clauses('a9000000-0000-0000-0000-0000000000e2', jsonb_build_array(
    jsonb_build_object('ord', 1, 'label', '제1조', 'heading', '목적', 'body', '가상 본문 1', 'embedding', public.t09_vec(1)::text::jsonb),
    jsonb_build_object('ord', 2, 'label', '제2조', 'heading', null, 'body', '가상 본문 2')), null),
  2, 'trainer: replace 첫 호출은 2개를 넣는다');
select results_eq(
  $$select status, clause_count, error from public.policy_documents where id = 'a9000000-0000-0000-0000-0000000000e2'$$,
  $$values ('ready'::text, 2, null::text)$$, 'trainer: replace 뒤 문서는 ready, clause_count 2');
select is(
  public.replace_document_clauses('a9000000-0000-0000-0000-0000000000e2', jsonb_build_array(
    jsonb_build_object('ord', 1, 'label', '제9조', 'heading', '새 조항', 'body', '새 본문', 'embedding', public.t09_vec(3)::text::jsonb)), null),
  1, 'trainer: replace 두 번째 호출은 1개를 넣는다');
select results_eq(
  $$select count(*), min(label), bool_and(org_id = 'a9000000-0000-0000-0000-000000000001'), bool_and(embedding = public.t09_vec(3))
      from public.document_clauses where document_id = 'a9000000-0000-0000-0000-0000000000e2'$$,
  $$values (1::bigint, '제9조'::text, true, true)$$,
  'trainer: 두 번째 뒤 조항 수는 두 번째 입력 수와 같다(교체, 문서의 org_id, 임베딩 저장)');
select results_eq(
  $$select clause_count from public.policy_documents where id = 'a9000000-0000-0000-0000-0000000000e2'$$,
  array[1], 'trainer: clause_count도 1');

-- 실패 기록
select is(
  public.replace_document_clauses('a9000000-0000-0000-0000-0000000000e2', '[]'::jsonb, '가상 파싱 실패'),
  0, 'trainer: p_error를 넘기면 0을 돌려준다');
select results_eq(
  $$select status, clause_count, error from public.policy_documents where id = 'a9000000-0000-0000-0000-0000000000e2'$$,
  $$values ('failed'::text, 0, '가상 파싱 실패'::text)$$, 'trainer: p_error → failed, clause_count 0, error 기록');
reset role;
select is((select count(*) from public.document_clauses where document_id = 'a9000000-0000-0000-0000-0000000000e2'), 0::bigint,
  'p_error → 기존 조항도 지워진다');
set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000201';
select is(
  public.replace_document_clauses('a9000000-0000-0000-0000-0000000000e2', jsonb_build_array(
    jsonb_build_object('ord', 1, 'body', '다시 색인')), null),
  1, 'trainer: failed 문서도 다시 색인할 수 있다');
select results_eq(
  $$select status, clause_count, error from public.policy_documents where id = 'a9000000-0000-0000-0000-0000000000e2'$$,
  $$values ('ready'::text, 1, null::text)$$, 'trainer: 다시 색인하면 ready, error 지워짐');
select throws_ok(
  $$select public.replace_document_clauses('a9000000-0000-0000-0000-0000000000e2', '{"ord":1}'::jsonb)$$,
  '22023', null, 'trainer: p_clauses가 배열이 아니면 거부');
select results_eq(
  $$select status, clause_count from public.policy_documents where id = 'a9000000-0000-0000-0000-0000000000e2'$$,
  $$values ('ready'::text, 1)$$, 'trainer: 거부된 호출은 문서를 바꾸지 않는다');

-- ── 신입A: 초안은 보이지 않는다 ──────────────────────────────────────
set local request.jwt.claim.sub = 'a9000000-0000-0000-0000-000000000101';
select is_empty($$select 1 from public.knowledge_items where origin = 'ai_draft' and status = 'draft'$$,
  '신입A: AI 초안(draft)은 보이지 않는다');

-- ── service_role(색인·시드 스크립트): 범위 검사를 건너뛴다 ───────────
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(
  public.replace_document_clauses('a9000000-0000-0000-0000-0000000000d5', jsonb_build_array(
    jsonb_build_object('ord', 1, 'body', '서비스 색인')), null),
  1, 'service_role: 다른 조직 문서도 교체할 수 있다');
select throws_ok(
  $$select public.replace_document_clauses('a9000000-0000-0000-0000-0000000000ff', '[]'::jsonb)$$,
  'P0002', null, 'service_role: 없는 문서는 P0002');
reset role;
set local request.jwt.claims = '';

-- ── anon ────────────────────────────────────────────────────────────
set local role anon;
select throws_ok('select 1 from public.policy_documents', '42501', null, 'anon: 문서 권한 없음');
select throws_ok('select 1 from public.document_clauses', '42501', null, 'anon: 조항 권한 없음');
select throws_ok('select 1 from public.knowledge_sources', '42501', null, 'anon: 지식 출처 권한 없음');
reset role;
select is(
  (select bool_or(has_function_privilege('anon', p, 'execute')) from unnest(array[
    'public.match_document_clauses(extensions.vector, int)',
    'public.replace_document_clauses(uuid, jsonb, text)',
    'public.resolve_unanswered_with_sources(uuid, text, text, text, uuid[], text)',
    'public.save_knowledge_drafts(jsonb)',
    'public.can_manage_document(uuid)']) p),
  false, 'anon: 새 RPC 모두 실행 불가');
select ok(has_function_privilege('service_role', 'public.replace_document_clauses(uuid, jsonb, text)', 'execute')
      and has_function_privilege('authenticated', 'public.replace_document_clauses(uuid, jsonb, text)', 'execute'),
  'replace_document_clauses: authenticated·service_role 실행 가능');

select * from finish();
rollback;
