"""어시스턴트 조회 도구 (로컬 Supabase + 부트스트랩 계정 필요). 모두 사용자 토큰으로 읽는다(RLS 적용)."""

import uuid

import pytest

from app.assistant_tools import get_my_tasks, match_knowledge, search_documents, search_knowledge
from app.auth import CurrentUser, _load_user
from app.embeddings import EMBEDDING_DIM


def as_user(token: str) -> CurrentUser:
    return _load_user(token)


def test_get_my_tasks_returns_31(newhire_token):
    tasks = get_my_tasks(as_user(newhire_token))

    assert len(tasks) == 31
    assert set(tasks[0]) == {"id", "code", "title", "status", "due_date", "owner", "blocked_by", "handled_by", "my_turn"}
    by_code = {t["code"]: t for t in tasks}
    hr02, hr03 = by_code["HR-02"], by_code["HR-03"]
    # 시드 상태에서 HR-03은 HR-02 완료 후 열린다
    if hr02["status"] in ("done", "na"):
        assert hr03["blocked_by"] == []
    else:
        assert hr03["status"] == "blocked"
        assert hr03["blocked_by"] == ["HR-02"]
    # 열린 과제에는 대기 중인 선행 과제가 없다
    assert all(t["blocked_by"] == [] for t in tasks if t["status"] != "blocked")
    assert hr02["owner"] == "인사팀"
    assert any(t["owner"] == "AI팀" for t in tasks)


def test_get_my_tasks_marks_who_acts(newhire_token):
    """담당자가 처리하는 과제(staff_only)는 신입의 할 일이 아니다. 웹 '지금 할 일'과 같은 기준."""
    by_code = {t["code"]: t for t in get_my_tasks(as_user(newhire_token))}

    ga02 = by_code["GA-02"]  # 지문 등록·출입 확인: 총무가 처리
    assert ga02["handled_by"] == "담당자"
    assert ga02["my_turn"] is False
    for code in ("AI-05", "AI-10"):  # 평가 과제도 담당자 처리
        assert by_code[code]["handled_by"] == "담당자"
        assert by_code[code]["my_turn"] is False

    ai01 = by_code["AI-01"]  # 사무실 돌며 인사하기: 신입이 직접
    assert ai01["handled_by"] == "신입"
    assert ai01["my_turn"] == (ai01["status"] in ("todo", "rework"))
    # my_turn은 열려 있고(todo·rework) 신입이 처리하는 과제에만 참이다
    for t in by_code.values():
        assert t["my_turn"] == (t["status"] in ("todo", "rework") and t["handled_by"] == "신입")


def test_search_knowledge_scope(newhire_token, service):
    items = search_knowledge(as_user(newhire_token))

    assert len(items) == 30
    assert set(items[0]) == {"id", "question", "answer", "category"}
    ids = [i["id"] for i in items]
    statuses = service.table("knowledge_items").select("status").in_("id", ids).execute().data
    assert {s["status"] for s in statuses} == {"published"}


# 다른 시드 조항보다 먼저 나오도록 픽스처 조항만 이 벡터를 쓴다(코사인 유사도 1)
PROBE = [1.0] + [0.0] * (EMBEDDING_DIM - 1)


@pytest.fixture
def clause_fixture(service, newhire_token):
    """신입 조직의 회사 공통 ready 문서와 다른 팀 ready 문서에 조항 하나씩. 끝나면 지운다(조항은 cascade)."""
    hire = as_user(newhire_token)
    suffix = uuid.uuid4().hex[:8]
    other_team = service.table("teams").insert({"org_id": hire.org_id, "name": f"테스트팀 {suffix}"}).execute().data[0]
    # 0012의 CHECK: file_path = org_id/id.file_type
    company_id, other_id = str(uuid.uuid4()), str(uuid.uuid4())
    doc_ids: list[str] = []
    try:
        docs = (
            service.table("policy_documents")
            .insert(
                [
                    {
                        "id": company_id, "org_id": hire.org_id, "scope": "company", "team_id": None,
                        "title": f"회사 규정 {suffix}", "file_path": f"{hire.org_id}/{company_id}.pdf",
                        "file_type": "pdf", "status": "ready",
                    },
                    {
                        "id": other_id, "org_id": hire.org_id, "scope": "team", "team_id": other_team["id"],
                        "title": f"다른 팀 규정 {suffix}", "file_path": f"{hire.org_id}/{other_id}.pdf",
                        "file_type": "pdf", "status": "ready",
                    },
                ]
            )
            .execute()
            .data
        )
        doc_ids = [d["id"] for d in docs]
        clauses = (
            service.table("document_clauses")
            .insert(
                [
                    {
                        "org_id": hire.org_id, "document_id": doc["id"], "ord": 1, "label": "제1조", "heading": "목적",
                        "body": f"{doc['title']} 본문", "embedding": PROBE,
                    }
                    for doc in docs
                ]
            )
            .execute()
            .data
        )
        yield {"company": (docs[0], clauses[0]), "other": (docs[1], clauses[1])}
    finally:
        if doc_ids:
            service.table("policy_documents").delete().in_("id", doc_ids).execute()
        service.table("teams").delete().eq("id", other_team["id"]).execute()


def test_search_documents_scoped_by_rls(newhire_token, clause_fixture):
    found = search_documents(as_user(newhire_token), PROBE)

    company_doc, company_clause = clause_fixture["company"]
    _, other_clause = clause_fixture["other"]
    assert found[0] == {
        "id": company_clause["id"], "document_title": company_doc["title"], "label": "제1조", "heading": "목적",
        "body": f"{company_doc['title']} 본문",
    }
    assert other_clause["id"] not in [c["id"] for c in found]
    assert len(found) <= 6


def test_match_knowledge_scoped_by_rls(make_org, service):
    """가까운 게시 지식 count개 + 임베딩 없는 게시 지식. 다른 팀·초안 지식과 그 임베딩은 빠진다."""
    org = make_org()
    hire = as_user(org.add_user("new_hire", team_id=org.team_a))
    near = org.add_knowledge("company", "가까운 질문", "가까운 답")
    far = org.add_knowledge("company", "먼 질문", "먼 답")
    fresh = org.add_knowledge("team", "새 팀 질문", "새 팀 답", team_id=org.team_a)
    other_team = org.add_knowledge("team", "다른 팀 질문", "다른 팀 답", team_id=org.team_b)
    draft = org.add_knowledge("company", "초안 질문", "초안 답", status="draft")
    rows = service.table("knowledge_items").select("id, question, answer").in_("id", [near, far, other_team, draft]).execute().data
    other = [0.0, 1.0] + [0.0] * (EMBEDDING_DIM - 2)
    service.rpc(
        "save_knowledge_embeddings",
        {"p_items": [{**r, "embedding": other if r["id"] == far else PROBE} for r in rows]},
    ).execute()

    found = match_knowledge(hire, PROBE, 1)

    assert [k["id"] for k in found] == [near, fresh]
    assert found[0] == {"id": near, "question": "가까운 질문", "answer": "가까운 답", "category": "테스트"}
    assert {k["id"] for k in match_knowledge(hire, PROBE, 20)} == {near, far, fresh}
