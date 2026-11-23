"""user_client 연결 재사용. 사용자 클라이언트끼리 연결 풀만 같이 쓰고 토큰·쿠키는 섞이지 않아야 한다.

실제 Supabase 대신 httpx MockTransport로 요청 헤더를 기록한다(로컬 Supabase가 필요 없다).
"""

import httpx
import pytest

from app import db


@pytest.fixture
def seen(monkeypatch):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=[], headers={"Set-Cookie": "tracker=abc; Path=/"})

    client = db._new_http_client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(db, "_shared_http", lambda: client)
    return requests


def test_user_clients_share_one_connection_pool(seen):
    a = db.user_client("token-a")
    b = db.user_client("token-b")

    assert a.postgrest.session is b.postgrest.session


def test_each_request_carries_its_own_token(seen):
    a = db.user_client("token-a")
    b = db.user_client("token-b")

    a.table("profiles").select("id").execute()
    b.table("profiles").select("id").execute()
    a.rpc("consume_quota", {"p_kind": "chat", "p_limit": 1}).execute()

    assert [r.headers["Authorization"] for r in seen] == ["Bearer token-a", "Bearer token-b", "Bearer token-a"]


def test_shared_pool_holds_no_token_or_cookie(seen):
    db.user_client("token-a").table("profiles").select("id").execute()
    db.user_client("token-b").table("profiles").select("id").execute()

    assert "cookie" not in seen[1].headers
    shared = db._shared_http()
    assert "authorization" not in shared.headers
    assert len(shared.cookies) == 0


def test_shared_pool_is_created_once():
    db._shared_http.cache_clear()
    try:
        assert db._shared_http() is db._shared_http()
    finally:
        db._shared_http.cache_clear()
