"""가상 시드 규정 문서 2개를 policy-docs 버킷에 올리고 조항으로 색인한다. 환경마다 한 번 실행하며 다시 실행해도 안전하다.

사용: cd services/agent && uv run python scripts/index_seed_docs.py --org <org_id>

필요한 환경변수: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENAI_EMBEDDING_MODEL

- 파일은 <repo>/supabase/seed-docs/. 회사 공통(scope company) 문서로 올리고 uploaded_by는 비운다.
- 같은 조직에 같은 제목이 이미 있으면 건너뛴다(처리 중·실패 상태여도 건너뛰므로, 고치려면 그 행을 지우고 다시 실행한다).
- 임베딩 등으로 처리가 중간에 실패하면 방금 만든 행과 객체를 지운다. 다시 실행하면 처음부터 다시 시도한다.
- 읽을 수 없는 문서(DocumentRejected)는 실패 사유를 저장한 행(failed)으로 남긴다.
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

BUCKET = "policy-docs"
SEED_DIR = Path(__file__).resolve().parents[3] / "supabase" / "seed-docs"
SEED_DOCS: list[tuple[str, str, str]] = [
    ("복리후생 규정(가상)", "welfare-policy.docx", "docx"),
    ("취업규칙 발췌(가상)", "work-rules.pdf", "pdf"),
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
    parser.add_argument("--org", required=True, help="조직 id")
    org_id = parser.parse_args(argv).org

    for name in REQUIRED_ENV:
        if not os.environ.get(name):
            _log(f"환경변수 {name}가 필요합니다.", err=True)
            return 2

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    indexed = skipped = 0
    for title, file_name, file_type in SEED_DOCS:
        path = SEED_DIR / file_name
        if not path.is_file():
            _log(f"파일 {file_name}이 없습니다.", err=True)
            return 2
        doc_id = ""
        file_path = ""
        try:
            if client.table("policy_documents").select("id").eq("org_id", org_id).eq("title", title).execute().data:
                _log(f"{title}: 이미 있어 건너뜀")
                skipped += 1
                continue
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
        indexed += 1
        _log(f"{title}: {'색인 완료' if status == 'ready' else '읽지 못해 실패로 기록'}(조항 {count}개)")
    _log(f"완료: 색인 {indexed}개, 건너뜀 {skipped}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
