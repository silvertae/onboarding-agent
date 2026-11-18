-- 0011 과제 서식 저장소(버킷·테이블·권한)와 데모 초기화 교체(템플릿·서식 되돌리기).
-- 계약: docs/contracts.md "과제 서식 저장소". 웹이 사용자 토큰으로 Storage와 테이블을 직접 쓴다.
-- 객체 경로는 {org_id}/{template_id}/{uuid}.{pdf|docx|xlsx}(ASCII만), 원본 이름은 테이블에 둔다. update는 없다.

-- ── 버킷 ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-forms',
  'task-forms',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- 아래 정책이 담당자 여부를 본다. 0003에서 public 실행 권한을 회수해 authenticated가 정책 안에서 부를 수 없었다.
grant execute on function private.is_handler(public.task_templates) to authenticated;

-- ── 서식 테이블 ─────────────────────────────────────────────────────
create table public.task_template_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  template_id uuid not null references public.task_templates (id),
  file_name text not null,       -- 원본 이름(화면에 텍스트로만 그린다)
  storage_path text not null unique,
  size_bytes int not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (template_id, file_name),
  constraint task_template_files_size check (size_bytes between 1 and 10485760),
  constraint task_template_files_name check (
    char_length(file_name) between 1 and 120
    and file_name ~* '\.(pdf|docx|xlsx)$'
  ),
  constraint task_template_files_path check (
    storage_path ~ ('^' || org_id::text || '/' || template_id::text || '/[0-9a-f-]{36}\.(pdf|docx|xlsx)$')
  )
);

revoke all on public.task_template_files from anon, authenticated;
grant select, insert, delete on public.task_template_files to authenticated;  -- update 없음: 교체는 지우고 다시 올린다
grant all on public.task_template_files to service_role;

alter table public.task_template_files enable row level security;

-- 정책 안의 하위 질의는 바깥 행의 칸을 테이블 이름으로 적는다(그냥 org_id라고 쓰면 t.org_id로 묶인다).

-- 같은 조직이고 그 템플릿을 볼 수 있는 사용자. 한 사람용 템플릿은 템플릿 조회 정책이 다른 신입에게 가린다.
create policy "볼 수 있는 템플릿의 서식" on public.task_template_files for select to authenticated
  using (
    org_id = (select private.my_org())
    and exists (
      select 1 from public.task_templates t
       where t.id = task_template_files.template_id
    )
  );

-- 그 템플릿의 담당자만, 보관되지 않은 템플릿에만, 본인 이름으로, 기본 서식이 아닌 것만.
create policy "담당자 올리기" on public.task_template_files for insert to authenticated
  with check (
    org_id = (select private.my_org())
    and uploaded_by = (select auth.uid())
    and is_seed = false
    and exists (
      select 1 from public.task_templates t
       where t.id = task_template_files.template_id
         and t.org_id = task_template_files.org_id
         and t.archived_at is null
         and private.is_handler(t)
    )
  );

-- 담당자 또는 같은 조직 admin(데모 초기화). 기본 서식은 지우지 않는다.
create policy "담당자·관리자 지우기(기본 서식 제외)" on public.task_template_files for delete to authenticated
  using (
    is_seed = false
    and (
      exists (
        select 1 from public.task_templates t
         where t.id = task_template_files.template_id
           and private.is_handler(t)
      )
      or (
        (select private.my_role()) = 'admin'
        and org_id = (select private.my_org())
      )
    )
  );

-- ── Storage 객체 정책(task-forms 버킷만) ─────────────────────────────
-- 경로 첫 폴더는 조직, 두 번째 폴더는 템플릿. 테이블 정책보다 넓지 않게 같은 조건을 경로로 확인한다.
-- 서명 URL 만들기·내려받기는 select 정책을 따른다.
create policy "과제 서식: 볼 수 있는 템플릿" on storage.objects for select to authenticated
  using (
    bucket_id = 'task-forms'
    and (storage.foldername(objects.name))[1] = (select private.my_org())::text
    and exists (
      select 1 from public.task_templates t
       where t.id::text = (storage.foldername(objects.name))[2]
    )
  );

-- 경로 모양도 테이블 storage_path 검사와 같게: 폴더 두 단계, 파일 이름은 uuid.{pdf|docx|xlsx}
create policy "과제 서식: 담당자 올리기" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-forms'
    and array_length(storage.foldername(objects.name), 1) = 2
    and storage.filename(objects.name) ~ '^[0-9a-f-]{36}\.(pdf|docx|xlsx)$'
    and (storage.foldername(objects.name))[1] = (select private.my_org())::text
    and exists (
      select 1 from public.task_templates t
       where t.id::text = (storage.foldername(objects.name))[2]
         and t.org_id::text = (storage.foldername(objects.name))[1]
         and t.archived_at is null
         and private.is_handler(t)
    )
  );

-- 기본 서식 객체는 테이블을 거치지 않고 Storage API로 직접 지우려 해도 막는다.
create policy "과제 서식: 담당자·관리자 지우기" on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-forms'
    and (
      exists (
        select 1 from public.task_templates t
         where t.id::text = (storage.foldername(objects.name))[2]
           and t.org_id::text = (storage.foldername(objects.name))[1]
           and private.is_handler(t)
      )
      or (
        (select private.my_role()) = 'admin'
        and (storage.foldername(objects.name))[1] = (select private.my_org())::text
      )
    )
    and not exists (
      select 1 from public.task_template_files f
       where f.storage_path = objects.name
         and f.is_seed
    )
  );
-- update 정책 없음: 덮어쓰기(upsert)는 거부된다.

-- ── 데모 초기화 교체 ────────────────────────────────────────────────
-- 0007 본문에 더해, 맨 앞에서 시드 신입 잠금과 조직별 템플릿 잠금(배타)을 잡고, 신입 루프 전에 순서대로:
--   1) 담당자가 올린 서식 행을 지운다(기본 서식은 남긴다). Storage 객체는 SQL로 지우지 않는다:
--      storage-api가 직접 삭제를 막으므로 웹이 Storage API로 먼저 지운 뒤 이 함수를 부른다.
--   2) 시드 템플릿의 편집 칸을 시드 사본 값으로 되돌리고 보관을 푼다.
--   3) 시드가 아닌 템플릿(한 사람용 포함)은 지우지 않고 보관한다. 이미 보관된 것은 보관 시각을 그대로 둔다.
create or replace function public.reset_demo() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := (select private.my_org());
  v_hire uuid;
begin
  if (select private.my_role()) is distinct from 'admin' then
    raise exception '관리자만 데모 데이터를 초기화할 수 있습니다' using errcode = '42501';
  end if;

  -- 잠금 순서(0009): 신입별 잠금(id 순) → 조직별 템플릿 잠금 → 템플릿 행 잠금.
  -- 템플릿 행을 고치기 전에 시드 신입 잠금을 모두 잡고, 템플릿을 시드 값으로 되돌리므로 조직별 템플릿 잠금은 배타로 잡는다.
  -- 행부터 잠그면 저장(조직별 잠금 → 행)과 서로를 기다린다: 이 함수가 아래 _start_onboarding에서 조직별 잠금을 기다리게 된다.
  for v_hire in
    select id from public.profiles
     where org_id = v_org and role = 'new_hire' and is_seed
     order by id
  loop
    perform pg_advisory_xact_lock(private.hire_lock_key(v_hire));
  end loop;
  perform pg_advisory_xact_lock(private.template_lock_key(v_org));

  delete from public.exams where org_id = v_org;
  delete from public.unanswered_questions where org_id = v_org;
  delete from public.knowledge_items where org_id = v_org;
  perform public.seed_demo_knowledge(v_org);
  delete from public.question_bank_items where org_id = v_org;
  perform public.seed_demo_bank(v_org);

  delete from public.task_template_files where org_id = v_org and not is_seed;

  update public.task_templates t
     set title = s.title,
         description = s.description,
         kind = s.kind,
         completion_mode = s.completion_mode,
         stage = s.stage,
         due_offset_days = s.due_offset_days,
         allow_na = s.allow_na,
         requires_hq_access = s.requires_hq_access,
         prerequisite_codes = s.prerequisite_codes,
         checklist = s.checklist,
         form_schema = s.form_schema,
         sort_order = s.sort_order,
         archived_at = null
    from private.task_template_seed s
   where s.template_id = t.id
     and t.org_id = v_org;

  update public.task_templates
     set archived_at = coalesce(archived_at, now())
   where org_id = v_org
     and not is_seed;

  for v_hire in
    select id from public.profiles
     where org_id = v_org and role = 'new_hire' and is_seed
     order by id
  loop
    perform pg_advisory_xact_lock(private.hire_lock_key(v_hire));  -- 위에서 이미 잡았다(다시 잡아도 바로 통과)
    delete from public.task_instances where new_hire_id = v_hire;
    update public.profiles set hire_date = (now() at time zone 'Asia/Seoul')::date where id = v_hire;
    perform public._start_onboarding(v_hire);
  end loop;
end
$$;

revoke execute on function public.reset_demo() from public, anon;
grant execute on function public.reset_demo() to authenticated, service_role;
