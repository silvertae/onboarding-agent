import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_health_returns_ok_and_version(monkeypatch):
    monkeypatch.setenv("GIT_SHA", "abc")
    client = TestClient(create_app(Settings()))

    res = client.get("/health")

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["version"] == "abc"


def test_health_version_defaults_to_dev(monkeypatch):
    monkeypatch.delenv("GIT_SHA", raising=False)
    client = TestClient(create_app(Settings()))

    assert client.get("/health").json() == {"ok": True, "version": "dev"}


def test_missing_required_setting_fails_at_startup(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)

    with pytest.raises(Exception):
        Settings()
