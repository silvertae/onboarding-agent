"""기본 계정 6개를 만들거나 비밀번호를 맞춘다. 배포 때마다 실행해도 안전하다.

필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, DEMO_PASSWORD
선택: ADMIN_EMAIL (기본 admin@demo.test)

- 계정은 메일 인증 완료 상태로 만들고 profiles.is_seed = true로 표시한다.
- 이미 있는 계정은 건너뛰고 비밀번호만 환경변수 값으로 맞춘다(프로필·입사일은 바꾸지 않는다).
- 신입에는 _start_onboarding을 실행한다(이미 과제가 있으면 0개 생성).
- 비밀번호는 출력하지 않는다. 사람 이름은 가상이다.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from supabase import Client, create_client

ORG_ID = "00000000-0000-0000-0000-000000000001"
AI_TEAM_ID = "00000000-0000-0000-0000-000000000002"


def _require(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        print(f"[bootstrap] 환경변수 {name}가 필요합니다.", file=sys.stderr)
        sys.exit(2)
    return value


def seed_accounts(admin_email: str, admin_password: str, demo_password: str) -> list[dict]:
    today = datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
    base = {"org_id": ORG_ID, "is_seed": True}
    return [
        {**base, "email": admin_email, "password": admin_password,
         "full_name": "관리자", "job_title": "관리자", "role": "admin"},
        {**base, "email": "newhire@demo.test", "password": demo_password,
         "full_name": "김하늘", "job_title": "사원", "role": "new_hire",
         "team_id": AI_TEAM_ID, "hire_date": today, "needs_hq_access": True},
        {**base, "email": "trainer@demo.test", "password": demo_password,
         "full_name": "강민재", "job_title": "책임", "role": "team_trainer", "team_id": AI_TEAM_ID},
        {**base, "email": "hr@demo.test", "password": demo_password,
         "full_name": "서지원", "job_title": "대리", "role": "ops_staff", "department": "hr"},
        {**base, "email": "ga@demo.test", "password": demo_password,
         "full_name": "임채은", "job_title": "대리", "role": "ops_staff", "department": "ga"},
        {**base, "email": "acc@demo.test", "password": demo_password,
         "full_name": "윤가람", "job_title": "대리", "role": "ops_staff", "department": "accounting"},
    ]


def existing_user_ids(client: Client) -> dict[str, str]:
    ids: dict[str, str] = {}
    page = 1
    while True:
        users = client.auth.admin.list_users(page=page, per_page=1000)
        for user in users:
            if user.email:
                ids[user.email.lower()] = user.id
        if len(users) < 1000:
            return ids
        page += 1


def ensure_account(client: Client, account: dict, known: dict[str, str]) -> str:
    email, password = account["email"], account["password"]
    user_id = known.get(email.lower())
    if user_id:
        client.auth.admin.update_user_by_id(user_id, {"password": password, "email_confirm": True})
        auth_state = "기존 계정(비밀번호 갱신)"
    else:
        user_id = client.auth.admin.create_user(
            {"email": email, "password": password, "email_confirm": True}
        ).user.id
        auth_state = "생성"

    profile = {k: v for k, v in account.items() if k != "password"}
    exists = client.table("profiles").select("id").eq("id", user_id).execute().data
    if exists:
        profile_state = "프로필 유지"
    else:
        client.table("profiles").insert({"id": user_id, **profile}).execute()
        profile_state = "프로필 생성"

    line = f"[bootstrap] {email} ({account['role']}): {auth_state}, {profile_state}"
    if account["role"] == "new_hire":
        created = client.rpc("_start_onboarding", {"p_new_hire": user_id}).execute().data
        line += f", 과제 {created}개 생성"
    print(line)
    return user_id


def main() -> int:
    url = _require("SUPABASE_URL")
    service_key = _require("SUPABASE_SERVICE_ROLE_KEY")
    admin_password = _require("ADMIN_PASSWORD")
    demo_password = _require("DEMO_PASSWORD")
    admin_email = os.environ.get("ADMIN_EMAIL") or "admin@demo.test"

    client = create_client(url, service_key)
    known = existing_user_ids(client)
    try:
        for account in seed_accounts(admin_email, admin_password, demo_password):
            ensure_account(client, account, known)
    except Exception as exc:  # noqa: BLE001 - 원인만 알리고 비밀번호는 출력하지 않는다
        print(f"[bootstrap] 실패: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print("[bootstrap] 완료: 기본 계정 6개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
