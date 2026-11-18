"""하루 사용 한도. 횟수는 DB의 consume_quota RPC가 사용자 토큰으로 원자적으로 센다."""

from typing import Literal

from fastapi import HTTPException

from app.auth import CurrentUser
from app.config import get_settings
from app.db import user_client

QUOTA_EXCEEDED = "오늘 사용 한도를 넘었어요"


def enforce_quota(user: CurrentUser, kind: Literal["chat", "exam", "document", "draft"]) -> None:
    settings = get_settings()
    limit = {
        "chat": settings.chat_daily_limit,
        "exam": settings.exam_daily_limit,
        "document": settings.document_daily_limit,
        "draft": settings.draft_daily_limit,
    }[kind]
    allowed = user_client(user.token).rpc("consume_quota", {"p_kind": kind, "p_limit": limit}).execute().data
    if allowed is not True:
        raise HTTPException(status_code=429, detail=QUOTA_EXCEEDED)
