-- 0012 규정 문서·조항 저장소(S14), 지식 출처 연결, policy-docs 버킷.
-- 설계: docs/superpowers/specs/2026-11-18-policy-docs-rag-design.md. 담당자가 올린 가상 규정 문서(docx·pdf)를 조항으로 나눠 임베딩과 함께 둔다.
-- 객체 경로는 {org_id}/{document_id}.{pdf|docx}(ASCII만). 문서 상태 갱신은 이후 RPC(security definer)만 한다.

create extension if not exists vector with schema extensions;

-- ── 관리 범위 판정 ──────────────────────────────────────────────────
-- 0002 지식 쓰기 정책과 같은 판정: 같은 조직에서, 교육 담당자는 우리 팀 범위, 경영지원은 회사 공통.
-- 다른 조직이면 먼저 false. 문서·조항·지식 출처·storage 정책과 이후 RPC가 재사용한다.
create function private.can_manage_scope(p_org uuid, p_scope public.knowledge_scope, p_team uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_org = (select private.my_org())
    and (
      ((select private.my_role()) = 'team_trainer' and p_scope = 'team' and p_team = (select private.my_team()))
      or ((select private.my_role()) = 'ops_staff' and p_scope = 'company')
    )
$$;

revoke execute on function private.can_manage_scope(uuid, public.knowledge_scope, uuid) from public, anon;
grant execute on function private.can_manage_scope(uuid, public.knowledge_scope, uuid) to authenticated, service_role;

-- ── 테이블 ──────────────────────────────────────────────────────────
create table public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  scope public.knowledge_scope not null,
  team_id uuid references public.teams (id),
  title text not null,
  file_path text not null unique,
  file_type text not null check (file_type in ('pdf', 'docx')),
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  error text,
  clause_count int not null default 0,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint policy_documents_scope_team check ((scope = 'team') = (team_id is not null)),
  constraint policy_documents_path check (file_path = org_id::text || '/' || id::text || '.' || file_type)
);
create index on public.policy_documents (org_id);

create table public.document_clauses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  document_id uuid not null references public.policy_documents (id) on delete cascade,
  ord int not null,
  label text,
  heading text,
  body text not null,
  embedding extensions.vector(1536)
);
create index on public.document_clauses (org_id);
create index on public.document_clauses (document_id);
create index on public.document_clauses using hnsw (embedding extensions.vector_cosine_ops);

-- 지식이 어느 조항에서 나왔는지. 지식 초안(AI)과 담당자 편집이 이 연결을 쓴다.
alter table public.knowledge_items
  add column origin text not null default 'manual' check (origin in ('manual', 'ai_draft'));

-- 지식(데모 초기화 포함)이나 조항을 지우면 연결도 함께 사라진다.
create table public.knowledge_sources (
  knowledge_id uuid not null references public.knowledge_items (id) on delete cascade,
  clause_id uuid not null references public.document_clauses (id) on delete cascade,
  org_id uuid not null references public.orgs (id),
  primary key (knowledge_id, clause_id)
);
create index on public.knowledge_sources (org_id);
create index on public.knowledge_sources (clause_id);

-- ── 권한 ────────────────────────────────────────────────────────────
revoke all on public.policy_documents, public.document_clauses, public.knowledge_sources from anon, authenticated;
grant select, insert, delete on public.policy_documents to authenticated;  -- update 없음: 상태 갱신은 RPC만
grant select, insert, delete on public.document_clauses to authenticated;
grant select, insert, delete on public.knowledge_sources to authenticated;
grant all on public.policy_documents, public.document_clauses, public.knowledge_sources to service_role;

alter table public.policy_documents enable row level security;
alter table public.document_clauses enable row level security;
alter table public.knowledge_sources enable row level security;

-- ── RLS: 문서 ───────────────────────────────────────────────────────
-- 관리 범위 전체, 또는 읽기 범위(회사 공통·우리 팀)의 ready 문서. 신입도 포함한다:
-- 조항 정책의 부모 문서 조회와 match_document_clauses의 문서명 JOIN이 RLS에 막히지 않게 하려는 것이다.
-- 원본 파일은 아래 storage 정책(관리 범위만)으로 막는다.
create policy "관리 범위 또는 읽기 범위의 ready 문서" on public.policy_documents for select to authenticated
  using (
    private.can_manage_scope(org_id, scope, team_id)
    or (
      org_id = (select private.my_org())
      and status = 'ready'
      and (scope = 'company' or team_id = (select private.my_team()))
    )
  );

create policy "관리 범위 추가" on public.policy_documents for insert to authenticated
  with check (private.can_manage_scope(org_id, scope, team_id));

create policy "관리 범위 삭제" on public.policy_documents for delete to authenticated
  using (private.can_manage_scope(org_id, scope, team_id));

-- ── RLS: 조항 ───────────────────────────────────────────────────────
-- 정책 안의 하위 질의는 바깥 행의 칸을 테이블 이름으로 적는다(그냥 org_id라고 쓰면 d.org_id로 묶인다).
create policy "읽기 범위의 ready 문서 조항" on public.document_clauses for select to authenticated
  using (
    org_id = (select private.my_org())
    and exists (
      select 1 from public.policy_documents d
       where d.id = document_clauses.document_id
         and d.org_id = document_clauses.org_id
         and d.status = 'ready'
         and (d.scope = 'company' or d.team_id = (select private.my_team()))
    )
  );

create policy "관리 범위 문서에 추가" on public.document_clauses for insert to authenticated
  with check (
    exists (
      select 1 from public.policy_documents d
       where d.id = document_clauses.document_id
         and d.org_id = document_clauses.org_id
         and private.can_manage_scope(d.org_id, d.scope, d.team_id)
    )
  );

create policy "관리 범위 문서에서 삭제" on public.document_clauses for delete to authenticated
  using (
    exists (
      select 1 from public.policy_documents d
       where d.id = document_clauses.document_id
         and d.org_id = document_clauses.org_id
         and private.can_manage_scope(d.org_id, d.scope, d.team_id)
    )
  );

-- ── RLS: 지식 출처 ──────────────────────────────────────────────────
-- 연결된 지식이 내 관리 범위일 때만(신입은 정책이 없어 0행). save_knowledge_drafts(invoker)와 S10 편집 창이 기댄다.
create policy "관리 범위 지식의 출처" on public.knowledge_sources for select to authenticated
  using (
    org_id = (select private.my_org())
    and exists (
      select 1 from public.knowledge_items k
       where k.id = knowledge_sources.knowledge_id
         and k.org_id = knowledge_sources.org_id
         and private.can_manage_scope(k.org_id, k.scope, k.team_id)
    )
  );

-- 추가는 호출자가 읽을 수 있는 조항(조항 select 정책 통과)만 연결한다.
create policy "관리 범위 지식에 출처 추가" on public.knowledge_sources for insert to authenticated
  with check (
    org_id = (select private.my_org())
    and exists (
      select 1 from public.knowledge_items k
       where k.id = knowledge_sources.knowledge_id
         and k.org_id = knowledge_sources.org_id
         and private.can_manage_scope(k.org_id, k.scope, k.team_id)
    )
    and exists (
      select 1 from public.document_clauses c
       where c.id = knowledge_sources.clause_id
         and c.org_id = knowledge_sources.org_id
    )
  );

create policy "관리 범위 지식의 출처 삭제" on public.knowledge_sources for delete to authenticated
  using (
    org_id = (select private.my_org())
    and exists (
      select 1 from public.knowledge_items k
       where k.id = knowledge_sources.knowledge_id
         and k.org_id = knowledge_sources.org_id
         and private.can_manage_scope(k.org_id, k.scope, k.team_id)
    )
  );

-- ── 버킷 ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'policy-docs',
  'policy-docs',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- ── Storage 객체 정책(policy-docs 버킷만) ────────────────────────────
-- 객체 이름이 문서 행의 file_path({org_id}/{document_id}.{ext})와 같고, 첫 폴더가 그 문서의 조직이며,
-- 호출자가 그 문서의 관리 범위일 때만. 경로 조각을 uuid로 바꾸지 않고 문자열로 비교한다.
-- 신입은 문서 행이 보여도 원본을 받을 수 없다. 문서 행을 먼저 만들고 그 file_path로 올린다. update 정책 없음(덮어쓰기 거부).
create policy "규정 문서: 관리 범위 보기" on storage.objects for select to authenticated
  using (
    bucket_id = 'policy-docs'
    and exists (
      select 1 from public.policy_documents d
       where d.file_path = objects.name
         and d.org_id::text = (storage.foldername(objects.name))[1]
         and private.can_manage_scope(d.org_id, d.scope, d.team_id)
    )
  );

create policy "규정 문서: 관리 범위 올리기" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'policy-docs'
    and exists (
      select 1 from public.policy_documents d
       where d.file_path = objects.name
         and d.org_id::text = (storage.foldername(objects.name))[1]
         and private.can_manage_scope(d.org_id, d.scope, d.team_id)
    )
  );

create policy "규정 문서: 관리 범위 지우기" on storage.objects for delete to authenticated
  using (
    bucket_id = 'policy-docs'
    and exists (
      select 1 from public.policy_documents d
       where d.file_path = objects.name
         and d.org_id::text = (storage.foldername(objects.name))[1]
         and private.can_manage_scope(d.org_id, d.scope, d.team_id)
    )
  );
