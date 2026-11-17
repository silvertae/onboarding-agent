-- 0002 RLS와 권한. anon에는 아무 권한도 주지 않는다.
-- task_instances에는 쓰기 권한·정책이 없다. 상태 변경은 0003의 RPC(security definer)로만 한다.

-- ── 호출자 정보 함수 (API에 노출되지 않는 private 스키마) ─────────────
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create function private.my_org() returns uuid
language sql stable security definer set search_path = ''
as $$ select org_id from public.profiles where id = (select auth.uid()) $$;

create function private.my_role() returns public.user_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = (select auth.uid()) $$;

create function private.my_team() returns uuid
language sql stable security definer set search_path = ''
as $$ select team_id from public.profiles where id = (select auth.uid()) $$;

create function private.my_department() returns public.ops_department
language sql stable security definer set search_path = ''
as $$ select department from public.profiles where id = (select auth.uid()) $$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ── 기본 권한 정리 ──────────────────────────────────────────────────
-- 앞으로 만드는 객체도 anon에게 자동으로 열리지 않게 한다.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

revoke all on all tables in schema public from anon, authenticated;

grant select on public.orgs, public.teams, public.task_templates, public.profiles, public.task_instances
  to authenticated;
grant select, insert, update, delete on public.knowledge_items, public.exams, public.exam_questions
  to authenticated;
grant select, insert on public.unanswered_questions to authenticated;
-- usage_counters: 권한 없음(consume_quota RPC로만 접근)

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.orgs enable row level security;
alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_instances enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.unanswered_questions enable row level security;
alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.usage_counters enable row level security;

create policy "같은 조직" on public.orgs for select to authenticated
  using (id = (select private.my_org()));

create policy "같은 조직" on public.teams for select to authenticated
  using (org_id = (select private.my_org()));

create policy "같은 조직" on public.task_templates for select to authenticated
  using (org_id = (select private.my_org()));

-- 본인 / 같은 조직 전체(admin) / 신입 전체(ops) / 우리 팀 신입(trainer)
create policy "역할별 조회" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (
      org_id = (select private.my_org())
      and (
        (select private.my_role()) = 'admin'
        or ((select private.my_role()) = 'ops_staff' and role = 'new_hire')
        or ((select private.my_role()) = 'team_trainer' and role = 'new_hire'
            and team_id = (select private.my_team()))
      )
    )
  );

-- 본인 과제 / 템플릿 팀이 내 팀인 trainer / 템플릿 부서가 내 부서인 ops
create policy "본인 또는 담당자" on public.task_instances for select to authenticated
  using (
    new_hire_id = (select auth.uid())
    or exists (
      select 1 from public.task_templates t
      where t.id = template_id
        and t.org_id = (select private.my_org())
        and (
          ((select private.my_role()) = 'team_trainer' and t.team_id = (select private.my_team()))
          or ((select private.my_role()) = 'ops_staff' and t.department = (select private.my_department()))
        )
    )
  );

-- 게시 지식은 범위 안 전원, 초안 포함 관리는 trainer(우리 팀)·ops(회사 공통)
create policy "게시 지식 또는 관리 범위" on public.knowledge_items for select to authenticated
  using (
    org_id = (select private.my_org())
    and (
      (status = 'published' and (scope = 'company' or team_id = (select private.my_team())))
      or ((select private.my_role()) = 'team_trainer' and scope = 'team' and team_id = (select private.my_team()))
      or ((select private.my_role()) = 'ops_staff' and scope = 'company')
    )
  );

create policy "관리 범위 추가" on public.knowledge_items for insert to authenticated
  with check (
    org_id = (select private.my_org())
    and (
      ((select private.my_role()) = 'team_trainer' and scope = 'team' and team_id = (select private.my_team()))
      or ((select private.my_role()) = 'ops_staff' and scope = 'company')
    )
  );

create policy "관리 범위 수정" on public.knowledge_items for update to authenticated
  using (
    org_id = (select private.my_org())
    and (
      ((select private.my_role()) = 'team_trainer' and scope = 'team' and team_id = (select private.my_team()))
      or ((select private.my_role()) = 'ops_staff' and scope = 'company')
    )
  )
  with check (
    org_id = (select private.my_org())
    and (
      ((select private.my_role()) = 'team_trainer' and scope = 'team' and team_id = (select private.my_team()))
      or ((select private.my_role()) = 'ops_staff' and scope = 'company')
    )
  );

create policy "관리 범위 삭제" on public.knowledge_items for delete to authenticated
  using (
    org_id = (select private.my_org())
    and (
      ((select private.my_role()) = 'team_trainer' and scope = 'team' and team_id = (select private.my_team()))
      or ((select private.my_role()) = 'ops_staff' and scope = 'company')
    )
  );

create policy "본인 질문 기록" on public.unanswered_questions for insert to authenticated
  with check (
    asked_by = (select auth.uid())
    and org_id = (select private.my_org())
    and team_id is not distinct from (select private.my_team())
  );

create policy "우리 팀 trainer와 ops" on public.unanswered_questions for select to authenticated
  using (
    org_id = (select private.my_org())
    and (
      ((select private.my_role()) = 'team_trainer' and team_id = (select private.my_team()))
      or (select private.my_role()) = 'ops_staff'
    )
  );

create policy "우리 팀 trainer" on public.exams for all to authenticated
  using (
    org_id = (select private.my_org())
    and (select private.my_role()) = 'team_trainer'
    and team_id = (select private.my_team())
  )
  with check (
    org_id = (select private.my_org())
    and (select private.my_role()) = 'team_trainer'
    and team_id = (select private.my_team())
  );

-- 문항은 볼 수 있는 시험에 딸린 것만 (exams RLS가 함께 적용된다)
create policy "볼 수 있는 시험의 문항" on public.exam_questions for all to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id))
  with check (
    org_id = (select private.my_org())
    and exists (select 1 from public.exams e where e.id = exam_id)
  );

-- usage_counters: 정책 없음
