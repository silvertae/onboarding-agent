"""CORS: 허용 목록과 미리보기 주소 패턴만 허용한다."""

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

LISTED = "https://onboarding-staging.web.app"
PREVIEW = "https://onboarding-staging--pr-12-abc123.web.app"
OTHER = "https://evil.example.com"


def client() -> TestClient:
    settings = Settings(
        allowed_origins=f"http://localhost:5173, {LISTED}",
        allowed_origin_regex=r"https://onboarding-staging--pr-\d+-[a-z0-9]+\.web\.app",
    )
    return TestClient(create_app(settings))


def preflight(origin: str):
    return client().options(
        "/health",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type",
        },
    )


def test_cors_allows_listed_origin():
    res = preflight(LISTED)
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == LISTED
    assert "authorization" in res.headers["access-control-allow-headers"].lower()
    assert client().get("/health", headers={"Origin": LISTED}).headers["access-control-allow-origin"] == LISTED


def test_cors_allows_regex_origin():
    res = preflight(PREVIEW)
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == PREVIEW


def test_cors_rejects_other_origin():
    res = preflight(OTHER)
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers
    assert "access-control-allow-origin" not in client().get("/health", headers={"Origin": OTHER}).headers
