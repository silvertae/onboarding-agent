-- 동시성 테스트: 같은 신입의 선행 과제 두 개가 서로 다른 트랜잭션에서 동시에 끝나도
-- 후속 과제가 열려야 한다. 별도 연결(dblink)이 필요해 픽스처를 커밋하고 끝에 지운다.
-- 접속 정보는 로컬 Supabase 기본값이다(운영 값 아님). 컨테이너 네트워크 주소로 붙어야 비밀번호 인증을 거친다.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(3);

select extensions.dblink_connect('c0', format('host=%s port=5432 dbname=postgres user=postgres password=postgres',
                                               host(inet_server_addr())));
select extensions.dblink_connect('c1', format('host=%s port=5432 dbname=postgres user=postgres password=postgres',
                                               host(inet_server_addr())));
select extensions.dblink_connect('c2', format('host=%s port=5432 dbname=postgres user=postgres password=postgres',
                                               host(inet_server_addr())));

-- ── 픽스처 (c0, 자동 커밋) ──────────────────────────────────────────
select extensions.dblink_exec('c0', $fx$
  delete from public.task_instances where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from public.task_templates where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from public.profiles where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from auth.users where id::text like 'a5000000-%';
  delete from public.teams where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from public.orgs where id = 'a5000000-0000-0000-0000-000000000001';

  insert into public.orgs (id, name) values ('a5000000-0000-0000-0000-000000000001', '테스트 가상 조직');
  insert into public.teams (id, org_id, name) values
    ('a5000000-0000-0000-0000-0000000000a1', 'a5000000-0000-0000-0000-000000000001', '팀T');
  insert into auth.users (id, email) values
    ('a5000000-0000-0000-0000-000000000101', 'new@cc.test'),
    ('a5000000-0000-0000-0000-000000000301', 'hr@cc.test');
  insert into public.profiles (id, org_id, email, full_name, role, department, team_id, hire_date) values
    ('a5000000-0000-0000-0000-000000000101', 'a5000000-0000-0000-0000-000000000001', 'new@cc.test', '신입', 'new_hire',
     null, 'a5000000-0000-0000-0000-0000000000a1', current_date),
    ('a5000000-0000-0000-0000-000000000301', 'a5000000-0000-0000-0000-000000000001', 'hr@cc.test', '인사', 'ops_staff',
     'hr', null, null);
  insert into public.task_templates (org_id, code, title, stage, department, kind, completion_mode, prerequisite_codes) values
    ('a5000000-0000-0000-0000-000000000001', 'P1', '선행1', 'day1', 'hr', 'ops', 'confirm', '{}'),
    ('a5000000-0000-0000-0000-000000000001', 'S1', '셀프',  'day1', 'ga', 'ops', 'self',    '{}'),
    ('a5000000-0000-0000-0000-000000000001', 'M1', '선행 둘', 'week1', 'hr', 'ops', 'confirm', '{P1,S1}');
  select public._start_onboarding('a5000000-0000-0000-0000-000000000101');
  update public.task_instances i set status = 'submitted'
    from public.task_templates t
   where t.id = i.template_id and t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'P1';
$fx$);

-- ── 두 트랜잭션이 동시에 선행 과제를 끝낸다 ────────────────────────
-- c1: 인사 담당자가 P1 확인 (커밋 전)
select extensions.dblink_exec('c1', 'begin');
select extensions.dblink_exec('c1', $$set local role authenticated$$);
select extensions.dblink_exec('c1', $$set local request.jwt.claim.sub = 'a5000000-0000-0000-0000-000000000301'$$);
select * from extensions.dblink('c1', $$
  select (public.confirm_task(i.id)).status::text from public.task_instances i
    join public.task_templates t on t.id = i.template_id
   where t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'P1'$$) as r(status text);

-- c2: 신입이 S1 제출 (비동기로 보낸다. 직렬화되면 c1 커밋까지 기다린다)
select extensions.dblink_exec('c2', 'begin');
select extensions.dblink_exec('c2', $$set local role authenticated$$);
select extensions.dblink_exec('c2', $$set local request.jwt.claim.sub = 'a5000000-0000-0000-0000-000000000101'$$);
select extensions.dblink_send_query('c2', $$
  select (public.submit_task(i.id)).status::text from public.task_instances i
    join public.task_templates t on t.id = i.template_id
   where t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'S1'$$);
select pg_sleep(0.5);

select extensions.dblink_exec('c1', 'commit');
select is((select status from extensions.dblink_get_result('c2') as r(status text)), 'done', 'S1 제출 → done');
-- 비동기 결과는 빈 결과가 나올 때까지 읽어야 연결이 비워진다
select count(*) from extensions.dblink_get_result('c2') as r(status text);
select extensions.dblink_exec('c2', 'commit');

-- ── 결과 확인과 정리 ────────────────────────────────────────────────
select is(
  (select status from extensions.dblink('c0', $$
     select i.status::text from public.task_instances i join public.task_templates t on t.id = i.template_id
      where t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'P1'$$) as r(status text)),
  'done', 'P1 확인 → done');
select is(
  (select status from extensions.dblink('c0', $$
     select i.status::text from public.task_instances i join public.task_templates t on t.id = i.template_id
      where t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'M1'$$) as r(status text)),
  'todo', '선행 두 개가 동시에 끝나도 M1 = todo');

select extensions.dblink_exec('c0', $fx$
  delete from public.task_instances where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from public.task_templates where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from public.profiles where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from auth.users where id::text like 'a5000000-%';
  delete from public.teams where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from public.orgs where id = 'a5000000-0000-0000-0000-000000000001';
$fx$);
select extensions.dblink_disconnect('c0');
select extensions.dblink_disconnect('c1');
select extensions.dblink_disconnect('c2');

select * from finish();
rollback;
