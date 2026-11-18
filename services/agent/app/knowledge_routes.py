"""POST /knowledge/draft-answer, /knowledge/draft-from-document.

team_trainer·ops_staff만, 모델 호출 전에 하루 한도(draft)를 센다. DB에 쓰지 않는다(웹이 검토 뒤 저장한다).
"""

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from app import knowledge_draft
from app.auth import CurrentUser, require_role
from app.knowledge_schema import DocumentDraftRequest, DraftAnswerRequest, DraftAnswerResponse, KnowledgeDrafts
from app.quota import enforce_quota

router = APIRouter(prefix="/knowledge")
staff_only = require_role("team_trainer", "ops_staff")
DOCUMENT_NOT_FOUND = "문서를 찾을 수 없어요"


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
