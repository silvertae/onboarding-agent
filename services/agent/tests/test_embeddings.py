"""임베딩 함수 (DB 없이 litellm을 가짜로 바꿔 검사한다)."""

import pytest

from app import embeddings
from app.config import get_settings
from app.embeddings import EmbeddingError, embed

pytestmark = pytest.mark.anyio


@pytest.fixture
def embedding_env(monkeypatch):
    monkeypatch.setenv("OPENAI_EMBEDDING_MODEL", "text-embedding-test")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _fake_response(n: int, dim: int):
    return type("R", (), {"data": [{"embedding": [0.0] * dim, "index": i} for i in range(n)]})()


async def test_embed_batches_and_checks_dimension(embedding_env, monkeypatch):
    calls = []

    async def fake_aembedding(**kwargs):
        calls.append(kwargs)
        return _fake_response(len(kwargs["input"]), 1536)

    monkeypatch.setattr(embeddings.litellm, "aembedding", fake_aembedding)
    result = await embed([f"t{i}" for i in range(150)])
    assert len(calls) == 2
    assert [len(c["input"]) for c in calls] == [100, 50]
    assert calls[0]["model"] == "openai/text-embedding-test"
    assert len(result) == 150 and all(len(v) == 1536 for v in result)

    async def wrong_dim(**kwargs):
        return _fake_response(len(kwargs["input"]), 1535)

    monkeypatch.setattr(embeddings.litellm, "aembedding", wrong_dim)
    with pytest.raises(EmbeddingError) as exc:
        await embed(["비밀 본문"])
    assert "비밀 본문" not in str(exc.value)


async def test_embed_requires_model_env(monkeypatch):
    monkeypatch.delenv("OPENAI_EMBEDDING_MODEL", raising=False)
    get_settings.cache_clear()
    try:
        with pytest.raises(EmbeddingError):
            await embed(["a"])
    finally:
        get_settings.cache_clear()


async def test_embed_empty_returns_empty_without_calling_api(monkeypatch):
    async def boom(**kwargs):
        raise AssertionError("호출되면 안 된다")

    monkeypatch.setattr(embeddings.litellm, "aembedding", boom)
    assert await embed([]) == []


async def test_embed_wraps_api_errors_without_echoing_input(embedding_env, monkeypatch):
    async def failing(**kwargs):
        raise RuntimeError("secret input text")

    monkeypatch.setattr(embeddings.litellm, "aembedding", failing)
    with pytest.raises(EmbeddingError) as exc:
        await embed(["secret input text"])
    assert "secret input text" not in str(exc.value)
    assert "RuntimeError" in str(exc.value)
    assert exc.value.__cause__ is None and exc.value.__suppress_context__


async def test_embed_rejects_count_mismatch(embedding_env, monkeypatch):
    async def short(**kwargs):
        return _fake_response(len(kwargs["input"]) - 1, 1536)

    monkeypatch.setattr(embeddings.litellm, "aembedding", short)
    with pytest.raises(EmbeddingError):
        await embed(["a", "b"])
