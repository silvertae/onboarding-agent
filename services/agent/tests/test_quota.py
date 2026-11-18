"""하루 사용 한도 (로컬 Supabase + 부트스트랩 계정 필요)."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi import Depends, HTTPException
from fastapi.testclient import TestClient

from app.auth import CurrentUser, current_user
from app.config import Settings, get_settings
from app.main import create_app
from app.quota import enforce_quota


@pytest.fixture
def chat_limit_two(monkeypatch):
    monkeypatch.setenv("CHAT_DAILY_LIMIT", "2")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_quota_429_after_limit(chat_limit_two, service, newhire_token):
    hire = service.table("profiles").select("id").eq("email", "newhire@demo.test").single().execute().data
    today = datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
    service.table("usage_counters").delete().eq("user_id", hire["id"]).eq("day", today).execute()

    app = create_app(Settings())

    @app.post("/_test/chat")
    async def chat(user: CurrentUser = Depends(current_user)) -> dict:
        enforce_quota(user, "chat")
        return {"ok": True}

    client = TestClient(app)
    headers = {"Authorization": f"Bearer {newhire_token}"}
    try:
        assert client.post("/_test/chat", headers=headers).status_code == 200
        assert client.post("/_test/chat", headers=headers).status_code == 200
        third = client.post("/_test/chat", headers=headers)
        assert third.status_code == 429
        assert third.json() == {"detail": "오늘 사용 한도를 넘었어요"}
    finally:
        service.table("usage_counters").delete().eq("user_id", hire["id"]).eq("day", today).execute()


class _FakeRpc:
    def __init__(self, calls, name, params):
        calls.append((name, params))

    def execute(self):
        return type("R", (), {"data": False})()


class _FakeClient:
    def __init__(self):
        self.calls = []

    def rpc(self, name, params):
        return _FakeRpc(self.calls, name, params)


@pytest.mark.parametrize(
    "kind,env",
    [("document", "DOCUMENT_DAILY_LIMIT"), ("draft", "DRAFT_DAILY_LIMIT")],
)
def test_document_and_draft_limits_use_their_settings(kind, env, monkeypatch):
    monkeypatch.setenv(env, "0")
    get_settings.cache_clear()
    fake = _FakeClient()
    monkeypatch.setattr("app.quota.user_client", lambda token: fake)
    try:
        with pytest.raises(HTTPException) as exc:
            enforce_quota(CurrentUser(id="u", token="t", role="member", department=None, team_id=None, org_id="o"), kind)
    finally:
        get_settings.cache_clear()
    assert exc.value.status_code == 429
    assert fake.calls == [("consume_quota", {"p_kind": kind, "p_limit": 0})]
