-- 0014 지식 임베딩: 채팅이 질문과 가까운 게시 지식만 넣도록 지식도 pgvector로 검색한다.
-- 설계: docs/superpowers/specs/2026-11-19-knowledge-vector-search-design.md
-- 임베딩은 임베딩한 본문의 해시와 함께 둔다. 지식 본문이 바뀌면 해시가 맞지 않아 "임베딩 없음"으로 본다.
-- 그래서 지식을 쓰는 경로(웹 저장, RPC, 시드, 데모 초기화)는 고치지 않는다. 임베딩 저장은 save_knowledge_embeddings만 한다.

-- ── 본문 해시 ───────────────────────────────────────────────────────
-- 에이전트가 임베딩하는 글(question + 줄바꿈 + answer)과 같은 모양. 분류·상태는 넣지 않는다(바뀌어도 다시 임베딩하지 않는다).
create function private.knowledge_hash(p_question text, p_answer text)
returns text
language sql immutable set search_path = ''
as $$ select md5(p_question || E'\n' || p_answer) $$;

-- ── 테이블 ──────────────────────────────────────────────────────────
-- 지식 테이블에 칼럼으로 두지 않는다: 웹이 knowledge_items를 select('*')로 읽어 벡터를 받게 된다.
create table public.knowledge_embeddings (
  knowledge_id uuid primary key references public.knowledge_items (id) on delete cascade,
  org_id uuid not null references public.orgs (id),
  content_hash text not null,
  embedding extensions.vector(1536) not null,
  embedded_at timestamptz not null default now()
);
create index on public.knowledge_embeddings (org_id);
create index on public.knowledge_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- ── 권한 ────────────────────────────────────────────────────────────
revoke all on public.knowledge_embeddings from anon, authenticated;
grant select on public.knowledge_embeddings to authenticated;  -- 쓰기는 save_knowledge_embeddings(definer)만
grant all on public.knowledge_embeddings to service_role;

alter table public.knowledge_embeddings enable row level security;

-- 읽을 수 있는 지식의 임베딩만. 하위 질의에 지식 RLS가 그대로 걸린다(신입은 게시된 회사·우리 팀 지식만).
-- 정책 안의 하위 질의는 바깥 행의 칸을 테이블 이름으로 적는다.
create policy "읽을 수 있는 지식의 임베딩" on public.knowledge_embeddings for select to authenticated
  using (
    org_id = (select private.my_org())
    and exists (
      select 1 from public.knowledge_items k
       where k.id = knowledge_embeddings.knowledge_id
         and k.org_id = knowledge_embeddings.org_id
    )
  );

-- ── 채팅 검색 ───────────────────────────────────────────────────────
-- 호출자의 RLS가 범위를 정한다. 해시가 맞는 게시 지식 중 가까운 p_count건(1~50, 기본 20)에
-- 임베딩이 없거나 낡은 게시 지식을 모두 더한다(방금 저장한 지식, 시드·초기화 직후 지식이 빠지지 않게).
-- 임베딩 없는 지식은 similarity가 null이고 맨 뒤에 온다.
create function public.match_knowledge(p_embedding extensions.vector(1536), p_count int default 20)
returns table (id uuid, category text, question text, answer text, similarity float8)
language sql stable security invoker set search_path = ''
set hnsw.iterative_scan = strict_order
as $$
  select r.id, r.category, r.question, r.answer, r.similarity
    from (
      (select k.id, k.category, k.question, k.answer,
              (1 - (e.embedding operator(extensions.<=>) p_embedding))::float8 as similarity
         from public.knowledge_embeddings e
         join public.knowledge_items k on k.id = e.knowledge_id
        where k.status = 'published'
          and e.content_hash = private.knowledge_hash(k.question, k.answer)
        order by e.embedding operator(extensions.<=>) p_embedding
        limit greatest(1, least(coalesce(p_count, 20), 50)))
      union all
      (select k.id, k.category, k.question, k.answer, null::float8
         from public.knowledge_items k
        where k.status = 'published'
          and not exists (
            select 1 from public.knowledge_embeddings e
             where e.knowledge_id = k.id
               and e.content_hash = private.knowledge_hash(k.question, k.answer)))
    ) r
   order by r.similarity desc nulls last
$$;

-- ── 임베딩할 지식 ───────────────────────────────────────────────────
-- 해시가 맞는 임베딩이 없는 게시 지식, 오래된 순 100건. 초안은 게시할 때 임베딩한다.
-- 담당자는 관리 범위만(교육 담당자는 우리 팀, 경영지원은 회사 공통). service_role(백필 스크립트)은
-- RLS를 거치지 않으므로 p_org로 조직을 거른다(null이면 모든 조직).
create function public.knowledge_without_embedding(p_org uuid default null)
returns table (id uuid, question text, answer text)
language sql stable security invoker set search_path = ''
as $$
  select k.id, k.question, k.answer
    from public.knowledge_items k
   where k.status = 'published'
     and not exists (
       select 1 from public.knowledge_embeddings e
        where e.knowledge_id = k.id
          and e.content_hash = private.knowledge_hash(k.question, k.answer))
     and case
           when coalesce((select auth.jwt() ->> 'role') = 'service_role', false)
             then p_org is null or k.org_id = p_org
           else private.can_manage_scope(k.org_id, k.scope, k.team_id)
         end
   order by k.updated_at, k.id
   limit 100
$$;

-- ── 임베딩 저장 ─────────────────────────────────────────────────────
-- 호출자에게 테이블 쓰기 권한이 없으므로 definer로 저장한다. RLS가 없으니 검사는 직접 한다.
-- p_items: [{id, question, answer, embedding:[...1536]}] 1~100개. 해시는 받은 본문(임베딩한 글)으로 계산한다:
-- 임베딩하는 사이 담당자가 본문을 고쳤다면 해시가 맞지 않아 다음 호출에서 다시 임베딩된다(잠금 불필요).
-- 없는 지식·다른 조직 지식은 건너뛴다. 관리 범위 밖이면 42501. service_role만 조직·범위 검사를 건너뛴다.
-- 임베딩의 org_id는 항상 지식에서 가져온다. 저장한 개수를 돌려준다.
create function public.save_knowledge_embeddings(p_items jsonb)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_service boolean := coalesce((select auth.jwt() ->> 'role') = 'service_role', false);
  v_org uuid := (select private.my_org());
  v_item jsonb;
  v_k public.knowledge_items;
  v_count int := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception '임베딩 목록 형식이 올바르지 않습니다' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if v_item ->> 'question' is null or v_item ->> 'answer' is null or v_item ->> 'embedding' is null then
      raise exception '임베딩 항목에 빠진 값이 있습니다' using errcode = '22023';
    end if;

    select * into v_k from public.knowledge_items where id = (v_item ->> 'id')::uuid;
    if not found or (not v_service and v_k.org_id is distinct from v_org) then
      continue;
    end if;
    if not v_service and not private.can_manage_scope(v_k.org_id, v_k.scope, v_k.team_id) then
      raise exception '이 지식을 관리할 권한이 없습니다' using errcode = '42501';
    end if;

    insert into public.knowledge_embeddings (knowledge_id, org_id, content_hash, embedding)
    values (v_k.id, v_k.org_id, private.knowledge_hash(v_item ->> 'question', v_item ->> 'answer'),
            (v_item ->> 'embedding')::extensions.vector)
    on conflict (knowledge_id) do update
      set org_id = excluded.org_id,
          content_hash = excluded.content_hash,
          embedding = excluded.embedding,
          embedded_at = now();
    v_count := v_count + 1;
  end loop;

  return v_count;
end
$$;

-- ── 실행 권한 ───────────────────────────────────────────────────────
revoke execute on function
  private.knowledge_hash(text, text),
  public.match_knowledge(extensions.vector, int),
  public.knowledge_without_embedding(uuid),
  public.save_knowledge_embeddings(jsonb)
from public, anon;
grant execute on function private.knowledge_hash(text, text) to authenticated, service_role;
grant execute on function public.match_knowledge(extensions.vector, int) to authenticated;
grant execute on function
  public.knowledge_without_embedding(uuid),
  public.save_knowledge_embeddings(jsonb)
to authenticated, service_role;
