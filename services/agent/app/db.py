"""Supabase 클라이언트.

- user_client: 공개 키 + 사용자 토큰. RLS가 그대로 적용된다. 에이전트의 모든 조회는 이것을 쓴다.
- service_client: 관리자 키. RLS를 우회하므로 app/admin_routes.py와 scripts/에서만 쓴다.
"""

from functools import lru_cache

from supabase import Client, ClientOptions, create_client

from app.config import get_settings


def _server_options(headers: dict[str, str] | None = None) -> ClientOptions:
    # 서버에서는 세션을 저장하거나 갱신하지 않는다(요청 사이에 상태를 갖지 않는다)
    return ClientOptions(headers=headers or {}, auto_refresh_token=False, persist_session=False)


def user_client(token: str) -> Client:
    settings = get_settings()
    return create_client(
        settings.supabase_url,
        settings.supabase_anon_key,
        _server_options({"Authorization": f"Bearer {token}"}),
    )


@lru_cache
def anon_client() -> Client:
    """토큰 확인(auth.get_user)용. 세션을 저장하지 않으므로 요청 사이에 공유해도 된다."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_anon_key, _server_options())


def service_client() -> Client:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다")
    return create_client(settings.supabase_url, settings.supabase_service_role_key, _server_options())
