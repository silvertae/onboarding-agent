"""index_knowledge.py 통합 테스트 (로컬 Supabase 필요, 임베딩은 가짜). 임시 조직에만 쓰고 데모 조직은 건드리지 않는다."""

import importlib.util
from pathlib import Path

import pytest

from app.embeddings import EMBEDDING_DIM, EmbeddingError

AGENT_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def script():
    spec = importlib.util.spec_from_file_location("index_knowledge", AGENT_DIR / "scripts" / "index_knowledge.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(autouse=True)
def embedding_env(monkeypatch):
    for name in ("OPENAI_API_KEY", "OPENAI_EMBEDDING_MODEL"):
        monkeypatch.setenv(name, "test-value")


@pytest.fixture
def calls(script, monkeypatch) -> list[int]:
    """가짜 임베딩. 묶음마다 받은 글 수를 기록한다."""
    sizes: list[int] = []

    async def fake(texts):
        sizes.append(len(texts))
        return [[0.1] * EMBEDDING_DIM for _ in texts]

    monkeypatch.setattr(script, "embed", fake)
    return sizes


def embedded_ids(service, org_id: str) -> set[str]:
    rows = service.table("knowledge_embeddings").select("knowledge_id").eq("org_id", org_id).execute().data
    return {r["knowledge_id"] for r in rows}


def test_backfills_published_items_of_the_org_only(script, service, make_org, calls, capsys):
    org, other = make_org(), make_org()
    published = {
        org.add_knowledge("company", "회사 질문", "회사 답"),
        org.add_knowledge("team", "팀 질문", "팀 답", team_id=org.team_a),
    }
    org.add_knowledge("company", "초안 질문", "초안 답", status="draft")
    other.add_knowledge("company", "다른 조직 질문", "다른 조직 답")

    assert script.main(["--org", org.id]) == 0
    assert embedded_ids(service, org.id) == published
    assert embedded_ids(service, other.id) == set()
    assert "임베딩 2건" in capsys.readouterr().out

    calls.clear()
    assert script.main(["--org", org.id]) == 0
    assert calls == []


def test_more_than_one_batch(script, service, make_org, calls):
    org = make_org()
    service.table("knowledge_items").insert(
        [
            {"org_id": org.id, "scope": "company", "question": f"질문 {i}", "answer": f"답 {i}", "status": "published"}
            for i in range(101)
        ]
    ).execute()

    assert script.main(["--org", org.id]) == 0
    assert calls == [100, 1]
    assert len(embedded_ids(service, org.id)) == 101


def test_embedding_error_exits_1(script, service, make_org, monkeypatch, capsys):
    org = make_org()
    org.add_knowledge("company", "회사 질문", "회사 답")

    async def boom(texts):
        raise EmbeddingError("fail")

    monkeypatch.setattr(script, "embed", boom)
    assert script.main(["--org", org.id]) == 1
    assert "EmbeddingError" in capsys.readouterr().err
    assert embedded_ids(service, org.id) == set()


def test_missing_env_exits_2_naming_only_the_variable(script, monkeypatch, capsys):
    monkeypatch.delenv("OPENAI_EMBEDDING_MODEL", raising=False)
    assert script.main(["--org", "00000000-0000-0000-0000-0000000000ff"]) == 2
    assert "OPENAI_EMBEDDING_MODEL" in capsys.readouterr().err
