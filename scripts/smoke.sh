#!/usr/bin/env bash
# 배포 직후 점검. 하나라도 실패하면 그 단계에서 멈추고 0이 아닌 값으로 끝난다.
#
#   scripts/smoke.sh <web_url> <agent_url> <supabase_url> <anon_key>
#
# 환경변수
#   DEMO_PASSWORD     (필수) newhire@demo.test 비밀번호. 출력하지 않는다.
#   EXPECT_VERSION    /health의 version 기대값. 기본: $GIT_SHA, 없으면 "dev"(로컬)
#   SMOKE_RETRIES     /health 재시도 횟수(기본 6). 막 배포한 서비스가 뜨는 시간을 기다린다.
#   SMOKE_RETRY_DELAY 재시도 간격 초(기본 5)
#
# 점검 순서 (구현 계획 Task 6)
#   1. GET <agent>/health → ok true, version == 배포한 커밋
#   2. GET <web>/ → 200, GET <web>/me → 200 (SPA 리라이트)
#   3. newhire@demo.test 로그인 → 토큰
#   4. 그 토큰으로 task_instances 조회 → 31행
#   5. 같은 anon key로 가입 요청 → 거부
#   6. 토큰 없이 POST <agent>/chat → 401
set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "사용법: $0 <web_url> <agent_url> <supabase_url> <anon_key>" >&2
  exit 2
fi
if [ -z "${DEMO_PASSWORD:-}" ]; then
  echo "[smoke] DEMO_PASSWORD 환경변수가 필요합니다." >&2
  exit 2
fi
for cmd in curl jq; do
  command -v "$cmd" >/dev/null || { echo "[smoke] $cmd 명령이 필요합니다." >&2; exit 2; }
done

web="${1%/}"
agent="${2%/}"
supabase="${3%/}"
anon_key="$4"
expect_version="${EXPECT_VERSION:-${GIT_SHA:-dev}}"
retries="${SMOKE_RETRIES:-6}"
delay="${SMOKE_RETRY_DELAY:-5}"
newhire_email="newhire@demo.test"
expect_tasks=31

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

fail() { # <단계> <내용>
  echo "[smoke] 실패: $1단계 - $2" >&2
  exit 1
}
pass() { echo "[smoke] 통과: $1단계 - $2"; }

# HTTP 상태 코드만 표준 출력으로, 응답 본문은 ${body_file}에 둔다. 연결 실패는 000.
http() {
  curl -sS -o "$body_file" -w '%{http_code}' --max-time 20 "$@" 2>/dev/null || echo 000
}

# 1. 에이전트 상태와 버전
status=000
for attempt in $(seq "$retries"); do
  status="$(http "$agent/health")"
  [ "$status" = 200 ] && break
  [ "$attempt" -lt "$retries" ] && sleep "$delay"
done
[ "$status" = 200 ] || fail 1 "GET /health → $status"
jq -e '.ok == true' "$body_file" >/dev/null 2>&1 || fail 1 "/health 응답에 ok:true가 없습니다"
version="$(jq -r '.version // empty' "$body_file")"
[ "$version" = "$expect_version" ] || fail 1 "version '$version' (기대 '$expect_version')"
pass 1 "/health ok, version $version"

# 2. 웹과 SPA 리라이트
for path in / /me; do
  status="$(http "$web$path")"
  [ "$status" = 200 ] || fail 2 "GET $path → $status"
done
pass 2 "웹 / 와 /me 200"

# 3. 신입 로그인 (비밀번호는 표준 입력으로 넘겨 프로세스 목록·로그에 남기지 않는다)
status="$(jq -n --arg e "$newhire_email" --arg p "$DEMO_PASSWORD" '{email:$e, password:$p}' |
  http -X POST "$supabase/auth/v1/token?grant_type=password" \
    -H "apikey: $anon_key" -H "Content-Type: application/json" --data-binary @-)"
[ "$status" = 200 ] || fail 3 "$newhire_email 로그인 → $status"
token="$(jq -r '.access_token // empty' "$body_file")"
[ -n "$token" ] || fail 3 "로그인 응답에 access_token이 없습니다"
: >"$body_file"
pass 3 "$newhire_email 로그인"

# 4. 신입 토큰으로 본인 과제 조회 (RLS 적용)
status="$(http "$supabase/rest/v1/task_instances?select=id" \
  -H "apikey: $anon_key" -H "Authorization: Bearer $token")"
[ "$status" = 200 ] || fail 4 "task_instances 조회 → $status"
count="$(jq 'length' "$body_file" 2>/dev/null || echo "?")"
[ "$count" = "$expect_tasks" ] || fail 4 "과제 ${count}개 (기대 ${expect_tasks}개)"
pass 4 "신입 과제 ${count}개"
unset token

# 5. 공개 가입 차단
signup_email="smoke-$(date +%s)-$RANDOM@demo.test"
signup_password="smoke-$(date +%s)-$RANDOM-$RANDOM"
status="$(jq -n --arg e "$signup_email" --arg p "$signup_password" '{email:$e, password:$p}' |
  http -X POST "$supabase/auth/v1/signup" \
    -H "apikey: $anon_key" -H "Content-Type: application/json" --data-binary @-)"
case "$status" in
  2*) fail 5 "공개 가입이 열려 있습니다($status). 대시보드에서 가입을 끄고 $signup_email 계정을 지우세요" ;;
  000) fail 5 "Supabase Auth에 연결하지 못했습니다" ;;
esac
# 요청 제한·서버 오류 같은 다른 실패는 가입이 꺼졌다는 증거가 아니다. 가입 차단 오류만 통과시킨다.
if ! jq -e '.error_code == "signup_disabled"' "$body_file" >/dev/null 2>&1; then
  fail 5 "가입 요청이 ${status}로 실패했지만 가입 차단(signup_disabled) 응답이 아닙니다"
fi
pass 5 "공개 가입 거부($status signup_disabled)"

# 6. 토큰 없는 채팅 요청 거부
status="$(http -X POST "$agent/chat" -H "Content-Type: application/json" \
  --data '{"message":"smoke","history":[]}')"
[ "$status" = 401 ] || fail 6 "토큰 없는 POST /chat → $status (기대 401)"
pass 6 "토큰 없는 /chat 401"

echo "[smoke] 모두 통과"
