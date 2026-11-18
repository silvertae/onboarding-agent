-- 0009 과제 템플릿 관리: 보관·한 사람용·시드 표시 컬럼, 시드 사본, 조회 정책 교체, 시작 함수 보강.
-- 추가만 한다. 단, "같은 조직" 조회 정책은 한 사람용 과제를 다른 신입·담당 밖 직원에게 숨기려고 교체한다(테이블·컬럼 변경이 아님).

alter table public.task_templates
  add column archived_at timestamptz,
  add column assigned_to uuid references public.profiles (id),
  add column created_by uuid references public.profiles (id),
  add column is_seed boolean not null default false;

-- 이 시점의 기존 템플릿은 전부 시드다
update public.task_templates set is_seed = true;

create index on public.task_templates (assigned_to) where assigned_to is not null;

alter table public.teams add column task_code_prefix text;
update public.teams set task_code_prefix = 'AI' where name = 'AI팀';

-- ── 시드 템플릿 사본(reset_demo가 시드 상태로 되돌릴 때 쓴다) ───────────
create table private.task_template_seed (
  template_id uuid primary key references public.task_templates (id),
  org_id uuid not null references public.orgs (id),
  title text not null,
  description text not null,
  kind public.task_kind not null,
  completion_mode public.completion_mode not null,
  stage public.task_stage not null,
  due_offset_days int not null,
  allow_na boolean not null,
  requires_hq_access boolean not null,
  prerequisite_codes text[] not null,
  checklist jsonb,
  form_schema jsonb,
  sort_order int not null
);
alter table private.task_template_seed enable row level security;
revoke all on private.task_template_seed from public, anon, authenticated;

insert into private.task_template_seed
  (template_id, org_id, title, description, kind, completion_mode, stage, due_offset_days,
   allow_na, requires_hq_access, prerequisite_codes, checklist, form_schema, sort_order)
select id, org_id, title, description, kind, completion_mode, stage, due_offset_days,
       allow_na, requires_hq_access, prerequisite_codes, checklist, form_schema, sort_order
  from public.task_templates
 where is_seed;

-- ── 단계 시작일 ─────────────────────────────────────────────────────
create function private.stage_start_days(p_stage public.task_stage) returns int
language sql immutable set search_path = ''
as $$
  select case p_stage when 'day1' then 0 when 'week1' then 5 else 30 end
$$;
revoke execute on function private.stage_start_days(public.task_stage) from public, anon;
grant execute on function private.stage_start_days(public.task_stage) to authenticated, service_role;

-- ── 조회 정책 교체: 한 사람용 과제는 본인·담당자·관리자만 ───────────
-- 담당자 = 그 템플릿의 같은 팀 교육 담당자·같은 부서 경영지원(private.is_handler와 같은 조건, task_instances 조회 정책과 같은 모양).
-- 관리자는 데모 초기화 때 한 사람용 템플릿의 서식을 지우려고 본다. 서식 행·객체 조회 정책이 이 정책을 따른다.
drop policy "같은 조직" on public.task_templates;
create policy "같은 조직, 한 사람용은 본인·담당자·관리자" on public.task_templates for select to authenticated
  using (
    org_id = (select private.my_org())
    and (
      assigned_to is null
      or assigned_to = (select auth.uid())
      or (select private.my_role()) = 'admin'
      or ((select private.my_role()) = 'team_trainer' and team_id = (select private.my_team()))
      or ((select private.my_role()) = 'ops_staff' and department = (select private.my_department()))
    )
  );

-- ── 온보딩 시작: 보관·한 사람용 템플릿은 건너뛴다 ───────────────────
-- 이미 시작한 신입(기본 과제 인스턴스가 하나라도 있는 신입)에게는 아무것도 더하지 않는다(진행 중인 신입 보호).
-- bootstrap이 배포마다 다시 부르고 start_onboarding도 다시 부를 수 있으므로, 그 사이 만든 기본 과제가 끼어들면 안 된다.
-- 한 사람용 인스턴스는 세지 않는다: 시작 전에 한 사람용 과제를 먼저 받은 신입도 시작할 수 있어야 한다.
create or replace function public._start_onboarding(p_new_hire uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_hire public.profiles;
  v_count int;
begin
  select * into v_hire from public.profiles where id = p_new_hire;
  if not found or v_hire.role <> 'new_hire' then
    raise exception '신입 계정이 아닙니다' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(private.hire_lock_key(v_hire.id));

  -- 잠금을 얻은 뒤의 새 스냅샷에서 본다(같은 신입의 시작·한 사람용 추가와 직렬화)
  if exists (
    select 1
      from public.task_instances i
      join public.task_templates t on t.id = i.template_id
     where i.new_hire_id = v_hire.id
       and t.assigned_to is null
  ) then
    return 0;
  end if;

  insert into public.task_instances (org_id, template_id, new_hire_id, status, due_date, na_reason)
  select t.org_id,
         t.id,
         v_hire.id,
         case
           when t.requires_hq_access and not v_hire.needs_hq_access then 'na'::public.task_status
           when cardinality(t.prerequisite_codes) > 0 then 'blocked'::public.task_status
           else 'todo'::public.task_status
         end,
         v_hire.hire_date + t.due_offset_days,
         case when t.requires_hq_access and not v_hire.needs_hq_access then '본사 출입 대상 아님' end
    from public.task_templates t
   where t.org_id = v_hire.org_id
     and (t.department is not null or t.team_id = v_hire.team_id)
     and t.archived_at is null
     and t.assigned_to is null
  on conflict (template_id, new_hire_id) do nothing;
  get diagnostics v_count = row_count;

  -- 선행 과제가 처음부터 na인 경우를 연다
  perform private.unlock_ready(v_hire.id);
  return v_count;
end
$$;
