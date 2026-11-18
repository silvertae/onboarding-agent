-- 0013 규정 문서 RPC: 조항 검색, 조항 원자 교체, 근거가 붙은 미답변 해결, 지식 초안 일괄 저장, 한도 종류 확장.
-- 설계: docs/superpowers/specs/2026-11-18-policy-docs-rag-design.md. 테이블·정책은 0012.

-- ── 관리 가능 여부 ──────────────────────────────────────────────────
-- 문서가 안 보이거나 없으면 false. 읽기 범위(교육 담당자가 보는 회사 공통 ready 문서)와 관리 범위가 다르므로
-- 문서 select 성공만으로 판단하지 않는다. 항상 true/false.
create function public.can_manage_document(p_document_id uuid)
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select coalesce(
    (select private.can_manage_scope(d.org_id, d.scope, d.team_id)
       from public.policy_documents d
      where d.id = p_document_id),
    false)
$$;

-- ── 조항 검색 ───────────────────────────────────────────────────────
-- 호출자의 RLS가 그대로 적용된다(읽기 범위의 ready 문서 조항만). 임베딩이 없는 조항은 뺀다.
-- RLS가 인덱스 결과를 걸러 낸 뒤 결과가 모자라지 않도록 hnsw 반복 검색을 켠다.
create function public.match_document_clauses(p_embedding extensions.vector(1536), p_count int default 6)
returns table (id uuid, document_id uuid, document_title text, label text, heading text, body text, similarity float8)
language sql stable security invoker set search_path = ''
set hnsw.iterative_scan = strict_order
as $$
  select c.id, c.document_id, d.title, c.label, c.heading, c.body,
         (1 - (c.embedding operator(extensions.<=>) p_embedding))::float8
    from public.document_clauses c
    join public.policy_documents d on d.id = c.document_id
   where c.embedding is not null
   order by c.embedding operator(extensions.<=>) p_embedding
   limit greatest(1, least(coalesce(p_count, 6), 20))
$$;

-- ── 조항 원자 교체 ──────────────────────────────────────────────────
-- 호출자에게 policy_documents update 권한이 없으므로 definer로 상태를 갱신한다. RLS가 없으니 검사는 직접 한다.
-- service_role(시드·색인 스크립트)만 조직·범위 검사를 건너뛴다(그때는 my_org()가 null). 그 밖의 호출자는
-- 문서가 내 조직에 있어야 하고(P0002) 문서의 관리 범위여야 한다(42501).
-- p_clauses: [{ord, label, heading, body, embedding:[...1536]}]. 기존 조항을 모두 지우고 새로 넣는다. 한 트랜잭션이라 중간 상태가 없다.
-- p_error가 있으면 조항 없이 failed로 기록하고 0을 돌려준다. 없으면 ready와 clause_count를 기록하고 넣은 조항 수를 돌려준다.
create function public.replace_document_clauses(p_document_id uuid, p_clauses jsonb, p_error text default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_service boolean := coalesce((select auth.jwt() ->> 'role') = 'service_role', false);
  v_doc public.policy_documents;
  v_count int := 0;
begin
  -- 한 번만 읽으며 바로 잠근다(같은 문서를 동시에 색인하거나 지우는 호출과 겹치지 않게).
  select * into v_doc from public.policy_documents where id = p_document_id for update;
  if not found or (not v_service and v_doc.org_id is distinct from (select private.my_org())) then
    raise exception '문서를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if not v_service and not private.can_manage_scope(v_doc.org_id, v_doc.scope, v_doc.team_id) then
    raise exception '이 문서를 관리할 권한이 없습니다' using errcode = '42501';
  end if;
  if p_error is null and jsonb_typeof(p_clauses) is distinct from 'array' then
    raise exception '조항 목록 형식이 올바르지 않습니다' using errcode = '22023';
  end if;

  delete from public.document_clauses where document_id = p_document_id;

  if p_error is not null then
    update public.policy_documents set status = 'failed', error = p_error, clause_count = 0 where id = p_document_id;
    return 0;
  end if;

  -- 조항의 org_id는 항상 문서에서 가져온다.
  insert into public.document_clauses (org_id, document_id, ord, label, heading, body, embedding)
  select v_doc.org_id, p_document_id, (c ->> 'ord')::int, c ->> 'label', c ->> 'heading', c ->> 'body',
         (c ->> 'embedding')::extensions.vector
    from jsonb_array_elements(p_clauses) c;
  get diagnostics v_count = row_count;

  update public.policy_documents set status = 'ready', error = null, clause_count = v_count where id = p_document_id;
  return v_count;
end
$$;

-- ── 미답변 해결 + 근거 연결 ─────────────────────────────────────────
-- 역할·범위·연타(이미 해결된 질문)·게시 지식 insert는 resolve_unanswered가 맡고, 여기서는 origin과 근거 연결만 더한다.
-- definer라 RLS가 없으므로 호출자가 읽을 수 있는 조항(내 조직, ready 문서, 회사 공통 또는 우리 팀)만 연결하고
-- 읽을 수 없는 id는 조용히 건너뛴다. 같은 호출을 다시 불러도 연결은 늘지 않는다.
create function public.resolve_unanswered_with_sources(
  p_id uuid, p_question text, p_answer text, p_category text, p_clause_ids uuid[], p_origin text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.unanswered_status;
  v_k public.knowledge_items;
begin
  if p_origin is null or p_origin not in ('manual', 'ai_draft') then
    raise exception '알 수 없는 출처 종류입니다' using errcode = '22023';
  end if;

  -- 질문을 먼저 잠가 상태를 읽는다(동시에 두 사람이 해결해도 한 쪽만 새로 해결한 것으로 본다).
  -- 보이는 행이 없으면 resolve_unanswered가 오류를 낸다.
  select status into v_status from public.unanswered_questions
   where id = p_id and org_id = (select private.my_org())
     for update;

  v_k := public.resolve_unanswered(p_id, p_question, p_answer, p_category);

  -- 이미 해결돼 있었다면 기존 지식을 그대로 돌려준다. 이번 요청의 답은 저장되지 않았으므로 origin과 근거도 붙이지 않는다.
  if v_status = 'resolved' then
    return v_k.id;
  end if;

  update public.knowledge_items set origin = p_origin where id = v_k.id;

  insert into public.knowledge_sources (knowledge_id, clause_id, org_id)
  select v_k.id, c.id, c.org_id
    from public.document_clauses c
    join public.policy_documents d on d.id = c.document_id and d.org_id = c.org_id
   where c.id = any (coalesce(p_clause_ids, '{}'::uuid[]))
     and c.org_id = (select private.my_org())
     and d.status = 'ready'
     and (d.scope = 'company' or d.team_id = (select private.my_team()))
  on conflict do nothing;

  return v_k.id;
end
$$;

-- ── 지식 초안 일괄 저장 ─────────────────────────────────────────────
-- p_items: [{question, answer, category, clause_ids:[uuid]}] 1~10개. invoker라 RLS가 그대로 적용된다.
-- 범위는 호출자 역할로 정한다: ops = 회사 공통, trainer = 우리 팀. 근거는 호출자가 읽을 수 있는 조항만 연결한다(나머지는 오류 없이 빠진다).
-- clause_ids가 없거나 배열이 아니면 근거 없이 저장하고, uuid 모양이 아닌 값은 건너뛴다.
-- 한 호출이 한 트랜잭션이라 하나라도 실패하면 모두 취소된다. 저장한 지식 수를 돌려준다.
create function public.save_knowledge_drafts(p_items jsonb)
returns int
language plpgsql security invoker set search_path = ''
as $$
declare
  v_role public.user_role := (select private.my_role());
  v_scope public.knowledge_scope;
  v_team uuid;
  v_item jsonb;
  v_question text;
  v_answer text;
  v_id uuid;
  v_count int := 0;
begin
  if v_role = 'ops_staff' then
    v_scope := 'company';
  elsif v_role = 'team_trainer' and (select private.my_team()) is not null then
    v_scope := 'team';
    v_team := (select private.my_team());
  else
    raise exception '지식 초안을 저장할 권한이 없습니다' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception '초안은 1개 이상 10개 이하로 보내 주세요' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_question := btrim(coalesce(v_item ->> 'question', ''));
    v_answer := btrim(coalesce(v_item ->> 'answer', ''));
    if v_question = '' or v_answer = '' then
      raise exception '질문과 답변을 입력해 주세요' using errcode = '22023';
    end if;

    insert into public.knowledge_items (org_id, scope, team_id, question, answer, category, status, origin, updated_by)
    values ((select private.my_org()), v_scope, v_team, v_question, v_answer,
            coalesce(btrim(v_item ->> 'category'), ''), 'draft', 'ai_draft', (select auth.uid()))
    returning id into v_id;

    insert into public.knowledge_sources (knowledge_id, clause_id, org_id)
    select v_id, c.id, c.org_id
      from public.document_clauses c
     where c.id in (
         select e.value::uuid
           from jsonb_array_elements_text(
                  case when jsonb_typeof(v_item -> 'clause_ids') = 'array' then v_item -> 'clause_ids' else '[]'::jsonb end) e
          where e.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- ── 하루 사용 한도 ─────────────────────────────────────────────────
-- 0003과 같은 본문. 받는 종류만 chat, exam에 document(문서 색인), draft(지식 초안)를 더한다.
create or replace function public.consume_quota(p_kind text, p_limit int) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := (select private.my_org());
  v_count int;
begin
  if p_kind is null or p_kind not in ('chat', 'exam', 'document', 'draft') then
    raise exception '알 수 없는 사용 종류입니다' using errcode = '22023';
  end if;
  if v_org is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;

  insert into public.usage_counters as u (org_id, user_id, day, kind, count)
  values (v_org, (select auth.uid()), (now() at time zone 'Asia/Seoul')::date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = u.count + 1
  returning u.count into v_count;
  return v_count <= p_limit;
end
$$;

-- ── 실행 권한 ───────────────────────────────────────────────────────
revoke execute on function
  public.can_manage_document(uuid),
  public.match_document_clauses(extensions.vector, int),
  public.replace_document_clauses(uuid, jsonb, text),
  public.resolve_unanswered_with_sources(uuid, text, text, text, uuid[], text),
  public.save_knowledge_drafts(jsonb)
from public, anon;
grant execute on function
  public.can_manage_document(uuid),
  public.match_document_clauses(extensions.vector, int),
  public.resolve_unanswered_with_sources(uuid, text, text, text, uuid[], text),
  public.save_knowledge_drafts(jsonb)
to authenticated;
grant execute on function public.replace_document_clauses(uuid, jsonb, text) to authenticated, service_role;
