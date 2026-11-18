#!/usr/bin/env bash
# 에이전트 서비스를 Cloud Run에 배포한다(소스 → Cloud Build → Artifact Registry → Cloud Run).
#
#   scripts/deploy-agent.sh <staging|prod> <git_sha>
#
# 필요한 환경변수 (GitHub Environments에서 받는다. 비밀값은 여기서 다루지 않는다)
#   GCP_PROJECT_ID        GCP 프로젝트 ID
#   SUPABASE_URL          해당 환경 Supabase 주소
#   SUPABASE_ANON_KEY     해당 환경 anon key(공개 값)
#   OPENAI_MODEL          모델 이름
#   OPENAI_EMBEDDING_MODEL 임베딩 모델 이름(1536차원). 채팅 조항 검색과 문서 색인에 쓴다
#   WEB_URL               해당 환경 웹 주소 → ALLOWED_ORIGINS
#   ALLOWED_ORIGIN_REGEX  (선택) PR 미리보기 채널 주소 패턴. 스테이징에만 둔다
#   CHAT_DAILY_LIMIT, EXAM_DAILY_LIMIT (선택) 하루 사용 한도(양의 정수). 없으면 서비스 기본값(50, 10)
#   RUNTIME_SERVICE_ACCOUNT (선택) 기본 agent-runtime@<프로젝트>.iam.gserviceaccount.com
#
# 비밀값은 Secret Manager 참조로만 연결한다(값이 이 스크립트·로그를 거치지 않는다):
#   OPENAI_API_KEY            ← openai-api-key
#   SUPABASE_SERVICE_ROLE_KEY ← supabase-service-role-key-<env>
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "사용법: $0 <staging|prod> <git_sha>" >&2
  exit 2
fi
env_name="$1"
git_sha="$2"

case "$env_name" in
  staging) min_instances=0 ;;
  prod) min_instances=1 ;;
  *) echo "[deploy-agent] 환경은 staging 또는 prod여야 합니다: $env_name" >&2; exit 2 ;;
esac

missing=()
for var in GCP_PROJECT_ID SUPABASE_URL SUPABASE_ANON_KEY OPENAI_MODEL OPENAI_EMBEDDING_MODEL WEB_URL; do
  [ -n "${!var:-}" ] || missing+=("$var")
done
if [ "${#missing[@]}" -ne 0 ]; then
  echo "[deploy-agent] 환경변수가 없습니다: ${missing[*]}" >&2
  exit 2
fi
[ -n "$git_sha" ] || { echo "[deploy-agent] git_sha가 비어 있습니다." >&2; exit 2; }
# 잘못된 한도 값은 새 리비전이 시작하지 못하게 하므로 배포 전에 막는다
for var in CHAT_DAILY_LIMIT EXAM_DAILY_LIMIT; do
  value="${!var:-}"
  if [ -n "$value" ] && ! [[ "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "[deploy-agent] ${var}는 양의 정수여야 합니다: $value" >&2
    exit 2
  fi
done

service="agent-${env_name}"
region="asia-northeast3"
runtime_sa="${RUNTIME_SERVICE_ACCOUNT:-agent-runtime@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"

# 환경변수는 YAML 파일로 넘긴다(정규식의 쉼표·특수문자가 --set-env-vars 구분자와 섞이지 않게).
yaml_quote() { printf "'%s'" "${1//\'/\'\'}"; }
env_file="$(mktemp)"
trap 'rm -f "$env_file"' EXIT
{
  echo "SUPABASE_URL: $(yaml_quote "$SUPABASE_URL")"
  echo "SUPABASE_ANON_KEY: $(yaml_quote "$SUPABASE_ANON_KEY")"
  echo "OPENAI_MODEL: $(yaml_quote "$OPENAI_MODEL")"
  echo "OPENAI_EMBEDDING_MODEL: $(yaml_quote "$OPENAI_EMBEDDING_MODEL")"
  echo "ALLOWED_ORIGINS: $(yaml_quote "${WEB_URL%/}")"
  if [ -n "${ALLOWED_ORIGIN_REGEX:-}" ]; then
    echo "ALLOWED_ORIGIN_REGEX: $(yaml_quote "$ALLOWED_ORIGIN_REGEX")"
  fi
  for var in CHAT_DAILY_LIMIT EXAM_DAILY_LIMIT; do
    if [ -n "${!var:-}" ]; then
      echo "$var: $(yaml_quote "${!var}")"
    fi
  done
  echo "GIT_SHA: $(yaml_quote "$git_sha")"
} >"$env_file"

echo "[deploy-agent] $service ← $git_sha (최소 인스턴스 $min_instances)"
gcloud run deploy "$service" \
  --project "$GCP_PROJECT_ID" \
  --region "$region" \
  --source "$repo_root/services/agent" \
  --service-account "$runtime_sa" \
  --memory 1Gi \
  --concurrency 20 \
  --max-instances 3 \
  --min-instances "$min_instances" \
  --timeout 300 \
  --allow-unauthenticated \
  --env-vars-file "$env_file" \
  --set-secrets "OPENAI_API_KEY=openai-api-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key-${env_name}:latest" \
  --quiet

# 롤백(update-traffic --to-revisions)으로 트래픽이 이전 리비전에 고정돼 있으면 Cloud Run은 새 배포에도
# 그 고정을 유지한다. 방금 배포한 리비전이 트래픽을 받도록 최신으로 되돌린다.
gcloud run services update-traffic "$service" \
  --project "$GCP_PROJECT_ID" \
  --region "$region" \
  --to-latest \
  --quiet

gcloud run services describe "$service" \
  --project "$GCP_PROJECT_ID" --region "$region" --format 'value(status.url)'
