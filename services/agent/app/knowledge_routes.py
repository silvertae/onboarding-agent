"""POST /knowledge/draft-answer, /knowledge/draft-from-document, /knowledge/index. team_trainer·ops_staff만.

- 초안: 모델 호출 전에 하루 한도(draft)를 센다. DB에 쓰지 않는다(웹이 검토 뒤 저장한다).
- index: 관리 범위 게시 지식의 빠진 임베딩만 채운다(담당자 토큰 RPC). 지식 본문·상태는 쓰지 않는다.
  빠진 것만 계산하므로 다시 불러도 임베딩 API를 부르지 않아 한도를 두지 않는다. 지식 내용은 로그에 남기지 않는다.
"""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError
from starlette.concurrency import run_in_threadpool

from app import embeddings, knowledge_draft, knowledge_index
from app.auth import CurrentUser, require_role
from app.db import user_client
from app.knowledge_schema import (
    DocumentDraftRequest,
    DraftAnswerRequest,
    DraftAnswerResponse,
    KnowledgeDrafts,
    KnowledgeIndexResult,
)
from app.quota import enforce_quota

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge")
staff_only = require_role("team_trainer", "ops_staff")
DOCUMENT_NOT_FOUND = "문서를 찾을 수 없어요"
INDEX_FAILED = "지식 임베딩을 만들지 못했어요. 잠시 후 다시 시도해 주세요."


@router.post("/draft-answer", response_model=DraftAnswerResponse, response_model_exclude_none=True)
async def draft_answer(req: DraftAnswerRequest, user: CurrentUser = Depends(staff_only)) -> DraftAnswerResponse:
    await run_in_threadpool(enforce_quota, user, "draft")
    try:
        draft = await knowledge_draft.draft_answer(user, req.question)
    except knowledge_draft.DraftError:
        raise HTTPException(status_code=502, detail=knowledge_draft.DRAFT_ERROR) from None
    return DraftAnswerResponse(found=draft is not None, draft=draft)


@router.post("/draft-from-document", response_model=KnowledgeDrafts)
async def draft_from_document(req: DocumentDraftRequest, user: CurrentUser = Depends(staff_only)) -> KnowledgeDrafts:
    try:
        # 문서 권한을 먼저 본다. 없는 문서·관리 범위 밖 문서 요청은 한도를 쓰지 않는다
        await run_in_threadpool(knowledge_draft.ensure_can_manage, user, req.document_id)
        await run_in_threadpool(enforce_quota, user, "draft")
        drafts = await knowledge_draft.drafts_from_document(user, req.document_id, req.count)
    except knowledge_draft.DocumentNotFound:
        raise HTTPException(status_code=404, detail=DOCUMENT_NOT_FOUND) from None
    except knowledge_draft.DraftError:
        raise HTTPException(status_code=502, detail=knowledge_draft.DRAFT_ERROR) from None
    return KnowledgeDrafts(drafts=drafts)


@router.post("/index", response_model=KnowledgeIndexResult)
async def index_knowledge(user: CurrentUser = Depends(staff_only)) -> KnowledgeIndexResult:
    """웹이 지식을 저장한 뒤 결과를 기다리지 않고 부른다. 실패해도 채팅은 임베딩 없는 지식을 함께 넣는다."""
    try:
        count = await knowledge_index.index_missing(user_client(user.token), embeddings.embed)
    except (embeddings.EmbeddingError, APIError, httpx.HTTPError) as exc:
        logger.warning("knowledge index failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail=INDEX_FAILED) from None
    return KnowledgeIndexResult(embedded=count)
