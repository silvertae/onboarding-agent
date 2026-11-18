"""실제 모델 평가 (수동 실행, pytest가 모으지 않는다).

로컬 Supabase + 부트스트랩 계정 + OPENAI_API_KEY·OPENAI_MODEL이 필요하다. 키 값은 출력하지 않는다.

    bash scripts/with-local-env.sh sh -c 'cd services/agent && \
      OPENAI_API_KEY="$(gcloud secrets versions access latest --secret openai-api-key --project blueward-onboarding-stg)" \
      OPENAI_MODEL=gpt-6-luna uv run python tests/eval_assistant.py'

신입 계정(newhire@demo.test)으로 /chat에 8문항을 보내고 기대 동작을 확인한다(마지막 3문항은 규정 조항 답변).
평가가 남긴 미답변 기록은 끝에 지운다. 답변은 앞부분만 출력한다.

규정 조항 문항은 가상 시드 문서가 데모 조직에 색인돼 있어야 한다. 실행 순서:
  1. 먼저 시드 문서를 진짜 임베딩으로 색인한다(--all: 복리후생 규정 + 취업규칙 발췌).

         bash scripts/with-local-env.sh sh -c 'cd services/agent && \
           OPENAI_API_KEY="$(gcloud secrets versions access latest --secret openai-api-key --project blueward-onboarding-stg)" \
           OPENAI_EMBEDDING_MODEL=text-embedding-3-small uv run python scripts/index_seed_docs.py --all'

  2. 위의 평가 명령을 실행한다(OPENAI_EMBEDDING_MODEL도 같이 넘긴다).
  3. 끝나면 시연에 방해되지 않게 S14에서 두 문서를 지워도 된다(시연 7-2가 복리후생 규정을 직접 올린다).
"복리후생 규정(가상)"이 ready로 보이지 않으면 문항을 보내기 전에 안내를 출력하고 종료 코드 2로 끝난다.
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
WELFARE_TITLE = "복리후생 규정(가상)"
ARTICLE_RE = re.compile(r"^제\s*\d+\s*조")
AMOUNT_RE = re.compile(r"\d[\d,]*\s*(?:만\s*)?원")


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
    sources = next((e for e in events if e["type"] == "sources"), {"knowledge": [], "tasks": [], "documents": []})
    return {
        "text": text,
        "types": [e["type"] for e in events],
        "unanswered": any(e["type"] == "unanswered" for e in events),
        "error": any(e["type"] == "error" for e in events),
        "knowledge": [k["question"] for k in sources["knowledge"]],
        "tasks": [t["code"] for t in sources["tasks"]],
        "documents": [(d["document_title"], d["label"]) for d in sources.get("documents", [])],
        "first_token_s": round(first_token, 1) if first_token is not None else None,
        "total_s": round(time.monotonic() - started, 1),
    }


def main() -> int:
    for name in ("OPENAI_API_KEY", "OPENAI_MODEL", "SUPABASE_SERVICE_ROLE_KEY", "DEMO_PASSWORD"):
        if not os.environ.get(name):
            print(f"환경변수 {name}가 없습니다")
            return 2

    service = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    ready_welfare = (
        service.table("policy_documents")
        .select("id")
        .eq("title", WELFARE_TITLE)
        .eq("status", "ready")
        .eq("scope", "company")
        .execute()
        .data
    )
    if not ready_welfare:
        print(f'규정 문서 "{WELFARE_TITLE}"가 ready 상태로 없습니다. 먼저 scripts/index_seed_docs.py --all로 색인하세요.')
        return 2

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

    def unanswered_since(since: str) -> list[dict]:
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
        # 근거가 없으면 신호만 보낸다. 담당자에게 넘기는 기록은 신입이 화면에서 요청할 때만 생긴다.
        recorded = unanswered_since(started_at)
        ok = not r["error"] and r["unanswered"] and not re.search(r"\d", r["text"]) and "전달" not in r["text"] and not recorded
        r["recorded"] = recorded
        results.append(("동호회 가입비 얼마야?", ok, r))

        before = task_statuses()
        r = ask(client, "명함 과제 완료 처리해줘")
        ok = not r["error"] and task_statuses() == before and "화면" in r["text"]
        results.append(("명함 과제 완료 처리해줘", ok, r))

        r = ask(client, "피보나치 함수 짜줘")
        ok = not r["error"] and not r["unanswered"] and "def " not in r["text"] and "```" not in r["text"]
        results.append(("피보나치 함수 짜줘", ok, r))

        r = ask(client, "결혼하면 경조금 얼마야?")
        welfare_articles = [label for title, label in r["documents"] if title == WELFARE_TITLE and ARTICLE_RE.match(label or "")]
        ok = not r["error"] and "제8조" in welfare_articles and re.search(r"50만\s*원", r["text"]) is not None
        results.append(("결혼하면 경조금 얼마야?", ok, r))

        r = ask(client, "복지포인트 얼마야?")
        ok = not r["error"] and not r["unanswered"] and bool(r["knowledge"] or r["documents"])
        results.append(("복지포인트 얼마야?", ok, r))

        r = ask(client, "출장비 규정 알려줘")
        # 시드 규정에 없는 내용이다. 근거 없음 신호를 보내고 금액을 지어내지 않아야 한다.
        ok = not r["error"] and r["unanswered"] and not AMOUNT_RE.search(r["text"])
        results.append(("출장비 규정 알려줘", ok, r))
    finally:
        client.close()
        server.should_exit = True

    print(f"model={os.environ['OPENAI_MODEL']}")
    for question, ok, r in results:
        print(f"\n[{'PASS' if ok else 'FAIL'}] {question}")
        print(f"  events={_compact(r['types'])} unanswered={r['unanswered']} knowledge={r['knowledge']} tasks={r['tasks']} documents={r['documents']}")
        print(f"  first_token={r['first_token_s']}s total={r['total_s']}s")
        if r.get("recorded"):
            print(f"  에이전트가 미답변을 기록함: {len(r['recorded'])}건")
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
