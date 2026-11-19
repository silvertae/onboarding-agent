import os
import uuid
from datetime import date
from types import SimpleNamespace

import pytest

# 앱 모듈을 import하기 전에 시작 시 필수 환경변수를 채운다.
# npm run test:agent는 with-local-env.sh로 실제 로컬 값을 넣으므로 이 기본값은 쓰이지 않는다.
os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

AI_TEAM_ID = "00000000-0000-0000-0000-000000000002"


def require_env(name: str) -> str:
    """로컬 Supabase가 필요한 테스트용. 없으면 건너뛰지 않고 이유를 밝히며 실패한다."""
    value = os.environ.get(name)
    if not value:
        pytest.fail(f"환경변수 {name}가 없습니다. 'supabase start && npm run db:reset' 후 'npm run test:agent'로 실행하세요.")
    return value


@pytest.fixture(scope="session")
def service():
    """테스트 준비·정리용 관리자 클라이언트(앱 코드에서는 쓰지 않는다)."""
    from supabase import create_client

    return create_client(require_env("SUPABASE_URL"), require_env("SUPABASE_SERVICE_ROLE_KEY"))


def sign_in(email: str, password: str) -> str:
    from supabase import create_client

    client = create_client(require_env("SUPABASE_URL"), require_env("SUPABASE_ANON_KEY"))
    session = client.auth.sign_in_with_password({"email": email, "password": password}).session
    assert session is not None, email
    return session.access_token


# 테스트마다 새로 로그인한다. 부트스트랩이 비밀번호를 다시 설정하면 기존 세션이 끊기기 때문이다.
@pytest.fixture
def newhire_token() -> str:
    return sign_in("newhire@demo.test", require_env("DEMO_PASSWORD"))


@pytest.fixture
def trainer_token() -> str:
    return sign_in("trainer@demo.test", require_env("DEMO_PASSWORD"))


@pytest.fixture
def make_org(service):
    """공유 로컬 DB의 시드 데이터를 건드리지 않도록 테스트에서 쓰는 임시 조직(팀 A·B). 사람·지식은 모두 가상이고 끝나면 지운다.

    org = make_org(); token = org.add_user("team_trainer", team_id=org.team_a); kid = org.add_knowledge("company", "질문", "답")
    """
    orgs: list[str] = []
    users: list[str] = []

    def make() -> SimpleNamespace:
        suffix = uuid.uuid4().hex[:10]
        org_id = service.table("orgs").insert({"name": f"임시 조직 {suffix}"}).execute().data[0]["id"]
        orgs.append(org_id)
        team_a, team_b = (
            service.table("teams")
            .insert([{"org_id": org_id, "name": f"팀A {suffix}"}, {"org_id": org_id, "name": f"팀B {suffix}"}])
            .execute()
            .data
        )

        def add_user(role: str, team_id: str | None = None, department: str | None = None) -> str:
            email = f"{role}-{uuid.uuid4().hex[:8]}@temp.test"
            password = f"pw-{uuid.uuid4().hex}"
            user_id = service.auth.admin.create_user({"email": email, "password": password, "email_confirm": True}).user.id
            users.append(user_id)
            service.table("profiles").insert(
                {
                    "id": user_id, "org_id": org_id, "email": email, "full_name": "임시 사용자", "role": role,
                    "team_id": team_id, "department": department,
                    "hire_date": date.today().isoformat() if role == "new_hire" else None,
                }
            ).execute()
            return sign_in(email, password)

        def add_knowledge(scope: str, question: str, answer: str, status: str = "published", team_id: str | None = None) -> str:
            row = {
                "org_id": org_id, "scope": scope, "team_id": team_id, "question": question, "answer": answer,
                "category": "테스트", "status": status,
            }
            return service.table("knowledge_items").insert(row).execute().data[0]["id"]

        return SimpleNamespace(id=org_id, team_a=team_a["id"], team_b=team_b["id"], add_user=add_user, add_knowledge=add_knowledge)

    yield make
    for user_id in users:
        service.auth.admin.delete_user(user_id)
    for org_id in orgs:
        service.table("knowledge_items").delete().eq("org_id", org_id).execute()  # 임베딩은 cascade
        service.table("teams").delete().eq("org_id", org_id).execute()
        service.table("orgs").delete().eq("id", org_id).execute()
