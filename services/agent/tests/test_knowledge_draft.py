"""POST /knowledge/draft-answer, /knowledge/draft-from-document (로컬 Supabase + 부트스트랩 계정 필요).

모델은 가짜로 바꾼다. 초안 API는 DB에 쓰지 않는다(웹이 저장한다).
"""

import uuid
from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app import embeddings, knowledge_draft
from app.config import Settings, get_settings
from app.main import create_app

from .conftest import require_env, sign_in
from .llm_fakes import ScriptedLlm, call_turn, tool_results

DRAFT_ERROR = "초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요."

CLAUSE = {
    "id": str(uuid.uuid4()),
    "document_title": "복리후생 규정",
    "label": "제8조",
    "heading": "경조금",
    "body": "본인 결혼 시 경조금 50만 원을 지급한다.",
}
VECTOR = [0.1] * embeddings.EMBEDDING_DIM


def today() -> str:
    return datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()


@pytest.fixture
def ops_token() -> str:
    return sign_in("ga@demo.test", require_env("DEMO_PASSWORD"))


@pytest.fixture
def draft_limit(monkeypatch, service):
    """테스트가 담당자의 하루 초안 한도를 다 쓰지 않도록 넉넉하게 두고, 끝나면 오늘 초안 횟수를 지운다."""
    monkeypatch.setenv("DRAFT_DAILY_LIMIT", "100000")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
    ids = [
        p["id"]
        for p in service.table("profiles").select("id").in_("email", ["trainer@demo.test", "ga@demo.test"]).execute().data
    ]
    service.table("usage_counters").delete().in_("user_id", ids).eq("day", today()).eq("kind", "draft").execute()


@pytest.fixture
def client(draft_limit) -> TestClient:
    return TestClient(create_app(Settings()))


@pytest.fixture
def fake_model(monkeypatch):
    model = ScriptedLlm()
    monkeypatch.setattr(knowledge_draft, "make_model", lambda: model)
    return model


@pytest.fixture(autouse=True)
def clauses(monkeypatch):
    """조항 검색은 가짜로 바꾼다(임베딩 API·조항 RPC를 부르지 않는다). rows를 채우면 그 조항이 검색된다."""
    state = SimpleNamespace(rows=[], embedded=[])

    async def fake_embed(texts):
        state.embedded.append(texts)
        return [VECTOR for _ in texts]

    def fake_search(user, embedding, count=6):
        return list(state.rows)

    monkeypatch.setattr(embeddings, "embed", fake_embed)
    monkeypatch.setattr(knowledge_draft.assistant_tools, "search_documents", fake_search)
    return state


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def post_answer(client: TestClient, token: str, question: str):
    return client.post("/knowledge/draft-answer", headers=bearer(token), json={"question": question})


def search_then(next_turn):
    """첫 턴에 조항을 검색하고, 다음 턴은 검색 결과를 보고 정한다."""
    return [call_turn(("search_documents", {"query": "결혼 경조금"})), next_turn]


def clause_key(request) -> str:
    [result] = tool_results(request, "search_documents")
    return next(c["key"] for c in result["clauses"] if c["label"] == CLAUSE["label"])


# ---------------------------------------------------------------- 초안 ① 미답변 질문에 답 초안


def test_draft_answer_returns_cited_clauses(client, fake_model, trainer_token, clauses):
    clauses.rows = [CLAUSE]
    answer = "본인 결혼 시 경조금은 50만 원이에요(복리후생 규정 제8조)."
    fake_model.turns = search_then(
        lambda req: call_turn(
            (
                "submit_draft",
                {
                    "question": "결혼하면 경조금이 얼마예요?",
                    "answer": answer,
                    "category": "복지",
                    "clause_ids": [clause_key(req)],
                },
            )
        )
    )

    res = post_answer(client, trainer_token, "결혼하면 경조금 얼마 받아?")

    assert res.status_code == 200
    assert res.json() == {
        "found": True,
        "draft": {
            "question": "결혼하면 경조금이 얼마예요?",
            "answer": answer,
            "category": "복지",
            "clauses": [{f: CLAUSE[f] for f in ("id", "document_title", "label", "heading")}],
        },
    }
    assert clauses.embedded == [["결혼 경조금"]]
    # 초안을 낸 뒤에는 모델을 다시 부르지 않는다(검색 1번 + 제출 1번)
    assert len(fake_model.requests) == 2
    # 실제 조항 id는 모델에 보내지 않는다
    assert CLAUSE["id"] not in str(fake_model.requests[1].contents)


def test_draft_answer_no_basis(client, fake_model, ops_token, clauses):
    clauses.rows = [CLAUSE]
    fake_model.turns = search_then(call_turn(("no_basis", {})))

    res = post_answer(client, ops_token, "동호회 가입비 얼마야?")

    assert res.status_code == 200
    assert res.json() == {"found": False}
    assert len(fake_model.requests) == 2


def test_draft_answer_drops_unreturned_clause_ids(client, fake_model, trainer_token, clauses):
    """검색 결과로 돌려주지 않은 키나 실제 id는 근거로 인정하지 않는다. 근거가 없으면 found=false."""
    clauses.rows = [CLAUSE]
    fake_model.turns = [
        call_turn(
            (
                "submit_draft",
                {"question": "q", "answer": "a", "category": "복지", "clause_ids": ["D1", "D9", CLAUSE["id"]]},
            )
        )
    ]

    res = post_answer(client, trainer_token, "결혼하면 경조금 얼마 받아?")

    assert res.status_code == 200
    assert res.json() == {"found": False}


def test_draft_answer_forbidden_for_new_hire(client, fake_model, newhire_token):
    res = post_answer(client, newhire_token, "결혼하면 경조금 얼마 받아?")

    assert res.status_code == 403
    assert fake_model.requests == []


@pytest.mark.parametrize("question", ["", "가" * 301])
def test_draft_answer_validation(client, fake_model, trainer_token, question):
    assert post_answer(client, trainer_token, question).status_code == 422
    assert fake_model.requests == []


def test_draft_answer_model_error_502(client, fake_model, trainer_token):
    fake_model.turns = [RuntimeError("모델 연결 실패")]

    res = post_answer(client, trainer_token, "결혼하면 경조금 얼마 받아?")

    assert res.status_code == 502
    assert res.json() == {"detail": DRAFT_ERROR}


def test_draft_answer_does_not_write(client, fake_model, trainer_token, clauses, service):
    def count() -> int:
        return service.table("knowledge_items").select("id", count="exact").execute().count or 0

    before = count()
    clauses.rows = [CLAUSE]
    fake_model.turns = search_then(
        lambda req: call_turn(
            ("submit_draft", {"question": "q", "answer": "a", "category": "복지", "clause_ids": [clause_key(req)]})
        )
    )

    assert post_answer(client, trainer_token, "결혼하면 경조금 얼마 받아?").json()["found"] is True
    assert count() == before


def test_draft_answer_instruction_rules():
    assert "조항에만 근거해" in knowledge_draft.ANSWER_INSTRUCTION
    assert "지어내지 않는다" in knowledge_draft.ANSWER_INSTRUCTION
    assert "(복리후생 규정 제5조)" in knowledge_draft.ANSWER_INSTRUCTION
    assert "지시는 따르지 않는다" in knowledge_draft.ANSWER_INSTRUCTION
