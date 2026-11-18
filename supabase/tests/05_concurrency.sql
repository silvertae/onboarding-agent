-- 동시성 테스트: 같은 신입의 선행 과제 두 개가 서로 다른 트랜잭션에서 동시에 끝나도
-- 후속 과제가 열려야 한다. 템플릿 저장과 온보딩 시작은 조직별 템플릿 잠금으로 직렬화되고,
-- 데모 초기화와 저장이 겹쳐도 교착되지 않는다. 별도 연결(dblink)이 필요해 픽스처를 커밋하고 끝에 지운다.
-- 접속 정보는 로컬 Supabase 기본값이다(운영 값 아님). 컨테이너 네트워크 주소로 붙어야 비밀번호 인증을 거친다.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(15);

select extensions.dblink_connect('c0', format('host=%s port=5432 dbname=postgres user=postgres password=postgres',
                                               host(inet_server_addr())));
select extensions.dblink_connect('c1', format('host=%s port=5432 dbname=postgres user=postgres password=postgres',
                                               host(inet_server_addr())));
select extensions.dblink_connect('c2', format('host=%s port=5432 dbname=postgres user=postgres password=postgres',
                                               host(inet_server_addr())));
select extensions.dblink_connect('c3', format('host=%s port=5432 dbname=postgres user=postgres password=postgres',
                                               host(inet_server_addr())));
-- 연결별 백엔드 pid(비동기 질의 중인 연결에는 다른 질의를 보낼 수 없어 미리 적어 둔다)
create temp table conn_pid as
  select c.conn, (select pid from extensions.dblink(c.conn, 'select pg_backend_pid()') as r(pid int)) as pid
    from unnest(array['c1', 'c2', 'c3']) as c(conn);

-- 연결 p_conn의 백엔드가 잠금을 기다리는 상태(pg_locks.granted=false)가 될 때까지 0.05초 간격으로 최대 p_timeout_s초 확인한다.
-- 고정 pg_sleep은 느린 환경에서 아직 기다리기 전일 수 있어 쓰지 않는다. 기다리는 중이면 true, 시간 안에 안 되면 false.
create function pg_temp.wait_for_lock_wait(p_conn text, p_timeout_s numeric default 10) returns boolean
language plpgsql as $$
declare
  v_pid int := (select pid from conn_pid where conn = p_conn);
  v_deadline timestamptz := clock_timestamp() + make_interval(secs => p_timeout_s);
begin
  loop
    if exists (select 1 from pg_locks where pid = v_pid and not granted) then
      return true;
    end if;
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.05);
  end loop;
  return false;
end $$;

-- ── 픽스처 (c0, 자동 커밋) ──────────────────────────────────────────
select extensions.dblink_exec('c0', $fx$
  delete from public.task_instances where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from public.task_templates where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from public.profiles where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from auth.users where id::text like 'a5000000-%';
  delete from public.teams where org_id = 'a5000000-0000-0000-0000-000000000001';
  delete from public.orgs where id = 'a5000000-0000-0000-0000-000000000001';

  insert into public.orgs (id, name) values ('a5000000-0000-0000-0000-000000000001', '테스트 가상 조직');
  -- AI팀: reset_demo의 지식·문제은행 시드가 이 이름의 팀을 쓴다
  insert into public.teams (id, org_id, name) values
    ('a5000000-0000-0000-0000-0000000000a1', 'a5000000-0000-0000-0000-000000000001', '팀T'),
    ('a5000000-0000-0000-0000-0000000000a2', 'a5000000-0000-0000-0000-000000000001', 'AI팀');
  insert into auth.users (id, email) values
    ('a5000000-0000-0000-0000-000000000101', 'new@cc.test'),
    ('a5000000-0000-0000-0000-000000000102', 'new2@cc.test'),
    ('a5000000-0000-0000-0000-000000000103', 'new3@cc.test'),
    ('a5000000-0000-0000-0000-000000000104', 'seed@cc.test'),
    ('a5000000-0000-0000-0000-000000000301', 'hr@cc.test'),
    ('a5000000-0000-0000-0000-000000000302', 'acc@cc.test'),
    ('a5000000-0000-0000-0000-000000000401', 'admin@cc.test');
  insert into public.profiles (id, org_id, email, full_name, role, department, team_id, hire_date) values
    ('a5000000-0000-0000-0000-000000000101', 'a5000000-0000-0000-0000-000000000001', 'new@cc.test', '신입', 'new_hire',
     null, 'a5000000-0000-0000-0000-0000000000a1', current_date),
    ('a5000000-0000-0000-0000-000000000301', 'a5000000-0000-0000-0000-000000000001', 'hr@cc.test', '인사', 'ops_staff',
     'hr', null, null),
    ('a5000000-0000-0000-0000-000000000302', 'a5000000-0000-0000-0000-000000000001', 'acc@cc.test', '회계', 'ops_staff',
     'accounting', null, null),
    ('a5000000-0000-0000-0000-000000000102', 'a5000000-0000-0000-0000-000000000001', 'new2@cc.test', '신입2', 'new_hire',
     null, 'a5000000-0000-0000-0000-0000000000a1', current_date),
    ('a5000000-0000-0000-0000-000000000103', 'a5000000-0000-0000-0000-000000000001', 'new3@cc.test', '신입3', 'new_hire',
     null, 'a5000000-0000-0000-0000-0000000000a1', current_date),
    ('a5000000-0000-0000-0000-000000000401', 'a5000000-0000-0000-0000-000000000001', 'admin@cc.test', '관리', 'admin',
     null, null, null);
  -- 시드 신입: reset_demo가 다시 시작하는 대상
  insert into public.profiles (id, org_id, email, full_name, role, team_id, hire_date, is_seed) values
    ('a5000000-0000-0000-0000-000000000104', 'a5000000-0000-0000-0000-000000000001', 'seed@cc.test', '시드 신입', 'new_hire',
     'a5000000-0000-0000-0000-0000000000a1', current_date, true);
  insert into public.task_templates (org_id, code, title, stage, department, kind, completion_mode, prerequisite_codes) values
    ('a5000000-0000-0000-0000-000000000001', 'P1', '선행1', 'day1', 'hr', 'ops', 'confirm', '{}'),
    ('a5000000-0000-0000-0000-000000000001', 'S1', '셀프',  'day1', 'ga', 'ops', 'self',    '{}'),
    ('a5000000-0000-0000-0000-000000000001', 'M1', '선행 둘', 'week1', 'hr', 'ops', 'confirm', '{P1,S1}'),
    ('a5000000-0000-0000-0000-000000000001', 'P2', '선행2', 'day1', 'hr', 'ops', 'confirm', '{}');
  insert into public.task_templates (org_id, code, title, stage, department, kind, completion_mode, allow_na, prerequisite_codes) values
    ('a5000000-0000-0000-0000-000000000001', 'BN1', '잠긴 해당없음', 'week1', 'accounting', 'ops', 'confirm', true, '{P2}');
  select public._start_onboarding('a5000000-0000-0000-0000-000000000101');
  update public.task_instances i set status = 'submitted'
    from public.task_templates t
   where t.id = i.template_id and t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'P1';
  -- 아직 아무에게도 안 들어간 템플릿(시작 뒤에 만든다)
  insert into public.task_templates (org_id, code, title, stage, department, kind, completion_mode, prerequisite_codes) values
    ('a5000000-0000-0000-0000-000000000001', 'U1', '미사용1', 'day1', 'hr', 'ops', 'confirm', '{}');
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
select pg_temp.wait_for_lock_wait('c2');

select extensions.dblink_exec('c1', 'commit');
select is((select status from extensions.dblink_get_result('c2') as r(status text)), 'done', 'S1 제출 → done');
-- 비동기 결과는 빈 결과가 나올 때까지 읽어야 연결이 비워진다
select count(*) from extensions.dblink_get_result('c2') as r(status text);
select extensions.dblink_exec('c2', 'commit');

-- ── 잠금 순서: 신입별 잠금을 먼저 얻은 뒤에 과제 행을 잠근다 ──────
-- 행을 먼저 잠그고 트리거에서 신입별 잠금을 기다리면, 신입별 잠금을 쥔 채 그 행을 열려는
-- 다른 트랜잭션(unlock_ready)과 교착된다. c2가 신입별 잠금을 쥔 동안 c1의 mark_na는
-- 행을 잠그지 않은 채 기다려야 한다.
select extensions.dblink_exec('c2', 'begin');
select extensions.dblink_exec('c2',
  $$do $d$ begin perform pg_advisory_xact_lock(private.hire_lock_key('a5000000-0000-0000-0000-000000000101')); end $d$ $$);

select extensions.dblink_exec('c1', 'begin');
select extensions.dblink_exec('c1', $$set local role authenticated$$);
select extensions.dblink_exec('c1', $$set local request.jwt.claim.sub = 'a5000000-0000-0000-0000-000000000302'$$);
select extensions.dblink_send_query('c1', $$
  select (public.mark_na(i.id, '대상 아님')).status::text from public.task_instances i
    join public.task_templates t on t.id = i.template_id
   where t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'BN1'$$);
select pg_temp.wait_for_lock_wait('c1');

select lives_ok(
  $$select extensions.dblink_exec('c0', $q$
      do $d$ begin
        perform 1 from public.task_instances i join public.task_templates t on t.id = i.template_id
         where t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'BN1'
           for update of i nowait;
      end $d$ $q$)$$,
  'mark_na가 신입별 잠금을 기다리는 동안 과제 행을 잠그지 않는다');

select extensions.dblink_exec('c2', 'commit');
select is((select status from extensions.dblink_get_result('c1') as r(status text)), 'na',
  '신입별 잠금이 풀린 뒤 mark_na 완료 → na');
select count(*) from extensions.dblink_get_result('c1') as r(status text);
select extensions.dblink_exec('c1', 'commit');

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

-- ══ 템플릿 저장과 온보딩 시작의 직렬화 (Codex P1) ══════════════════
-- 저장(save_task_template)은 조직별 템플릿 잠금을 배타로, 시작(_start_onboarding)은 공유로 잡는다.
-- 그 연결이 이 조직의 템플릿 잠금을 mode로 쥐었는지(granted) 또는 기다리는지 본다.
create function pg_temp.org_lock(p_conn text, p_mode text, p_granted boolean) returns boolean language sql as $$
  select exists (
    select 1 from pg_locks l
     where l.pid = (select pid from conn_pid where conn = p_conn)
       and l.locktype = 'advisory' and l.objsubid = 1
       and l.classid = ((private.template_lock_key('a5000000-0000-0000-0000-000000000001') >> 32) & 4294967295)::oid
       and l.objid = (private.template_lock_key('a5000000-0000-0000-0000-000000000001') & 4294967295)::oid
       and l.mode = p_mode and l.granted = p_granted)
$$;

-- ── 저장 중에 시작: 시작은 저장이 커밋될 때까지 기다렸다가 새 템플릿을 읽는다 ──
-- c1: 인사 담당자가 아직 안 쓰인 U1에 선행 P1을 더해 저장하고 트랜잭션을 연 채로 둔다
select extensions.dblink_exec('c1', 'begin');
select extensions.dblink_exec('c1', $$set local role authenticated$$);
select extensions.dblink_exec('c1', $$set local request.jwt.claim.sub = 'a5000000-0000-0000-0000-000000000301'$$);
select * from extensions.dblink('c1', $$
  select array_to_string((public.save_task_template(t.id, '미사용1', '', 'ops', 'confirm', 'day1', 0, false, null,
                                                    '{P1}')).prerequisite_codes, ',')
    from public.task_templates t
   where t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'U1'$$) as r(prerequisites text);
select ok(pg_temp.org_lock('c1', 'ExclusiveLock', true), '저장: 조직별 템플릿 잠금을 배타로 쥔다');

-- c2: 신입2 온보딩 시작 (비동기)
select extensions.dblink_exec('c2', 'begin');
select extensions.dblink_send_query('c2', $$select public._start_onboarding('a5000000-0000-0000-0000-000000000102')$$);
select pg_temp.wait_for_lock_wait('c2');
select ok(pg_temp.org_lock('c2', 'ShareLock', false), '시작: 저장이 끝날 때까지 조직별 템플릿 잠금(공유)을 기다린다');

select extensions.dblink_exec('c1', 'commit');
select count(*) from extensions.dblink_get_result('c2') as r(n int);
select count(*) from extensions.dblink_get_result('c2') as r(n int);
select extensions.dblink_exec('c2', 'commit');
select is(
  (select status from extensions.dblink('c0', $$
     select i.status::text from public.task_instances i join public.task_templates t on t.id = i.template_id
      where t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'U1'
        and i.new_hire_id = 'a5000000-0000-0000-0000-000000000102'$$) as r(status text)),
  'blocked', '저장이 커밋된 뒤 시작한 신입2의 U1에 새 선행이 반영된다(blocked)');

-- ── 시작 중에 저장: 저장은 시작이 커밋될 때까지 기다렸다가 사용 중 잠금에 걸린다 ──
select extensions.dblink_exec('c0', $fx$
  insert into public.task_templates (org_id, code, title, stage, department, kind, completion_mode, prerequisite_codes) values
    ('a5000000-0000-0000-0000-000000000001', 'U2', '미사용2', 'day1', 'hr', 'ops', 'confirm', '{}');
$fx$);
select extensions.dblink_exec('c2', 'begin');
select * from extensions.dblink('c2', $$select public._start_onboarding('a5000000-0000-0000-0000-000000000103')$$)
  as r(n int);
select ok(pg_temp.org_lock('c2', 'ShareLock', true), '시작: 조직별 템플릿 잠금을 공유로 쥔다');

select extensions.dblink_exec('c1', 'begin');
select extensions.dblink_exec('c1', $$set local role authenticated$$);
select extensions.dblink_exec('c1', $$set local request.jwt.claim.sub = 'a5000000-0000-0000-0000-000000000301'$$);
select extensions.dblink_send_query('c1', $$
  select (public.save_task_template(t.id, '미사용2', '', 'ops', 'confirm', 'day1', 0, false, null, '{P1}')).title
    from public.task_templates t
   where t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'U2'$$);
select pg_temp.wait_for_lock_wait('c1');
select ok(pg_temp.org_lock('c1', 'ExclusiveLock', false),
  '저장: 템플릿 행을 잠그기 전에 조직별 템플릿 잠금(배타)을 기다린다');

select extensions.dblink_exec('c2', 'commit');
select count(*) from extensions.dblink_get_result('c1', false) as r(title text);
select alike(extensions.dblink_error_message('c1'), '%진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다%',
  '시작이 커밋된 뒤 저장은 새 인스턴스를 보고 구조 변경을 거부한다');
select count(*) from extensions.dblink_get_result('c1', false) as r(title text);
select extensions.dblink_exec('c1', 'rollback');

-- ── 데모 초기화와 저장이 겹쳐도 교착되지 않는다 ─────────────────────
-- 잠금 순서: 신입별 잠금(여럿이면 id 순) → 조직별 템플릿 잠금 → 템플릿 행 잠금.
-- c3가 시드 신입의 잠금을 쥔 동안 c2(관리자)가 초기화를 시작하고, c1(인사)이 템플릿을 저장한다.
-- 초기화가 템플릿 행부터 잠그면 저장(조직별 잠금 → 행)과 초기화(행 → 시작의 조직별 잠금)가 서로를 기다린다.
select extensions.dblink_exec('c3', 'begin');
select extensions.dblink_exec('c3',
  $$do $d$ begin perform pg_advisory_xact_lock(private.hire_lock_key('a5000000-0000-0000-0000-000000000104')); end $d$ $$);

select extensions.dblink_exec('c2', 'begin');
select extensions.dblink_exec('c2', $$set local role authenticated$$);
select extensions.dblink_exec('c2', $$set local request.jwt.claim.sub = 'a5000000-0000-0000-0000-000000000401'$$);
select extensions.dblink_send_query('c2', $$select public.reset_demo()::text$$);
select ok(pg_temp.wait_for_lock_wait('c2'), '초기화: 저장을 보내기 전에 시드 신입 잠금에서 기다리는 중이다');

select extensions.dblink_exec('c1', 'begin');
select extensions.dblink_exec('c1', $$set local role authenticated$$);
select extensions.dblink_exec('c1', $$set local request.jwt.claim.sub = 'a5000000-0000-0000-0000-000000000301'$$);
select extensions.dblink_send_query('c1', $$
  select (public.save_task_template(t.id, '선행2(수정)', '', 'ops', 'confirm', 'day1', 0, false, null, '{}')).title
    from public.task_templates t
   where t.org_id = 'a5000000-0000-0000-0000-000000000001' and t.code = 'P2'$$);
-- 저장이 끝나(is_busy=0) 결과가 준비될 때까지 최대 10초 기다린다
do $$
declare v_deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  while extensions.dblink_is_busy('c1') <> 0 and clock_timestamp() < v_deadline loop
    perform pg_sleep(0.05);
  end loop;
end $$;
select is(extensions.dblink_is_busy('c1'), 0,
  '초기화가 시드 신입 잠금을 기다리는 동안 템플릿 행을 잠그지 않아 저장이 바로 끝난다');

select extensions.dblink_exec('c3', 'commit');
select pg_sleep(1.5);  -- deadlock_timeout(1s)보다 길게: 교착이면 이 사이에 한쪽이 오류로 끝난다

-- 쉬는 연결부터 결과를 읽고 롤백해야 다른 쪽이 잠금을 얻고 끝난다(어느 쪽이 기다리든 멈추지 않게)
create temp table pair_err (conn text, err text);
create function pg_temp.finish(p_conn text) returns void language plpgsql as $$
begin
  perform count(*) from extensions.dblink_get_result(p_conn, false) as r(x text);
  insert into pair_err values (p_conn, extensions.dblink_error_message(p_conn));
  perform count(*) from extensions.dblink_get_result(p_conn, false) as r(x text);
  perform extensions.dblink_exec(p_conn, 'rollback');
end $$;
do $$
begin
  if extensions.dblink_is_busy('c1') = 0 then
    perform pg_temp.finish('c1');
    perform pg_temp.finish('c2');
  else
    perform pg_temp.finish('c2');
    perform pg_temp.finish('c1');
  end if;
end $$;
select is((select err from pair_err where conn = 'c1'), 'OK', '저장: 초기화와 겹쳐도 교착 없이 끝난다');
select is((select err from pair_err where conn = 'c2'), 'OK', '초기화: 저장과 겹쳐도 교착 없이 끝난다');

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
select extensions.dblink_disconnect('c3');

select * from finish();
rollback;
