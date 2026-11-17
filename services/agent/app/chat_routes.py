"""POST /chat: 신입 전용 어시스턴트 SSE 스트림. 형식은 docs/contracts.md를 따른다."""

import json
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app import assistant
from app.auth import CurrentUser, require_role
from app.quota import enforce_quota

router = APIRouter()

# 프록시·브라우저가 스트림을 모아 두지 않게 한다
SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[HistoryTurn] = Field(default_factory=list, max_length=10)


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def chat(body: ChatRequest, user: CurrentUser = Depends(require_role("new_hire"))) -> StreamingResponse:
    # 모델을 부르기 전에 하루 한도를 센다. 넘으면 429(스트림을 시작하지 않는다)
    await run_in_threadpool(enforce_quota, user, "chat")

    history = [(turn.role, turn.text) for turn in body.history]

    async def stream():
        async for event in assistant.run_chat(user, body.message, history):
            yield _sse(event)

    return StreamingResponse(stream(), media_type="text/event-stream", headers=SSE_HEADERS)
