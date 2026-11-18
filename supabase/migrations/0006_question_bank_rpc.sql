-- 0006 문제은행 RPC: 확정 시험 등록, 은행에서 뽑기, 생성 회피 목록, 응시 시험 연결.
-- 등록·뽑기·회피 목록은 호출자 권한(RLS 적용)으로 돈다. 응시 기록 쓰기는 assign_exam으로만 한다.

-- ── 문항 출처는 우리 팀 은행만 ──────────────────────────────────────
-- FK 검사는 RLS를 보지 않으므로 다른 팀 은행 id를 bank_item_id에 넣을 수 있다.
-- 그러면 등록(출처가 비어 있는 문항만 넣음)·뽑기 제외·응시 스냅샷이 틀어지고 다른 팀 id 존재를 떠볼 수 있다.
-- 은행 RLS가 하위 조회를 우리 팀 행으로 좁히므로, 보이지 않는 id는 검사에 걸린다.
create policy "은행 문항은 우리 팀 것만" on public.exam_questions as restrictive for insert to authenticated
  with check (
    bank_item_id is null
    or exists (select 1 from public.question_bank_items b where b.id = bank_item_id)
  );

create policy "은행 문항은 우리 팀 것만 수정" on public.exam_questions as restrictive for update to authenticated
  using (true)
  with check (
    bank_item_id is null
    or exists (select 1 from public.question_bank_items b where b.id = bank_item_id)
  );

-- ── 확정 시험 문항을 은행에 등록 ────────────────────────────────────
-- 대상: 출처가 비어 있는 문항, 그리고 출처 은행 행과 문장 키가 달라진 문항(편집기에서 새 문제로 고친 경우).
-- 대상을 은행에 넣고(같은 문항은 건너뜀) 같은 문항 키의 은행 행으로 출처를 바꾼다. 원래 은행 행은 고치지 않는다.
-- 답안·채점 기준·배점만 고친 문항은 문장 키가 같으므로 대상이 아니다.
-- 반환: 새로 넣은 은행 행 수. 다시 불러도 중복이 생기지 않는다.
create function public.register_exam_to_bank(p_exam uuid) returns int
language plpgsql security invoker set search_path = ''
as $$
declare
  v_e public.exams;
  v_ids uuid[];
  v_count int;
begin
  select * into v_e from public.exams where id = p_exam;
  if not found then
    raise exception '시험을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if v_e.status <> 'final' then
    raise exception '확정된 시험만 문제은행에 넣을 수 있습니다' using errcode = '22023';
  end if;

  select coalesce(array_agg(q.id), '{}') into v_ids
    from public.exam_questions q
    left join public.question_bank_items b on b.id = q.bank_item_id
   where q.exam_id = p_exam
     and (b.id is null or b.prompt_key <> private.prompt_key(q.prompt));

  insert into public.question_bank_items
    (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source)
  select v_e.org_id, v_e.team_id, v_e.topic, v_e.difficulty, q.prompt, q.model_answer, q.rubric, q.points, 'exam'
    from public.exam_questions q
   where q.id = any (v_ids)
   order by q.position
  on conflict (team_id, prompt_key) do nothing;
  get diagnostics v_count = row_count;

  update public.exam_questions q
     set bank_item_id = b.id
    from public.question_bank_items b
   where q.id = any (v_ids)
     and b.team_id = v_e.team_id
     and b.prompt_key = private.prompt_key(q.prompt);

  return v_count;
end
$$;

-- ── 은행에서 뽑기 ───────────────────────────────────────────────────
-- 우리 팀 게시 문항 중 주제(topic_key)·난이도가 같은 것을 무작위로 p_count개.
-- 편집기에 있는 문항은 출처 id(p_exclude)와 문장(p_exclude_prompts)으로 빼고,
-- p_new_hire가 있으면 그 신입의 응시 기록 스냅샷에 있는 문항도 뺀다.
create function public.pick_bank_items(
  p_topic text,
  p_difficulty public.exam_difficulty,
  p_count int,
  p_exclude uuid[] default '{}',
  p_exclude_prompts text[] default '{}',
  p_new_hire uuid default null
) returns setof public.question_bank_items
language plpgsql volatile security invoker set search_path = ''
as $$
begin
  if p_count is null or p_count < 1 or p_count > 10 then
    raise exception '문항 수는 1~10개입니다' using errcode = '22023';
  end if;

  return query
  select b.*
    from public.question_bank_items b
   where b.team_id = (select private.my_team())
     and b.status = 'active'
     and b.topic_key = lower(btrim(p_topic))
     and b.difficulty = p_difficulty
     and b.id <> all (coalesce(p_exclude, '{}'))
     and b.prompt_key <> all (array(
       select private.prompt_key(x) from unnest(coalesce(p_exclude_prompts, '{}')) as x
     ))
     and not exists (
       select 1
         from public.exam_sittings s
         join public.task_instances i on i.id = s.task_instance_id
        where i.new_hire_id = p_new_hire
          and b.id = any (s.bank_item_ids)
     )
   order by random()
   limit p_count;
end
$$;

-- ── 생성 회피 목록 ──────────────────────────────────────────────────
-- 같은 조건(제외 없음)의 게시 문항 문장을 최근 것부터 최대 30개.
create function public.bank_prompts(
  p_topic text,
  p_difficulty public.exam_difficulty,
  p_limit int default 30
) returns setof text
language sql stable security invoker set search_path = ''
as $$
  select b.prompt
    from public.question_bank_items b
   where b.team_id = (select private.my_team())
     and b.status = 'active'
     and b.topic_key = lower(btrim(p_topic))
     and b.difficulty = p_difficulty
   order by b.created_at desc
   limit least(p_limit, 30)
$$;

-- ── 평가 과제에 응시 시험 연결 (해당 팀 교육 담당자만) ──────────────
-- 연결 시점에 시험에 있던 은행 문항 id를 스냅샷으로 남긴다. 다시 연결하면 처음 스냅샷을 그대로 돌려준다.
create function public.assign_exam(p_task uuid, p_exam uuid) returns public.exam_sittings
language plpgsql security definer set search_path = ''
as $$
declare
  v_i public.task_instances;
  v_t public.task_templates;
  v_e public.exams;
  v_s public.exam_sittings;
begin
  perform private.lock_hire_of_task(p_task);  -- 다른 상태 변경 RPC와 잠금 순서를 맞춘다
  select * into v_i from public.task_instances where id = p_task;
  if not found then
    raise exception '과제를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  select * into v_t from public.task_templates where id = v_i.template_id;
  if (select private.my_role()) is distinct from 'team_trainer'
     or v_t.team_id is distinct from (select private.my_team())
     or v_t.org_id is distinct from (select private.my_org()) then
    raise exception '이 팀의 교육 담당자만 시험을 연결할 수 있습니다' using errcode = '42501';
  end if;
  if v_t.kind <> 'assessment' then
    raise exception '평가 과제가 아닙니다' using errcode = '22023';
  end if;
  if v_i.status in ('blocked', 'na') then
    raise exception '지금은 시험을 연결할 수 없는 과제입니다' using errcode = '22023';
  end if;
  select * into v_e from public.exams where id = p_exam;
  if not found or v_e.team_id is distinct from v_t.team_id or v_e.org_id is distinct from v_t.org_id then
    raise exception '이 팀의 시험이 아닙니다' using errcode = '22023';
  end if;
  if v_e.status <> 'final' then
    raise exception '확정된 시험만 연결할 수 있습니다' using errcode = '22023';
  end if;

  insert into public.exam_sittings (org_id, exam_id, task_instance_id, assigned_by, bank_item_ids)
  values (
    v_i.org_id, p_exam, p_task, (select auth.uid()),
    array(select distinct q.bank_item_id from public.exam_questions q
           where q.exam_id = p_exam and q.bank_item_id is not null)
  )
  on conflict (exam_id, task_instance_id) do nothing;

  select * into v_s from public.exam_sittings where exam_id = p_exam and task_instance_id = p_task;
  return v_s;
end
$$;

-- ── 실행 권한 ───────────────────────────────────────────────────────
revoke execute on function
  public.register_exam_to_bank(uuid),
  public.pick_bank_items(text, public.exam_difficulty, int, uuid[], text[], uuid),
  public.bank_prompts(text, public.exam_difficulty, int),
  public.assign_exam(uuid, uuid)
from public, anon;

grant execute on function
  public.register_exam_to_bank(uuid),
  public.pick_bank_items(text, public.exam_difficulty, int, uuid[], text[], uuid),
  public.bank_prompts(text, public.exam_difficulty, int),
  public.assign_exam(uuid, uuid)
to authenticated, service_role;
