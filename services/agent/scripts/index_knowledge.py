"""게시 지식의 빠진 임베딩을 채운다(백필). 환경마다 마이그레이션 0014 뒤에 한 번 실행한다. 다시 실행해도 안전하다.

사용: cd services/agent && uv run python scripts/index_knowledge.py [--org <org_id>]

- --org 기본값은 데모 조직(00000000-0000-0000-0000-000000000001).
- 해시가 맞는 임베딩이 없는 게시 지식만 100건씩 임베딩한다. 이미 임베딩된 지식은 건너뛴다.
- 데모 초기화(reset_demo) 뒤에는 선택이다. 임베딩 없는 지식도 채팅에 들어가고, 담당자가 지식을 저장하면 그 범위가 채워진다.
- 임베딩 모델을 바꾼 뒤에는 knowledge_embeddings를 비우고 다시 실행한다(docs/deploy.md).

필요한 환경변수: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENAI_EMBEDDING_MODEL

- 환경변수가 없으면 이름만 출력하고 종료 코드 2.
- 임베딩·DB 오류는 종류만 출력하고 종료 코드 1. 이미 저장한 것은 남으니 다시 실행하면 이어서 채운다.
- 지식 내용과 키는 출력하지 않는다.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

# 어디서 실행해도 app 패키지를 찾게 한다(services/agent가 루트).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from supabase import create_client  # noqa: E402

from app.embeddings import embed  # noqa: E402
from app.knowledge_index import index_missing  # noqa: E402

DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001"
# 한 회차에 100건씩. 저장한 것이 없는 회차가 오면 끝낸다(이 수는 무한 반복을 막는 상한).
MAX_ROUNDS = 100
REQUIRED_ENV = (
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "OPENAI_EMBEDDING_MODEL",
)


def _log(message: str, *, err: bool = False) -> None:
    print(f"[index-knowledge] {message}", file=sys.stderr if err else sys.stdout)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="게시 지식의 빠진 임베딩을 채운다")
    parser.add_argument("--org", default=DEMO_ORG_ID, help="조직 id(기본: 데모 조직)")
    args = parser.parse_args(argv)

    for name in REQUIRED_ENV:
        if not os.environ.get(name):
            _log(f"환경변수 {name}가 필요합니다.", err=True)
            return 2

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    total = 0
    try:
        for _ in range(MAX_ROUNDS):
            saved = asyncio.run(index_missing(client, embed, args.org))
            total += saved
            if saved == 0:
                break
    except Exception as exc:  # noqa: BLE001 - 원인 종류만 알리고 키·지식 내용은 출력하지 않는다
        _log(f"실패({type(exc).__name__}). 저장한 {total}건은 남았으니 다시 실행하면 이어서 채웁니다.", err=True)
        return 1
    _log(f"완료: 임베딩 {total}건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
