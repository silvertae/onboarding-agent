"""가상 시드 규정 문서를 policy-docs 버킷에 올리고 조항으로 색인한다. 환경마다 한 번 실행하며 다시 실행해도 안전하다.

사용: cd services/agent && uv run python scripts/index_seed_docs.py [--org <org_id>] [--all]

- 기본은 "취업규칙 발췌(가상)"(work-rules.pdf) 하나만 올린다. 시연에서 경영지원이 "복리후생 규정(가상)"(welfare-policy.docx)을
  S14에서 직접 올리기 때문이다. --all을 주면 복리후생 규정도 함께 올린다.
- --org 기본값은 데모 조직(00000000-0000-0000-0000-000000000001).

필요한 환경변수: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENAI_EMBEDDING_MODEL

- 파일은 <repo>/supabase/seed-docs/. 회사 공통(scope company) 문서로 올리고 uploaded_by는 비운다.
- 같은 조직에 같은 제목이 이미 있고 ready면 건너뛴다. failed·processing이면 그 행과 객체를 지우고 다시 색인한다.
- 처리 중 실패하면 방금 만든 행과 객체를 지운다. 다시 실행하면 처음부터 다시 시도한다.
- 시드 문서가 읽히지 않아 failed로 끝나면 stderr에 사유를 출력하고 종료 코드 1(실패 행은 남고, 다시 실행하면 지우고 재시도).
- 환경변수가 없으면 이름만 출력하고 종료 코드 2, 처리 중 실패는 종료 코드 1.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid
from pathlib import Path

# 어디서 실행해도 app 패키지를 찾게 한다(services/agent가 루트).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from supabase import create_client  # noqa: E402

from app.documents import UNREADABLE, DocumentRejected, build_clause_payload, extract_text, split_clauses  # noqa: E402
from app.embeddings import EmbeddingError, embed  # noqa: E402

DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001"
BUCKET = "policy-docs"
SEED_DIR = Path(__file__).resolve().parents[3] / "supabase" / "seed-docs"
# 기본으로 올리는 문서
SEED_DOCS: list[tuple[str, str, str]] = [
    ("취업규칙 발췌(가상)", "work-rules.pdf", "pdf"),
]
# --all일 때 더 올리는 문서
EXTRA_DOCS: list[tuple[str, str, str]] = [
    ("복리후생 규정(가상)", "welfare-policy.docx", "docx"),
]
CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
REQUIRED_ENV = (
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "OPENAI_EMBEDDING_MODEL",
)


def _log(message: str, *, err: bool = False) -> None:
    print(f"[index-seed-docs] {message}", file=sys.stderr if err else sys.stdout)


def _index(client, doc_id: str, data: bytes, file_type: str) -> tuple[str, int]:
    """조항을 만들어 저장한다. (상태, 조항 수)."""
    try:
        clauses = split_clauses(extract_text(data, file_type))  # type: ignore[arg-type]
        if not clauses:
            raise DocumentRejected(UNREADABLE)
    except DocumentRejected as e:
        client.rpc("replace_document_clauses", {"p_document_id": doc_id, "p_clauses": [], "p_error": str(e)}).execute()
        return "failed", 0
    payload = asyncio.run(build_clause_payload(clauses, embed))
    count = client.rpc("replace_document_clauses", {"p_document_id": doc_id, "p_clauses": payload}).execute().data
    return "ready", count


def _discard(client, doc_id: str, path: str) -> None:
    """실패한 문서의 행과 객체를 지운다(다시 실행하면 처음부터 시도하도록)."""
    for step in (
        lambda: client.storage.from_(BUCKET).remove([path]),
        lambda: client.table("policy_documents").delete().eq("id", doc_id).execute(),
    ):
        try:
            step()
        except Exception:  # noqa: BLE001 - 정리 실패는 원래 오류를 가리지 않는다
            pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="가상 시드 규정 문서를 색인한다")
    parser.add_argument("--org", default=DEMO_ORG_ID, help="조직 id(기본: 데모 조직)")
    parser.add_argument("--all", action="store_true", help="복리후생 규정(가상)도 올린다")
    args = parser.parse_args(argv)
    org_id = args.org
    docs = SEED_DOCS + (EXTRA_DOCS if args.all else [])

    for name in REQUIRED_ENV:
        if not os.environ.get(name):
            _log(f"환경변수 {name}가 필요합니다.", err=True)
            return 2

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    indexed = skipped = 0
    for title, file_name, file_type in docs:
        path = SEED_DIR / file_name
        if not path.is_file():
            _log(f"파일 {file_name}이 없습니다.", err=True)
            return 2
        doc_id = ""
        file_path = ""
        try:
            existing = (
                client.table("policy_documents")
                .select("id, status, file_path")
                .eq("org_id", org_id)
                .eq("title", title)
                .execute()
                .data
            )
            if existing and all(r["status"] == "ready" for r in existing):
                _log(f"{title}: 이미 있어 건너뜀")
                skipped += 1
                continue
            for row in existing:
                _log(f"{title}: {row['status']} 상태라 지우고 다시 색인")
                _discard(client, row["id"], row["file_path"])
            data = path.read_bytes()
            doc_id = str(uuid.uuid4())
            file_path = f"{org_id}/{doc_id}.{file_type}"
            client.table("policy_documents").insert(
                {
                    "id": doc_id,
                    "org_id": org_id,
                    "scope": "company",
                    "team_id": None,
                    "title": title,
                    "file_path": file_path,
                    "file_type": file_type,
                    "status": "processing",
                    "uploaded_by": None,
                }
            ).execute()
            client.storage.from_(BUCKET).upload(file_path, data, {"content-type": CONTENT_TYPES[file_type]})
            status, count = _index(client, doc_id, data, file_type)
        except Exception as exc:  # noqa: BLE001 - 원인 종류만 알리고 키·문서 내용은 출력하지 않는다
            if doc_id:
                _discard(client, doc_id, file_path)
            kind = type(exc).__name__
            _log(f"{title}: 실패({kind}). 처리하다 만 행은 지웠으니 다시 실행하세요.", err=True)
            return 1
        if status != "ready":
            _log(f"{title}: 문서를 읽지 못해 failed로 끝났습니다(DocumentRejected).", err=True)
            return 1
        indexed += 1
        _log(f"{title}: 색인 완료(조항 {count}개)")
    _log(f"완료: 색인 {indexed}개, 건너뜀 {skipped}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
