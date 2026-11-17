#!/usr/bin/env bash
# scripts/smoke.sh를 가짜 서버(fake_backend.py)에 돌려 판정 로직을 확인한다.
# 실제 스테이징·운영 점검은 배포 워크플로가 smoke.sh를 직접 실행한다.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
smoke="$here/../smoke.sh"
anon="anon-test-key"
password="pw-$RANDOM-$RANDOM-secret"
failures=0

run_case() { # <이름> <기대: 0 | 실패해야 할 단계 번호> <FAKE_FAULTS> [EXPECT_VERSION]
  local name="$1" expect="$2" faults="$3" version="${4:-dev}"
  local port_file out pid port code=0
  port_file="$(mktemp)"; out="$(mktemp)"
  FAKE_FAULTS="$faults" FAKE_ANON_KEY="$anon" FAKE_PASSWORD="$password" FAKE_VERSION=dev \
    python3 -I "$here/fake_backend.py" >"$port_file" &
  pid=$!
  for _ in $(seq 50); do [ -s "$port_file" ] && break; sleep 0.1; done
  port="$(head -1 "$port_file")"
  local base="http://127.0.0.1:$port"

  DEMO_PASSWORD="$password" EXPECT_VERSION="$version" SMOKE_RETRY_DELAY=0 \
    bash "$smoke" "$base" "$base" "$base" "$anon" >"$out" 2>&1 || code=$?
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null || true

  local ok=1
  if [ "$expect" = 0 ] && [ "$code" -ne 0 ]; then ok=0; fi
  if [ "$expect" != 0 ]; then
    # 0이 아닌 코드로 끝나고, 기대한 단계에서 멈췄다고 보고해야 한다
    if [ "$code" -eq 0 ] || ! grep -qF "[smoke] 실패: ${expect}단계" "$out"; then ok=0; fi
  fi
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

run_case "정상 환경은 통과"                0    ""
run_case "version이 배포 커밋과 다르면 실패" 1    ""            "abc123"
run_case "health version 불일치"           1    "bad_version"
run_case "SPA 리라이트 없으면 실패"         2    "no_spa"
run_case "신입 로그인 실패"                3    "bad_login"
run_case "과제가 31개가 아니면 실패"        4    "task_count"
run_case "공개 가입이 열려 있으면 실패"      5    "signup_open"
run_case "가입 요청이 429면 차단 확인 실패"   5    "signup_429"
run_case "가입 요청이 500이면 차단 확인 실패"  5    "signup_500"
run_case "토큰 없는 /chat이 401이 아니면 실패" 6    "chat_open"

# 인자·비밀번호 누락
if DEMO_PASSWORD="" bash "$smoke" a b c d >/dev/null 2>&1; then
  echo "FAIL DEMO_PASSWORD 없이 실행되면 안 됨"; failures=$((failures + 1))
else
  echo "PASS DEMO_PASSWORD 없으면 실패"
fi
if DEMO_PASSWORD=x bash "$smoke" a b >/dev/null 2>&1; then
  echo "FAIL 인자 4개가 아니면 실패해야 함"; failures=$((failures + 1))
else
  echo "PASS 인자 부족하면 실패"
fi

if [ "$failures" -ne 0 ]; then echo "${failures}개 실패"; exit 1; fi
echo "모두 통과"
