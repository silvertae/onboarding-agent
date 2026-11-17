"""토큰 검증·역할 확인·사용자 토큰 클라이언트 (로컬 Supabase + 부트스트랩 계정 필요)."""

from dataclasses import asdict

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from app.auth import CurrentUser, current_user, require_role
from app.config import Settings
from app.db import user_client
from app.main import create_app

from .conftest import AI_TEAM_ID, require_env


@pytest.fixture(scope="module")
def client() -> TestClient:
    app = create_app(Settings())

    @app.get("/_test/me")
    async def me(user: CurrentUser = Depends(current_user)) -> dict:
        data = asdict(user)
        data.pop("token")
        return data

    @app.get("/_test/trainer-only", dependencies=[Depends(require_role("team_trainer"))])
    async def trainer_only() -> dict:
        return {"ok": True}

    return TestClient(app)


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_missing_token_401(client):
    res = client.get("/_test/me")
    assert res.status_code == 401


def test_garbage_token_401(client):
    assert client.get("/_test/me", headers=bearer("not-a-jwt")).status_code == 401
    assert client.get("/_test/me", headers={"Authorization": "Basic abc"}).status_code == 401


def test_signed_out_token_401(client):
    from supabase import create_client

    supa = create_client(require_env("SUPABASE_URL"), require_env("SUPABASE_ANON_KEY"))
    session = supa.auth.sign_in_with_password(
        {"email": "newhire@demo.test", "password": require_env("DEMO_PASSWORD")}
    ).session
    assert session is not None
    token = session.access_token
    assert client.get("/_test/me", headers=bearer(token)).status_code == 200

    supa.auth.sign_out({"scope": "local"})  # 이 세션만 끝낸다(다른 테스트 토큰은 유지)

    assert client.get("/_test/me", headers=bearer(token)).status_code == 401


def test_current_user_fields(client, newhire_token):
    res = client.get("/_test/me", headers=bearer(newhire_token))
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == "new_hire"
    assert body["team_id"] == AI_TEAM_ID
    assert body["department"] is None
    assert body["org_id"] == "00000000-0000-0000-0000-000000000001"


def test_require_role_403(client, newhire_token, trainer_token):
    assert client.get("/_test/trainer-only", headers=bearer(newhire_token)).status_code == 403
    assert client.get("/_test/trainer-only", headers=bearer(trainer_token)).status_code == 200


def test_user_client_respects_rls(service, newhire_token, trainer_token):
    exam = service.table("exams").insert({
        "org_id": "00000000-0000-0000-0000-000000000001", "team_id": AI_TEAM_ID,
        "title": "RLS 확인용", "topic": "테스트", "difficulty": "beginner",
    }).execute().data[0]
    try:
        assert user_client(newhire_token).table("exams").select("id").execute().data == []
        trainer_rows = user_client(trainer_token).table("exams").select("id").eq("id", exam["id"]).execute().data
        assert len(trainer_rows) == 1
    finally:
        service.table("exams").delete().eq("id", exam["id"]).execute()
