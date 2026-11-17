#!/usr/bin/env bash
# 로컬 Supabase 값을 환경변수로 채운 뒤 인자로 받은 명령을 실행한다.
# .env 파일을 만들거나 읽지 않는다. 값은 화면에 출력하지 않는다.
# 이미 설정된 환경변수는 덮어쓰지 않는다.
set -euo pipefail

if status_env=$(supabase status -o env \
  --override-name api.url=SB_API_URL,auth.anon_key=SB_ANON_KEY,auth.service_role_key=SB_SERVICE_ROLE_KEY \
  2>/dev/null); then
  eval "$status_env"
  export SUPABASE_URL="${SUPABASE_URL:-$SB_API_URL}"
  export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$SB_ANON_KEY}"
  export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SB_SERVICE_ROLE_KEY}"
  unset SB_API_URL SB_ANON_KEY SB_SERVICE_ROLE_KEY
else
  echo "[with-local-env] 로컬 Supabase가 꺼져 있습니다. 'supabase start' 후 다시 실행하세요." >&2
fi

# 웹(공개 값)
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-${SUPABASE_URL:-}}"
export VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}"
export VITE_AGENT_URL="${VITE_AGENT_URL:-http://localhost:8000}"
export VITE_ENV_LABEL="${VITE_ENV_LABEL:-local}"

# 에이전트·부트스트랩 로컬 기본값 (스테이징·운영은 GitHub Secrets에서 받는다)
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:5173}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@demo.test}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-demo1234}"
export DEMO_PASSWORD="${DEMO_PASSWORD:-demo1234}"

exec "$@"
