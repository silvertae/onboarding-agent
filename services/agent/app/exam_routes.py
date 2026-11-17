"""POST /exams/generate, POST /exams/regenerate-question. team_trainer만, 모델 호출 전에 하루 한도를 센다."""

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from app import exam_agent
from app.auth import CurrentUser, require_role
from app.exam_schema import ExamQuestion, GeneratedExam, GenerateRequest, RegenerateRequest
from app.quota import enforce_quota

router = APIRouter(prefix="/exams")
trainer_only = require_role("team_trainer")


@router.post("/generate", response_model=GeneratedExam)
async def generate(req: GenerateRequest, user: CurrentUser = Depends(trainer_only)) -> GeneratedExam:
    await run_in_threadpool(enforce_quota, user, "exam")
    survey = None
    if req.new_hire_id is not None:
        survey = await run_in_threadpool(exam_agent.load_survey, user, req.new_hire_id)
    try:
        return await exam_agent.generate_exam(req, survey)
    except exam_agent.ExamOutputError:
        raise HTTPException(status_code=502, detail=exam_agent.RETRY_MESSAGE) from None


@router.post("/regenerate-question", response_model=ExamQuestion)
async def regenerate(req: RegenerateRequest, user: CurrentUser = Depends(trainer_only)) -> ExamQuestion:
    await run_in_threadpool(enforce_quota, user, "exam")
    try:
        return await exam_agent.regenerate_question(req)
    except exam_agent.ExamOutputError:
        raise HTTPException(status_code=502, detail=exam_agent.RETRY_MESSAGE) from None
