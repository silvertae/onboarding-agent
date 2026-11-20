"""bootstrap_forms.py 통합 테스트 (로컬 Supabase 필요: supabase start 후 npm run test:agent)."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from supabase import create_client

AGENT_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = AGENT_DIR.parents[1]
SEED_DIR = REPO_DIR / "supabase" / "seed-forms"
ORG_ID = "00000000-0000-0000-0000-000000000001"
SEED_FORMS = [
    ("AC-01", "법인카드 신청서.xlsx"),
    ("AC-01", "법인카드 사용 동의서.docx"),
    ("HR-08", "소득세 감면 신청서.pdf"),
    ("GA-07", "명함 신청서.xlsx"),
]


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        pytest.fail(f"환경변수 {name}가 없습니다. 'supabase start' 후 'npm run test:agent'로 실행하세요.")
    return value


def _run(env: dict) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "scripts/bootstrap_forms.py"],
        cwd=AGENT_DIR, env=env, capture_output=True, text=True, timeout=120,
    )


@pytest.fixture(scope="module")
def admin():
    return create_client(_env("SUPABASE_URL"), _env("SUPABASE_SERVICE_ROLE_KEY"))


@pytest.fixture(scope="module")
def runs() -> list[subprocess.CompletedProcess]:
    for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        _env(name)
    results = [_run(os.environ.copy()) for _ in range(2)]
    for r in results:
        assert r.returncode == 0, r.stderr
    return results


def _seed_rows(admin) -> list[dict]:
    rows = (
        admin.table("task_template_files")
        .select("file_name, size_bytes, storage_path, is_seed, uploaded_by, task_templates(code)")
        .eq("org_id", ORG_ID).eq("is_seed", True).execute().data
    )
    return rows


def test_seed_files_are_small():
    for code, name in SEED_FORMS:
        path = SEED_DIR / code / name
        assert path.is_file(), f"{path} 없음"
        assert path.stat().st_size <= 100 * 1024


def test_four_seed_rows_after_two_runs(runs, admin):
    rows = _seed_rows(admin)
    assert len(rows) == 4
    got = {(r["task_templates"]["code"], r["file_name"]): r for r in rows}
    assert sorted(got) == sorted(SEED_FORMS)
    for (code, name), row in got.items():
        assert row["size_bytes"] == (SEED_DIR / code / name).stat().st_size
        assert row["uploaded_by"] is None


def test_objects_match_repository_bytes(runs, admin):
    for row in _seed_rows(admin):
        code = row["task_templates"]["code"]
        data = admin.storage.from_("task-forms").download(row["storage_path"])
        assert data == (SEED_DIR / code / row["file_name"]).read_bytes()


def test_missing_service_key_exits_2_without_leaking():
    env = {k: v for k, v in os.environ.items() if k != "SUPABASE_SERVICE_ROLE_KEY"}
    r = _run(env)
    assert r.returncode == 2
    assert "SUPABASE_SERVICE_ROLE_KEY" in r.stderr
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    assert key and key not in r.stdout + r.stderr


def test_missing_seed_files_exit_2_and_name_them(tmp_path):
    env = {**os.environ, "SEED_FORMS_DIR": str(tmp_path)}
    r = _run(env)
    assert r.returncode == 2
    for code, name in SEED_FORMS:
        assert f"{code}/{name}" in r.stderr
    assert os.environ["SUPABASE_SERVICE_ROLE_KEY"] not in r.stdout + r.stderr


def test_unreachable_server_exits_1_without_traceback_or_key():
    env = {**os.environ, "SUPABASE_URL": "http://127.0.0.1:9"}
    r = _run(env)
    assert r.returncode == 1
    assert "Traceback" not in r.stderr
    assert "실패" in r.stderr
    assert os.environ["SUPABASE_SERVICE_ROLE_KEY"] not in r.stdout + r.stderr
