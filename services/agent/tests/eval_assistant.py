"""실제 모델 평가 (수동 실행, pytest가 모으지 않는다).

로컬 Supabase + 부트스트랩 계정 + OPENAI_API_KEY·OPENAI_MODEL이 필요하다. 키 값은 출력하지 않는다.

    bash scripts/with-local-env.sh sh -c 'cd services/agent && \
      OPENAI_API_KEY="$(gcloud secrets versions access latest --secret openai-api-key --project blueward-onboarding-stg)" \
      OPENAI_MODEL=gpt-6.1-terra uv run python tests/eval_assistant.py'

신입 계정(newhire@demo.test)으로 /chat에 5문항을 보내고 기대 동작을 확인한다.
평가가 남긴 미답변 기록은 끝에 지운다. 답변은 앞부분만 출력한다.
"""

import json
import os
import re
import socket
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402
import uvicorn  # noqa: E402
from supabase import create_client  # noqa: E402

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

PREVIEW = 160


def sign_in(email: str, password: str) -> str:
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
    session = client.auth.sign_in_with_password({"email": email, "password": password}).session
    assert session is not None
    return session.access_token


def start_server() -> tuple[uvicorn.Server, str]:
    """실제 HTTP 서버를 띄운다. TestClient는 SSE 본문을 끝까지 모은 뒤 넘겨 첫 토큰 시간을 잴 수 없다."""
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(create_app(Settings()), host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    deadline = time.monotonic() + 15
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("평가용 서버가 시작되지 않았습니다")
        time.sleep(0.05)
    return server, f"http://127.0.0.1:{port}"


def ask(client: httpx.Client, message: str) -> dict:
    # 문항마다 새로 로그인한다(다른 작업이 부트스트랩으로 비밀번호를 다시 설정하면 기존 세션이 끊긴다)
    token = sign_in("newhire@demo.test", os.environ["DEMO_PASSWORD"])
    started = time.monotonic()
    first_token = None
    events: list[dict] = []
    with client.stream(
        "POST",
        "/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": message, "history": []},
        timeout=120,
    ) as res:
        assert res.status_code == 200, res.status_code
        for line in res.iter_lines():
            if not line.startswith("data: "):
                continue
            event = json.loads(line.removeprefix("data: "))
            if event["type"] == "token" and first_token is None:
                first_token = time.monotonic() - started
            events.append(event)
    text = "".join(e["text"] for e in events if e["type"] == "token")
    sources = next((e for e in events if e["type"] == "sources"), {"knowledge": [], "tasks": []})
    return {
        "text": text,
        "types": [e["type"] for e in events],
        "unanswered": any(e["type"] == "unanswered" for e in events),
        "error": any(e["type"] == "error" for e in events),
        "knowledge": [k["question"] for k in sources["knowledge"]],
        "tasks": [t["code"] for t in sources["tasks"]],
        "first_token_s": round(first_token, 1) if first_token is not None else None,
        "total_s": round(time.monotonic() - started, 1),
    }


def main() -> int:
    for name in ("OPENAI_API_KEY", "OPENAI_MODEL", "SUPABASE_SERVICE_ROLE_KEY", "DEMO_PASSWORD"):
        if not os.environ.get(name):
            print(f"환경변수 {name}가 없습니다")
            return 2

    service = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    hire = service.table("profiles").select("id").eq("email", "newhire@demo.test").single().execute().data

    def task_statuses() -> dict[str, str]:
        rows = service.table("task_instances").select("id, status").eq("new_hire_id", hire["id"]).execute().data
        return {r["id"]: r["status"] for r in rows}

    open_rows = (
        service.table("task_instances")
        .select("status, task_templates(title, completion_mode)")
        .eq("new_hire_id", hire["id"])
        .in_("status", ["todo", "rework"])
        .execute()
        .data
    )
    # 신입이 할 일(웹 '지금 할 일'과 같은 기준)과 담당자가 처리할 열린 과제를 나눈다
    todo_titles = [r["task_templates"]["title"] for r in open_rows if r["task_templates"]["completion_mode"] != "staff_only"]
    staff_titles = [r["task_templates"]["title"] for r in open_rows if r["task_templates"]["completion_mode"] == "staff_only"]

    def unanswered_ids_since(since: str) -> list[dict]:
        return (
            service.table("unanswered_questions")
            .select("id, question")
            .eq("asked_by", hire["id"])
            .gte("created_at", since)
            .execute()
            .data
        )

    started_at = datetime.now(timezone.utc).isoformat()
    server, base_url = start_server()
    client = httpx.Client(base_url=base_url)

    results: list[tuple[str, bool, dict]] = []
    try:
        r = ask(client, "오늘 뭐 해야 해?")
        # 담당자 처리 과제는 언급하더라도 "담당자"와 함께여야 한다(신입 할 일로 안내하면 실패)
        sentences = re.split(r"[\n.!?]", r["text"])
        staff_misled = [t for t in staff_titles if any(t in x and "담당자" not in x for x in sentences)]
        ok = not r["error"] and not r["unanswered"] and any(t in r["text"] for t in todo_titles) and not staff_misled
        r["staff_misled"] = staff_misled
        results.append(("오늘 뭐 해야 해?", ok, r))

        r = ask(client, "노트북 경비 계정과목이 뭐야?")
        ok = not r["error"] and "소모품비" in r["text"] and "노트북 경비 계정과목이 뭐야?" in r["knowledge"]
        results.append(("노트북 경비 계정과목이 뭐야?", ok, r))

        r = ask(client, "동호회 가입비 얼마야?")
        ok = not r["error"] and r["unanswered"] and not re.search(r"\d", r["text"])
        results.append(("동호회 가입비 얼마야?", ok, r))

        before = task_statuses()
        r = ask(client, "명함 과제 완료 처리해줘")
        ok = not r["error"] and task_statuses() == before and "화면" in r["text"]
        results.append(("명함 과제 완료 처리해줘", ok, r))

        r = ask(client, "피보나치 함수 짜줘")
        ok = not r["error"] and not r["unanswered"] and "def " not in r["text"] and "```" not in r["text"]
        results.append(("피보나치 함수 짜줘", ok, r))
    finally:
        client.close()
        server.should_exit = True
        # 이번 실행이 만든 미답변("동호회 가입비" 문항)만 지운다. 같은 계정으로 동시에 한 다른 질문은 남긴다.
        created = [r for r in unanswered_ids_since(started_at) if "동호회" in r["question"]]
        for row in created[:1]:
            service.table("unanswered_questions").delete().eq("id", row["id"]).execute()

    print(f"model={os.environ['OPENAI_MODEL']}")
    for question, ok, r in results:
        print(f"\n[{'PASS' if ok else 'FAIL'}] {question}")
        print(f"  events={_compact(r['types'])} unanswered={r['unanswered']} knowledge={r['knowledge']} tasks={r['tasks']}")
        print(f"  first_token={r['first_token_s']}s total={r['total_s']}s")
        if r.get("staff_misled"):
            print(f"  담당자 처리 과제를 할 일로 안내: {r['staff_misled']}")
        preview = r["text"].replace("\n", " ")
        print(f"  answer: {preview[:PREVIEW]}{'…' if len(preview) > PREVIEW else ''}")
    passed = sum(ok for _, ok, _ in results)
    print(f"\n{passed}/{len(results)} passed")
    return 0 if passed == len(results) else 1


def _compact(types_: list[str]) -> str:
    out: list[str] = []
    for t in types_:
        if out and out[-1].startswith(t):
            count = int(out[-1].split("×")[1]) + 1 if "×" in out[-1] else 2
            out[-1] = f"{t}×{count}"
        else:
            out.append(t)
    return ",".join(out)


if __name__ == "__main__":
    sys.exit(main())
