"""POST /knowledge/draft-answer. team_trainer·ops_staff만, 모델 호출 전에 하루 한도(draft)를 센다. DB에 쓰지 않는다."""

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from app import knowledge_draft
from app.auth import CurrentUser, require_role
from app.knowledge_schema import DraftAnswerRequest, DraftAnswerResponse
from app.quota import enforce_quota

router = APIRouter(prefix="/knowledge")
staff_only = require_role("team_trainer", "ops_staff")


@router.post("/draft-answer", response_model=DraftAnswerResponse, response_model_exclude_none=True)
async def draft_answer(req: DraftAnswerRequest, user: CurrentUser = Depends(staff_only)) -> DraftAnswerResponse:
    await run_in_threadpool(enforce_quota, user, "draft")
    try:
        draft = await knowledge_draft.draft_answer(user, req.question)
    except knowledge_draft.DraftError:
        raise HTTPException(status_code=502, detail=knowledge_draft.DRAFT_ERROR) from None
    return DraftAnswerResponse(found=draft is not None, draft=draft)
