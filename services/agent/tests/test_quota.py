"""하루 사용 한도 (로컬 Supabase + 부트스트랩 계정 필요)."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi import Depends
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
