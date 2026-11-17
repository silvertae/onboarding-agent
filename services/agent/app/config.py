"""에이전트 서비스 설정. 환경변수 목록은 docs/contracts.md를 따른다.

시작 시 필수: SUPABASE_URL, SUPABASE_ANON_KEY.
SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENAI_MODEL은 쓰는 곳에서 확인한다.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # .env 파일은 읽지 않는다. 값은 실행 환경의 환경변수로만 받는다.
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str | None = None
    openai_api_key: str | None = None
    openai_model: str | None = None
    allowed_origins: str = ""
    allowed_origin_regex: str | None = None
    git_sha: str = "dev"
    chat_daily_limit: int = 50
    exam_daily_limit: int = 10

    @property
    def allowed_origin_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
