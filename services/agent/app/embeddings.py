"""텍스트 임베딩. 모델 이름은 OPENAI_EMBEDDING_MODEL 환경변수, 차원은 1536 고정."""

import litellm

from app.config import get_settings

EMBEDDING_DIM = 1536
BATCH_SIZE = 100


class EmbeddingError(Exception):
    """임베딩 실패. 메시지에 입력 텍스트를 담지 않는다(채팅·문서 내용은 로그에 남기지 않는다)."""


async def embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    settings = get_settings()
    if not settings.openai_embedding_model:
        raise EmbeddingError("OPENAI_EMBEDDING_MODEL 환경변수가 없습니다")
    vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH_SIZE):
        batch = texts[start : start + BATCH_SIZE]
        try:
            response = await litellm.aembedding(
                model="openai/" + settings.openai_embedding_model,
                input=batch,
                api_key=settings.openai_api_key,
            )
            batch_vectors = [item["embedding"] for item in response.data]
        except Exception as e:
            # litellm 오류 메시지는 입력 텍스트를 담을 수 있어 타입 이름만 남긴다.
            raise EmbeddingError(f"임베딩 API 호출에 실패했습니다({type(e).__name__})") from None
        if len(batch_vectors) != len(batch) or any(len(v) != EMBEDDING_DIM for v in batch_vectors):
            raise EmbeddingError(f"임베딩 결과가 올바르지 않습니다(기대 차원 {EMBEDDING_DIM})")
        vectors.extend(batch_vectors)
    return vectors
