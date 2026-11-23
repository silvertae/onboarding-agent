"""시작 시 준비(warm-up). 첫 채팅 요청이 늦지 않도록 서버가 요청을 받기 전에 한 번 실행한다.

첫 /chat은 OpenAI SDK 모듈 불러오기, ADK 실행기와 LiteLLM 스트리밍 경로의 첫 실행, OpenAI와의 첫 연결 때문에
Cloud Run(1 vCPU)에서 6초가량 더 걸렸다. 정해 둔 짧은 글로 임베딩과 모델 호출을 한 번씩 미리 지나가게 한다.

- 실패하거나 늦어도 시작을 막지 않는다(경고에 예외 종류 이름만 남긴다).
- OpenAI 설정이 없으면(테스트·로컬) 건너뛴다.
- 사용자 데이터는 읽지 않는다. 보내는 글은 아래 고정 문구뿐이다.
"""

import asyncio
import logging

from google.adk.agents import LlmAgent
from google.adk.agents.run_config import RunConfig, StreamingMode  # pyright: ignore[reportPrivateImportUsage]
from google.adk.runners import InMemoryRunner
from google.genai import types

from app import assistant, embeddings
from app.config import get_settings

logger = logging.getLogger(__name__)

# 이 시간(초)이 지나면 준비를 그만두고 요청을 받기 시작한다
WARMUP_TIMEOUT = 20
WARMUP_TEXT = "준비"
_APP_NAME = "warmup"
_USER_ID = "warmup"


async def _run() -> None:
    await embeddings.embed([WARMUP_TEXT])
    # 채팅(assistant.run_chat)과 같은 방식으로 모델을 한 번 부른다
    agent = LlmAgent(name="warmup", model=assistant.make_model(), instruction=lambda _ctx: "한 단어로 답한다.")
    runner = InMemoryRunner(agent=agent, app_name=_APP_NAME)
    session = await runner.session_service.create_session(app_name=_APP_NAME, user_id=_USER_ID)
    async for event in runner.run_async(
        user_id=_USER_ID,
        session_id=session.id,
        new_message=types.Content(role="user", parts=[types.Part(text=WARMUP_TEXT)]),
        run_config=RunConfig(streaming_mode=StreamingMode.SSE, max_llm_calls=1),
    ):
        if event.error_code:
            raise RuntimeError(event.error_code)


async def warm_up(timeout: float = WARMUP_TIMEOUT) -> None:
    settings = get_settings()
    if not (settings.openai_api_key and settings.openai_model and settings.openai_embedding_model):
        logger.info("warm-up skipped: OpenAI settings missing")
        return
    try:
        await asyncio.wait_for(_run(), timeout=timeout)
    except Exception as exc:
        logger.warning("warm-up failed: %s", type(exc).__name__)
