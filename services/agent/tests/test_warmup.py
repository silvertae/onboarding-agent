"""시작 시 준비(warm-up). 실제 모델·임베딩 대신 가짜를 쓴다(로컬 Supabase가 필요 없다)."""

import asyncio
import logging

import pytest
from fastapi.testclient import TestClient

from app import assistant, embeddings, warmup
from app.config import Settings, get_settings
from app.main import create_app

from .llm_fakes import ScriptedLlm, text_turn


@pytest.fixture
def openai_env(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    monkeypatch.setenv("OPENAI_EMBEDDING_MODEL", "test-embedding")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def fake_model(monkeypatch):
    model = ScriptedLlm(turns=[text_turn("준비")])
    monkeypatch.setattr(assistant, "make_model", lambda: model)
    return model


@pytest.fixture
def embed_calls(monkeypatch):
    calls: list[list[str]] = []

    async def fake_embed(texts):
        calls.append(texts)
        return [[0.0] * embeddings.EMBEDDING_DIM for _ in texts]

    monkeypatch.setattr(embeddings, "embed", fake_embed)
    return calls


def test_warm_up_calls_embedding_and_model_once(openai_env, fake_model, embed_calls):
    asyncio.run(warmup.warm_up())

    assert len(embed_calls) == 1
    assert len(fake_model.requests) == 1


def test_warm_up_streams_like_chat(openai_env, fake_model, embed_calls, monkeypatch):
    """채팅과 같은 스트리밍 경로를 미리 지나가야 첫 요청이 빨라진다."""
    seen = {}
    original = fake_model.__class__.generate_content_async

    async def spy(self, llm_request, stream=False):
        seen["stream"] = stream
        async for response in original(self, llm_request, stream):
            yield response

    monkeypatch.setattr(fake_model.__class__, "generate_content_async", spy)

    asyncio.run(warmup.warm_up())

    assert seen["stream"] is True


def test_warm_up_skips_without_openai_settings(monkeypatch, fake_model, embed_calls):
    for name in ("OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_EMBEDDING_MODEL"):
        monkeypatch.delenv(name, raising=False)
    get_settings.cache_clear()
    try:
        asyncio.run(warmup.warm_up())
    finally:
        get_settings.cache_clear()

    assert embed_calls == []
    assert fake_model.requests == []


def test_warm_up_failure_does_not_raise_and_logs_type_only(openai_env, embed_calls, monkeypatch, caplog):
    model = ScriptedLlm(turns=[RuntimeError("비밀 내용")])
    monkeypatch.setattr(assistant, "make_model", lambda: model)

    with caplog.at_level(logging.WARNING, logger="app.warmup"):
        asyncio.run(warmup.warm_up())

    ours = " ".join(r.getMessage() for r in caplog.records if r.name == "app.warmup")
    assert "RuntimeError" in ours
    assert "비밀 내용" not in ours


def test_warm_up_gives_up_after_timeout(openai_env, fake_model, monkeypatch):
    async def slow_embed(texts):
        await asyncio.sleep(10)

    monkeypatch.setattr(embeddings, "embed", slow_embed)

    asyncio.run(asyncio.wait_for(warmup.warm_up(timeout=0.05), timeout=2))

    assert fake_model.requests == []


def test_app_startup_runs_warm_up(monkeypatch):
    calls = []

    async def fake_warm_up():
        calls.append(True)

    monkeypatch.setattr(warmup, "warm_up", fake_warm_up)

    with TestClient(create_app(Settings())) as client:
        assert calls == [True]
        assert client.get("/health").status_code == 200
