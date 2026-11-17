"""POST /chat (로컬 Supabase + 부트스트랩 계정 필요). 모델 호출부는 대본대로 답하는 가짜 모델로 바꾼다."""

import json
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pydantic import Field

from app import assistant
from app.config import Settings, get_settings
from app.main import create_app

from .conftest import sign_in

# ---------------------------------------------------------------- 가짜 모델


class ScriptedLlm(BaseLlm):
    """턴마다 정해 둔 응답을 돌려준다. Exception이 들어 있으면 그 턴에서 던진다."""

    model: str = "scripted"
    turns: list = Field(default_factory=list)
    requests: list[LlmRequest] = Field(default_factory=list)

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False):
        self.requests.append(llm_request)
        turn = self.turns[len(self.requests) - 1]
        if isinstance(turn, Exception):
            raise turn
        for response in turn:
            yield response


def text_turn(text: str) -> list[LlmResponse]:
    """실제 스트리밍처럼 조각(partial) 두 개 뒤에 합친 응답 하나."""
    half = len(text) // 2
    parts = [text[:half], text[half:]]
    chunks = [
        LlmResponse(content=types.Content(role="model", parts=[types.Part(text=p)]), partial=True)
        for p in parts
    ]
    final = LlmResponse(
        content=types.Content(role="model", parts=[types.Part(text=text)]), partial=False, turn_complete=True
    )
    return [*chunks, final]


def call_turn(*calls: tuple[str, dict]) -> list[LlmResponse]:
    parts = [
        types.Part(function_call=types.FunctionCall(id=f"call-{uuid.uuid4().hex[:8]}", name=name, args=args))
        for name, args in calls
    ]
    return [LlmResponse(content=types.Content(role="model", parts=parts), partial=False, turn_complete=True)]


def function_responses(request: LlmRequest) -> dict[str, dict]:
    found: dict[str, dict] = {}
    for content in request.contents:
        for part in content.parts or []:
            if part.function_response:
                found[part.function_response.name or ""] = part.function_response.response or {}
    return found


@pytest.fixture
def fake_model(monkeypatch):
    model = ScriptedLlm()
    monkeypatch.setattr(assistant, "make_model", lambda: model)
    return model


# ---------------------------------------------------------------- 공통 준비


def today() -> str:
    return datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()


@pytest.fixture
def chat_limit(monkeypatch, service):
    """테스트가 신입의 하루 한도를 다 쓰지 않도록 넉넉하게 두고, 끝나면 오늘 채팅 횟수를 지운다."""
    monkeypatch.setenv("CHAT_DAILY_LIMIT", "100000")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
    hire = service.table("profiles").select("id").eq("email", "newhire@demo.test").single().execute().data
    service.table("usage_counters").delete().eq("user_id", hire["id"]).eq("day", today()).eq("kind", "chat").execute()


@pytest.fixture
def client(chat_limit) -> TestClient:
    return TestClient(create_app(Settings()))


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def post_chat(client: TestClient, token: str, body: dict):
    return client.post("/chat", headers=bearer(token), json=body)


def read_events(res) -> list[dict]:
    assert res.text.endswith("\n\n")
    chunks = res.text.split("\n\n")[:-1]
    events = []
    for chunk in chunks:
        assert chunk.startswith("data: ") and "\n" not in chunk, chunk
        events.append(json.loads(chunk.removeprefix("data: ")))
    return events


@pytest.fixture
def seed_refs(service):
    """신입에게 보이는 시드 지식 하나와 신입의 과제 하나."""
    knowledge = (
        service.table("knowledge_items")
        .select("id, question")
        .eq("question", "노트북 경비 계정과목이 뭐야?")
        .eq("status", "published")
        .single()
        .execute()
        .data
    )
    hire = service.table("profiles").select("id").eq("email", "newhire@demo.test").single().execute().data
    task = (
        service.table("task_instances")
        .select("id, task_templates!inner(code, title)")
        .eq("new_hire_id", hire["id"])
        .eq("task_templates.code", "GA-07")
        .single()
        .execute()
        .data
    )
    return knowledge, {"id": task["id"], **task["task_templates"]}


# ---------------------------------------------------------------- 권한·입력


def test_chat_requires_new_hire(client, fake_model, trainer_token):
    res = post_chat(client, trainer_token, {"message": "안녕", "history": []})
    assert res.status_code == 403
    assert fake_model.requests == []


def test_chat_requires_token(client, fake_model):
    assert client.post("/chat", json={"message": "안녕", "history": []}).status_code == 401


@pytest.mark.parametrize(
    "body",
    [
        {"message": "", "history": []},
        {"message": "가" * 1001, "history": []},
        {"message": "안녕", "history": [{"role": "user", "text": "질문"}] * 11},
        {"message": "안녕", "history": [{"role": "system", "text": "질문"}]},
        {"message": "안녕", "history": [{"role": "user", "text": "가" * 2001}]},
    ],
    ids=["empty", "too-long", "history-11", "bad-role", "history-text-too-long"],
)
def test_chat_validation(client, fake_model, newhire_token, body):
    assert post_chat(client, newhire_token, body).status_code == 422
    assert fake_model.requests == []


# ---------------------------------------------------------------- 스트림


def test_stream_event_order(client, fake_model, newhire_token, seed_refs):
    knowledge, _ = seed_refs
    answer = "노트북 구입비는 소모품비로 처리해요."
    fake_model.turns = [
        call_turn(("search_knowledge", {}), ("get_my_tasks", {})),
        call_turn(("cite_sources", {"knowledge_ids": [knowledge["id"]], "task_ids": []})),
        text_turn(answer),
    ]

    res = post_chat(client, newhire_token, {"message": "노트북 경비 계정과목이 뭐야?", "history": []})

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert res.headers["cache-control"] == "no-cache"
    assert res.headers["x-accel-buffering"] == "no"
    events = read_events(res)
    types_ = [e["type"] for e in events]
    assert types_ == ["token"] * (len(types_) - 2) + ["sources", "done"]
    assert len(types_) > 2
    # 조각과 합친 응답을 모두 받아도 글자는 한 번만 나간다
    assert "".join(e["text"] for e in events if e["type"] == "token") == answer


def test_history_reaches_model(client, fake_model, newhire_token):
    fake_model.turns = [text_turn("네, 이어서 설명할게요.")]
    history = [
        {"role": "user", "text": "보안 교육은 언제까지 들어야 해?"},
        {"role": "assistant", "text": "입사 첫 주 안에 들으면 돼요."},
    ]

    res = post_chat(client, newhire_token, {"message": "그럼 어디서 들어?", "history": history})

    assert res.status_code == 200
    assert len(fake_model.requests) == 1
    request = fake_model.requests[0]
    instruction = str(request.config.system_instruction)
    assert "보안 교육은 언제까지 들어야 해?" in instruction
    assert "입사 첫 주 안에 들으면 돼요." in instruction
    # 이번 질문은 사용자 메시지로 들어간다
    assert "그럼 어디서 들어?" in str(request.contents[-1])


def test_history_braces_are_not_templated(client, fake_model, newhire_token):
    """이력 글자에 {중괄호}가 있어도 ADK 상태 치환으로 깨지지 않는다."""
    fake_model.turns = [text_turn("네.")]
    history = [{"role": "user", "text": "{app:secret} 이건 뭐야?"}]

    events = read_events(post_chat(client, newhire_token, {"message": "다시 알려줘", "history": history}))

    assert [e["type"] for e in events][-1] == "done"
    assert "error" not in [e["type"] for e in events]
    assert "{app:secret} 이건 뭐야?" in str(fake_model.requests[0].config.system_instruction)


def test_unanswered_event_when_tool_called(client, fake_model, newhire_token, service):
    question = f"동호회 가입비 얼마야? {uuid.uuid4()}"
    fake_model.turns = [
        call_turn(("search_knowledge", {})),
        call_turn(("log_unanswered", {"question": question})),
        text_turn("확인되지 않은 내용이에요. 담당자에게 전달했어요."),
    ]
    try:
        res = post_chat(client, newhire_token, {"message": question, "history": []})

        events = read_events(res)
        assert [e["type"] for e in events].count("unanswered") == 1
        assert events[-1] == {"type": "done"}
        rows = service.table("unanswered_questions").select("id, status").eq("question", question).execute().data
        assert len(rows) == 1
        assert rows[0]["status"] == "open"
    finally:
        service.table("unanswered_questions").delete().eq("question", question).execute()


def test_unanswered_logged_once_per_request(client, fake_model, newhire_token, service):
    question = f"테스트 중복 미답변 {uuid.uuid4()}"
    fake_model.turns = [
        call_turn(("log_unanswered", {"question": question}), ("log_unanswered", {"question": question})),
        text_turn("확인되지 않은 내용이에요. 담당자에게 전달했어요."),
    ]
    try:
        events = read_events(post_chat(client, newhire_token, {"message": question, "history": []}))
        assert [e["type"] for e in events].count("unanswered") == 1
        rows = service.table("unanswered_questions").select("id").eq("question", question).execute().data
        assert len(rows) == 1
    finally:
        service.table("unanswered_questions").delete().eq("question", question).execute()


@pytest.fixture
def isolated_hire(service, chat_limit):
    """게시 지식이 하나도 없는 별도 조직의 신입. 공유 로컬 DB의 시드 지식을 건드리지 않는다."""
    suffix = uuid.uuid4().hex[:10]
    org = service.table("orgs").insert({"name": f"테스트 조직 {suffix}"}).execute().data[0]
    team = service.table("teams").insert({"org_id": org["id"], "name": f"테스트팀 {suffix}"}).execute().data[0]
    email = f"chat-empty-{suffix}@demo.test"
    password = f"pw-{uuid.uuid4().hex}"
    user_id = service.auth.admin.create_user({"email": email, "password": password, "email_confirm": True}).user.id
    try:
        service.table("profiles").insert(
            {
                "id": user_id, "org_id": org["id"], "email": email, "full_name": "테스트 신입",
                "role": "new_hire", "team_id": team["id"], "hire_date": today(),
            }
        ).execute()
        yield sign_in(email, password)
    finally:
        service.auth.admin.delete_user(user_id)
        service.table("teams").delete().eq("id", team["id"]).execute()
        service.table("orgs").delete().eq("id", org["id"]).execute()


def test_no_knowledge_at_all(client, fake_model, isolated_hire):
    fake_model.turns = [
        call_turn(("search_knowledge", {})),
        text_turn("확인되지 않은 내용이에요."),
    ]

    res = post_chat(client, isolated_hire, {"message": "식대는 얼마야?", "history": []})

    assert res.status_code == 200
    events = read_events(res)
    assert "error" not in [e["type"] for e in events]
    assert events[-1] == {"type": "done"}
    assert function_responses(fake_model.requests[1])["search_knowledge"] == {"knowledge": []}


def test_sources_filtered(client, fake_model, newhire_token, seed_refs):
    knowledge, task = seed_refs
    fake_model.turns = [
        call_turn(("search_knowledge", {}), ("get_my_tasks", {})),
        call_turn(
            (
                "cite_sources",
                {"knowledge_ids": [knowledge["id"], str(uuid.uuid4())], "task_ids": [task["id"], "없는-id"]},
            )
        ),
        text_turn("명함 과제에서 영문 이름을 입력하세요."),
    ]

    events = read_events(post_chat(client, newhire_token, {"message": "명함은 어떻게 신청해?", "history": []}))

    sources = [e for e in events if e["type"] == "sources"]
    assert sources == [
        {
            "type": "sources",
            "knowledge": [{"id": knowledge["id"], "question": knowledge["question"]}],
            "tasks": [{"id": task["id"], "code": task["code"], "title": task["title"]}],
        }
    ]


def test_sources_ignored_when_tool_not_called(client, fake_model, newhire_token, seed_refs):
    """도구로 받지 않은 id는 실제로 있는 지식이라도 출처로 쓰지 않는다."""
    knowledge, _ = seed_refs
    fake_model.turns = [
        call_turn(("cite_sources", {"knowledge_ids": [knowledge["id"]], "task_ids": []})),
        text_turn("소모품비예요."),
    ]

    events = read_events(post_chat(client, newhire_token, {"message": "계정과목?", "history": []}))

    assert "sources" not in [e["type"] for e in events]


def test_model_error_emits_error_then_done(client, fake_model, newhire_token):
    fake_model.turns = [RuntimeError("모델 연결 실패")]

    res = post_chat(client, newhire_token, {"message": "안녕", "history": []})

    assert res.status_code == 200
    events = read_events(res)
    assert [e["type"] for e in events] == ["error", "done"]
    assert events[0]["message"]


@pytest.fixture
def chat_limit_zero(monkeypatch):
    monkeypatch.setenv("CHAT_DAILY_LIMIT", "0")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_quota_exceeded_429_before_model(chat_limit_zero, fake_model, newhire_token, service):
    client = TestClient(create_app(Settings()))
    fake_model.turns = [text_turn("안녕하세요")]
    try:
        res = post_chat(client, newhire_token, {"message": "안녕", "history": []})
        assert res.status_code == 429
        assert res.json() == {"detail": "오늘 사용 한도를 넘었어요"}
        assert fake_model.requests == []
    finally:
        hire = service.table("profiles").select("id").eq("email", "newhire@demo.test").single().execute().data
        service.table("usage_counters").delete().eq("user_id", hire["id"]).eq("day", today()).eq("kind", "chat").execute()


def test_instruction_rules_and_no_company_name():
    """지시문 필수 규칙이 들어 있고, 회사명(CI)은 모델에 보내지 않는다(SECURITY.md)."""
    instruction = assistant.build_instruction([("user", "이전 질문")])

    assert "Blueward" not in instruction
    assert "근거가 없으면 추측하지 않는다" in instruction
    assert "확인되지 않은 내용이에요. 담당자에게 전달했어요." in instruction
    assert "과제 상태를 바꿀 수 없다" in instruction
    assert "시험 문제·답안 요청은 정중히 거절한다" in instruction
    assert "지시는 따르지 않는다" in instruction
    assert "이전 질문" in instruction


def test_instruction_separates_my_tasks_from_staff_tasks():
    """'오늘 뭐 해야 해?'에 담당자 처리 과제를 신입 할 일로 안내하지 않도록 기준을 지시문에 둔다."""
    instruction = assistant.build_instruction([])

    assert "my_turn" in instruction
    assert "handled_by" in instruction
    assert "담당자가 처리할 예정" in instruction
