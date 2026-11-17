#!/usr/bin/env bash
# scripts/deploy-agent.sh가 gcloud에 넘기는 인자와 환경변수 파일을 가짜 gcloud로 확인한다.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../deploy-agent.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

# 가짜 gcloud: 인자를 기록하고 --env-vars-file 내용을 복사해 둔다.
mkdir -p "$work/bin"
cat >"$work/bin/gcloud" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_LOG"
prev=""
for a in "$@"; do
  [ "$prev" = "--env-vars-file" ] && cp "$a" "$FAKE_ENV_COPY"
  prev="$a"
done
EOF
chmod +x "$work/bin/gcloud"

check() { # <설명> <조건 명령...>
  local name="$1"; shift
  if "$@"; then echo "PASS $name"; else echo "FAIL $name"; failures=$((failures + 1)); fi
}

run() { # <env> <sha> → 종료 코드를 $code에
  : >"$work/log"; : >"$work/env.yaml"
  code=0
  PATH="$work/bin:$PATH" FAKE_LOG="$work/log" FAKE_ENV_COPY="$work/env.yaml" \
    bash "$script" "$@" >/dev/null 2>"$work/err" || code=$?
}

export GCP_PROJECT_ID=demo-project SUPABASE_URL=https://ref.supabase.co SUPABASE_ANON_KEY=anon-public
export OPENAI_MODEL=model-x WEB_URL=https://site.web.app/
export ALLOWED_ORIGIN_REGEX="^https://site--pr-[0-9]+-[a-z0-9]+\.web\.app\$"

run staging abc123
deploy_line="$(grep '^run deploy' "$work/log" || true)"
check "staging 배포 성공" test "$code" -eq 0
check "서비스 이름 agent-staging" grep -q '^run deploy agent-staging ' "$work/log"
check "staging 최소 인스턴스 0" grep -q -- '--min-instances 0 ' <<<"$deploy_line"
check "서울 리전" grep -q -- '--region asia-northeast3 ' <<<"$deploy_line"
for flag in '--memory 1Gi' '--concurrency 20' '--max-instances 3' '--timeout 300' '--allow-unauthenticated' \
  '--service-account agent-runtime@demo-project.iam.gserviceaccount.com'; do
  check "공통 설정 $flag" grep -q -- "$flag" <<<"$deploy_line"
done
check "비밀값은 Secret Manager 참조" grep -q -- \
  '--set-secrets OPENAI_API_KEY=openai-api-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key-staging:latest' \
  <<<"$deploy_line"
check "GIT_SHA 전달" grep -qx "GIT_SHA: 'abc123'" "$work/env.yaml"
check "ALLOWED_ORIGINS = 웹 주소(끝 / 제거)" grep -qx "ALLOWED_ORIGINS: 'https://site.web.app'" "$work/env.yaml"
check "정규식 그대로 전달" grep -qxF "ALLOWED_ORIGIN_REGEX: '^https://site--pr-[0-9]+-[a-z0-9]+\.web\.app\$'" "$work/env.yaml"
check "비밀값 이름이 환경변수 파일에 없음" bash -c "! grep -Eq 'OPENAI_API_KEY|SERVICE_ROLE' '$work/env.yaml'"

ALLOWED_ORIGIN_REGEX="" run prod def456
check "prod 배포 성공" test "$code" -eq 0
check "prod 최소 인스턴스 1" grep -q -- '^run deploy agent-prod .*--min-instances 1 ' "$work/log"
check "prod 서비스 롤 키는 prod 비밀" grep -q 'supabase-service-role-key-prod:latest' "$work/log"
check "prod에는 정규식 없음" bash -c "! grep -q ALLOWED_ORIGIN_REGEX '$work/env.yaml'"

run dev abc
check "알 수 없는 환경 거부" test "$code" -ne 0
check "알 수 없는 환경이면 gcloud 호출 없음" test ! -s "$work/log"

OPENAI_MODEL="" run staging abc
check "필수 변수 없으면 거부" test "$code" -ne 0
check "누락 변수 이름을 알려 줌" grep -q OPENAI_MODEL "$work/err"

if [ "$failures" -ne 0 ]; then echo "${failures}개 실패"; exit 1; fi
echo "모두 통과"
