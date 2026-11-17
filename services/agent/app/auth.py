"""요청 토큰 검증. 토큰 검증은 이 모듈 한 곳에서만 한다.

Supabase Auth에 토큰을 보내 사용자를 확인한다(서명 방식에 의존하지 않고, 로그아웃한 세션도 거부된다).
그다음 사용자 토큰으로 profiles를 읽어 역할·소속을 얻는다(RLS 적용).
"""

from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException
from starlette.concurrency import run_in_threadpool
from supabase_auth.errors import AuthApiError, AuthError

from app.db import anon_client, user_client

UNAUTHORIZED = "로그인이 필요해요"


@dataclass(frozen=True)
class CurrentUser:
    id: str
    token: str
    role: str
    department: str | None
    team_id: str | None
    org_id: str


def _bearer_token(authorization: str | None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail=UNAUTHORIZED)
    return token.strip()


def _load_user(token: str) -> CurrentUser:
    try:
        user = anon_client().auth.get_user(token)
    except (AuthApiError, AuthError):
        # 만료·형식 오류·로그아웃한 세션
        raise HTTPException(status_code=401, detail=UNAUTHORIZED) from None
    except Exception:
        raise HTTPException(status_code=503, detail="인증 서버에 연결할 수 없어요") from None
    if user is None or user.user is None:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED)

    rows = (
        user_client(token)
        .table("profiles")
        .select("id, role, department, team_id, org_id")
        .eq("id", user.user.id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED)
    p = rows[0]
    return CurrentUser(
        id=p["id"], token=token, role=p["role"], department=p["department"],
        team_id=p["team_id"], org_id=p["org_id"],
    )


async def current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    # 토큰이 없을 때 FastAPI 기본값(422) 대신 401을 돌려주려고 기본값을 None으로 둔다
    token = _bearer_token(authorization)
    # supabase-py 동기 클라이언트이므로 이벤트 루프를 막지 않게 스레드에서 실행한다
    return await run_in_threadpool(_load_user, token)


def require_role(*roles: str) -> Callable:
    async def dependency(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="이 기능을 쓸 권한이 없어요")
        return user

    return dependency
