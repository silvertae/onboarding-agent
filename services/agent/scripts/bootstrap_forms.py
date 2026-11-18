"""기본 서식 3개를 task-forms 버킷에 올리고 task_template_files에 등록한다. 배포 때마다 실행해도 안전하다.

필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

- 파일은 <repo>/supabase/seed-forms/<과제 코드>/<파일 이름>.
- 객체 경로는 {org}/{template_id}/{uuid5}.{확장자}로 고정이라 다시 실행해도 같은 객체를 덮어쓴다(upsert).
- 행은 (template_id, file_name) 기준으로 upsert하며 is_seed = true, uploaded_by = null.
- 템플릿이나 파일이 없으면 이름을 출력하고 종료 코드 2.
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

from supabase import create_client

ORG_ID = "00000000-0000-0000-0000-000000000001"
BUCKET = "task-forms"
SEED_DIR = Path(__file__).resolve().parents[3] / "supabase" / "seed-forms"
SEED_FORMS: list[tuple[str, str]] = [
    ("AC-01", "법인카드 신청서.xlsx"),
    ("AC-01", "법인카드 사용 동의서.docx"),
    ("HR-08", "소득세 감면 신청서.pdf"),
]
CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _require(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        print(f"[bootstrap-forms] 환경변수 {name}가 필요합니다.", file=sys.stderr)
        sys.exit(2)
    return value


def main() -> int:
    url = _require("SUPABASE_URL")
    service_key = _require("SUPABASE_SERVICE_ROLE_KEY")

    # 파일과 템플릿이 모두 있는지 먼저 확인한다(일부만 올리지 않는다).
    client = create_client(url, service_key)
    plan = []
    missing = []
    for code, file_name in SEED_FORMS:
        path = SEED_DIR / code / file_name
        if not path.is_file():
            missing.append(f"파일 {code}/{file_name}")
            continue
        rows = (
            client.table("task_templates").select("id").eq("org_id", ORG_ID).eq("code", code).execute().data
        )
        if not rows:
            missing.append(f"템플릿 {code}")
            continue
        plan.append((code, file_name, path, rows[0]["id"]))
    if missing:
        print(f"[bootstrap-forms] 없음: {', '.join(missing)}", file=sys.stderr)
        return 2

    try:
        for code, file_name, path, template_id in plan:
            ext = file_name.rsplit(".", 1)[-1].lower()
            object_id = uuid.uuid5(uuid.NAMESPACE_URL, f"{code}/{file_name}")
            storage_path = f"{ORG_ID}/{template_id}/{object_id}.{ext}"
            data = path.read_bytes()
            client.storage.from_(BUCKET).upload(
                storage_path, data, {"content-type": CONTENT_TYPES[ext], "upsert": "true"}
            )
            client.table("task_template_files").upsert(
                {
                    "org_id": ORG_ID,
                    "template_id": template_id,
                    "file_name": file_name,
                    "storage_path": storage_path,
                    "size_bytes": len(data),
                    "uploaded_by": None,
                    "is_seed": True,
                },
                on_conflict="template_id,file_name",
            ).execute()
            print(f"[bootstrap-forms] {code} {file_name}: 등록 ({len(data)}바이트)")
    except Exception as exc:  # noqa: BLE001 - 원인만 알리고 키는 출력하지 않는다
        print(f"[bootstrap-forms] 실패: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print(f"[bootstrap-forms] 완료: 기본 서식 {len(plan)}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
