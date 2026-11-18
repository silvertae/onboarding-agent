-- 0010 과제 템플릿 쓰기 RPC: 저장(새로 만들기·수정), 보관, 복원, 한 사람용 과제 추가·해당 없음(mark_na 교체), 코드 부여.
-- 템플릿 쓰기는 이 함수로만 한다(테이블 쓰기 권한·정책 없음). 담당 범위와 사용 중 잠금을 DB에서 확인한다.
-- 오류 코드: 42501 범위 밖, 22023 검증·잠금, P0002 없음.

-- 조직별 템플릿 잠금(private.template_lock_key)과 전체 잠금 순서는 0009에 있다.

-- ── 코드 부여 ───────────────────────────────────────────────────────
-- 같은 조직에서 "<접두어>-<번호>"(한 사람용은 "<접두어>-P<번호>")의 가장 큰 번호 + 1, 두 자리 이상 0 채움.
-- 조직별 템플릿 잠금(배타)을 얻은 뒤의 새 스냅샷에서 최대 번호를 본다(READ COMMITTED).
-- 저장에서는 이미 쥔 잠금이라 바로 통과하고, 한 사람용 추가(신입별 잠금 → 이 잠금)에서는 여기서 처음 잡는다.
create function private.next_task_code(p_org uuid, p_prefix text, p_one_off boolean) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_head text := p_prefix || case when p_one_off then '-P' else '-' end;
  v_next int;
begin
  perform pg_advisory_xact_lock(private.template_lock_key(p_org));

  select coalesce(max(substr(t.code, char_length(v_head) + 1)::int), 0) + 1 into v_next
    from public.task_templates t
   where t.org_id = p_org
     and left(t.code, char_length(v_head)) = v_head
     and substr(t.code, char_length(v_head) + 1) ~ '^[0-9]{1,9}$';
  return v_head || lpad(v_next::text, greatest(2, char_length(v_next::text)), '0');
end
$$;

-- ── 내부 도우미 ─────────────────────────────────────────────────────
-- 편집 칸 검증·정리. 정리한 값(title·description·kind·completion_mode·stage·due_offset_days·allow_na·checklist)을
-- 템플릿 행 모양으로 돌려준다. p_kind_before는 수정 전 종류(새 템플릿이면 null).
create function private.task_template_fields(
  p_title text,
  p_description text,
  p_kind public.task_kind,
  p_completion_mode public.completion_mode,
  p_stage public.task_stage,
  p_days_in_stage int,
  p_allow_na boolean,
  p_checklist jsonb,
  p_kind_before public.task_kind
) returns public.task_templates
language plpgsql stable set search_path = ''
as $$
declare
  v_ws constant text := E' \t\r\n\u00a0\u3000';  -- 줄바꿈 없는 공백·전각 공백도 지운다
  v public.task_templates;
begin
  v.title := btrim(coalesce(p_title, ''), v_ws);
  if char_length(v.title) not between 1 and 60 then
    raise exception '제목은 1~60자로 입력해 주세요' using errcode = '22023';
  end if;
  v.description := btrim(coalesce(p_description, ''), v_ws);
  if char_length(v.description) > 2000 then
    raise exception '안내문은 2000자 이하로 입력해 주세요' using errcode = '22023';
  end if;
  if p_kind is null or p_completion_mode is null or p_stage is null or p_allow_na is null then
    raise exception '종류·완료 방식·단계·해당 없음 허용을 골라 주세요' using errcode = '22023';
  end if;
  if p_days_in_stage is null or p_days_in_stage not between 0 and 60 then
    raise exception '기한은 단계 시작 후 0~60일로 입력해 주세요' using errcode = '22023';
  end if;

  -- 입력 양식은 시드만 쓴다: 원래 input인 템플릿만 input으로 남을 수 있다
  if p_kind = 'input' and p_kind_before is distinct from 'input' then
    raise exception '입력 양식 과제는 새로 만들 수 없습니다' using errcode = '22023';
  end if;
  if p_kind = 'assessment' then
    if (select private.my_role()) is distinct from 'team_trainer' then
      raise exception '평가 과제는 교육 담당자만 만들 수 있습니다' using errcode = '42501';
    end if;
    if p_completion_mode <> 'staff_only' then
      raise exception '평가 과제의 완료 방식은 담당자 처리여야 합니다' using errcode = '22023';
    end if;
  end if;

  if p_kind = 'setup' then
    -- 조건을 나눠 검사한다(배열이 아닐 때 길이·원소 함수가 오류를 내지 않게)
    if jsonb_typeof(p_checklist) is distinct from 'array' then
      raise exception '체크리스트는 1~20개 항목, 항목마다 1~60자로 입력해 주세요' using errcode = '22023';
    end if;
    if jsonb_array_length(p_checklist) not between 1 and 20
       or exists (
         select 1 from jsonb_array_elements(p_checklist) as e(x)
          where jsonb_typeof(e.x) <> 'string'
       ) then
      raise exception '체크리스트는 1~20개 항목, 항목마다 1~60자로 입력해 주세요' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(p_checklist) as e(x)
       where char_length(btrim(e.x, v_ws)) not between 1 and 60
    ) then
      raise exception '체크리스트는 1~20개 항목, 항목마다 1~60자로 입력해 주세요' using errcode = '22023';
    end if;
    v.checklist := (
      select jsonb_agg(btrim(e.x, v_ws) order by e.n)
        from jsonb_array_elements_text(p_checklist) with ordinality as e(x, n)
    );
  elsif p_checklist is not null and jsonb_typeof(p_checklist) <> 'null' then
    raise exception '체크리스트는 체크리스트 과제에만 넣을 수 있습니다' using errcode = '22023';
  end if;

  v.kind := p_kind;
  v.completion_mode := p_completion_mode;
  v.stage := p_stage;
  v.due_offset_days := private.stage_start_days(p_stage) + p_days_in_stage;
  v.allow_na := p_allow_na;
  return v;
end
$$;

-- 호출자가 관리하는 템플릿을 행 잠금과 함께 읽는다. 담당 범위는 is_handler(같은 부서 ops_staff·같은 팀 team_trainer).
-- 행 잠금(FOR UPDATE)은 인스턴스를 만드는 쪽의 외래 키 잠금과 충돌하므로, 잠금 뒤 사용 중 여부를 보면 그 사이 생긴 인스턴스도 보인다.
create function private.lock_managed_template(p_id uuid) returns public.task_templates
language plpgsql set search_path = ''
as $$
declare
  v_t public.task_templates;
begin
  if coalesce((select private.my_role())::text, '') not in ('team_trainer', 'ops_staff') then
    raise exception '과제 템플릿을 관리할 권한이 없습니다' using errcode = '42501';
  end if;
  select * into v_t from public.task_templates
   where id = p_id and org_id = (select private.my_org())
     for update;
  if not found then
    raise exception '과제 템플릿을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if not private.is_handler(v_t) then
    raise exception '담당 범위의 과제만 고칠 수 있습니다' using errcode = '42501';
  end if;
  return v_t;
end
$$;

-- 새 템플릿 행을 만든다. 담당은 팀 또는 부서 하나, 코드는 next_task_code, 정렬은 같은 담당·단계의 최댓값 + 10.
create function private.create_task_template(
  p_org uuid,
  p_team uuid,
  p_department public.ops_department,
  p_fields public.task_templates,
  p_prerequisite_codes text[],
  p_assigned_to uuid
) returns public.task_templates
language plpgsql set search_path = ''
as $$
declare
  v_prefix text;
  v_code text;
  v_sort int;
  v_t public.task_templates;
begin
  v_prefix := case
    when p_team is not null then
      coalesce((select nullif(btrim(tm.task_code_prefix), '') from public.teams tm where tm.id = p_team), 'TM')
    when p_department = 'hr' then 'HR'
    when p_department = 'ga' then 'GA'
    when p_department = 'accounting' then 'AC'
  end;
  v_code := private.next_task_code(p_org, v_prefix, p_assigned_to is not null);  -- 조직별 잠금을 잡는다

  select coalesce(max(t.sort_order), 0) + 10 into v_sort
    from public.task_templates t
   where t.org_id = p_org
     and t.stage = p_fields.stage
     and t.team_id is not distinct from p_team
     and t.department is not distinct from p_department;

  insert into public.task_templates
    (org_id, code, title, description, stage, department, team_id, kind, completion_mode, allow_na,
     requires_hq_access, prerequisite_codes, checklist, form_schema, due_offset_days, sort_order,
     assigned_to, created_by, is_seed)
  values
    (p_org, v_code, p_fields.title, p_fields.description, p_fields.stage, p_department, p_team, p_fields.kind,
     p_fields.completion_mode, p_fields.allow_na, false, p_prerequisite_codes, p_fields.checklist, null,
     p_fields.due_offset_days, v_sort, p_assigned_to, (select auth.uid()), false)
  returning * into v_t;
  return v_t;
end
$$;

-- ── 저장(새로 만들기·수정) ──────────────────────────────────────────
-- p_id가 null이면 호출자의 팀(교육 담당자) 또는 부서(경영지원) 템플릿을 새로 만든다.
-- 사용 중(인스턴스가 있는) 템플릿은 제목·안내문만 바뀐다. 다른 칸이 기존 값과 다르면 거부한다.
-- 조직별 템플릿 잠금(배타)을 가장 먼저 잡아 온보딩 시작(공유)과 직렬화한다(0009 잠금 순서).
create function public.save_task_template(
  p_id uuid,
  p_title text,
  p_description text,
  p_kind public.task_kind,
  p_completion_mode public.completion_mode,
  p_stage public.task_stage,
  p_days_in_stage int,
  p_allow_na boolean,
  p_checklist jsonb,
  p_prerequisite_codes text[]
) returns public.task_templates
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.user_role := (select private.my_role());
  v_org uuid := (select private.my_org());
  v_old public.task_templates;
  v_new public.task_templates;
  v_team uuid;
  v_department public.ops_department;
  v_prereq text[];
  v_prereq_before text[] := '{}';
begin
  if v_role is null or v_role not in ('team_trainer', 'ops_staff') then
    raise exception '과제 템플릿을 관리할 권한이 없습니다' using errcode = '42501';
  end if;
  -- 템플릿 행 잠금·읽기보다 먼저 잡는다. 진행 중인 시작이 있으면 커밋을 기다리므로 아래 사용 중 검사가 그 인스턴스를
  -- 보고, 이 저장이 끝나기 전에 시작한 신입은 커밋 뒤의 템플릿을 읽는다. 조직은 호출자 프로필에서 정한다
  -- (다른 조직 템플릿 id면 lock_managed_template가 P0002로 거부한다). 선행 변경의 순환 검사도 이 잠금 아래에서 한다.
  perform pg_advisory_xact_lock(private.template_lock_key(v_org));

  if p_id is null then
    if v_role = 'team_trainer' then
      v_team := (select private.my_team());
    else
      v_department := (select private.my_department());
    end if;
  else
    v_old := private.lock_managed_template(p_id);
    if v_old.assigned_to is not null then
      raise exception '한 사람용 과제는 여기서 고칠 수 없습니다' using errcode = '42501';
    end if;
    if v_old.archived_at is not null then
      raise exception '보관된 과제는 고칠 수 없습니다. 먼저 복원해 주세요' using errcode = '22023';
    end if;
    v_team := v_old.team_id;
    v_department := v_old.department;
    v_prereq_before := array(select distinct c from unnest(v_old.prerequisite_codes) as c order by 1);
  end if;

  v_new := private.task_template_fields(p_title, p_description, p_kind, p_completion_mode, p_stage,
                                        p_days_in_stage, p_allow_na, p_checklist, v_old.kind);

  -- 선행 과제: 공백 제거·중복 제거·정렬해 집합으로 다룬다
  if exists (select 1 from unnest(p_prerequisite_codes) as c where c is null or btrim(c) = '') then
    raise exception '선행 과제 코드가 비어 있습니다' using errcode = '22023';
  end if;
  v_prereq := array(select distinct btrim(c) from unnest(coalesce(p_prerequisite_codes, '{}')) as c order by 1);
  if cardinality(v_prereq) > 3 then
    raise exception '선행 과제는 3개까지 고를 수 있습니다' using errcode = '22023';
  end if;
  -- 바뀐 경우에만 검사한다. 이미 걸려 있던 코드는 그 뒤 보관됐어도 그대로 둘 수 있다(제목만 고칠 때 막히지 않게).
  if v_prereq is distinct from v_prereq_before then
    -- 맨 앞에서 잡은 조직별 템플릿 잠금 덕분에 A→B와 B→A를 동시에 저장해도 뒤 저장이 먼저 커밋된 선행을 본다
    -- (행 잠금은 고치는 행만 잡으므로 이 잠금 없이는 서로의 미커밋 변경을 못 보고 순환이 저장된다).
    if v_old.code = any (v_prereq) then
      raise exception '자기 자신을 선행 과제로 고를 수 없습니다' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(v_prereq) as c
       where c <> all (v_prereq_before)
         and not exists (
           select 1 from public.task_templates t
            where t.org_id = v_org
              and t.code = c
              and t.team_id is not distinct from v_team
              and t.department is not distinct from v_department
              and t.archived_at is null
              and t.assigned_to is null
         )
    ) then
      raise exception '선행 과제는 같은 담당 범위의 보관되지 않은 기본 과제만 고를 수 있습니다' using errcode = '22023';
    end if;
    -- 순환: 새 선행에서 선행을 따라가다 자기 코드에 닿으면 거부한다(보관된 템플릿의 선행도 따라간다)
    if p_id is not null and exists (
      with recursive reach(code) as (
        select c from unnest(v_prereq) as c
        union
        select p.code
          from reach r
          join public.task_templates t on t.org_id = v_org and t.code = r.code
          cross join lateral unnest(t.prerequisite_codes) as p(code)
      )
      select 1 from reach where reach.code = v_old.code
    ) then
      raise exception '선행 과제가 서로를 기다리게 되어 고를 수 없습니다' using errcode = '22023';
    end if;
  end if;

  if p_id is null then
    return private.create_task_template(v_org, v_team, v_department, v_new, v_prereq, null);
  end if;

  -- 사용 중 잠금: 진행 중인 신입의 제출·확인·잠금 해제가 템플릿을 실시간으로 읽으므로 구조를 바꾸지 않는다
  if exists (select 1 from public.task_instances i where i.template_id = v_old.id) then
    if v_new.kind is distinct from v_old.kind
       or v_new.completion_mode is distinct from v_old.completion_mode
       or v_new.stage is distinct from v_old.stage
       or v_new.due_offset_days is distinct from v_old.due_offset_days
       or v_new.allow_na is distinct from v_old.allow_na
       or v_new.checklist is distinct from v_old.checklist
       or v_prereq is distinct from v_prereq_before then
      raise exception '진행 중인 신입이 있어 제목·안내문만 고칠 수 있습니다' using errcode = '22023';
    end if;
    update public.task_templates
       set title = v_new.title, description = v_new.description
     where id = v_old.id
    returning * into v_new;
    return v_new;
  end if;

  update public.task_templates
     set title = v_new.title,
         description = v_new.description,
         kind = v_new.kind,
         completion_mode = v_new.completion_mode,
         stage = v_new.stage,
         due_offset_days = v_new.due_offset_days,
         allow_na = v_new.allow_na,
         checklist = v_new.checklist,
         prerequisite_codes = v_prereq
   where id = v_old.id
  returning * into v_new;
  return v_new;
end
$$;

-- ── 보관·복원 ───────────────────────────────────────────────────────
-- 보관한 템플릿은 새 신입에게 들어가지 않는다. 진행 중인 신입의 과제는 그대로 둔다. 한 사람용은 보관·복원하지 않는다.
create function public.archive_task_template(p_id uuid) returns public.task_templates
language plpgsql security definer set search_path = ''
as $$
declare
  v_t public.task_templates;
begin
  v_t := private.lock_managed_template(p_id);
  if v_t.assigned_to is not null then
    raise exception '한 사람용 과제는 보관하지 않습니다. 신입의 과제에서 해당 없음으로 처리해 주세요'
      using errcode = '22023';
  end if;
  update public.task_templates set archived_at = coalesce(archived_at, now())
   where id = v_t.id
  returning * into v_t;
  return v_t;
end
$$;

create function public.restore_task_template(p_id uuid) returns public.task_templates
language plpgsql security definer set search_path = ''
as $$
declare
  v_t public.task_templates;
begin
  v_t := private.lock_managed_template(p_id);
  if v_t.assigned_to is not null then
    raise exception '한 사람용 과제는 복원하지 않습니다' using errcode = '22023';
  end if;
  update public.task_templates set archived_at = null
   where id = v_t.id
  returning * into v_t;
  return v_t;
end
$$;

-- ── 한 사람용 과제 추가 ─────────────────────────────────────────────
-- 그 신입만 쓰는 숨은 템플릿(assigned_to)을 만들고 인스턴스를 바로 todo로 만든다. 선행은 없다.
-- 기한은 입사일 + due_offset_days, 오늘(Asia/Seoul)보다 이르면 오늘.
create function public.add_task_for_hire(
  p_new_hire uuid,
  p_title text,
  p_description text,
  p_kind public.task_kind,
  p_completion_mode public.completion_mode,
  p_stage public.task_stage,
  p_days_in_stage int,
  p_allow_na boolean,
  p_checklist jsonb
) returns public.task_instances
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.user_role := (select private.my_role());
  v_hire public.profiles;
  v_fields public.task_templates;
  v_t public.task_templates;
  v_i public.task_instances;
begin
  -- 같은 신입의 시작·잠금 해제와 직렬화한다(잠금 순서: 신입별 잠금 → 조직별 코드 잠금)
  perform pg_advisory_xact_lock(private.hire_lock_key(p_new_hire));

  select * into v_hire from public.profiles where id = p_new_hire;
  if not found or v_hire.role <> 'new_hire' or v_hire.org_id is distinct from (select private.my_org()) then
    raise exception '신입을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if not coalesce(
       v_role = 'ops_staff'
       or (v_role = 'team_trainer' and v_hire.team_id = (select private.my_team())),
       false) then
    raise exception '이 신입에게 과제를 추가할 권한이 없습니다' using errcode = '42501';
  end if;

  v_fields := private.task_template_fields(p_title, p_description, p_kind, p_completion_mode, p_stage,
                                           p_days_in_stage, p_allow_na, p_checklist, null);
  v_t := private.create_task_template(
    v_hire.org_id,
    case when v_role = 'team_trainer' then (select private.my_team()) end,
    case when v_role = 'ops_staff' then (select private.my_department()) end,
    v_fields,
    '{}',
    v_hire.id
  );

  insert into public.task_instances (org_id, template_id, new_hire_id, status, due_date)
  values (v_t.org_id, v_t.id, v_hire.id, 'todo',
          greatest(v_hire.hire_date + v_t.due_offset_days, (now() at time zone 'Asia/Seoul')::date))
  returning * into v_i;
  return v_i;
end
$$;

-- ── 해당 없음: 한 사람용 과제 빼기 ──────────────────────────────────
-- 한 사람용 과제는 고치거나 보관할 수 없으므로 빼는 길은 해당 없음(사유 필수)뿐이다.
-- 그래서 그 템플릿의 담당자는 해당 없음 허용(allow_na)과 상관없이 해당 없음으로 바꿀 수 있다.
-- 본문은 0003과 같고 allow_na 검사에 이 예외만 더했다(신입 본인·기본 과제·사유·상태 규칙은 그대로).
create or replace function public.mark_na(p_id uuid, p_reason text) returns public.task_instances
language plpgsql security definer set search_path = ''
as $$
declare
  v_i public.task_instances;
  v_t public.task_templates;
  v_reason text := btrim(coalesce(p_reason, ''), E' \t\r\n');
  v_handler boolean;
begin
  perform private.lock_hire_of_task(p_id);  -- 행 잠금보다 먼저 신입별 잠금(잠금 순서 통일)
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
  -- 한 사람용 과제는 담당자가 해당 없음 허용과 상관없이 뺄 수 있다
  if not v_t.allow_na and not (v_handler and v_t.assigned_to is not null) then
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

-- ── 실행 권한 ───────────────────────────────────────────────────────
revoke all on function
  private.task_template_fields(text, text, public.task_kind, public.completion_mode, public.task_stage, int, boolean,
                               jsonb, public.task_kind),
  private.lock_managed_template(uuid),
  private.create_task_template(uuid, uuid, public.ops_department, public.task_templates, text[], uuid)
from public, anon, authenticated;

-- 코드 부여는 정의자 함수(save_task_template·add_task_for_hire) 안에서만 부른다
revoke execute on function private.next_task_code(uuid, text, boolean) from public, anon, authenticated;
grant execute on function private.next_task_code(uuid, text, boolean) to service_role;

revoke execute on function
  public.save_task_template(uuid, text, text, public.task_kind, public.completion_mode, public.task_stage, int, boolean,
                            jsonb, text[]),
  public.archive_task_template(uuid),
  public.restore_task_template(uuid),
  public.add_task_for_hire(uuid, text, text, public.task_kind, public.completion_mode, public.task_stage, int, boolean,
                           jsonb)
from public, anon;

grant execute on function
  public.save_task_template(uuid, text, text, public.task_kind, public.completion_mode, public.task_stage, int, boolean,
                            jsonb, text[]),
  public.archive_task_template(uuid),
  public.restore_task_template(uuid),
  public.add_task_for_hire(uuid, text, text, public.task_kind, public.completion_mode, public.task_stage, int, boolean,
                           jsonb)
to authenticated, service_role;
