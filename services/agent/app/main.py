from fastapi import FastAPI

from app.config import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="온보딩 에이전트", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "version": settings.git_sha}

    return app


app = create_app()
