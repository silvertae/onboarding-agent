"""POST /knowledge/index (로컬 Supabase 필요, 임베딩은 가짜). 임시 조직에서만 돌려 시드 지식에 벡터를 남기지 않는다."""

import pytest
from fastapi.testclient import TestClient

from app import embeddings, knowledge_index
from app.config import Settings, get_settings
from app.main import create_app

INDEX_FAILED = "지식 임베딩을 만들지 못했어요. 잠시 후 다시 시도해 주세요."


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client() -> TestClient:
    get_settings.cache_clear()
    return TestClient(create_app(Settings()))


@pytest.fixture
def fake_embed(monkeypatch):
    """받은 글을 기록하고 0이 아닌 벡터를 돌려준다(영벡터는 코사인 거리가 정의되지 않는다)."""
    calls: list[list[str]] = []

    async def fake(texts: list[str]) -> list[list[float]]:
        calls.append(texts)
        return [[0.1 + (i % 7) / 10.0] * embeddings.EMBEDDING_DIM for i, _ in enumerate(texts)]

    monkeypatch.setattr(embeddings, "embed", fake)
    return calls


def embedded_ids(service, org_id: str) -> set[str]:
    rows = service.table("knowledge_embeddings").select("knowledge_id").eq("org_id", org_id).execute().data
    return {r["knowledge_id"] for r in rows}


@pytest.fixture
def org(make_org):
    """팀 A 교육 담당자, 경영지원, 팀 A 신입과 지식 넷: 팀 A 게시·팀 A 초안·팀 B 게시·회사 게시."""
    o = make_org()
    o.trainer = o.add_user("team_trainer", team_id=o.team_a)
    o.ops = o.add_user("ops_staff", department="ga")
    o.hire = o.add_user("new_hire", team_id=o.team_a)
    o.team_item = o.add_knowledge("team", "팀 질문", "팀 답", team_id=o.team_a)
    o.team_draft = o.add_knowledge("team", "팀 초안 질문", "팀 초안 답", status="draft", team_id=o.team_a)
    o.other_team_item = o.add_knowledge("team", "다른 팀 질문", "다른 팀 답", team_id=o.team_b)
    o.company_item = o.add_knowledge("company", "회사 질문", "회사 답")
    return o


def test_new_hire_forbidden(client, fake_embed, org):
    res = client.post("/knowledge/index", headers=bearer(org.hire), json={})

    assert res.status_code == 403
    assert fake_embed == []


def test_trainer_embeds_only_missing_published_items_in_team(client, fake_embed, org, service):
    res = client.post("/knowledge/index", headers=bearer(org.trainer), json={})

    assert res.status_code == 200
    assert res.json() == {"embedded": 1}
    assert fake_embed == [["팀 질문\n팀 답"]]
    # 팀 초안, 다른 팀 지식, 회사 지식은 건드리지 않는다
    assert embedded_ids(service, org.id) == {org.team_item}


def test_second_call_does_not_embed_again(client, fake_embed, org):
    client.post("/knowledge/index", headers=bearer(org.trainer), json={})
    fake_embed.clear()

    res = client.post("/knowledge/index", headers=bearer(org.trainer), json={})

    assert res.json() == {"embedded": 0}
    assert fake_embed == []


def test_edited_item_is_embedded_again(client, fake_embed, org, service):
    client.post("/knowledge/index", headers=bearer(org.trainer), json={})
    service.table("knowledge_items").update({"answer": "고친 팀 답"}).eq("id", org.team_item).execute()
    fake_embed.clear()

    res = client.post("/knowledge/index", headers=bearer(org.trainer), json={})

    assert res.json() == {"embedded": 1}
    assert fake_embed == [["팀 질문\n고친 팀 답"]]


def test_status_change_does_not_embed_again(client, fake_embed, org, service):
    client.post("/knowledge/index", headers=bearer(org.trainer), json={})
    service.table("knowledge_items").update({"category": "바뀐 분류"}).eq("id", org.team_item).execute()
    fake_embed.clear()

    assert client.post("/knowledge/index", headers=bearer(org.trainer), json={}).json() == {"embedded": 0}
    assert fake_embed == []


def test_ops_embeds_company_items(client, fake_embed, org, service):
    res = client.post("/knowledge/index", headers=bearer(org.ops), json={})

    assert res.json() == {"embedded": 1}
    assert embedded_ids(service, org.id) == {org.company_item}


def test_long_text_is_cut_for_embedding(client, fake_embed, org):
    long_answer = "가" * 3000
    org.add_knowledge("team", "긴 질문", long_answer, team_id=org.team_a)

    client.post("/knowledge/index", headers=bearer(org.trainer), json={})

    [texts] = fake_embed
    assert max(len(t) for t in texts) == knowledge_index.EMBED_TEXT_LIMIT
    assert "긴 질문\n가" in [t[:6] for t in texts]


def test_embedding_failure_is_502_and_saves_nothing(client, org, service, monkeypatch):
    async def broken(_texts):
        raise embeddings.EmbeddingError("임베딩 API 호출에 실패했습니다(Timeout)")

    monkeypatch.setattr(embeddings, "embed", broken)

    res = client.post("/knowledge/index", headers=bearer(org.trainer), json={})

    assert res.status_code == 502
    assert res.json() == {"detail": INDEX_FAILED}
    assert embedded_ids(service, org.id) == set()


def test_chat_finds_embedded_item_only_once(org, fake_embed, client):
    """임베딩한 지식은 가까운 지식으로, 아직 없는 지식은 임베딩 없는 지식으로 한 번씩만 검색된다."""
    from app.assistant_tools import match_knowledge
    from app.auth import _load_user

    client.post("/knowledge/index", headers=bearer(org.trainer), json={})
    client.post("/knowledge/index", headers=bearer(org.ops), json={})
    new_item = org.add_knowledge("company", "방금 게시한 질문", "방금 게시한 답")

    found = match_knowledge(_load_user(org.hire), [0.1] * embeddings.EMBEDDING_DIM, 20)

    ids = [k["id"] for k in found]
    assert sorted(ids) == sorted([org.team_item, org.company_item, new_item])
    assert ids[-1] == new_item  # 임베딩 없는 지식은 맨 뒤
    assert set(found[0]) == {"id", "question", "answer", "category"}
