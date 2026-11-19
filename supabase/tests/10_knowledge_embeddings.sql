-- 지식 임베딩 저장소·검색 테스트. 픽스처는 이 파일 안에서 만들고 끝나면 롤백한다.
-- 설계: docs/superpowers/specs/2026-11-19-knowledge-vector-search-design.md
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ── 픽스처 (postgres 권한) ───────────────────────────────────────────
-- 조직 O(팀 T·T2)와 다른 조직 O2. 사람·지식은 모두 가상.
insert into public.orgs (id, name) values
  ('b0000000-0000-0000-0000-000000000001', '테스트 가상 조직'),
  ('b0000000-0000-0000-0000-0000000000f1', '다른 가상 조직');
insert into public.teams (id, org_id, name, org_line) values
  ('b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000001', '팀T',  '{팀T}'),
  ('b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-000000000001', '팀T2', '{팀T2}');

insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-000000000101', 'new-a@kemb.test'),
  ('b0000000-0000-0000-0000-000000000201', 'trainer@kemb.test'),
  ('b0000000-0000-0000-0000-000000000301', 'ga@kemb.test');

insert into public.profiles (id, org_id, email, full_name, job_title, role, department, team_id, hire_date) values
  ('b0000000-0000-0000-0000-000000000101', 'b0000000-0000-0000-0000-000000000001', 'new-a@kemb.test',   '신입A', '사원', 'new_hire',     null, 'b0000000-0000-0000-0000-0000000000a1', current_date),
  ('b0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000001', 'trainer@kemb.test', '교육',  '책임', 'team_trainer', null, 'b0000000-0000-0000-0000-0000000000a1', null),
  ('b0000000-0000-0000-0000-000000000301', 'b0000000-0000-0000-0000-000000000001', 'ga@kemb.test',      '총무',  '대리', 'ops_staff',    'ga', null, null);

-- 지식 열하나. 신입A가 볼 수 있는 게시 지식은 k1·k2·k3·k6·k8·k9.
--   k1 회사 게시(임베딩 vec1)   k2 회사 게시(vec2)        k3 팀T 게시(vec1)      k4 팀T2 게시(vec1)
--   k5 회사 초안(vec1)          k6 회사 게시(임베딩 없음)  k7 O2 회사 게시(vec1)  k8 회사 게시(예전 본문의 임베딩)
--   k9 팀T 게시(임베딩 없음)     k10 팀T 초안(없음)         k11 O2 회사 게시(없음)
insert into public.knowledge_items (id, org_id, scope, team_id, question, answer, status) values
  ('b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000001', 'company', null, '회사 질문1', '회사 답1', 'published'),
  ('b0000000-0000-0000-0000-0000000000b2', 'b0000000-0000-0000-0000-000000000001', 'company', null, '회사 질문2', '회사 답2', 'published'),
  ('b0000000-0000-0000-0000-0000000000b3', 'b0000000-0000-0000-0000-000000000001', 'team', 'b0000000-0000-0000-0000-0000000000a1', '팀 질문', '팀 답', 'published'),
  ('b0000000-0000-0000-0000-0000000000b4', 'b0000000-0000-0000-0000-000000000001', 'team', 'b0000000-0000-0000-0000-0000000000a2', '다른 팀 질문', '다른 팀 답', 'published'),
  ('b0000000-0000-0000-0000-0000000000b5', 'b0000000-0000-0000-0000-000000000001', 'company', null, '초안 질문', '초안 답', 'draft'),
  ('b0000000-0000-0000-0000-0000000000b6', 'b0000000-0000-0000-0000-000000000001', 'company', null, '새 질문', '새 답', 'published'),
  ('b0000000-0000-0000-0000-0000000000b7', 'b0000000-0000-0000-0000-0000000000f1', 'company', null, 'O2 질문', 'O2 답', 'published'),
  ('b0000000-0000-0000-0000-0000000000b8', 'b0000000-0000-0000-0000-000000000001', 'company', null, '고친 질문', '고친 답', 'published'),
  ('b0000000-0000-0000-0000-0000000000b9', 'b0000000-0000-0000-0000-000000000001', 'team', 'b0000000-0000-0000-0000-0000000000a1', '팀 새 질문', '팀 새 답', 'published'),
  ('b0000000-0000-0000-0000-0000000000ba', 'b0000000-0000-0000-0000-000000000001', 'team', 'b0000000-0000-0000-0000-0000000000a1', '팀 초안 질문', '팀 초안 답', 'draft'),
  ('b0000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-0000000000f1', 'company', null, 'O2 새 질문', 'O2 새 답', 'published');

-- 차원 n만 1인 단위 벡터(1536차원)
create function public.t10_vec(p_n int) returns extensions.vector language sql immutable as $$
  select ('[' || string_agg(case when i = p_n then '1' else '0' end, ',') || ']')::extensions.vector
    from generate_series(1, 1536) i
$$;

-- 현재 본문의 해시로 임베딩을 넣는다. k8은 예전 본문('예전 질문'/'예전 답')의 해시로 넣는다(낡은 임베딩).
insert into public.knowledge_embeddings (knowledge_id, org_id, content_hash, embedding)
select k.id, k.org_id, private.knowledge_hash(k.question, k.answer),
       public.t10_vec(case when k.id = 'b0000000-0000-0000-0000-0000000000b2' then 2 else 1 end)
  from public.knowledge_items k
 where k.id in ('b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b2',
                'b0000000-0000-0000-0000-0000000000b3', 'b0000000-0000-0000-0000-0000000000b4',
                'b0000000-0000-0000-0000-0000000000b5', 'b0000000-0000-0000-0000-0000000000b7');
insert into public.knowledge_embeddings (knowledge_id, org_id, content_hash, embedding) values
  ('b0000000-0000-0000-0000-0000000000b8', 'b0000000-0000-0000-0000-000000000001',
   private.knowledge_hash('예전 질문', '예전 답'), public.t10_vec(1));

-- ════ 스키마 ═════════════════════════════════════════════════════════
select has_table('public', 'knowledge_embeddings', '지식 임베딩 테이블');
select is(
  (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'knowledge_embeddings' and indexdef like '%hnsw%'),
  1::bigint, '임베딩에 hnsw 인덱스');
select isnt(private.knowledge_hash('질문', '답'), private.knowledge_hash('질문', '다른 답'), '본문이 다르면 해시가 다르다');

-- ── 신입A(팀T) ──────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000101';

select set_eq(
  $$select id from public.match_knowledge(public.t10_vec(1), 20)$$,
  $$values ('b0000000-0000-0000-0000-0000000000b1'::uuid), ('b0000000-0000-0000-0000-0000000000b2'::uuid),
           ('b0000000-0000-0000-0000-0000000000b3'::uuid), ('b0000000-0000-0000-0000-0000000000b6'::uuid),
           ('b0000000-0000-0000-0000-0000000000b8'::uuid), ('b0000000-0000-0000-0000-0000000000b9'::uuid)$$,
  '신입A: 게시된 회사·우리 팀 지식만(다른 팀·초안·다른 조직 제외)');
select is(
  (select array_agg(similarity) from public.match_knowledge(public.t10_vec(1), 20)),
  array[1, 1, 0, null, null, null]::float8[],
  '신입A: 가까운 순서, 임베딩 없거나 낡은 지식은 similarity null로 맨 뒤');
select set_eq(
  $$select id from public.match_knowledge(public.t10_vec(1), 20) where similarity is null$$,
  $$values ('b0000000-0000-0000-0000-0000000000b6'::uuid), ('b0000000-0000-0000-0000-0000000000b8'::uuid),
           ('b0000000-0000-0000-0000-0000000000b9'::uuid)$$,
  '신입A: 임베딩 없는 지식(k6·k9)과 예전 본문의 임베딩(k8)은 검색과 관계없이 들어간다');
select is((select count(*) from public.match_knowledge(public.t10_vec(1), 1)), 4::bigint,
  '신입A: p_count 1이면 가까운 1건 + 임베딩 없는 3건');
select is((select count(*) from public.match_knowledge(public.t10_vec(1), 0)), 4::bigint,
  '신입A: p_count 0은 1로 올린다');
select is((select count(*) from public.match_knowledge(public.t10_vec(1), null)), 6::bigint,
  '신입A: p_count null은 기본 20');
select is((select count(*) from public.match_knowledge(public.t10_vec(1), 1000)), 6::bigint,
  '신입A: p_count가 커도 오류 없이 돌려준다');
select is((select count(*) from public.match_knowledge(public.t10_vec(1))), 6::bigint,
  '신입A: p_count를 빼면 기본 20');

select set_eq(
  $$select knowledge_id from public.knowledge_embeddings$$,
  $$values ('b0000000-0000-0000-0000-0000000000b1'::uuid), ('b0000000-0000-0000-0000-0000000000b2'::uuid),
           ('b0000000-0000-0000-0000-0000000000b3'::uuid), ('b0000000-0000-0000-0000-0000000000b8'::uuid)$$,
  '신입A: 읽을 수 있는 지식의 임베딩만 보인다(다른 팀·초안·다른 조직 제외)');
select is_empty($$select 1 from public.knowledge_without_embedding()$$,
  '신입A: 관리 범위가 없어 임베딩할 지식이 없다');
select throws_ok(
  $$select public.save_knowledge_embeddings(jsonb_build_array(jsonb_build_object(
      'id', 'b0000000-0000-0000-0000-0000000000b6', 'question', '새 질문', 'answer', '새 답',
      'embedding', public.t10_vec(3)::text::jsonb)))$$,
  '42501', null, '신입A: 임베딩 저장 불가');
select throws_ok(
  $$insert into public.knowledge_embeddings (knowledge_id, org_id, content_hash, embedding)
    values ('b0000000-0000-0000-0000-0000000000b6', 'b0000000-0000-0000-0000-000000000001', 'x', public.t10_vec(3))$$,
  '42501', null, '신입A: 테이블에 직접 쓸 수 없다');

-- ── 교육 담당자(팀T) ─────────────────────────────────────────────────
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000201';

select set_eq(
  $$select id from public.knowledge_without_embedding()$$,
  $$values ('b0000000-0000-0000-0000-0000000000b9'::uuid)$$,
  '교육 담당자: 우리 팀의 임베딩 없는 게시 지식만(팀 초안·회사 지식 제외)');
select throws_ok(
  $$select public.save_knowledge_embeddings(jsonb_build_array(jsonb_build_object(
      'id', 'b0000000-0000-0000-0000-0000000000b6', 'question', '새 질문', 'answer', '새 답',
      'embedding', public.t10_vec(3)::text::jsonb)))$$,
  '42501', null, '교육 담당자: 회사 지식의 임베딩은 저장 불가');
select is(
  public.save_knowledge_embeddings(jsonb_build_array(jsonb_build_object(
    'id', 'b0000000-0000-0000-0000-0000000000bb', 'question', 'O2 새 질문', 'answer', 'O2 새 답',
    'embedding', public.t10_vec(3)::text::jsonb))),
  0, '교육 담당자: 다른 조직 지식은 건너뛴다');
select is(
  public.save_knowledge_embeddings(jsonb_build_array(jsonb_build_object(
    'id', 'b0000000-0000-0000-0000-0000000000b9', 'question', '팀 새 질문', 'answer', '팀 새 답',
    'embedding', public.t10_vec(3)::text::jsonb))),
  1, '교육 담당자: 우리 팀 지식의 임베딩 저장');
select is_empty($$select 1 from public.knowledge_without_embedding()$$,
  '교육 담당자: 저장한 뒤에는 임베딩할 지식이 없다');
select is(
  public.save_knowledge_embeddings(jsonb_build_array(jsonb_build_object(
    'id', 'b0000000-0000-0000-0000-0000000000b9', 'question', '팀 새 질문', 'answer', '팀 새 답',
    'embedding', public.t10_vec(4)::text::jsonb))),
  1, '교육 담당자: 같은 지식을 다시 저장하면 덮어쓴다');
select is(
  (select count(*) from public.knowledge_embeddings where knowledge_id = 'b0000000-0000-0000-0000-0000000000b9'),
  1::bigint, '교육 담당자: 지식 하나에 임베딩은 하나');

select throws_ok($$select public.save_knowledge_embeddings('[]'::jsonb)$$,
  '22023', null, '빈 목록은 22023');
select throws_ok($$select public.save_knowledge_embeddings('{}'::jsonb)$$,
  '22023', null, '배열이 아니면 22023');
select throws_ok(
  $$select public.save_knowledge_embeddings((select jsonb_agg(jsonb_build_object(
      'id', 'b0000000-0000-0000-0000-0000000000b9', 'question', '팀 새 질문', 'answer', '팀 새 답',
      'embedding', public.t10_vec(3)::text::jsonb)) from generate_series(1, 101)))$$,
  '22023', null, '101개는 22023');
select throws_ok(
  $$select public.save_knowledge_embeddings(jsonb_build_array(jsonb_build_object(
      'id', 'b0000000-0000-0000-0000-0000000000b9', 'question', '팀 새 질문', 'answer', '팀 새 답')))$$,
  '22023', null, '임베딩이 빠지면 22023');

-- ── 경영지원(회사 공통) ──────────────────────────────────────────────
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000301';

select set_eq(
  $$select id from public.knowledge_without_embedding()$$,
  $$values ('b0000000-0000-0000-0000-0000000000b6'::uuid), ('b0000000-0000-0000-0000-0000000000b8'::uuid)$$,
  '경영지원: 회사 공통의 임베딩 없는·낡은 게시 지식(회사 초안·팀 지식 제외)');
-- 임베딩하는 사이 본문이 바뀐 경우: 받은 본문(예전 질문)으로 해시를 기록하므로 여전히 "임베딩 없음"이다.
select is(
  public.save_knowledge_embeddings(jsonb_build_array(jsonb_build_object(
    'id', 'b0000000-0000-0000-0000-0000000000b8', 'question', '예전 질문2', 'answer', '고친 답',
    'embedding', public.t10_vec(3)::text::jsonb))),
  1, '경영지원: 본문이 달라도 저장은 된다');
select set_eq(
  $$select id from public.knowledge_without_embedding()$$,
  $$values ('b0000000-0000-0000-0000-0000000000b6'::uuid), ('b0000000-0000-0000-0000-0000000000b8'::uuid)$$,
  '경영지원: 받은 본문이 현재 본문과 다르면 다음 호출에서 다시 임베딩한다');

-- 본문을 고치면 임베딩이 낡는다. 분류·상태만 바꾸면 그대로다.
update public.knowledge_items set answer = '회사 답1 수정' where id = 'b0000000-0000-0000-0000-0000000000b1';
update public.knowledge_items set category = '바뀐 분류', status = 'draft' where id = 'b0000000-0000-0000-0000-0000000000b2';
update public.knowledge_items set status = 'published' where id = 'b0000000-0000-0000-0000-0000000000b2';
select set_eq(
  $$select id from public.knowledge_without_embedding()$$,
  $$values ('b0000000-0000-0000-0000-0000000000b1'::uuid), ('b0000000-0000-0000-0000-0000000000b6'::uuid),
           ('b0000000-0000-0000-0000-0000000000b8'::uuid)$$,
  '경영지원: 답을 고친 k1은 다시 임베딩 대상, 분류·상태만 바꾼 k2는 아니다');

set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000101';
select is(
  (select similarity from public.match_knowledge(public.t10_vec(1), 20) where id = 'b0000000-0000-0000-0000-0000000000b1'),
  null::float8, '신입A: 본문을 고친 지식은 임베딩 없는 지식으로 들어간다');
select is(
  (select similarity from public.match_knowledge(public.t10_vec(2), 20) where id = 'b0000000-0000-0000-0000-0000000000b2'),
  1::float8, '신입A: 분류·상태만 바꾼 지식은 임베딩으로 검색된다');

-- ── 지식 삭제(데모 초기화)는 임베딩도 지운다 ─────────────────────────
reset role;
delete from public.knowledge_items where id = 'b0000000-0000-0000-0000-0000000000b3';
select is(
  (select count(*) from public.knowledge_embeddings where knowledge_id = 'b0000000-0000-0000-0000-0000000000b3'),
  0::bigint, '지식을 지우면 임베딩도 지워진다');

-- ── service_role(백필 스크립트): 범위 검사를 건너뛰고 조직으로 거른다 ──
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select set_eq(
  $$select id from public.knowledge_without_embedding('b0000000-0000-0000-0000-0000000000f1')$$,
  $$values ('b0000000-0000-0000-0000-0000000000bb'::uuid)$$,
  'service_role: p_org 조직의 임베딩 없는 게시 지식만');
select is(
  (select count(*) from public.knowledge_without_embedding()
    where id in ('b0000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-0000000000b6')),
  2::bigint, 'service_role: p_org가 없으면 모든 조직');
select is(
  public.save_knowledge_embeddings(jsonb_build_array(
    jsonb_build_object('id', 'b0000000-0000-0000-0000-0000000000bb', 'question', 'O2 새 질문', 'answer', 'O2 새 답',
                       'embedding', public.t10_vec(3)::text::jsonb),
    jsonb_build_object('id', 'b0000000-0000-0000-0000-0000000000ff', 'question', '없는 지식', 'answer', '없음',
                       'embedding', public.t10_vec(3)::text::jsonb))),
  1, 'service_role: 다른 조직 지식도 저장하고, 없는 지식은 건너뛴다');
select is(
  (select org_id from public.knowledge_embeddings where knowledge_id = 'b0000000-0000-0000-0000-0000000000bb'),
  'b0000000-0000-0000-0000-0000000000f1'::uuid, 'service_role: 임베딩의 org_id는 지식에서 가져온다');
reset role;
set local request.jwt.claims = '';

-- ── 권한 ────────────────────────────────────────────────────────────
set local role anon;
select throws_ok('select 1 from public.knowledge_embeddings', '42501', null, 'anon: 임베딩 권한 없음');
reset role;
select is(
  (select bool_or(has_function_privilege('anon', p, 'execute')) from unnest(array[
    'public.match_knowledge(extensions.vector, int)',
    'public.knowledge_without_embedding(uuid)',
    'public.save_knowledge_embeddings(jsonb)',
    'private.knowledge_hash(text, text)']) p),
  false, 'anon: 새 함수 모두 실행 불가');
select is(
  (select bool_or(has_table_privilege('authenticated', 'public.knowledge_embeddings', p))
     from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p),
  false, 'authenticated: 임베딩 테이블에 쓸 수 없다(저장은 RPC로만)');
select ok(has_table_privilege('authenticated', 'public.knowledge_embeddings', 'SELECT'),
  'authenticated: 임베딩 테이블 select 가능(RLS 적용)');
select ok(has_function_privilege('service_role', 'public.save_knowledge_embeddings(jsonb)', 'execute')
      and has_function_privilege('service_role', 'public.knowledge_without_embedding(uuid)', 'execute'),
  'service_role: 저장·조회 RPC 실행 가능');

select * from finish();
rollback;
