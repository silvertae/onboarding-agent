"""어시스턴트 조회 도구 (로컬 Supabase + 부트스트랩 계정 필요). 모두 사용자 토큰으로 읽는다(RLS 적용)."""

from app.assistant_tools import get_my_tasks, search_knowledge
from app.auth import CurrentUser, _load_user


def as_user(token: str) -> CurrentUser:
    return _load_user(token)


def test_get_my_tasks_returns_31(newhire_token):
    tasks = get_my_tasks(as_user(newhire_token))

    assert len(tasks) == 31
    assert set(tasks[0]) == {"id", "code", "title", "status", "due_date", "owner", "blocked_by", "handled_by", "my_turn"}
    by_code = {t["code"]: t for t in tasks}
    hr02, hr03 = by_code["HR-02"], by_code["HR-03"]
    # 시드 상태에서 HR-03은 HR-02 완료 후 열린다
    if hr02["status"] in ("done", "na"):
        assert hr03["blocked_by"] == []
    else:
        assert hr03["status"] == "blocked"
        assert hr03["blocked_by"] == ["HR-02"]
    # 열린 과제에는 대기 중인 선행 과제가 없다
    assert all(t["blocked_by"] == [] for t in tasks if t["status"] != "blocked")
    assert hr02["owner"] == "인사팀"
    assert any(t["owner"] == "AI팀" for t in tasks)


def test_get_my_tasks_marks_who_acts(newhire_token):
    """담당자가 처리하는 과제(staff_only)는 신입의 할 일이 아니다. 웹 '지금 할 일'과 같은 기준."""
    by_code = {t["code"]: t for t in get_my_tasks(as_user(newhire_token))}

    ga02 = by_code["GA-02"]  # 지문 등록·출입 확인: 총무가 처리
    assert ga02["handled_by"] == "담당자"
    assert ga02["my_turn"] is False
    for code in ("AI-05", "AI-10"):  # 평가 과제도 담당자 처리
        assert by_code[code]["handled_by"] == "담당자"
        assert by_code[code]["my_turn"] is False

    ai01 = by_code["AI-01"]  # 사무실 돌며 인사하기: 신입이 직접
    assert ai01["handled_by"] == "신입"
    assert ai01["my_turn"] == (ai01["status"] in ("todo", "rework"))
    # my_turn은 열려 있고(todo·rework) 신입이 처리하는 과제에만 참이다
    for t in by_code.values():
        assert t["my_turn"] == (t["status"] in ("todo", "rework") and t["handled_by"] == "신입")


def test_search_knowledge_scope(newhire_token, service):
    items = search_knowledge(as_user(newhire_token))

    assert len(items) == 30
    assert set(items[0]) == {"id", "question", "answer", "category"}
    ids = [i["id"] for i in items]
    statuses = service.table("knowledge_items").select("status").in_("id", ids).execute().data
    assert {s["status"] for s in statuses} == {"published"}
