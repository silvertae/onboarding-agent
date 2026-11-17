"""관리자 전용 경로. 관리자 키(service_client)는 앱 안에서 이 모듈에서만 쓴다.

POST /admin/users 처리 순서:
  1. 호출자 조직에 team_id가 있는지 확인(호출자 토큰, RLS 적용)
  2. 관리자 API로 인증 계정 생성(메일 인증 완료 상태)
  3. profiles 삽입(org_id는 호출자 조직, is_seed = false)
  4. new_hire면 _start_onboarding
3·4가 실패하면 2에서 만든 인증 계정을 지우고 500을 돌려준다(프로필·과제는 cascade로 함께 지워진다).
비밀번호와 요청 본문은 로그에도, 오류 응답에도 남기지 않는다.
"""

import logging
import time
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import ValidationError
from supabase import Client
from supabase_auth.errors import AuthApiError

from app.admin_schema import CreateUserRequest, CreateUserResponse
from app.auth import CurrentUser, require_role
from app.db import service_client, user_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin")

DUPLICATE_EMAIL = "이미 등록된 메일이에요"
UNKNOWN_TEAM = "팀을 찾을 수 없어요"
CREATE_FAILED = "계정을 만들지 못했어요"

# 롤백 삭제가 일시 장애로 실패하면 이 간격(초)으로 다시 시도한다
DELETE_RETRY_DELAYS: tuple[float, ...] = (0, 0.5, 1.5)


def _parse_request(payload: Any) -> CreateUserRequest:
    """요청 본문 검증. FastAPI 기본 422는 detail[].input에 입력값(비밀번호 포함)을 그대로 돌려주므로
    여기서 직접 검증하고 입력값·context를 뺀 오류만 돌려준다."""
    try:
        return CreateUserRequest.model_validate(payload)
    except ValidationError as error:
        detail = [
            {"type": e["type"], "loc": ["body", *e["loc"]], "msg": e["msg"]}
            for e in error.errors(include_url=False, include_context=False, include_input=False)
        ]
        raise HTTPException(status_code=422, detail=detail) from None


def _team_in_org(user: CurrentUser, team_id: str) -> bool:
    rows = (
        user_client(user.token)
        .table("teams")
        .select("id")
        .eq("id", team_id)
        .eq("org_id", user.org_id)
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)


def _create_auth_user(admin: Client, email: str, password: str) -> tuple[str, str]:
    """인증 계정을 만들고 (id, 정규화된 메일)을 돌려준다."""
    try:
        created = admin.auth.admin.create_user({"email": email, "password": password, "email_confirm": True})
    except AuthApiError as error:
        if error.code in ("email_exists", "user_already_exists"):
            raise HTTPException(status_code=409, detail=DUPLICATE_EMAIL) from None
        if error.code == "weak_password":
            raise HTTPException(status_code=422, detail="비밀번호가 너무 단순해요") from None
        logger.error("auth create_user failed: status=%s code=%s", error.status, error.code)
        raise HTTPException(status_code=500, detail=CREATE_FAILED) from None
    except Exception as error:  # noqa: BLE001 - 원인 종류만 남긴다
        logger.error("auth create_user failed: %s", type(error).__name__)
        raise HTTPException(status_code=500, detail=CREATE_FAILED) from None
    return created.user.id, created.user.email or email


def _insert_profile(admin: Client, profile: dict) -> None:
    admin.table("profiles").insert(profile).execute()


def _start_onboarding(admin: Client, user_id: str) -> None:
    admin.rpc("_start_onboarding", {"p_new_hire": user_id}).execute()


def _delete_auth_user_once(admin: Client, user_id: str) -> None:
    admin.auth.admin.delete_user(user_id)


def _delete_auth_user(admin: Client, user_id: str) -> None:
    """반쪽 계정을 남기지 않도록 삭제를 몇 번 다시 시도한다. 끝내 실패하면 수동 정리를 위해 id를 남긴다."""
    for attempt, delay in enumerate(DELETE_RETRY_DELAYS, start=1):
        if delay:
            time.sleep(delay)
        try:
            _delete_auth_user_once(admin, user_id)
            return
        except Exception as error:  # noqa: BLE001
            logger.warning("auth user cleanup attempt %d failed for %s: %s", attempt, user_id, type(error).__name__)
    logger.error("ORPHAN_AUTH_USER %s: cleanup failed; delete it in Supabase Auth", user_id)


@router.post("/users", status_code=201, response_model=CreateUserResponse)
def create_user(
    payload: Annotated[Any, Body()],
    user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    # 동기 함수: FastAPI가 스레드에서 실행하므로 supabase-py 동기 호출이 이벤트 루프를 막지 않는다
    req = _parse_request(payload)
    if req.team_id is not None and not _team_in_org(user, str(req.team_id)):
        raise HTTPException(status_code=422, detail=UNKNOWN_TEAM)

    try:
        admin = service_client()
    except Exception as error:  # noqa: BLE001 - 관리자 키 미설정 등
        logger.error("service client unavailable: %s", type(error).__name__)
        raise HTTPException(status_code=500, detail=CREATE_FAILED) from None

    new_id, email = _create_auth_user(admin, req.email, req.password)
    try:
        _insert_profile(admin, {
            "id": new_id,
            "org_id": user.org_id,
            "email": email,
            "full_name": req.full_name,
            "job_title": req.job_title,
            "role": req.role,
            "department": req.department,
            "team_id": str(req.team_id) if req.team_id else None,
            "hire_date": req.hire_date.isoformat() if req.hire_date else None,
            "needs_hq_access": req.needs_hq_access,
            "is_seed": False,
        })
        if req.role == "new_hire":
            _start_onboarding(admin, new_id)
    except Exception as error:  # noqa: BLE001 - 반쪽 계정을 남기지 않는다(Review Focus 5)
        logger.error("user setup failed after auth create (%s); deleting auth user %s", type(error).__name__, new_id)
        _delete_auth_user(admin, new_id)
        raise HTTPException(status_code=500, detail=CREATE_FAILED) from None

    logger.info("admin %s created user %s (%s)", user.id, new_id, req.role)
    return {"id": new_id}
