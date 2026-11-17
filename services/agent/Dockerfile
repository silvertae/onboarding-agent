# 에이전트 서비스 이미지 (Cloud Run). 의존성은 uv.lock 기준으로 설치한다.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.8.17 /uv /uvx /bin/

ENV UV_NO_DEV=1 \
    UV_PYTHON_DOWNLOADS=0 \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 의존성 레이어를 먼저 만들어 소스만 바뀔 때 캐시를 재사용한다.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-install-project --no-cache

COPY app ./app
COPY scripts ./scripts

RUN useradd --create-home --uid 10001 agent
USER agent

ENV PATH="/app/.venv/bin:$PATH" \
    PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
