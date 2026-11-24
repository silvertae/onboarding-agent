-- 0016 지식 초안 저장을 원본 문서에 묶는다.
-- 0013의 save_knowledge_drafts(jsonb)는 범위를 호출자 역할로 정하고 원본 문서를 몰라서, 초안 요청 뒤 계정이 바뀌면
-- 다른 범위(회사 공통 ↔ 팀)로 저장됐다. 문서 id를 받는 오버로드를 더해 범위·팀을 문서 행에서 가져오고,
-- 호출자가 그 문서를 관리할 수 있을 때만 저장한다. 기존 (jsonb) 함수는 호환용으로 남긴다(마이그레이션은 추가만).

-- ── 문서 기준 지식 초안 일괄 저장 ───────────────────────────────────
-- p_items: [{question, answer, category, clause_ids:[uuid]}] 1~10개. invoker라 RLS가 그대로 적용된다.
-- 관리할 수 없는 문서(없는 문서·다른 조직·관리 범위 밖)면 42501. 범위·팀·조직은 문서 행을 따른다.
-- 근거는 이 문서의 조항 중 호출자가 읽을 수 있는 것만 연결한다(다른 문서 조항과 uuid 모양이 아닌 값은 오류 없이 빠진다).
-- 한 호출이 한 트랜잭션이라 하나라도 실패하면 모두 취소된다. 저장한 지식 수를 돌려준다.
create function public.save_knowledge_drafts(p_document_id uuid, p_items jsonb)
returns int
language plpgsql security invoker set search_path = ''
as $$
declare
  v_doc public.policy_documents;
  v_item jsonb;
  v_question text;
  v_answer text;
  v_id uuid;
  v_count int := 0;
begin
  if not public.can_manage_document(p_document_id) then
    raise exception '이 문서로 초안을 저장할 권한이 없습니다' using errcode = '42501';
  end if;
  -- can_manage_document가 참이면 문서가 보이고 내 조직이다. 조직은 한 번 더 확인한다(어긋나면 같은 거부).
  select * into v_doc from public.policy_documents where id = p_document_id;
  if not found or v_doc.org_id is distinct from (select private.my_org()) then
    raise exception '이 문서로 초안을 저장할 권한이 없습니다' using errcode = '42501';
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
    values (v_doc.org_id, v_doc.scope, v_doc.team_id, v_question, v_answer,
            coalesce(btrim(v_item ->> 'category'), ''), 'draft', 'ai_draft', (select auth.uid()))
    returning id into v_id;

    insert into public.knowledge_sources (knowledge_id, clause_id, org_id)
    select v_id, c.id, c.org_id
      from public.document_clauses c
     where c.document_id = p_document_id
       and c.id in (
         select e.value::uuid
           from jsonb_array_elements_text(
                  case when jsonb_typeof(v_item -> 'clause_ids') = 'array' then v_item -> 'clause_ids' else '[]'::jsonb end) e
          where e.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- ── 실행 권한 ───────────────────────────────────────────────────────
revoke execute on function public.save_knowledge_drafts(uuid, jsonb) from public, anon;
grant execute on function public.save_knowledge_drafts(uuid, jsonb) to authenticated;
