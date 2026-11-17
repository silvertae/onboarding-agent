"""온보딩 어시스턴트의 조회 도구. 모두 사용자 토큰 클라이언트를 써서 RLS가 그대로 적용된다.

과제 상태를 바꾸는 함수는 두지 않는다(조회와 미답변 기록만).
"""

from typing import Any, cast

from postgrest import ReturnMethod

from app.auth import CurrentUser
from app.db import user_client

OWNER_LABEL = {"hr": "인사팀", "ga": "총무팀", "accounting": "회계팀"}
STAGE_ORDER = {"day1": 0, "week1": 1, "month1": 2}
FINISHED = ("done", "na")
OPEN_FOR_NEW_HIRE = ("todo", "rework")
MAX_QUESTION_LENGTH = 1000


def get_my_tasks(user: CurrentUser) -> list[dict]:
    """내 온보딩 과제. blocked_by는 아직 끝나지 않은(done·na가 아닌) 선행 과제 코드다.

    handled_by: 그 과제를 처리하는 사람("신입" | "담당자"). completion_mode가 staff_only면 담당자다.
    my_turn: 신입이 지금 할 차례인지. 웹 신입 홈의 '지금 할 일'과 같은 기준(todo·rework이면서 staff_only가 아님).
    """
    rows = cast(
        list[dict[str, Any]],
        user_client(user.token)
        .table("task_instances")
        .select(
            "id, status, due_date,"
            " task_templates!inner(code, title, department, stage, sort_order, prerequisite_codes, completion_mode,"
            " teams(name))"
        )
        .eq("new_hire_id", user.id)
        .execute()
        .data,
    )
    status_by_code = {r["task_templates"]["code"]: r["status"] for r in rows}
    rows.sort(key=lambda r: (STAGE_ORDER.get(r["task_templates"]["stage"], 9), r["task_templates"]["sort_order"]))

    tasks = []
    for r in rows:
        t = r["task_templates"]
        owner = OWNER_LABEL.get(t["department"]) if t["department"] else (t.get("teams") or {}).get("name", "")
        blocked_by = (
            [c for c in t["prerequisite_codes"] if status_by_code.get(c) not in FINISHED]
            if r["status"] == "blocked"
            else []
        )
        handled_by = "담당자" if t["completion_mode"] == "staff_only" else "신입"
        tasks.append(
            {
                "id": r["id"],
                "code": t["code"],
                "title": t["title"],
                "status": r["status"],
                "due_date": r["due_date"],
                "owner": owner,
                "blocked_by": blocked_by,
                "handled_by": handled_by,
                "my_turn": r["status"] in OPEN_FOR_NEW_HIRE and handled_by == "신입",
            }
        )
    return tasks


def search_knowledge(user: CurrentUser) -> list[dict]:
    """내 범위(회사 공통 + 우리 팀)의 게시된 지식 전부. 벡터 검색 없이 모델이 고른다."""
    return cast(
        list[dict[str, Any]],
        user_client(user.token)
        .table("knowledge_items")
        .select("id, question, answer, category")
        .eq("status", "published")
        .order("category")
        .order("question")
        .execute()
        .data,
    )


def log_unanswered(user: CurrentUser, question: str) -> None:
    """답할 근거가 없던 질문을 미답변으로 기록한다. 신입은 기록만 할 수 있고 읽을 수 없으므로 결과를 받지 않는다."""
    user_client(user.token).table("unanswered_questions").insert(
        {
            "org_id": user.org_id,
            "asked_by": user.id,
            "team_id": user.team_id,
            "question": question.strip()[:MAX_QUESTION_LENGTH],
        },
        returning=ReturnMethod.minimal,
    ).execute()
