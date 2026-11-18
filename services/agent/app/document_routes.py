"""POST /documents/{id}/index. 올라온 규정 문서를 조항으로 나누고 임베딩해 저장한다. 문서·조항 내용은 로그에 남기지 않는다."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.auth import CurrentUser, require_role
from app.db import user_client
from app.documents import UNREADABLE, DocumentRejected, extract_text, split_clauses
from app.embeddings import EmbeddingError, embed
from app.quota import enforce_quota

router = APIRouter(prefix="/documents")
staff_only = require_role("team_trainer", "ops_staff")

NOT_FOUND = "문서를 찾을 수 없어요"
EMBED_FAILED = "문서를 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
BUCKET = "policy-docs"


class IndexResult(BaseModel):
    status: Literal["ready", "failed"]
    clause_count: int
    error: str | None = None


def _can_manage(token: str, document_id: str) -> bool:
    return user_client(token).rpc("can_manage_document", {"p_document_id": document_id}).execute().data is True


def _load_row(token: str, document_id: str) -> dict | None:
    rows = (
        user_client(token).table("policy_documents").select("file_path, file_type").eq("id", document_id).execute().data
    )
    return rows[0] if rows else None


def _download(token: str, path: str) -> bytes:
    return user_client(token).storage.from_(BUCKET).download(path)


def _replace(token: str, document_id: str, clauses: list[dict], error: str | None = None) -> int:
    params: dict = {"p_document_id": document_id, "p_clauses": clauses}
    if error is not None:
        params["p_error"] = error
    return user_client(token).rpc("replace_document_clauses", params).execute().data


def _parse(data: bytes, file_type: str) -> list:
    clauses = split_clauses(extract_text(data, file_type))  # type: ignore[arg-type]
    if not clauses:
        raise DocumentRejected(UNREADABLE)
    return clauses


@router.post("/{document_id}/index", response_model=IndexResult)
async def index_document(document_id: str, user: CurrentUser = Depends(staff_only)) -> IndexResult:
    if not await run_in_threadpool(_can_manage, user.token, document_id):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    await run_in_threadpool(enforce_quota, user, "document")
    doc = await run_in_threadpool(_load_row, user.token, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    try:
        data = await run_in_threadpool(_download, user.token, doc["file_path"])
        clauses = await run_in_threadpool(_parse, data, doc["file_type"])
    except DocumentRejected as e:
        await run_in_threadpool(_replace, user.token, document_id, [], str(e))
        return IndexResult(status="failed", clause_count=0, error=str(e))

    texts = [f"{c.label or ''} {c.heading or ''}".strip() + "\n" + c.body for c in clauses]
    try:
        vectors = await embed(texts)
    except EmbeddingError:
        raise HTTPException(status_code=502, detail=EMBED_FAILED) from None
    payload = [
        {"ord": c.ord, "label": c.label, "heading": c.heading, "body": c.body, "embedding": v}
        for c, v in zip(clauses, vectors, strict=True)
    ]
    count = await run_in_threadpool(_replace, user.token, document_id, payload)
    return IndexResult(status="ready", clause_count=count, error=None)
