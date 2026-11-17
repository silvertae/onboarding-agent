-- 하루 사용 한도(consume_quota) 테스트
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.orgs (id, name) values ('a3000000-0000-0000-0000-000000000001', '테스트 가상 조직');
insert into public.teams (id, org_id, name) values
  ('a3000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-000000000001', '팀T');
insert into auth.users (id, email) values
  ('a3000000-0000-0000-0000-000000000101', 'q1@quota.test'),
  ('a3000000-0000-0000-0000-000000000102', 'q2@quota.test');
insert into public.profiles (id, org_id, email, full_name, role, team_id, hire_date) values
  ('a3000000-0000-0000-0000-000000000101', 'a3000000-0000-0000-0000-000000000001', 'q1@quota.test', '신입1', 'new_hire',
   'a3000000-0000-0000-0000-0000000000a1', current_date),
  ('a3000000-0000-0000-0000-000000000102', 'a3000000-0000-0000-0000-000000000001', 'q2@quota.test', '신입2', 'new_hire',
   'a3000000-0000-0000-0000-0000000000a1', current_date);

select ok(not has_function_privilege('anon', 'public.consume_quota(text, int)', 'execute'),
  'consume_quota: anon 실행 불가');

set local role authenticated;
set local request.jwt.claim.sub = 'a3000000-0000-0000-0000-000000000101';
select is(public.consume_quota('chat', 2), true,  'chat 1회째 → true');
select is(public.consume_quota('chat', 2), true,  'chat 2회째 → true');
select is(public.consume_quota('chat', 2), false, 'chat 3회째(한도 2 초과) → false');
select is(public.consume_quota('exam', 1), true,  '같은 사용자 exam 1회째 → true (종류별로 센다)');
select throws_ok($$select public.consume_quota('other', 1)$$, null, null, 'kind가 chat|exam이 아니면 예외');
select throws_ok('select 1 from public.usage_counters', '42501', null, 'usage_counters 직접 조회 불가');

set local request.jwt.claim.sub = 'a3000000-0000-0000-0000-000000000102';
select is(public.consume_quota('chat', 2), true, '다른 사용자 chat 1회째 → true');

reset role;
select is((select count from public.usage_counters
            where user_id = 'a3000000-0000-0000-0000-000000000101' and kind = 'chat'
              and day = (now() at time zone 'Asia/Seoul')::date),
  3, '오늘(Asia/Seoul) 날짜로 3회 기록');

select * from finish();
rollback;
