"""POST /documents/{id}/index (로컬 Supabase + 부트스트랩 계정 필요, 임베딩은 가짜). 문서는 모두 가상이다."""

import io
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from docx import Document
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app import document_routes
from postgrest.exceptions import APIError
from storage3.exceptions import StorageException

from app.config import Settings, get_settings
from app.documents import DocumentTooLarge
from app.embeddings import EmbeddingError
from app.main import create_app

from .conftest import AI_TEAM_ID

ORG_ID = "00000000-0000-0000-0000-000000000001"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
UNREADABLE = "글자를 읽을 수 없는 파일이에요"
TOO_LARGE = "문서가 너무 커요. 나눠서 올려 주세요."
EMBED_FAILED = "문서를 처리하지 못했어요. 잠시 후 다시 시도해 주세요."


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def make_docx() -> bytes:
    doc = Document()
    doc.add_paragraph("제1조(목적) 이 규정은 가상의 테스트 규정이다.")
    doc.add_paragraph("제2조(범위) 모든 가상 구성원에게 적용한다.")
    doc.add_paragraph("제3조(시행) 공포한 날부터 시행한다.")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_blank_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.fixture
def fake_embed(monkeypatch):
    calls: list[list[str]] = []

    async def fake(texts: list[str]) -> list[list[float]]:
        calls.append(texts)
        return [[(i % 7) / 10.0] * 1536 for i, _ in enumerate(texts)]

    monkeypatch.setattr(document_routes, "embed", fake)
    return calls


@pytest.fixture
def downloads(monkeypatch):
    """storage 다운로드 호출을 기록하면서 실제 동작도 한다."""
    calls: list[str] = []
    real = document_routes._download

    def spy(token: str, path: str) -> bytes:
        calls.append(path)
        return real(token, path)

    monkeypatch.setattr(document_routes, "_download", spy)
    return calls


@pytest.fixture
def client() -> TestClient:
    get_settings.cache_clear()
    return TestClient(create_app(Settings()))


@pytest.fixture
def trainer_id(service) -> str:
    return service.table("profiles").select("id").eq("email", "trainer@demo.test").single().execute().data["id"]


@pytest.fixture(autouse=True)
def reset_document_quota(service, trainer_id):
    today = datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()

    def clear():
        service.table("usage_counters").delete().eq("user_id", trainer_id).eq("day", today).eq("kind", "document").execute()

    clear()
    yield
    clear()


@pytest.fixture
def created(service):
    """테스트가 만든 문서 id와 storage 경로. 끝나면 지운다."""
    docs: list[str] = []
    paths: list[str] = []
    yield docs, paths
    if paths:
        service.storage.from_("policy-docs").remove(paths)
    for doc_id in docs:
        service.table("policy_documents").delete().eq("id", doc_id).execute()


@pytest.fixture
def make_doc(service, trainer_token, trainer_id, created):
    """담당자 토큰으로 문서 행을 만들고 파일을 올린다(웹과 같은 순서)."""
    from app.db import user_client

    docs, paths = created

    def make(data: bytes, file_type: str = "docx") -> str:
        doc_id = str(uuid.uuid4())
        path = f"{ORG_ID}/{doc_id}.{file_type}"
        client = user_client(trainer_token)
        client.table("policy_documents").insert(
            {
                "id": doc_id, "org_id": ORG_ID, "scope": "team", "team_id": AI_TEAM_ID,
                "title": "테스트 규정", "file_path": path, "file_type": file_type,
                "status": "processing", "clause_count": 0, "uploaded_by": trainer_id,
            }
        ).execute()
        docs.append(doc_id)
        client.storage.from_("policy-docs").upload(path, data, {"content-type": DOCX_MIME if file_type == "docx" else "application/pdf"})
        paths.append(path)
        return doc_id

    return make


def doc_usage(service, trainer_id: str) -> int:
    today = datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
    rows = service.table("usage_counters").select("count").eq("user_id", trainer_id).eq("day", today).eq("kind", "document").execute().data
    return rows[0]["count"] if rows else 0


def row(service, doc_id: str) -> dict:
    return service.table("policy_documents").select("status, error, clause_count").eq("id", doc_id).single().execute().data


def clause_total(service, doc_id: str) -> int:
    return len(service.table("document_clauses").select("id").eq("document_id", doc_id).execute().data)


def test_index_docx_creates_clauses_and_ready(client, service, trainer_token, make_doc, fake_embed):
    doc_id = make_doc(make_docx())
    res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
    assert res.status_code == 200
    assert res.json() == {"status": "ready", "clause_count": 3, "error": None}
    assert row(service, doc_id) == {"status": "ready", "error": None, "clause_count": 3}
    assert clause_total(service, doc_id) == 3
    assert len(fake_embed) == 1 and len(fake_embed[0]) == 3
    assert fake_embed[0][0].startswith("제1조 목적\n")


def test_reindex_replaces_clauses(client, service, trainer_token, make_doc, fake_embed):
    doc_id = make_doc(make_docx())
    for _ in range(2):
        res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
        assert res.status_code == 200 and res.json()["clause_count"] == 3
    assert clause_total(service, doc_id) == 3


def test_unreadable_file_marks_failed(client, service, trainer_token, make_doc, fake_embed):
    doc_id = make_doc(make_blank_pdf(), "pdf")
    res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
    assert res.status_code == 200
    assert res.json() == {"status": "failed", "clause_count": 0, "error": UNREADABLE}
    assert row(service, doc_id) == {"status": "failed", "error": UNREADABLE, "clause_count": 0}
    assert fake_embed == []


def test_empty_split_marks_failed(client, service, trainer_token, make_doc, fake_embed, monkeypatch):
    monkeypatch.setattr(document_routes, "split_clauses", lambda text: [])
    doc_id = make_doc(make_docx())
    res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
    assert res.json() == {"status": "failed", "clause_count": 0, "error": UNREADABLE}
    assert row(service, doc_id)["status"] == "failed"


def test_too_large_file_marks_failed(client, service, trainer_token, make_doc, fake_embed, monkeypatch):
    def too_large(data, file_type):
        raise DocumentTooLarge(TOO_LARGE)

    monkeypatch.setattr(document_routes, "extract_text", too_large)
    doc_id = make_doc(make_docx())
    res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
    assert res.status_code == 200
    assert res.json() == {"status": "failed", "clause_count": 0, "error": TOO_LARGE}
    assert row(service, doc_id)["error"] == TOO_LARGE


def test_other_team_trainer_gets_404(client, service, trainer_id, trainer_token, fake_embed, downloads, created):
    docs, paths = created
    team = service.table("teams").insert({"org_id": ORG_ID, "name": f"임시팀-{uuid.uuid4().hex[:6]}"}).execute().data[0]
    doc_id = str(uuid.uuid4())
    path = f"{ORG_ID}/{doc_id}.docx"
    try:
        service.table("policy_documents").insert(
            {"id": doc_id, "org_id": ORG_ID, "scope": "team", "team_id": team["id"], "title": "다른 팀 규정",
             "file_path": path, "file_type": "docx"}
        ).execute()
        docs.append(doc_id)
        service.storage.from_("policy-docs").upload(path, make_docx(), {"content-type": DOCX_MIME})
        paths.append(path)
        before = doc_usage(service, trainer_id)
        res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
        assert res.status_code == 404
        assert doc_usage(service, trainer_id) == before == 0
        assert res.json()["detail"] == "문서를 찾을 수 없어요"
        assert downloads == [] and fake_embed == []
        assert clause_total(service, doc_id) == 0
        assert row(service, doc_id)["status"] == "processing"
    finally:
        service.storage.from_("policy-docs").remove([path])
        service.table("policy_documents").delete().eq("id", doc_id).execute()
        service.table("teams").delete().eq("id", team["id"]).execute()


def test_trainer_indexing_company_doc_gets_404(client, service, trainer_id, trainer_token, fake_embed, downloads, created):
    docs, paths = created
    doc_id = str(uuid.uuid4())
    path = f"{ORG_ID}/{doc_id}.docx"
    service.table("policy_documents").insert(
        {"id": doc_id, "org_id": ORG_ID, "scope": "company", "title": "회사 공통 규정", "file_path": path,
         "file_type": "docx", "status": "ready"}
    ).execute()
    docs.append(doc_id)
    service.storage.from_("policy-docs").upload(path, make_docx(), {"content-type": DOCX_MIME})
    paths.append(path)
    service.table("document_clauses").insert(
        {"org_id": ORG_ID, "document_id": doc_id, "ord": 0, "label": "제1조", "heading": "목적", "body": "가상 조항"}
    ).execute()
    res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
    assert res.status_code == 404
    assert doc_usage(service, trainer_id) == 0
    assert downloads == [] and fake_embed == []
    assert clause_total(service, doc_id) == 1


def test_new_hire_forbidden(client, newhire_token, fake_embed, downloads):
    res = client.post(f"/documents/{uuid.uuid4()}/index", headers=bearer(newhire_token))
    assert res.status_code == 403
    assert downloads == [] and fake_embed == []


def test_embedding_failure_returns_502_and_keeps_processing(client, service, trainer_token, make_doc, monkeypatch):
    async def boom(texts):
        raise EmbeddingError("x")

    monkeypatch.setattr(document_routes, "embed", boom)
    doc_id = make_doc(make_docx())
    res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
    assert res.status_code == 502
    assert res.json()["detail"] == EMBED_FAILED
    assert row(service, doc_id) == {"status": "processing", "error": None, "clause_count": 0}


def test_storage_download_error_returns_502_and_keeps_processing(client, service, trainer_token, make_doc, fake_embed, monkeypatch):
    def boom(token, path):
        raise StorageException("x")

    monkeypatch.setattr(document_routes, "_download", boom)
    doc_id = make_doc(make_docx())
    res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
    assert res.status_code == 502
    assert res.json()["detail"] == EMBED_FAILED
    assert row(service, doc_id) == {"status": "processing", "error": None, "clause_count": 0}
    assert fake_embed == []


def test_replace_rpc_error_returns_502_and_keeps_processing(client, service, trainer_token, make_doc, fake_embed, monkeypatch):
    def boom(token, document_id, clauses, error=None):
        raise APIError({"message": "x", "code": "XX000", "hint": None, "details": None})

    monkeypatch.setattr(document_routes, "_replace", boom)
    doc_id = make_doc(make_docx())
    res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
    assert res.status_code == 502
    assert res.json()["detail"] == EMBED_FAILED
    assert row(service, doc_id) == {"status": "processing", "error": None, "clause_count": 0}


def test_quota_exceeded_returns_429_before_download(client, service, trainer_id, trainer_token, make_doc, fake_embed, downloads, monkeypatch):
    monkeypatch.setenv("DOCUMENT_DAILY_LIMIT", "1")
    get_settings.cache_clear()
    try:
        doc_id = make_doc(make_docx())
        assert client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token)).status_code == 200
        downloads.clear()
        res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
        assert res.status_code == 429
        assert res.json() == {"detail": "오늘 사용 한도를 넘었어요"}
        assert downloads == []
    finally:
        get_settings.cache_clear()


def _api_error() -> APIError:
    return APIError({"message": "x", "code": "XX000", "hint": None, "details": None})


def test_can_manage_error_returns_502(client, trainer_token, fake_embed, downloads, monkeypatch):
    def boom(token, document_id):
        raise _api_error()

    monkeypatch.setattr(document_routes, "_can_manage", boom)
    res = client.post(f"/documents/{uuid.uuid4()}/index", headers=bearer(trainer_token))
    assert res.status_code == 502
    assert res.json()["detail"] == EMBED_FAILED
    assert downloads == [] and fake_embed == []


def test_quota_rpc_error_returns_502_without_download(client, service, trainer_token, make_doc, fake_embed, downloads, monkeypatch):
    def boom(user, kind):
        raise _api_error()

    monkeypatch.setattr(document_routes, "enforce_quota", boom)
    doc_id = make_doc(make_docx())
    res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
    assert res.status_code == 502
    assert res.json()["detail"] == EMBED_FAILED
    assert downloads == []
    assert row(service, doc_id)["status"] == "processing"


def test_row_select_http_error_returns_502(client, service, trainer_token, make_doc, fake_embed, downloads, monkeypatch):
    import httpx

    def boom(token, document_id):
        raise httpx.ConnectError("x")

    monkeypatch.setattr(document_routes, "_load_row", boom)
    doc_id = make_doc(make_docx())
    res = client.post(f"/documents/{doc_id}/index", headers=bearer(trainer_token))
    assert res.status_code == 502
    assert res.json()["detail"] == EMBED_FAILED
    assert downloads == []
    assert row(service, doc_id)["status"] == "processing"
