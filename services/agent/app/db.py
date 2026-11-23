"""Supabase 클라이언트.

- user_client: 공개 키 + 사용자 토큰. RLS가 그대로 적용된다. 에이전트의 모든 조회는 이것을 쓴다.
- service_client: 관리자 키. RLS를 우회하므로 app/admin_routes.py와 scripts/에서만 쓴다.

user_client는 요청마다 만들지만 연결 풀(_shared_http)은 함께 쓴다. 새 연결을 맺는 비용(조회 1번에 약 70ms)을
줄이려는 것이다. 토큰은 클라이언트마다 요청 헤더로 붙고(postgrest·storage가 요청마다 헤더를 넘긴다),
공유 풀 자체에는 헤더를 두지 않으며 쿠키도 저장하지 않는다. 사용자끼리 인증 정보가 섞이지 않는다.
"""

from functools import lru_cache
from http.cookiejar import Cookie, CookieJar

import httpx
from supabase import Client, ClientOptions, create_client

from app.config import get_settings


# supabase-py가 직접 만들 때와 같은 시간 제한(postgrest 기본 120초)
HTTP_TIMEOUT = 120


class _NoCookieJar(CookieJar):
    """응답의 Set-Cookie를 저장하지 않는다. 공유 풀로 다른 사용자 요청에 쿠키가 실려 가지 않게 한다."""

    def set_cookie(self, cookie: Cookie) -> None:
        return None

    def extract_cookies(self, response, request) -> None:  # noqa: ANN001 (urllib 타입)
        return None


def _new_http_client(transport: httpx.BaseTransport | None = None) -> httpx.Client:
    return httpx.Client(
        timeout=HTTP_TIMEOUT,
        follow_redirects=True,
        http2=True,
        cookies=_NoCookieJar(),
        transport=transport,
    )


@lru_cache
def _shared_http() -> httpx.Client:
    """user_client들이 함께 쓰는 연결 풀. 헤더와 쿠키를 담지 않는다. 닫지 않는다(프로세스와 수명이 같다)."""
    return _new_http_client()


def _server_options(headers: dict[str, str] | None = None) -> ClientOptions:
    # 서버에서는 세션을 저장하거나 갱신하지 않는다(요청 사이에 상태를 갖지 않는다)
    return ClientOptions(headers=headers or {}, auto_refresh_token=False, persist_session=False)


def user_client(token: str) -> Client:
    settings = get_settings()
    options = _server_options({"Authorization": f"Bearer {token}"})
    options.httpx_client = _shared_http()
    return create_client(settings.supabase_url, settings.supabase_anon_key, options)


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
