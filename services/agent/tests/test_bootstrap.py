"""bootstrap_accounts.py 통합 테스트 (로컬 Supabase 필요: supabase start 후 npm run test:agent)."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from supabase import create_client

AGENT_DIR = Path(__file__).resolve().parents[1]
DEMO_EMAILS = ["newhire@demo.test", "trainer@demo.test", "hr@demo.test", "ga@demo.test", "acc@demo.test"]


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        pytest.fail(f"환경변수 {name}가 없습니다. 'supabase start' 후 'npm run test:agent'로 실행하세요.")
    return value


@pytest.fixture(scope="module")
def runs() -> list[subprocess.CompletedProcess]:
    """스크립트를 두 번 실행한 결과."""
    for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PASSWORD", "DEMO_PASSWORD"):
        _env(name)
    results = [
        subprocess.run(
            [sys.executable, "scripts/bootstrap_accounts.py"],
            cwd=AGENT_DIR,
            env=os.environ.copy(),
            capture_output=True,
            text=True,
            timeout=120,
        )
        for _ in range(2)
    ]
    for r in results:
        assert r.returncode == 0, r.stderr
    return results


@pytest.fixture(scope="module")
def admin():
    return create_client(_env("SUPABASE_URL"), _env("SUPABASE_SERVICE_ROLE_KEY"))


def _seed_emails() -> list[str]:
    return [os.environ.get("ADMIN_EMAIL") or "admin@demo.test", *DEMO_EMAILS]


def test_six_seed_profiles_exactly_once_after_two_runs(runs, admin):
    rows = admin.table("profiles").select("email, role, is_seed").in_("email", _seed_emails()).execute().data
    by_email = {}
    for row in rows:
        by_email.setdefault(row["email"], []).append(row)

    assert sorted(by_email) == sorted(_seed_emails())
    assert all(len(v) == 1 for v in by_email.values())
    assert all(v[0]["is_seed"] for v in by_email.values())
    roles = {email: v[0]["role"] for email, v in by_email.items()}
    assert roles["newhire@demo.test"] == "new_hire"
    assert roles["trainer@demo.test"] == "team_trainer"
    assert roles[_seed_emails()[0]] == "admin"


def test_new_hire_has_31_task_instances(runs, admin):
    hire = admin.table("profiles").select("id").eq("email", "newhire@demo.test").single().execute().data
    count = (
        admin.table("task_instances").select("id", count="exact").eq("new_hire_id", hire["id"]).execute().count
    )
    assert count == 31


def test_all_six_accounts_sign_in_with_env_passwords(runs):
    url, anon = _env("SUPABASE_URL"), _env("SUPABASE_ANON_KEY")
    passwords = {email: _env("DEMO_PASSWORD") for email in DEMO_EMAILS}
    passwords[_seed_emails()[0]] = _env("ADMIN_PASSWORD")

    for email, password in passwords.items():
        client = create_client(url, anon)
        res = client.auth.sign_in_with_password({"email": email, "password": password})
        assert res.session is not None, email
        client.auth.sign_out()


def test_output_never_contains_passwords(runs):
    output = "".join(r.stdout + r.stderr for r in runs)
    assert output.strip(), "스크립트가 진행 상황을 출력해야 한다"
    assert _env("ADMIN_PASSWORD") not in output
    assert _env("DEMO_PASSWORD") not in output


# ── 후속 단계 실패 시 보상 처리 (Codex P1) ────────────────────────────
def _load_script():
    import importlib.util

    spec = importlib.util.spec_from_file_location("bootstrap_accounts", AGENT_DIR / "scripts" / "bootstrap_accounts.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _broken_account(email: str) -> dict:
    # ops_staff인데 부서가 없어 profiles 제약(profiles_ops_department)에 걸린다
    return {"org_id": "00000000-0000-0000-0000-000000000001", "is_seed": True, "email": email,
            "password": "broken-test-pw-1", "full_name": "실패 테스트", "job_title": "대리", "role": "ops_staff"}


def _user_id(admin, email: str) -> str | None:
    return next((u.id for u in admin.auth.admin.list_users(per_page=1000) if u.email == email), None)


def test_new_auth_user_is_deleted_when_profile_insert_fails(admin):
    script = _load_script()
    email = "bootstrap-rollback-new@demo.test"
    if leftover := _user_id(admin, email):  # 이전 실패 실행이 남긴 계정 정리
        admin.auth.admin.delete_user(leftover)

    with pytest.raises(Exception):
        script.ensure_account(admin, _broken_account(email), known={})

    assert _user_id(admin, email) is None, "새로 만든 인증 계정이 남아 있다(반쪽 계정)"


def test_existing_auth_user_is_kept_when_profile_insert_fails(admin):
    script = _load_script()
    email = "bootstrap-rollback-existing@demo.test"
    user_id = admin.auth.admin.create_user({"email": email, "password": "existing-pw-1", "email_confirm": True}).user.id
    try:
        with pytest.raises(Exception):
            script.ensure_account(admin, _broken_account(email), known={email: user_id})
        assert _user_id(admin, email) == user_id, "기존 계정은 지우면 안 된다"
    finally:
        admin.auth.admin.delete_user(user_id)
