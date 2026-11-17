#!/usr/bin/env bash
# scripts/keepalive.sh를 가짜 서버(fake_backend.py)에 돌려 판정 로직을 확인한다.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../keepalive.sh"
anon="anon-test-key"
password="pw-$RANDOM-$RANDOM-secret"
failures=0

run_case() { # <이름> <기대: ok|fail> <FAKE_FAULTS>
  local name="$1" expect="$2" faults="$3"
  local port_file out pid port code=0
  port_file="$(mktemp)"; out="$(mktemp)"
  FAKE_FAULTS="$faults" FAKE_ANON_KEY="$anon" FAKE_PASSWORD="$password" \
    python3 -I "$here/fake_backend.py" >"$port_file" &
  pid=$!
  for _ in $(seq 50); do [ -s "$port_file" ] && break; sleep 0.1; done
  port="$(head -1 "$port_file")"

  DEMO_PASSWORD="$password" bash "$script" "http://127.0.0.1:$port" "$anon" >"$out" 2>&1 || code=$?
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null || true

  local ok=1
  if [ "$expect" = ok ] && [ "$code" -ne 0 ]; then ok=0; fi
  if [ "$expect" = fail ] && [ "$code" -eq 0 ]; then ok=0; fi
  if grep -qF "$password" "$out" || grep -qF "fake-access-token" "$out"; then
    echo "  출력에 비밀번호나 토큰이 들어 있음"; ok=0
  fi
  if [ "$ok" = 1 ]; then
    echo "PASS $name (exit $code)"
  else
    echo "FAIL $name (exit $code, 기대 $expect)"; sed 's/^/  | /' "$out"
    failures=$((failures + 1))
  fi
  rm -f "$port_file" "$out"
}

run_case "정상: 로그인 후 과제 조회" ok ""
run_case "로그인 실패면 실패"        fail "bad_login"

# 서버가 응답하지 않으면(일시 정지 등) 실패
if DEMO_PASSWORD=x SMOKE_RETRY_DELAY=0 bash "$script" "http://127.0.0.1:9" "$anon" >/dev/null 2>&1; then
  echo "FAIL 연결 실패인데 성공으로 끝남"; failures=$((failures + 1))
else
  echo "PASS 연결 실패면 실패"
fi
if DEMO_PASSWORD="" bash "$script" a b >/dev/null 2>&1; then
  echo "FAIL DEMO_PASSWORD 없이 실행되면 안 됨"; failures=$((failures + 1))
else
  echo "PASS DEMO_PASSWORD 없으면 실패"
fi

if [ "$failures" -ne 0 ]; then echo "${failures}개 실패"; exit 1; fi
echo "모두 통과"
