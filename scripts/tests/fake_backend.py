"""smoke.sh 테스트용 가짜 서버. 웹·에이전트·Supabase 경로를 한 포트에서 흉내 낸다.

FAKE_FAULTS(쉼표 구분)로 고장을 하나씩 켠다:
  bad_version   /health의 version이 기대값과 다르다
  no_spa        /me가 404 (SPA 리라이트 없음)
  bad_login     로그인 거부
  task_count    과제가 30개만 보인다
  signup_open   공개 가입이 열려 있다
  signup_429    가입 요청이 요청 제한(429)으로 실패한다(가입 차단 여부를 알 수 없음)
  signup_500    가입 요청이 서버 오류로 실패한다
  chat_open     토큰 없이 /chat이 200
첫 줄에 실제 포트 번호를 출력한다.
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FAULTS = set(filter(None, os.environ.get("FAKE_FAULTS", "").split(",")))
VERSION = os.environ.get("FAKE_VERSION", "dev")
ANON_KEY = os.environ["FAKE_ANON_KEY"]
PASSWORD = os.environ["FAKE_PASSWORD"]
TOKEN = "fake-access-token"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - 테스트 출력을 깨끗하게 둔다
        del format, args

    def _send(self, status, body, content_type="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        return json.loads(raw or b"{}")

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/health":
            version = "wrong" if "bad_version" in FAULTS else VERSION
            return self._send(200, {"ok": True, "version": version})
        if path == "/" or (path == "/me" and "no_spa" not in FAULTS):
            return self._send(200, b"<!doctype html><div id=root></div>", "text/html")
        if path == "/rest/v1/task_instances":
            if self.headers.get("apikey") != ANON_KEY:
                return self._send(401, {"message": "no apikey"})
            if self.headers.get("Authorization") != f"Bearer {TOKEN}":
                return self._send(200, [])  # RLS: 토큰 없으면 0행
            count = 30 if "task_count" in FAULTS else 31
            return self._send(200, [{"id": str(i)} for i in range(count)])
        return self._send(404, {"message": "not found"})

    def do_POST(self):
        path, _, query = self.path.partition("?")
        if self.headers.get("apikey") is None and path.startswith("/auth/"):
            return self._send(401, {"message": "no apikey"})
        if path == "/auth/v1/token" and query == "grant_type=password":
            body = self._body()
            ok = (
                self.headers.get("apikey") == ANON_KEY
                and body.get("email") == "newhire@demo.test"
                and body.get("password") == PASSWORD
                and "bad_login" not in FAULTS
            )
            if ok:
                return self._send(200, {"access_token": TOKEN, "token_type": "bearer"})
            return self._send(400, {"error": "invalid_grant"})
        if path == "/auth/v1/signup":
            self._body()
            if "signup_open" in FAULTS:
                return self._send(200, {"id": "new-user"})
            if "signup_429" in FAULTS:
                return self._send(429, {"error_code": "over_request_rate_limit"})
            if "signup_500" in FAULTS:
                return self._send(500, {"error_code": "unexpected_failure"})
            return self._send(422, {"error_code": "signup_disabled"})
        if path == "/chat":
            self._body()
            if "chat_open" in FAULTS or self.headers.get("Authorization"):
                return self._send(200, b"data: {}\n\n", "text/event-stream")
            return self._send(401, {"detail": "unauthorized"})
        return self._send(404, {"message": "not found"})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    print(server.server_address[1], flush=True)
    sys.stdout.close()
    server.serve_forever()
