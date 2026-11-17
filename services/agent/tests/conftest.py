import os

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
