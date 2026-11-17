"""관리자 계정 등록 API (로컬 Supabase + 부트스트랩 계정 필요).

여러 세션이 같은 로컬 DB를 쓰므로 테스트 계정 메일은 실행마다 겹치지 않게 만들고, 끝나면 지운다.
"""

import logging
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

from .conftest import AI_TEAM_ID, require_env, sign_in

ORG_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app(Settings()))


@pytest.fixture
def admin_token() -> str:
    return sign_in(require_env("ADMIN_EMAIL"), require_env("ADMIN_PASSWORD"))


@pytest.fixture
def ops_token() -> str:
    return sign_in("hr@demo.test", require_env("DEMO_PASSWORD"))


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def unique_email(prefix: str) -> str:
    return f"t17-{prefix}-{uuid.uuid4().hex[:12]}@demo.test"


def auth_user_id(service, email: str) -> str | None:
    page = 1
    while True:
        users = service.auth.admin.list_users(page=page, per_page=1000)
        for user in users:
            if user.email and user.email.lower() == email.lower():
                return user.id
        if len(users) < 1000:
            return None
        page += 1


@pytest.fixture
def created(service):
    """테스트가 만든 메일 목록. 끝나면 인증 계정을 지운다(프로필·과제는 cascade)."""
    emails: list[str] = []
    yield emails
    for email in emails:
        user_id = auth_user_id(service, email)
        if user_id:
            service.auth.admin.delete_user(user_id)


def new_hire_body(email: str, **overrides) -> dict:
    body = {
        "email": email,
        "password": f"pw-{uuid.uuid4().hex[:10]}",
        "full_name": "테스트 신입",
        "job_title": "사원",
        "role": "new_hire",
        "team_id": AI_TEAM_ID,
        "hire_date": date.today().isoformat(),
    }
    body.update(overrides)
    return body


def ops_body(email: str, **overrides) -> dict:
    body = {
        "email": email,
        "password": f"pw-{uuid.uuid4().hex[:10]}",
        "full_name": "테스트 인사",
        "job_title": "대리",
        "role": "ops_staff",
        "department": "hr",
    }
    body.update(overrides)
    return body


def test_requires_admin(client, newhire_token, trainer_token, ops_token, created):
    email = unique_email("forbidden")
    created.append(email)
    for token in (newhire_token, trainer_token, ops_token):
        res = client.post("/admin/users", json=ops_body(email), headers=bearer(token))
        assert res.status_code == 403
    assert client.post("/admin/users", json=ops_body(email)).status_code == 401


def test_create_new_hire(client, admin_token, service, created):
    email = unique_email("hire")
    created.append(email)
    body = new_hire_body(email)

    res = client.post("/admin/users", json=body, headers=bearer(admin_token))

    assert res.status_code == 201, res.text
    new_id = res.json()["id"]
    sign_in(email, body["password"])  # 새 계정으로 로그인된다
    profile = service.table("profiles").select("*").eq("id", new_id).single().execute().data
    assert profile["is_seed"] is False
    assert profile["org_id"] == ORG_ID
    assert profile["role"] == "new_hire"
    assert profile["team_id"] == AI_TEAM_ID
    assert profile["needs_hq_access"] is True
    tasks = service.table("task_instances").select("id", count="exact").eq("new_hire_id", new_id).execute()
    assert tasks.count == 31


def test_create_ops_staff(client, admin_token, service, created):
    email = unique_email("ops")
    created.append(email)
    body = ops_body(email)

    res = client.post("/admin/users", json=body, headers=bearer(admin_token))

    assert res.status_code == 201, res.text
    new_id = res.json()["id"]
    token = sign_in(email, body["password"])
    from app.db import user_client

    rows = user_client(token).table("profiles").select("role, department").eq("id", new_id).execute().data
    assert rows == [{"role": "ops_staff", "department": "hr"}]
    tasks = service.table("task_instances").select("id", count="exact").eq("new_hire_id", new_id).execute()
    assert tasks.count == 0


def test_role_admin_rejected(client, admin_token, service, created):
    email = unique_email("admin")
    created.append(email)
    res = client.post("/admin/users", json=ops_body(email, role="admin"), headers=bearer(admin_token))
    assert res.status_code == 422
    assert auth_user_id(service, email) is None


@pytest.mark.parametrize(
    "make_body",
    [
        lambda e: ops_body(e, department=None),                              # ops_staff에 부서 없음
        lambda e: ops_body(e, team_id=AI_TEAM_ID),                           # ops_staff에 팀
        lambda e: new_hire_body(e, hire_date=None),                          # 신입에 입사일 없음
        lambda e: new_hire_body(e, team_id=None),                            # 신입에 팀 없음
        lambda e: new_hire_body(e, department="hr"),                         # 신입에 부서
        lambda e: new_hire_body(e, role="team_trainer", hire_date=None, team_id=None),  # 교육 담당자에 팀 없음
        lambda e: ops_body(e, password="short7!"),                           # 비밀번호 7자
        lambda e: ops_body(e, password="x" * 73),                            # 비밀번호 73자
        lambda e: ops_body(e, full_name=""),                                 # 이름 비어 있음
        lambda e: {**ops_body(e), "email": "not-an-email"},                  # 메일 형식
    ],
    ids=["ops-no-dept", "ops-with-team", "hire-no-date", "hire-no-team", "hire-with-dept",
         "trainer-no-team", "pw-7", "pw-73", "empty-name", "bad-email"],
)
def test_field_rules(client, admin_token, service, created, make_body):
    email = unique_email("rules")
    created.append(email)
    res = client.post("/admin/users", json=make_body(email), headers=bearer(admin_token))
    assert res.status_code == 422, res.text
    assert auth_user_id(service, email) is None


def test_unknown_team(client, admin_token, service, created):
    other_org = service.table("orgs").insert({"name": "t17 다른 조직"}).execute().data[0]
    other_team = service.table("teams").insert({"org_id": other_org["id"], "name": "t17 다른 팀"}).execute().data[0]
    try:
        for team_id in (other_team["id"], str(uuid.uuid4())):
            email = unique_email("team")
            created.append(email)
            res = client.post("/admin/users", json=new_hire_body(email, team_id=team_id), headers=bearer(admin_token))
            assert res.status_code == 422, res.text
            assert auth_user_id(service, email) is None
    finally:
        service.table("teams").delete().eq("id", other_team["id"]).execute()
        service.table("orgs").delete().eq("id", other_org["id"]).execute()


def test_duplicate_email_409(client, admin_token, service, created):
    email = unique_email("dup")
    created.append(email)
    assert client.post("/admin/users", json=ops_body(email), headers=bearer(admin_token)).status_code == 201
    before = service.table("profiles").select("id", count="exact").eq("email", email).execute().count

    # 대소문자만 다른 같은 메일도 같은 계정이다
    res = client.post("/admin/users", json=ops_body(email.upper()), headers=bearer(admin_token))

    assert res.status_code == 409
    assert res.json()["detail"] == "이미 등록된 메일이에요"
    after = service.table("profiles").select("id", count="exact").eq("email", email).execute().count
    assert before == after == 1


def test_rollback_on_profile_failure(client, admin_token, service, created, monkeypatch):
    from app import admin_routes

    def broken_insert(*_args, **_kwargs):
        raise RuntimeError("profiles 삽입 실패(테스트)")

    monkeypatch.setattr(admin_routes, "_insert_profile", broken_insert)
    email = unique_email("rollback")
    created.append(email)

    res = client.post("/admin/users", json=new_hire_body(email), headers=bearer(admin_token))

    assert res.status_code == 500
    assert auth_user_id(service, email) is None
    assert service.table("profiles").select("id").eq("email", email).execute().data == []


def test_rollback_on_onboarding_failure(client, admin_token, service, created, monkeypatch):
    from app import admin_routes

    def broken_start(*_args, **_kwargs):
        raise RuntimeError("온보딩 시작 실패(테스트)")

    monkeypatch.setattr(admin_routes, "_start_onboarding", broken_start)
    email = unique_email("rollback-start")
    created.append(email)

    res = client.post("/admin/users", json=new_hire_body(email), headers=bearer(admin_token))

    assert res.status_code == 500
    assert auth_user_id(service, email) is None
    assert service.table("profiles").select("id").eq("email", email).execute().data == []


def test_password_not_logged(client, admin_token, created, caplog, monkeypatch):
    from app import admin_routes

    email = unique_email("log")
    created.append(email)
    body = new_hire_body(email)
    caplog.set_level(logging.DEBUG)

    assert client.post("/admin/users", json=body, headers=bearer(admin_token)).status_code == 201
    # 실패 경로(롤백 로그)도 확인한다
    monkeypatch.setattr(admin_routes, "_insert_profile", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    failing = new_hire_body(unique_email("log-fail"), password=body["password"] + "Z")
    created.append(failing["email"])
    assert client.post("/admin/users", json=failing, headers=bearer(admin_token)).status_code == 500

    assert caplog.records, "로그가 캡처되지 않으면 이 테스트는 의미가 없다"
    assert body["password"] not in caplog.text
    assert failing["password"] not in caplog.text


@pytest.mark.parametrize(
    "make_body",
    [
        lambda e: ops_body(e, password="short7!"),               # 필드 검증 실패
        lambda e: ops_body(e, department=None),                  # 모델 검증 실패(요청 전체가 input이 된다)
        lambda e: {**new_hire_body(e), "hire_date": "not-a-date"},
    ],
    ids=["field", "model", "type"],
)
def test_validation_error_hides_password(client, admin_token, created, make_body):
    """422 응답 본문에 비밀번호가 들어가지 않는다 (Codex P0, SECURITY.md)."""
    email = unique_email("v")
    created.append(email)
    body = make_body(email)

    res = client.post("/admin/users", json=body, headers=bearer(admin_token))

    assert res.status_code == 422
    assert body["password"] not in res.text
    detail = res.json()["detail"]
    assert isinstance(detail, list) and detail
    assert all("input" not in d and "ctx" not in d for d in detail)
    assert all(d["loc"][0] == "body" for d in detail)


def test_rollback_retries_auth_delete(client, admin_token, service, created, monkeypatch):
    """롤백 삭제가 일시적으로 실패해도 다시 시도해 인증 계정을 남기지 않는다 (Codex P1)."""
    from app import admin_routes

    monkeypatch.setattr(admin_routes, "_insert_profile", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    monkeypatch.setattr(admin_routes, "DELETE_RETRY_DELAYS", (0, 0, 0))
    real_delete_user = admin_routes._delete_auth_user_once
    calls = {"n": 0}

    def flaky_delete(admin, user_id):
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError("인증 서버 일시 장애(테스트)")
        real_delete_user(admin, user_id)

    monkeypatch.setattr(admin_routes, "_delete_auth_user_once", flaky_delete)
    email = unique_email("retry")
    created.append(email)

    res = client.post("/admin/users", json=new_hire_body(email), headers=bearer(admin_token))

    assert res.status_code == 500
    assert calls["n"] == 3
    assert auth_user_id(service, email) is None
