"""게시 지식의 빠진 임베딩 채우기. POST /knowledge/index와 백필 스크립트(scripts/index_knowledge.py)가 함께 쓴다.

해시가 맞는 임베딩이 없는 게시 지식을 찾아 임베딩하고 save_knowledge_embeddings로 저장한다. 지식 본문·상태는 쓰지 않는다.
범위는 RPC가 정한다: 담당자 토큰이면 관리 범위만, service_role이면 org_id로 고른 조직(없으면 모든 조직).
지식 내용은 로그에 남기지 않는다.
"""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, cast

from supabase import Client

from app.documents import EMBEDDING_DECIMALS

# 임베딩 입력 글자 수. 너무 긴 본문 하나 때문에 묶음 전체가 임베딩 API에서 실패하지 않게 자른다(해시는 원문으로 계산한다)
EMBED_TEXT_LIMIT = 2000

EmbedFn = Callable[[list[str]], Awaitable[list[list[float]]]]


def _missing(client: Client, org_id: str | None) -> list[dict]:
    return cast(list[dict[str, Any]], client.rpc("knowledge_without_embedding", {"p_org": org_id}).execute().data)


def _save(client: Client, items: list[dict]) -> int:
    return cast(int, client.rpc("save_knowledge_embeddings", {"p_items": items}).execute().data)


async def index_missing(client: Client, embed_fn: EmbedFn, org_id: str | None = None) -> int:
    """한 번에 최대 100건(RPC가 자른다)을 임베딩해 저장하고, 저장한 개수를 돌려준다. 임베딩·DB 오류는 그대로 올라간다.

    질문·답은 받은 그대로 돌려보낸다. 그 사이 본문이 바뀌었다면 해시가 맞지 않아 다음 호출에서 다시 임베딩된다.
    """
    rows = await asyncio.to_thread(_missing, client, org_id)
    if not rows:
        return 0
    vectors = await embed_fn([f"{r['question']}\n{r['answer']}"[:EMBED_TEXT_LIMIT] for r in rows])
    items = [
        {
            "id": r["id"],
            "question": r["question"],
            "answer": r["answer"],
            "embedding": [round(x, EMBEDDING_DECIMALS) for x in v],
        }
        for r, v in zip(rows, vectors, strict=True)
    ]
    return await asyncio.to_thread(_save, client, items)
