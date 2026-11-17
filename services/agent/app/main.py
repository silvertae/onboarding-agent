from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.exam_routes import router as exam_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="온보딩 에이전트", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings

    # 웹 출처만 허용한다: ALLOWED_ORIGINS 목록 + ALLOWED_ORIGIN_REGEX(PR 미리보기 주소). 인증은 Bearer 토큰이라 쿠키는 쓰지 않는다.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origin_list,
        allow_origin_regex=settings.allowed_origin_regex or None,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=False,
    )

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "version": settings.git_sha}

    app.include_router(exam_router)
    return app


app = create_app()
