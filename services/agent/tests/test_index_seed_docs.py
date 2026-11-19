"""index_seed_docs.py 통합 테스트 (로컬 Supabase 필요). 임시 조직에만 쓰고 데모 조직은 건드리지 않는다."""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app.documents import extract_text, split_clauses
from app.embeddings import EmbeddingError

AGENT_DIR = Path(__file__).resolve().parents[1]
SEED_DIR = AGENT_DIR.parents[1] / "supabase" / "seed-docs"
BUCKET = "policy-docs"
EXPECTED = {
    "복리후생 규정(가상)": ("welfare-policy.docx", "docx"),
    "취업규칙 발췌(가상)": ("work-rules.pdf", "pdf"),
}


@pytest.fixture(scope="module")
def script():
    spec = importlib.util.spec_from_file_location("index_seed_docs", AGENT_DIR / "scripts" / "index_seed_docs.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def org(service, monkeypatch):
    for name in ("OPENAI_API_KEY", "OPENAI_EMBEDDING_MODEL"):
        monkeypatch.setenv(name, "test-value")
    org_id = service.table("orgs").insert({"name": f"임시조직-{uuid.uuid4().hex[:6]}"}).execute().data[0]["id"]
    try:
        yield org_id
    finally:
        paths = [r["file_path"] for r in service.table("policy_documents").select("file_path").eq("org_id", org_id).execute().data]
        if paths:
            service.storage.from_(BUCKET).remove(paths)
        service.table("document_clauses").delete().eq("org_id", org_id).execute()
        service.table("policy_documents").delete().eq("org_id", org_id).execute()
        service.table("orgs").delete().eq("id", org_id).execute()


def _fake_embed(monkeypatch, script, calls: list):
    async def fake(texts):
        calls.append(len(texts))
        return [[0.1] * 1536 for _ in texts]

    monkeypatch.setattr(script, "embed", fake)


def _docs(service, org_id):
    return service.table("policy_documents").select("*").eq("org_id", org_id).execute().data


def test_default_seeds_only_work_rules(script, service, org, monkeypatch):
    _fake_embed(monkeypatch, script, [])
    assert script.main(["--org", org]) == 0
    assert [d["title"] for d in _docs(service, org)] == ["취업규칙 발췌(가상)"]


def test_all_indexes_both_docs_and_is_idempotent(script, service, org, monkeypatch, capsys):
    calls: list[int] = []
    _fake_embed(monkeypatch, script, calls)

    assert script.main(["--org", org, "--all"]) == 0
    docs = {d["title"]: d for d in _docs(service, org)}
    assert set(docs) == set(EXPECTED)
    for title, (file_name, file_type) in EXPECTED.items():
        d = docs[title]
        expected = len(split_clauses(extract_text((SEED_DIR / file_name).read_bytes(), file_type)))
        assert d["status"] == "ready" and d["error"] is None
        assert d["scope"] == "company" and d["team_id"] is None and d["uploaded_by"] is None
        assert d["clause_count"] == expected
        n = len(service.table("document_clauses").select("id").eq("document_id", d["id"]).execute().data)
        assert n == expected
        assert service.storage.from_(BUCKET).download(d["file_path"])
    out = capsys.readouterr().out
    assert "복리후생 규정(가상)" in out

    ids = {d["id"] for d in docs.values()}
    calls.clear()
    assert script.main(["--org", org, "--all"]) == 0
    assert {d["id"] for d in _docs(service, org)} == ids
    assert calls == []
    assert "건너뜀" in capsys.readouterr().out


def test_embedding_error_leaves_no_row_so_rerun_retries(script, service, org, monkeypatch, capsys):
    async def boom(texts):
        raise EmbeddingError("fail")

    monkeypatch.setattr(script, "embed", boom)
    assert script.main(["--org", org, "--all"]) == 1
    assert _docs(service, org) == []
    assert "EmbeddingError" in capsys.readouterr().err

    _fake_embed(monkeypatch, script, [])
    assert script.main(["--org", org, "--all"]) == 0
    assert len(_docs(service, org)) == 2


def test_failed_existing_row_is_replaced(script, service, org, monkeypatch):
    doc_id = str(uuid.uuid4())
    service.table("policy_documents").insert(
        {"id": doc_id, "org_id": org, "scope": "company", "title": "취업규칙 발췌(가상)",
         "file_path": f"{org}/{doc_id}.pdf", "file_type": "pdf", "status": "failed", "error": "x"}
    ).execute()
    _fake_embed(monkeypatch, script, [])
    assert script.main(["--org", org]) == 0
    docs = _docs(service, org)
    assert len(docs) == 1 and docs[0]["id"] != doc_id and docs[0]["status"] == "ready"


def test_ready_doc_survives_failed_duplicate(script, service, org, monkeypatch):
    calls: list[int] = []
    _fake_embed(monkeypatch, script, calls)
    assert script.main(["--org", org]) == 0
    ready = _docs(service, org)[0]
    clauses_before = len(service.table("document_clauses").select("id").eq("document_id", ready["id"]).execute().data)
    bad = str(uuid.uuid4())
    service.table("policy_documents").insert(
        {"id": bad, "org_id": org, "scope": "company", "title": ready["title"],
         "file_path": f"{org}/{bad}.pdf", "file_type": "pdf", "status": "failed", "error": "x"}
    ).execute()
    calls.clear()
    assert script.main(["--org", org]) == 0
    docs = _docs(service, org)
    assert [d["id"] for d in docs] == [ready["id"]] and calls == []
    assert len(service.table("document_clauses").select("id").eq("document_id", ready["id"]).execute().data) == clauses_before > 0


def test_rejected_seed_doc_exits_1(script, service, org, monkeypatch, capsys):
    from app.documents import DocumentRejected

    def reject(data, file_type):
        raise DocumentRejected("읽을 수 없음")

    monkeypatch.setattr(script, "extract_text", reject)
    _fake_embed(monkeypatch, script, [])
    assert script.main(["--org", org]) == 1
    assert "DocumentRejected" in capsys.readouterr().err
    assert [d["status"] for d in _docs(service, org)] == ["failed"]


def test_missing_env_exits_2_naming_only_the_variable(script, monkeypatch, capsys):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert script.main(["--org", str(uuid.uuid4())]) == 2
    assert "OPENAI_API_KEY" in capsys.readouterr().err
