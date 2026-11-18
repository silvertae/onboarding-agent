-- 0005 문제은행: 팀 문항 은행, 시험 문항의 은행 출처, 응시 기록(시험 ↔ 평가 과제).
-- 은행·응시 기록은 그 팀 교육 담당자만 본다. 응시 기록 쓰기는 0006의 assign_exam으로만 한다.
-- 마이그레이션은 추가만 한다. 끝에서 이미 확정된 시험의 문항을 은행으로 옮긴다(시험·문항 내용은 그대로).

create type public.bank_item_status as enum ('active', 'hidden');
create type public.bank_item_source as enum ('exam', 'manual', 'migrated', 'seed');

-- 같은 문항 판정 키: 연속 공백(줄바꿈·탭 포함)을 스페이스 하나로 줄인 뒤 앞뒤를 지운 문장의 md5.
-- btrim은 스페이스만 지우므로 줄이기를 먼저 한다.
-- 생성 컬럼이 insert하는 사용자 권한으로 부르므로 실행 권한을 명시한다.
create function private.prompt_key(p text) returns text
language sql immutable set search_path = ''
as $$ select md5(btrim(regexp_replace(p, '\s+', ' ', 'g'))) $$;

revoke all on function private.prompt_key(text) from public;
grant execute on function private.prompt_key(text) to authenticated, service_role;

create table public.question_bank_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  team_id uuid not null references public.teams (id),
  topic text not null check (btrim(topic) <> ''),
  difficulty public.exam_difficulty not null,
  prompt text not null,
  model_answer text not null,
  rubric text not null,
  points int not null check (points between 1 and 100),
  status public.bank_item_status not null default 'active',
  source public.bank_item_source not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  prompt_key text generated always as (private.prompt_key(prompt)) stored,
  -- 주제 비교는 이 컬럼으로만 한다(ilike는 _·%를 와일드카드로 읽는다)
  topic_key text generated always as (lower(btrim(topic))) stored,
  unique (team_id, prompt_key)
);
create index on public.question_bank_items (team_id, topic_key, difficulty);

alter table public.exam_questions
  add column bank_item_id uuid references public.question_bank_items (id) on delete set null;
create index on public.exam_questions (bank_item_id);

-- bank_item_ids: 연결 시점에 그 시험에 있던 은행 문항 id 스냅샷.
-- 시험 문항은 저장 때마다 지웠다가 다시 넣으므로 신입이 본 문항은 이 스냅샷으로 판정한다.
create table public.exam_sittings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  exam_id uuid not null references public.exams (id) on delete cascade,
  task_instance_id uuid not null references public.task_instances (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  bank_item_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (exam_id, task_instance_id)
);
create index on public.exam_sittings (task_instance_id);

-- ── 트리거: 작성자 고정, 수정 시각 ──────────────────────────────────
create trigger question_bank_items_stamp
  before insert or update on public.question_bank_items
  for each row execute function private.stamp_exam();

create trigger question_bank_items_touch
  before update on public.question_bank_items
  for each row execute function private.touch_updated_at();

-- ── 권한 ────────────────────────────────────────────────────────────
-- public 스키마 기본 권한이 authenticated에 전부 열려 있으므로 먼저 거둔다.
revoke all on public.question_bank_items, public.exam_sittings from anon, authenticated;
grant select, insert, update on public.question_bank_items to authenticated;  -- 삭제 대신 숨기기
grant select on public.exam_sittings to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.question_bank_items enable row level security;
alter table public.exam_sittings enable row level security;

create policy "우리 팀 trainer 조회" on public.question_bank_items for select to authenticated
  using (
    org_id = (select private.my_org())
    and (select private.my_role()) = 'team_trainer'
    and team_id = (select private.my_team())
  );

create policy "우리 팀 trainer 추가" on public.question_bank_items for insert to authenticated
  with check (
    org_id = (select private.my_org())
    and (select private.my_role()) = 'team_trainer'
    and team_id = (select private.my_team())
  );

create policy "우리 팀 trainer 수정" on public.question_bank_items for update to authenticated
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

-- 응시 기록은 연결된 시험이 보이면 보인다(exams RLS가 함께 적용된다)
create policy "볼 수 있는 시험의 응시 기록" on public.exam_sittings for select to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id));

-- ── 이관: 이미 확정된 시험의 문항을 은행으로 ─────────────────────────
-- 같은 팀의 같은 문항은 한 번만 넣고, 문항의 출처 칸만 채운다.
insert into public.question_bank_items
  (org_id, team_id, topic, difficulty, prompt, model_answer, rubric, points, source, created_by)
select e.org_id, e.team_id, e.topic, e.difficulty, q.prompt, q.model_answer, q.rubric, q.points,
       'migrated', e.created_by
  from public.exam_questions q
  join public.exams e on e.id = q.exam_id
 where e.status = 'final'
 order by e.created_at, q.position
on conflict (team_id, prompt_key) do nothing;

update public.exam_questions q
   set bank_item_id = b.id
  from public.exams e, public.question_bank_items b
 where e.id = q.exam_id
   and e.status = 'final'
   and b.team_id = e.team_id
   and b.prompt_key = private.prompt_key(q.prompt)
   and q.bank_item_id is null;
