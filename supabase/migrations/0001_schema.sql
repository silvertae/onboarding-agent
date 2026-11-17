-- 0001 스키마: enum과 테이블. RLS·권한은 0002, 함수는 0003.
-- 마이그레이션은 추가만 한다(삭제·이름 변경 금지).

create type public.user_role as enum ('new_hire', 'team_trainer', 'ops_staff', 'admin');
create type public.ops_department as enum ('hr', 'ga', 'accounting');
create type public.task_stage as enum ('day1', 'week1', 'month1');
create type public.task_kind as enum ('ops', 'read', 'input', 'practice', 'setup', 'assessment');
create type public.completion_mode as enum ('self', 'confirm', 'staff_only');
create type public.task_status as enum ('blocked', 'todo', 'submitted', 'rework', 'done', 'na');
create type public.assessment_result as enum ('pass', 'needs_followup');
create type public.knowledge_scope as enum ('company', 'team');
create type public.knowledge_status as enum ('draft', 'published');
create type public.unanswered_status as enum ('open', 'resolved');
create type public.exam_difficulty as enum ('beginner', 'intermediate');
create type public.exam_status as enum ('draft', 'final');

-- 조직 자체. id가 곧 org_id다.
create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  name text not null,
  org_line text[] not null default '{}'   -- 예: {AI팀,AI그룹,AI본부,AI부문,대표}
);
create index on public.teams (org_id);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.orgs (id),
  email text not null,
  full_name text not null,
  job_title text not null default '',
  role public.user_role not null,
  department public.ops_department,
  team_id uuid references public.teams (id),
  hire_date date,
  needs_hq_access boolean not null default true,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_ops_department check (role <> 'ops_staff' or department is not null),
  constraint profiles_team_required check (role not in ('new_hire', 'team_trainer') or team_id is not null),
  constraint profiles_hire_date_required check (role <> 'new_hire' or hire_date is not null)
);
create index on public.profiles (org_id);
create index on public.profiles (team_id);

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  code text not null,
  title text not null,
  description text not null default '',
  stage public.task_stage not null,
  department public.ops_department,
  team_id uuid references public.teams (id),
  kind public.task_kind not null default 'ops',
  completion_mode public.completion_mode not null,
  allow_na boolean not null default false,
  requires_hq_access boolean not null default false,
  prerequisite_codes text[] not null default '{}',
  checklist jsonb,       -- setup 과제의 항목 문자열 배열
  form_schema jsonb,     -- input 과제의 입력 칸 정의
  due_offset_days int not null default 0,
  sort_order int not null default 0,
  unique (org_id, code),
  constraint task_templates_owner check (num_nonnulls(department, team_id) = 1)
);

create table public.task_instances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  template_id uuid not null references public.task_templates (id),
  new_hire_id uuid not null references public.profiles (id) on delete cascade,
  status public.task_status not null,
  due_date date,
  result jsonb,
  na_reason text,
  rework_reason text,
  scheduled_at timestamptz,
  location text,
  assessment_result public.assessment_result,
  assessment_note text,
  submitted_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (template_id, new_hire_id)
);
create index on public.task_instances (new_hire_id);
create index on public.task_instances (org_id);

create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  scope public.knowledge_scope not null,
  team_id uuid references public.teams (id),
  question text not null,
  answer text not null,
  category text not null default '',
  status public.knowledge_status not null default 'draft',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint knowledge_items_scope_team check ((scope = 'team') = (team_id is not null))
);
create index on public.knowledge_items (org_id);

create table public.unanswered_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  asked_by uuid not null references public.profiles (id) on delete cascade,
  team_id uuid references public.teams (id),
  question text not null,
  status public.unanswered_status not null default 'open',
  resolved_knowledge_id uuid references public.knowledge_items (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.unanswered_questions (org_id);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  team_id uuid not null references public.teams (id),
  title text not null,
  topic text not null,
  difficulty public.exam_difficulty not null,
  status public.exam_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.exams (team_id);

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  exam_id uuid not null references public.exams (id) on delete cascade,
  position int not null,
  prompt text not null,
  model_answer text not null,
  rubric text not null,
  points int not null check (points between 1 and 100)
);
create index on public.exam_questions (exam_id);

create table public.usage_counters (
  org_id uuid not null references public.orgs (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  kind text not null,
  count int not null default 0,
  primary key (user_id, day, kind)
);
