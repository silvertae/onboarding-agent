-- 0003 업무 규칙 함수(RPC), 잠금 해제 트리거, realtime publication.
-- 과제 상태는 여기 함수로만 바뀐다. 모든 함수는 search_path를 비워 두고 이름을 스키마로 적는다.

-- ── 내부 도우미 ─────────────────────────────────────────────────────
-- 호출자가 이 템플릿의 담당자인가: 같은 부서 ops_staff 또는 같은 팀 team_trainer
create function private.is_handler(p_template public.task_templates) returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.org_id = p_template.org_id
      and (
        (p.role = 'ops_staff' and p.department = p_template.department)
        or (p.role = 'team_trainer' and p.team_id = p_template.team_id)
      )
  )
$$;

-- 선행 과제가 모두 done|na인 blocked 인스턴스를 todo로 연다
create function private.unlock_ready(p_new_hire uuid) returns void
language sql set search_path = ''
as $$
  update public.task_instances i
     set status = 'todo'
    from public.task_templates t
   where i.template_id = t.id
     and i.new_hire_id = p_new_hire
     and i.status = 'blocked'
     and not exists (
       select 1
         from public.task_instances pi
         join public.task_templates pt on pt.id = pi.template_id
        where pi.new_hire_id = p_new_hire
          and pt.org_id = t.org_id
          and pt.code = any (t.prerequisite_codes)
          and pi.status not in ('done', 'na')
     )
$$;

create function private.on_task_finished() returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform private.unlock_ready(new.new_hire_id);
  return null;
end
$$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- 감사 필드 고정: 사용자 요청(auth.uid()가 있을 때)이면 작성자를 호출자로 덮어쓴다
create function private.stamp_knowledge() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.updated_by := (select auth.uid());
  end if;
  return new;
end
$$;

create function private.stamp_exam() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  elsif (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end
$$;

-- 미답변은 항상 open으로 기록한다(해결은 resolve_unanswered로만)
create function private.sanitize_unanswered() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.status := 'open';
  new.resolved_knowledge_id := null;
  new.created_at := now();
  return new;
end
$$;

revoke all on function private.is_handler(public.task_templates) from public;
revoke all on function private.unlock_ready(uuid) from public;
revoke all on function private.on_task_finished() from public;
revoke all on function private.touch_updated_at() from public;
revoke all on function private.stamp_knowledge() from public;
revoke all on function private.stamp_exam() from public;
revoke all on function private.sanitize_unanswered() from public;

create trigger knowledge_items_stamp
  before insert or update on public.knowledge_items
  for each row execute function private.stamp_knowledge();

create trigger exams_stamp
  before insert or update on public.exams
  for each row execute function private.stamp_exam();

create trigger unanswered_questions_sanitize
  before insert on public.unanswered_questions
  for each row execute function private.sanitize_unanswered();

create trigger task_instances_unlock
  after update of status on public.task_instances
  for each row
  when (new.status in ('done', 'na') and old.status is distinct from new.status)
  execute function private.on_task_finished();

create trigger task_instances_touch
  before update on public.task_instances
  for each row execute function private.touch_updated_at();

create trigger knowledge_items_touch
  before update on public.knowledge_items
  for each row execute function private.touch_updated_at();

-- ── 온보딩 시작 ─────────────────────────────────────────────────────
-- 회사 공통 템플릿 + 신입 팀 템플릿으로 인스턴스를 만든다. 반환: 새로 만든 수(재호출 시 0).
create function public._start_onboarding(p_new_hire uuid) returns int
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
  on conflict (template_id, new_hire_id) do nothing;
  get diagnostics v_count = row_count;

  -- 선행 과제가 처음부터 na인 경우를 연다
  perform private.unlock_ready(v_hire.id);
  return v_count;
end
$$;

create function public.start_onboarding(p_new_hire uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_hire public.profiles;
begin
  if coalesce((select private.my_role())::text, '') not in ('ops_staff', 'admin') then
    raise exception '온보딩을 시작할 권한이 없습니다' using errcode = '42501';
  end if;
  select * into v_hire from public.profiles where id = p_new_hire;
  if not found or v_hire.org_id is distinct from (select private.my_org()) then
    raise exception '신입을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  return public._start_onboarding(p_new_hire);
end
$$;

-- ── 신입의 제출·해당 없음 ───────────────────────────────────────────
create function public.submit_task(p_id uuid, p_result jsonb default null) returns public.task_instances
language plpgsql security definer set search_path = ''
as $$
declare
  v_i public.task_instances;
  v_t public.task_templates;
begin
  select * into v_i from public.task_instances where id = p_id for update;
  if not found or v_i.new_hire_id is distinct from (select auth.uid()) then
    raise exception '본인 과제만 제출할 수 있습니다' using errcode = '42501';
  end if;
  select * into v_t from public.task_templates where id = v_i.template_id;
  if v_t.completion_mode = 'staff_only' then
    raise exception '담당자가 처리하는 과제입니다' using errcode = '42501';
  end if;

  -- 이미 제출했거나 끝난 과제는 그대로 돌려준다(연타·재호출 대비)
  if v_i.status in ('submitted', 'done') then
    return v_i;
  end if;
  if v_i.status not in ('todo', 'rework') then
    raise exception '지금은 제출할 수 없는 과제입니다' using errcode = '22023';
  end if;

  if v_t.kind = 'setup' and exists (
    select 1
      from jsonb_array_elements_text(coalesce(v_t.checklist, '[]'::jsonb)) as item(v)
     where not (coalesce(p_result -> 'checked', '[]'::jsonb) ? item.v)
  ) then
    raise exception '체크리스트를 모두 완료해야 합니다' using errcode = '22023';
  end if;

  update public.task_instances
     set result = p_result,
         submitted_at = now(),
         status = case when v_t.completion_mode = 'self' then 'done'::public.task_status
                       else 'submitted'::public.task_status end
   where id = p_id
  returning * into v_i;
  return v_i;
end
$$;

create function public.mark_na(p_id uuid, p_reason text) returns public.task_instances
language plpgsql security definer set search_path = ''
as $$
declare
  v_i public.task_instances;
  v_t public.task_templates;
  v_reason text := btrim(coalesce(p_reason, ''), E' \t\r\n');
  v_handler boolean;
begin
  select * into v_i from public.task_instances where id = p_id for update;
  if not found then
    raise exception '과제를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  select * into v_t from public.task_templates where id = v_i.template_id;
  v_handler := private.is_handler(v_t);
  if v_i.new_hire_id is distinct from (select auth.uid()) and not v_handler then
    raise exception '해당 없음으로 바꿀 권한이 없습니다' using errcode = '42501';
  end if;
  -- 신입 본인은 담당자 처리 과제를 바꿀 수 없고, 할 차례(todo·rework)인 과제만 바꿀 수 있다
  if not v_handler and v_t.completion_mode = 'staff_only' then
    raise exception '담당자가 처리하는 과제입니다' using errcode = '42501';
  end if;
  if not v_handler and v_i.status not in ('todo', 'rework', 'na') then
    raise exception '지금은 해당 없음으로 바꿀 수 없는 과제입니다' using errcode = '22023';
  end if;
  if not v_t.allow_na then
    raise exception '해당 없음을 선택할 수 없는 과제입니다' using errcode = '22023';
  end if;
  if v_reason = '' then
    raise exception '사유를 입력해 주세요' using errcode = '22023';
  end if;
  if v_i.status = 'na' then
    return v_i;
  end if;
  if v_i.status = 'done' then
    raise exception '이미 완료된 과제입니다' using errcode = '22023';
  end if;

  update public.task_instances set status = 'na', na_reason = v_reason
   where id = p_id
  returning * into v_i;
  return v_i;
end
$$;

-- ── 담당자의 확인·보완 요청 ─────────────────────────────────────────
create function public.confirm_task(p_id uuid) returns public.task_instances
language plpgsql security definer set search_path = ''
as $$
declare
  v_i public.task_instances;
  v_t public.task_templates;
begin
  select * into v_i from public.task_instances where id = p_id for update;
  if not found then
    raise exception '과제를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  select * into v_t from public.task_templates where id = v_i.template_id;
  if not private.is_handler(v_t) then
    raise exception '이 과제의 담당자가 아닙니다' using errcode = '42501';
  end if;

  if v_i.status = 'done' then
    return v_i;
  end if;
  if not ((v_t.completion_mode = 'confirm' and v_i.status = 'submitted')
          or (v_t.completion_mode = 'staff_only' and v_i.status = 'todo')) then
    raise exception '지금은 확인할 수 없는 과제입니다' using errcode = '22023';
  end if;

  update public.task_instances
     set status = 'done', confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = p_id
  returning * into v_i;
  return v_i;
end
$$;

create function public.request_rework(p_id uuid, p_reason text) returns public.task_instances
language plpgsql security definer set search_path = ''
as $$
declare
  v_i public.task_instances;
  v_t public.task_templates;
  v_reason text := btrim(coalesce(p_reason, ''), E' \t\r\n');
begin
  select * into v_i from public.task_instances where id = p_id for update;
  if not found then
    raise exception '과제를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  select * into v_t from public.task_templates where id = v_i.template_id;
  if not private.is_handler(v_t) then
    raise exception '이 과제의 담당자가 아닙니다' using errcode = '42501';
  end if;
  if v_reason = '' then
    raise exception '보완 요청 사유를 입력해 주세요' using errcode = '22023';
  end if;
  if v_i.status = 'rework' then
    return v_i;
  end if;
  if v_i.status <> 'submitted' then
    raise exception '확인 대기 중인 과제만 보완 요청할 수 있습니다' using errcode = '22023';
  end if;

  update public.task_instances set status = 'rework', rework_reason = v_reason
   where id = p_id
  returning * into v_i;
  return v_i;
end
$$;

-- ── 평가 기록 (해당 팀 교육 담당자만) ───────────────────────────────
create function public.record_assessment(
  p_id uuid,
  p_result public.assessment_result,
  p_note text,
  p_scheduled_at timestamptz default null,
  p_location text default null
) returns public.task_instances
language plpgsql security definer set search_path = ''
as $$
declare
  v_i public.task_instances;
  v_t public.task_templates;
begin
  select * into v_i from public.task_instances where id = p_id for update;
  if not found then
    raise exception '과제를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  select * into v_t from public.task_templates where id = v_i.template_id;
  if (select private.my_role()) is distinct from 'team_trainer'
     or v_t.team_id is distinct from (select private.my_team())
     or v_t.org_id is distinct from (select private.my_org()) then
    raise exception '이 팀의 교육 담당자만 평가를 기록할 수 있습니다' using errcode = '42501';
  end if;
  if v_t.kind <> 'assessment' then
    raise exception '평가 과제가 아닙니다' using errcode = '22023';
  end if;
  if v_i.status in ('blocked', 'na') then
    raise exception '지금은 평가를 기록할 수 없는 과제입니다' using errcode = '22023';
  end if;

  update public.task_instances
     set scheduled_at = coalesce(p_scheduled_at, scheduled_at),
         location = coalesce(p_location, location),
         assessment_note = coalesce(p_note, assessment_note),
         assessment_result = coalesce(p_result, assessment_result),
         status = case when p_result is not null then 'done'::public.task_status else status end,
         confirmed_by = case when p_result is not null then (select auth.uid()) else confirmed_by end,
         confirmed_at = case when p_result is not null then now() else confirmed_at end
   where id = p_id
  returning * into v_i;
  return v_i;
end
$$;

-- ── 미답변 해결 → 게시 지식 ─────────────────────────────────────────
-- 범위는 호출자 역할로 정한다: trainer = 우리 팀, ops = 회사 공통
create function public.resolve_unanswered(p_id uuid, p_question text, p_answer text, p_category text)
returns public.knowledge_items
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.user_role := (select private.my_role());
  v_u public.unanswered_questions;
  v_k public.knowledge_items;
begin
  if v_role is null or v_role not in ('team_trainer', 'ops_staff') then
    raise exception '지식을 등록할 권한이 없습니다' using errcode = '42501';
  end if;
  select * into v_u from public.unanswered_questions
   where id = p_id and org_id = (select private.my_org())
     for update;
  if not found or (v_role = 'team_trainer' and v_u.team_id is distinct from (select private.my_team())) then
    raise exception '미답변 질문을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if btrim(coalesce(p_question, '')) = '' or btrim(coalesce(p_answer, '')) = '' then
    raise exception '질문과 답변을 입력해 주세요' using errcode = '22023';
  end if;
  if v_u.status = 'resolved' and v_u.resolved_knowledge_id is not null then
    select * into v_k from public.knowledge_items where id = v_u.resolved_knowledge_id;
    if found then
      return v_k;
    end if;
  end if;

  insert into public.knowledge_items (org_id, scope, team_id, question, answer, category, status, updated_by)
  values (
    v_u.org_id,
    case when v_role = 'team_trainer' then 'team'::public.knowledge_scope else 'company'::public.knowledge_scope end,
    case when v_role = 'team_trainer' then (select private.my_team()) end,
    btrim(p_question),
    btrim(p_answer),
    coalesce(btrim(p_category), ''),
    'published',
    (select auth.uid())
  )
  returning * into v_k;

  update public.unanswered_questions
     set status = 'resolved', resolved_knowledge_id = v_k.id
   where id = p_id;
  return v_k;
end
$$;

-- ── 실행 권한 ───────────────────────────────────────────────────────
revoke execute on function public._start_onboarding(uuid) from public, anon, authenticated;
grant execute on function public._start_onboarding(uuid) to service_role;

revoke execute on function
  public.start_onboarding(uuid),
  public.submit_task(uuid, jsonb),
  public.mark_na(uuid, text),
  public.confirm_task(uuid),
  public.request_rework(uuid, text),
  public.record_assessment(uuid, public.assessment_result, text, timestamptz, text),
  public.resolve_unanswered(uuid, text, text, text)
from public, anon;

grant execute on function
  public.start_onboarding(uuid),
  public.submit_task(uuid, jsonb),
  public.mark_na(uuid, text),
  public.confirm_task(uuid),
  public.request_rework(uuid, text),
  public.record_assessment(uuid, public.assessment_result, text, timestamptz, text),
  public.resolve_unanswered(uuid, text, text, text)
to authenticated, service_role;

-- ── Realtime ────────────────────────────────────────────────────────
alter publication supabase_realtime
  add table public.task_instances, public.unanswered_questions, public.knowledge_items;
