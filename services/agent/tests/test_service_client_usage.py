"""관리자 키 클라이언트(service_client)는 정해진 곳에서만 쓴다."""

import ast
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1] / "app"
ALLOWED = {"db.py", "admin_routes.py"}


def _mentions_service_client(path: Path) -> bool:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "service_client":
            return True
        if isinstance(node, ast.ImportFrom) and any(a.name == "service_client" for a in node.names):
            return True
        if isinstance(node, ast.Attribute) and node.attr == "service_client":
            return True
        if isinstance(node, ast.Name) and node.id == "service_client":
            return True
    return False


def test_service_client_only_in_admin_and_scripts():
    users = {p.name for p in APP_DIR.rglob("*.py") if _mentions_service_client(p)}
    assert users <= ALLOWED, f"service_client는 {sorted(ALLOWED)}에서만 쓸 수 있다: {sorted(users - ALLOWED)}"
    assert "db.py" in users, "db.py가 service_client를 정의해야 한다"
