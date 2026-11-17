#!/usr/bin/env bash
# Supabase Free 프로젝트가 활동 부족으로 일시 정지되지 않도록 실제 요청을 보낸다.
# 신입 계정으로 로그인한 뒤 본인 과제를 한 건 조회한다(Auth와 DB 모두 사용). 아무것도 바꾸지 않는다.
#
#   scripts/keepalive.sh <supabase_url> <anon_key>      환경변수 DEMO_PASSWORD (출력하지 않음)
#
# 실패하면(일시 정지·장애·비밀번호 불일치) 0이 아닌 값으로 끝나 GitHub Actions가 실패를 알린다.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "사용법: $0 <supabase_url> <anon_key>" >&2
  exit 2
fi
if [ -z "${DEMO_PASSWORD:-}" ]; then
  echo "[keepalive] DEMO_PASSWORD 환경변수가 필요합니다." >&2
  exit 2
fi

supabase="${1%/}"
anon_key="$2"
body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

http() {
  curl -sS -o "$body_file" -w '%{http_code}' --max-time 20 "$@" 2>/dev/null || echo 000
}

status="$(jq -n --arg e "newhire@demo.test" --arg p "$DEMO_PASSWORD" '{email:$e, password:$p}' |
  http -X POST "$supabase/auth/v1/token?grant_type=password" \
    -H "apikey: $anon_key" -H "Content-Type: application/json" --data-binary @-)"
if [ "$status" != 200 ]; then
  echo "[keepalive] 실패: 로그인 → ${status} (일시 정지면 Supabase 대시보드에서 Restore)" >&2
  exit 1
fi
token="$(jq -r '.access_token // empty' "$body_file")"
: >"$body_file"
[ -n "$token" ] || { echo "[keepalive] 실패: 로그인 응답에 토큰 없음" >&2; exit 1; }

status="$(http "$supabase/rest/v1/task_instances?select=id&limit=1" \
  -H "apikey: $anon_key" -H "Authorization: Bearer $token")"
unset token
if [ "$status" != 200 ]; then
  echo "[keepalive] 실패: 과제 조회 → ${status}" >&2
  exit 1
fi
echo "[keepalive] 통과: 로그인과 DB 조회"
