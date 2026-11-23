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
export OPENAI_MODEL=model-x OPENAI_EMBEDDING_MODEL=embed-x WEB_URL=https://site.web.app/
export ALLOWED_ORIGIN_REGEX="^https://site--pr-[0-9]+-[a-z0-9]+\.web\.app\$"

run staging abc123
deploy_line="$(grep '^run deploy' "$work/log" || true)"
check "staging 배포 성공" test "$code" -eq 0
check "서비스 이름 agent-staging" grep -q '^run deploy agent-staging ' "$work/log"
check "staging 최소 인스턴스 1(콜드 스타트 방지)" grep -q -- '--min-instances 1 ' <<<"$deploy_line"
check "서울 리전" grep -q -- '--region asia-northeast3 ' <<<"$deploy_line"
for flag in '--memory 1Gi' '--concurrency 20' '--max-instances 3' '--timeout 300' '--allow-unauthenticated' \
  '--service-account agent-runtime@demo-project.iam.gserviceaccount.com'; do
  check "공통 설정 $flag" grep -q -- "$flag" <<<"$deploy_line"
done
check "비밀값은 Secret Manager 참조" grep -q -- \
  '--set-secrets OPENAI_API_KEY=openai-api-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key-staging:latest' \
  <<<"$deploy_line"
check "GIT_SHA 전달" grep -qx "GIT_SHA: 'abc123'" "$work/env.yaml"
check "모델 이름 전달" grep -qx "OPENAI_MODEL: 'model-x'" "$work/env.yaml"
check "임베딩 모델 이름 전달" grep -qx "OPENAI_EMBEDDING_MODEL: 'embed-x'" "$work/env.yaml"
check "ALLOWED_ORIGINS = 웹 주소(끝 / 제거)" grep -qx "ALLOWED_ORIGINS: 'https://site.web.app'" "$work/env.yaml"
check "정규식 그대로 전달" grep -qxF "ALLOWED_ORIGIN_REGEX: '^https://site--pr-[0-9]+-[a-z0-9]+\.web\.app\$'" "$work/env.yaml"
check "비밀값 이름이 환경변수 파일에 없음" bash -c "! grep -Eq 'OPENAI_API_KEY|SERVICE_ROLE' '$work/env.yaml'"
# 롤백으로 트래픽이 이전 리비전에 고정돼 있어도 새 리비전이 트래픽을 받아야 한다(Cloud Run은 고정을 유지한다)
traffic_line="$(grep -n '^run services update-traffic' "$work/log" || true)"
check "배포 후 최신 리비전으로 트래픽 전환" grep -q -- \
  'run services update-traffic agent-staging --project demo-project --region asia-northeast3 --to-latest' <<<"$traffic_line"
check "트래픽 전환은 배포 다음에" test "$(grep -n '^run deploy' "$work/log" | cut -d: -f1)" -lt "${traffic_line%%:*}"

ALLOWED_ORIGIN_REGEX="" run prod def456
check "prod 배포 성공" test "$code" -eq 0
check "prod 최소 인스턴스 1" grep -q -- '^run deploy agent-prod .*--min-instances 1 ' "$work/log"
check "prod 서비스 롤 키는 prod 비밀" grep -q 'supabase-service-role-key-prod:latest' "$work/log"
check "prod도 최신 리비전으로 트래픽 전환" grep -q -- \
  '^run services update-traffic agent-prod .*--to-latest' "$work/log"
check "prod에는 정규식 없음" bash -c "! grep -q ALLOWED_ORIGIN_REGEX '$work/env.yaml'"

run dev abc
check "알 수 없는 환경 거부" test "$code" -ne 0
check "알 수 없는 환경이면 gcloud 호출 없음" test ! -s "$work/log"

OPENAI_MODEL="" run staging abc
check "필수 변수 없으면 거부" test "$code" -ne 0
check "누락 변수 이름을 알려 줌" grep -q OPENAI_MODEL "$work/err"

# 임베딩 모델이 없으면 채팅은 조항 없이 답하고 문서 색인은 실패한다. 조용히 꺼지지 않게 배포를 막는다.
OPENAI_EMBEDDING_MODEL="" run staging abc
check "임베딩 모델 없으면 거부" test "$code" -ne 0
check "누락된 임베딩 모델 이름을 알려 줌" grep -q OPENAI_EMBEDDING_MODEL "$work/err"
check "임베딩 모델 없으면 gcloud 호출 없음" test ! -s "$work/log"

# 하루 한도는 선택 값이다. 없으면 환경변수 파일에 넣지 않아 서비스 기본값(채팅 50, 시험 10)을 쓴다.
run staging abc
check "한도 값이 없으면 파일에 넣지 않음" bash -c "! grep -q DAILY_LIMIT '$work/env.yaml'"

CHAT_DAILY_LIMIT=1000 EXAM_DAILY_LIMIT=200 run staging abc
check "한도 값이 있으면 배포 성공" test "$code" -eq 0
check "채팅 한도 전달" grep -qx "CHAT_DAILY_LIMIT: '1000'" "$work/env.yaml"
check "시험 한도 전달" grep -qx "EXAM_DAILY_LIMIT: '200'" "$work/env.yaml"

for bad in abc 0 -5 1.5 '10 '; do
  CHAT_DAILY_LIMIT="$bad" run staging abc
  check "잘못된 채팅 한도 '$bad' 거부" test "$code" -ne 0
  check "잘못된 채팅 한도 '$bad'면 gcloud 호출 없음" test ! -s "$work/log"
done
EXAM_DAILY_LIMIT=x run staging abc
check "잘못된 시험 한도 거부" test "$code" -ne 0
check "잘못된 한도 변수 이름을 알려 줌" grep -q EXAM_DAILY_LIMIT "$work/err"

if [ "$failures" -ne 0 ]; then echo "${failures}개 실패"; exit 1; fi
echo "모두 통과"
