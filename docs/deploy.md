# 배포 안내

구현 계획 Task 6의 결과물. 환경 구성, Leo가 먼저 할 일, 배포 흐름, 되돌리기, 운영 점검을 담는다.
**이 문서에는 키·비밀번호 값을 절대 적지 않는다.** 값은 Secret Manager와 GitHub Secrets에만 둔다.

## 환경

| | 로컬 | 스테이징 | 운영 |
|---|---|---|---|
| 용도 | 개발·테스트 | `main` 최신, PR 미리보기의 백엔드 | 심사위원 접속 |
| GCP 프로젝트 | — | 스테이징 전용 프로젝트 | 운영 전용 프로젝트 |
| DB·인증 | Supabase CLI | Supabase 무료 프로젝트 | Supabase 무료 프로젝트, 서울(`ap-northeast-2`) — 일시 정지 방지 `keepalive` |
| 에이전트 | `localhost:8000` | Cloud Run `agent-staging`, 최소 0 | Cloud Run `agent-prod`, 최소 1 |
| 웹 | `localhost:5173` | Firebase Hosting 대상 `staging` + PR 미리보기 채널 | Firebase Hosting 대상 `prod` |
| 배포 계기 | — | `main` 푸시 | `v*` 태그(Leo) |

**환경마다 GCP 프로젝트를 나눈다.** 운영 프로젝트(운영 웹·에이전트·비밀값)에는 운영 배포 작업만 들어갈 수 있다. PR 미리보기와 스테이징 배포가 쓰는 계정은 스테이징 프로젝트 안에서만 권한이 있다. 실제 도입 단계에서도 이 구조를 그대로 쓴다.

Cloud Run 공통(`scripts/deploy-agent.sh`): 리전 `asia-northeast3`, 메모리 1Gi, 동시성 20, 최대 인스턴스 3, 요청 제한 시간 300초, 인증 없이 호출 허용(인증은 서비스가 Supabase 토큰으로 직접 한다), 런타임 서비스 계정 `agent-runtime`.

## 파일

| 파일 | 하는 일 |
|---|---|
| `.github/workflows/ci.yml` | PR: 웹 테스트·빌드 / 배포 스크립트 검사 / 로컬 Supabase로 pgTAP·에이전트 pytest / 스테이징 설정 웹 빌드(인증 없음) → 미리보기 채널(`pr-<번호>`, 7일)에 배포하고 PR에 주소 댓글 |
| `.github/workflows/deploy-staging.yml` | `main` 푸시: 설정 확인 → DB 마이그레이션 → 계정 부트스트랩 → 에이전트 → 웹 → `smoke.sh` |
| `.github/workflows/deploy-prod.yml` | `v*` 태그: 태그 커밋이 `main`에 있는지 확인한 뒤 위와 같은 순서를 운영 대상으로 |
| `.github/workflows/keepalive.yml` | 하루 세 번(한국 09:17·17:17·01:17) 스테이징·운영 Supabase에 신입 로그인·과제 조회를 보내 무료 플랜 일시 정지를 막는다. 실패하면 알림. Actions에서 수동 실행도 가능 |
| `scripts/keepalive.sh <supabase_url> <anon_key>` | 위 요청. `DEMO_PASSWORD` 필요, 아무것도 바꾸지 않는다 |
| `scripts/deploy-agent.sh <staging\|prod> <git_sha>` | Cloud Run 배포. 비밀값은 Secret Manager 참조로만 연결 |
| `scripts/smoke.sh <web> <agent> <supabase> <anon_key>` | 배포 후 6단계 점검. `DEMO_PASSWORD` 필요, `EXPECT_VERSION`으로 커밋 확인 |
| `scripts/tests/*` | 위 두 스크립트를 가짜 서버·가짜 gcloud로 검사(CI `배포 스크립트 검사`) |
| `firebase.json`, `.firebaserc` | 호스팅 대상 `staging`(스테이징 프로젝트)·`prod`(운영 프로젝트), SPA 리라이트, `X-Robots-Tag: noindex`, `/assets/**` 장기 캐시, 페이지는 `no-cache` |
| `apps/web/.env.staging`, `.env.production` | 웹 빌드용 공개 값(`VITE_*`)만. 설정값에 `REPLACE_ME`가 남아 있으면 배포가 멈춘다 |

## Leo가 먼저 할 일

에이전트가 대신 할 수 없는 일이다. 아래 명령의 `<...>`는 Leo가 정하는 값으로 바꾼다. 비밀값을 명령 인자로 쓰지 않도록, 값이 필요한 곳은 입력 프롬프트로 받는다. 같은 셸(macOS 기본 zsh 또는 bash)에서 순서대로 실행한다(앞에서 만든 변수·함수를 뒤에서 쓴다).

```bash
export STAGING_PROJECT=<스테이징 GCP 프로젝트 ID>
export PROD_PROJECT=<운영 GCP 프로젝트 ID>
export STAGING_SITE=<스테이징 Hosting 사이트 ID>   # 예: ${STAGING_PROJECT}-web
export PROD_SITE=<운영 Hosting 사이트 ID>          # 예: ${PROD_PROJECT}-web
export REGION=asia-northeast3
export REPO=<GitHub 소유자>/<저장소>               # 이 저장소의 owner/name
```

### 1. GCP 프로젝트 2개, 결제, API, 예산 알림

```bash
gcloud billing accounts list                                   # 결제 계정 ID 확인
export BILLING=<결제 계정 ID>

for P in "$STAGING_PROJECT" "$PROD_PROJECT"; do
  gcloud projects create "$P"
  gcloud billing projects link "$P" --billing-account="$BILLING"
  gcloud services enable --project "$P" \
    run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
    secretmanager.googleapis.com compute.googleapis.com \
    iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
    firebase.googleapis.com firebasehosting.googleapis.com \
    cloudresourcemanager.googleapis.com serviceusage.googleapis.com billingbudgets.googleapis.com
  # --source 배포가 쓰는 저장소를 미리 만든다(CI에서 생성 확인 프롬프트가 뜨지 않게)
  gcloud artifacts repositories create cloud-run-source-deploy --project "$P" \
    --repository-format=docker --location="$REGION"
done

# 예산 알림은 프로젝트마다 따로(금액·통화는 결제 계정 통화에 맞춘다)
gcloud billing budgets create --billing-account="$BILLING" --display-name="onboarding-agent-staging" \
  --budget-amount=<금액><통화> --filter-projects="projects/$STAGING_PROJECT" \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
gcloud billing budgets create --billing-account="$BILLING" --display-name="onboarding-agent-prod" \
  --budget-amount=<금액><통화> --filter-projects="projects/$PROD_PROJECT" \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
```

### 2. Firebase와 Hosting 사이트 (프로젝트마다 1개)

```bash
npx firebase-tools@15.36.0 login
npx firebase-tools@15.36.0 projects:addfirebase "$STAGING_PROJECT"
npx firebase-tools@15.36.0 projects:addfirebase "$PROD_PROJECT"
npx firebase-tools@15.36.0 hosting:sites:create "$STAGING_SITE" --project "$STAGING_PROJECT"
npx firebase-tools@15.36.0 hosting:sites:create "$PROD_SITE" --project "$PROD_PROJECT"
```

웹 주소는 `https://$STAGING_SITE.web.app`, `https://$PROD_SITE.web.app`이 된다. `.firebaserc`의 `REPLACE_ME`는 6에서 PR로 채운다.

### 3. Supabase 프로젝트 2개

대시보드(supabase.com)에서 만든다. DB 비밀번호는 대시보드에서 생성해 바로 비밀 저장소에 옮기고 다른 곳에 적지 않는다.

| | 운영 | 스테이징 |
|---|---|---|
| 조직·플랜 | 무료(Free). 스테이징과 같은 무료 조직이어도 된다 | 무료(Free) |
| 리전 | Northeast Asia (Seoul) `ap-northeast-2` | 아무 곳(서울 권장) |

**운영도 무료 플랜으로 둔다(Leo 결정, 2026-11-17, 프로토타입 비용 절감).** 무료 플랜의 차이와 대응:

| 무료 플랜 제약 | 대응 |
|---|---|
| 일주일 동안 활동이 적으면 프로젝트가 일시 정지된다(하루 몇 건의 요청이면 대개 유지되지만 보장은 아님) | `.github/workflows/keepalive.yml`이 하루 세 번 실제 로그인·조회를 보낸다. 실패하면 GitHub 알림 메일. Supabase도 정지 약 일주일 전과 정지 시 메일을 보낸다 |
| 자동 백업이 보장되지 않고 다운로드할 수 없다 | 데모 데이터는 마이그레이션·부트스트랩·데모 초기화로 다시 만들 수 있다. 관리자가 만든 심사위원 계정만 다시 만들어야 한다 |
| 활성 무료 프로젝트는 계정당 2개 | 스테이징·운영 두 개로 딱 맞다. 다른 무료 프로젝트를 켜지 않는다 |
| DB 500MB, 월 사용자 5만, 트래픽 5GB | 시연 규모에서는 여유 있다 |

정지되면 Supabase 대시보드에서 프로젝트를 열고 **Restore**를 누른다(데이터·설정·키는 그대로). 정지가 실제로 생기면 **Billing → Upgrade to Pro**로 같은 프로젝트를 바로 Pro로 올릴 수 있다(주소·키 변경 없음).

두 프로젝트 모두:
- **프로젝트 생성 화면의 Security 설정**: "Enable Data API" 켬, **"Automatically expose new tables" 켬**, "Enable automatic RLS" 끔. 관리자 키(`service_role`)의 테이블 권한(`profiles` 조회·추가, `teams`·`task_instances` 조회)은 마이그레이션에 따로 적혀 있지 않고 이 기본 설정에 기대므로, 끄면 계정 부트스트랩과 관리자 계정 등록이 "permission denied"로 실패한다. `anon`·`authenticated` 권한은 마이그레이션이 전부 회수한 뒤 필요한 것만 다시 주므로 이 설정과 상관없다. 로컬 Supabase와 스테이징이 같은 조건이다. (실제 도입 단계에서 `service_role` 권한을 마이그레이션에 명시하면 이 설정을 끌 수 있다.)
- **Authentication → Sign In / Providers → "Allow new users to sign up" 끄기** (`smoke.sh` 5단계가 확인한다).
- **Authentication → URL Configuration → Site URL**을 해당 웹 주소로.
- **Project Settings → API Keys**에서 프로젝트 URL, anon 키(공개), service_role 키(비밀)를 확인. 로컬 CLI와 같은 JWT 형식(Legacy API keys)을 쓴다.

CI용 액세스 토큰(**Account → Access Tokens**)은 환경마다 따로 만들어 6에서 각 GitHub 환경의 비밀값으로만 넣는다. 프로젝트 범위를 고를 수 있으면 해당 프로젝트로 좁힌다. 저장소 공통 비밀값으로 두지 않는다(같은 저장소의 PR 작업에서도 읽힐 수 있다).

### 4. OpenAI 키와 Secret Manager

1. platform.openai.com에서 스테이징용·운영용 Project를 따로 만들고 각각 Project API 키를 발급한다(사용량·한도를 환경별로 본다).
2. 각 Project의 **Limits**에서 월 사용 한도를 정한다(스테이징은 낮게).
3. 각 GCP 프로젝트의 Secret Manager에 저장한다(값은 화면에 보이지 않게 입력):

```bash
put_secret() {   # 사용법: put_secret <프로젝트> <비밀 이름>  → 값을 입력하고 Enter
  local value
  printf '%s (%s) 값: ' "$2" "$1"; read -rs value; echo
  printf '%s' "$value" | gcloud secrets create "$2" --project "$1" --replication-policy=automatic --data-file=-
  unset value
}
put_secret "$STAGING_PROJECT" openai-api-key                     # 스테이징용 OpenAI 키
put_secret "$STAGING_PROJECT" supabase-service-role-key-staging
put_secret "$PROD_PROJECT"    openai-api-key                     # 운영용 OpenAI 키
put_secret "$PROD_PROJECT"    supabase-service-role-key-prod
```

키를 바꿀 때는 `gcloud secrets versions add <이름> --project <프로젝트> --data-file=-`로 새 버전을 넣는다(배포는 `:latest`를 참조하므로 다음 배포부터 반영된다).

### 5. 서비스 계정과 Workload Identity Federation

각 프로젝트에 런타임 계정·배포 계정·WIF를 만든다. **배포 계정은 해당 GitHub 환경(`staging` / `production`)에서 도는 작업만** 받을 수 있다. 운영 프로젝트의 WIF 제공자는 `production` 환경 토큰만 받아들인다.

```bash
# 사용법: setup_project <프로젝트 ID> <staging|prod> <GitHub 환경 이름>
setup_project() {
  local P="$1" ENV="$2" GH_ENV="$3" NUM CONDITION
  NUM=$(gcloud projects describe "$P" --format='value(projectNumber)')
  local RUNTIME="agent-runtime@$P.iam.gserviceaccount.com"
  local DEPLOYER="github-deployer@$P.iam.gserviceaccount.com"
  local POOL="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github"

  gcloud iam service-accounts create agent-runtime   --project "$P" --display-name="에이전트 런타임"
  gcloud iam service-accounts create github-deployer --project "$P" --display-name="GitHub Actions 배포"

  # 런타임: 이 프로젝트의 비밀값 읽기만
  for s in openai-api-key "supabase-service-role-key-$ENV"; do
    gcloud secrets add-iam-policy-binding "$s" --project "$P" \
      --member="serviceAccount:$RUNTIME" --role=roles/secretmanager.secretAccessor
  done

  # 배포 계정: 소스 배포, 공개 호출 설정, Hosting 배포
  for r in roles/run.sourceDeveloper roles/run.admin roles/serviceusage.serviceUsageConsumer \
           roles/firebasehosting.admin roles/serviceusage.apiKeysViewer; do
    gcloud projects add-iam-policy-binding "$P" --member="serviceAccount:$DEPLOYER" --role="$r"
  done
  gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --project "$P" \
    --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser

  # 소스 빌드에 쓰이는 기본 Compute 서비스 계정: 빌드 권한, 그리고 배포 계정이 이 계정으로 빌드를 실행할 권한
  # (없으면 gcloud run deploy --source가 "caller does not have permission to act as service account"로 실패)
  gcloud projects add-iam-policy-binding "$P" \
    --member="serviceAccount:$NUM-compute@developer.gserviceaccount.com" --role=roles/run.builder
  gcloud iam service-accounts add-iam-policy-binding "$NUM-compute@developer.gserviceaccount.com" --project "$P" \
    --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser

  # GitHub OIDC. environment 클레임은 환경을 선언한 작업에만 있으므로 없으면 'none'으로 매핑한다.
  CONDITION="assertion.repository=='$REPO'"
  if [ "$GH_ENV" = production ]; then
    CONDITION="$CONDITION && has(assertion.environment) && assertion.environment=='production'"
  fi
  gcloud iam workload-identity-pools create github --project "$P" --location=global --display-name="GitHub Actions"
  gcloud iam workload-identity-pools providers create-oidc github-repo --project "$P" \
    --location=global --workload-identity-pool=github \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.environment=has(assertion.environment) ? assertion.environment : 'none'" \
    --attribute-condition="$CONDITION"
  gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --project "$P" \
    --role=roles/iam.workloadIdentityUser --member="$POOL/attribute.environment/$GH_ENV"
}

setup_project "$STAGING_PROJECT" staging staging
setup_project "$PROD_PROJECT"    prod    production

# PR 미리보기 계정: 스테이징 프로젝트에만, Hosting 권한만 (Cloud Run·비밀값·DB 권한 없음).
# 이 저장소의 모든 작업(PR 포함)이 쓸 수 있으므로 운영 프로젝트에는 만들지 않는다.
STAGING_NUM=$(gcloud projects describe "$STAGING_PROJECT" --format='value(projectNumber)')
PREVIEW=github-preview@$STAGING_PROJECT.iam.gserviceaccount.com
gcloud iam service-accounts create github-preview --project "$STAGING_PROJECT" --display-name="GitHub Actions PR 미리보기"
for r in roles/firebasehosting.admin roles/serviceusage.apiKeysViewer roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$STAGING_PROJECT" --member="serviceAccount:$PREVIEW" --role="$r"
done
gcloud iam service-accounts add-iam-policy-binding "$PREVIEW" --project "$STAGING_PROJECT" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$STAGING_NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

# 6에서 쓸 WIF 제공자 이름
gcloud iam workload-identity-pools providers describe github-repo --project "$STAGING_PROJECT" \
  --location=global --workload-identity-pool=github --format='value(name)'
gcloud iam workload-identity-pools providers describe github-repo --project "$PROD_PROJECT" \
  --location=global --workload-identity-pool=github --format='value(name)'
```

### 6. GitHub 변수·비밀값, 공개 값 파일, 보호 규칙

**저장소는 공개(GitHub 무료 플랜)로 운영한다.** 무료 플랜에서 환경·환경 비밀값·실행 제한·브랜치 보호·규칙 세트·배포 승인자를 쓰려면 공개 저장소여야 한다. 운영 기간 중 다시 비공개로 바꾸면 환경 설정이 무시되어 배포가 멈추고 보호가 풀린다. 공개 전환 전에 전체 이력(PR 기록 포함)을 gitleaks와 개인정보 패턴으로 검사했다(2026-11-17, 비밀값 0건).

공개로 바꾼 뒤 먼저 한다:

```bash
# 외부 기여자의 PR 워크플로는 승인 후에만 실행(포크 PR에는 비밀값이 전달되지 않지만 실행 자체도 막는다)
gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" -f approval_policy=all_external_contributors
# 워크플로 기본 토큰은 읽기 전용(워크플로마다 필요한 권한만 명시한다)
gh api -X PUT "repos/$REPO/actions/permissions/workflow" -f default_workflow_permissions=read
# 비밀값 검사와 푸시 차단(공개 저장소는 무료)
gh api -X PATCH "repos/$REPO" \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

에이전트 주소는 배포 전에 정해진다: `https://agent-<staging|prod>-<프로젝트 번호>.$REGION.run.app`.

```bash
# 저장소 공통: PR 미리보기용(스테이징 프로젝트)만. 그 밖의 GCP 값은 저장소 공통에 두지 않는다.
gh variable set GCP_PREVIEW_PROJECT_ID      --repo "$REPO" --body "$STAGING_PROJECT"
gh variable set GCP_PREVIEW_WIF_PROVIDER    --repo "$REPO" --body "<5의 스테이징 제공자 이름>"
gh variable set GCP_PREVIEW_SERVICE_ACCOUNT --repo "$REPO" --body "$PREVIEW"

# 환경 만들기: staging은 main 브랜치에서만, production은 v* 태그에서만 실행되게 제한한다.
# production은 Leo의 승인을 받아야 배포가 시작된다.
LEO_ID=$(gh api user --jq .id)        # Leo 계정으로 로그인한 gh에서 실행
echo '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' |
  gh api -X PUT "repos/$REPO/environments/staging" --input -
echo "{\"deployment_branch_policy\":{\"protected_branches\":false,\"custom_branch_policies\":true},\"reviewers\":[{\"type\":\"User\",\"id\":$LEO_ID}]}" |
  gh api -X PUT "repos/$REPO/environments/production" --input -
gh api -X POST "repos/$REPO/environments/staging/deployment-branch-policies" -f name=main -f type=branch
gh api -X POST "repos/$REPO/environments/production/deployment-branch-policies" -f name='v*' -f type=tag

# 환경별 변수·비밀값
# 사용법: set_env <GitHub 환경> <GCP 프로젝트> <staging|prod> <Hosting 사이트>
set_env() {
  local E="$1" P="$2" ENV="$3" SITE="$4" NUM ref anon model
  NUM=$(gcloud projects describe "$P" --format='value(projectNumber)')
  gh variable set GCP_PROJECT_ID             --repo "$REPO" --env "$E" --body "$P"
  gh variable set GCP_WIF_PROVIDER           --repo "$REPO" --env "$E" \
    --body "projects/$NUM/locations/global/workloadIdentityPools/github/providers/github-repo"
  gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --repo "$REPO" --env "$E" --body "github-deployer@$P.iam.gserviceaccount.com"
  gh variable set AGENT_URL                  --repo "$REPO" --env "$E" --body "https://agent-$ENV-$NUM.$REGION.run.app"
  gh variable set WEB_URL                    --repo "$REPO" --env "$E" --body "https://$SITE.web.app"
  echo "[$E] Supabase·모델 값을 입력하세요"
  printf '  SUPABASE_PROJECT_REF: '; read -r ref
  gh variable set SUPABASE_PROJECT_REF --repo "$REPO" --env "$E" --body "$ref"
  gh variable set SUPABASE_URL         --repo "$REPO" --env "$E" --body "https://$ref.supabase.co"
  printf '  SUPABASE_ANON_KEY(공개 값): '; read -r anon
  gh variable set SUPABASE_ANON_KEY    --repo "$REPO" --env "$E" --body "$anon"
  printf '  OPENAI_MODEL: '; read -r model
  gh variable set OPENAI_MODEL         --repo "$REPO" --env "$E" --body "$model"
  # 비밀값은 gh가 직접 프롬프트로 받는다. ADMIN_PASSWORD·DEMO_PASSWORD는 12자 이상
  for s in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_SERVICE_ROLE_KEY ADMIN_PASSWORD DEMO_PASSWORD; do
    gh secret set "$s" --repo "$REPO" --env "$E"
  done
}
set_env staging    "$STAGING_PROJECT" staging "$STAGING_SITE"
set_env production "$PROD_PROJECT"    prod    "$PROD_SITE"

# 스테이징에만: PR 미리보기 채널 주소를 CORS에 허용
gh variable set ALLOWED_ORIGIN_REGEX --repo "$REPO" --env staging \
  --body "^https://$STAGING_SITE--pr-[0-9]+-[a-z0-9]+\\.web\\.app\$"
# (선택) 관리자 메일. 없으면 admin@demo.test
# gh variable set ADMIN_EMAIL --repo "$REPO" --env <환경> --body "<관리자 메일>"
```

| 이름 | 위치 | 종류 |
|---|---|---|
| `GCP_PREVIEW_PROJECT_ID`, `GCP_PREVIEW_WIF_PROVIDER`, `GCP_PREVIEW_SERVICE_ACCOUNT` | 저장소 (스테이징 프로젝트 값) | 변수 |
| `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT` | 환경 `staging`·`production` (각 환경의 프로젝트 값) | 변수 |
| `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AGENT_URL`, `WEB_URL`, `OPENAI_MODEL`, (`ADMIN_EMAIL`) | 환경 `staging`·`production` | 변수 |
| `ALLOWED_ORIGIN_REGEX` | 환경 `staging`만 | 변수 |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `DEMO_PASSWORD` | 환경 `staging`·`production` | 비밀값 |

공개 값 파일: 다음 값을 채워 PR로 올린다(Claude Code에 값만 알려 주면 된다. 모두 공개 값이다). 배포 워크플로는 파일 값과 GitHub 변수가 다르면 멈춘다.
- `apps/web/.env.staging`, `apps/web/.env.production`: Supabase URL, anon 키, 에이전트 주소(위 변수와 **같은 값**).
- `.firebaserc`: 스테이징·운영 프로젝트 ID와 각 사이트 ID. 대상 `staging`은 스테이징 프로젝트에, `prod`는 운영 프로젝트에만 연결한다.

보호 규칙: `main` 보호(PR 필수, CI 필수, 강제 푸시·삭제 금지), `v*` 태그 보호(관리자만 만들기·옮기기·지우기). `production` 승인자는 위 환경 만들기에서 설정했다. 모두 저장소가 공개여야 동작한다(무료 플랜).

```bash
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["웹 테스트·빌드", "배포 스크립트 검사", "pgTAP·에이전트 테스트", "미리보기 웹 빌드", "웹 미리보기 배포"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

# v* 태그는 저장소 관리자(Leo)만 만들고 옮기고 지울 수 있다
gh api -X POST "repos/$REPO/rulesets" --input - <<'EOF'
{
  "name": "release-tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [{ "type": "creation" }, { "type": "update" }, { "type": "deletion" }],
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }]
}
EOF
```

### keepalive 환경 (Supabase 일시 정지 방지)

예약 작업은 `main`에서 돌기 때문에 `production` 환경(태그 전용)을 쓸 수 없다. 공개 값과 신입 계정 비밀번호만 담은 별도 환경 `keepalive`를 `main` 전용으로 만든다. 환경을 하나씩 준비한 만큼만 깨우고, 값이 없는 쪽은 건너뛴다.

```bash
echo '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' |
  gh api -X PUT "repos/$REPO/environments/keepalive" --input -
gh api -X POST "repos/$REPO/environments/keepalive/deployment-branch-policies" -f name=main -f type=branch

# 대상별 공개 값은 각 환경 변수에서 복사, 비밀번호는 각 환경의 DEMO_PASSWORD와 같은 값을 프롬프트에 입력
for T in STAGING PROD; do
  E=$([ $T = STAGING ] && echo staging || echo production)
  gh variable set ${T}_SUPABASE_URL      --repo "$REPO" --env keepalive --body "$(gh variable get SUPABASE_URL --repo "$REPO" --env $E)"
  gh variable set ${T}_SUPABASE_ANON_KEY --repo "$REPO" --env keepalive --body "$(gh variable get SUPABASE_ANON_KEY --repo "$REPO" --env $E)"
  gh secret   set ${T}_DEMO_PASSWORD     --repo "$REPO" --env keepalive
done
gh workflow run keepalive --repo "$REPO"     # 바로 한 번 실행해 확인
```

`DEMO_PASSWORD`를 바꾸면 `keepalive` 환경의 같은 값도 함께 바꾼다(아니면 keepalive가 실패로 알린다).

### 끝났는지 확인

```bash
for P in "$STAGING_PROJECT" "$PROD_PROJECT"; do
  echo "== $P"
  gcloud services list --enabled --project "$P" | grep -E 'run|cloudbuild|secretmanager|firebasehosting'
  gcloud secrets list --project "$P"                           # 프로젝트마다 이름 2개
  gcloud iam service-accounts list --project "$P"               # 운영에는 github-preview가 없어야 함
done
gh api "repos/$REPO" --jq .visibility                           # public
gh api "repos/$REPO/environments/production" --jq '[.protection_rules[].type]'   # required_reviewers, branch_policy
gh variable list --repo "$REPO"                                 # GCP_PREVIEW_* 3개만
gh variable list --repo "$REPO" --env staging; gh variable list --repo "$REPO" --env production
gh secret list --repo "$REPO"                                   # 비어 있어야 함
gh secret list --repo "$REPO" --env staging; gh secret list --repo "$REPO" --env production
grep -nE '^[^#]*REPLACE_ME' apps/web/.env.staging apps/web/.env.production .firebaserc   # 출력 없어야 함
```

## 배포 흐름

1. 작업 브랜치 → PR. `ci`가 테스트하고, 스테이징 설정으로 빌드한 웹을 미리보기 채널 `pr-<번호>`(스테이징 프로젝트)에 올려 PR에 주소를 남긴다. 미리보기 웹은 스테이징 Supabase·스테이징 에이전트를 쓴다.
2. CI 통과 → squash 머지 → `deploy-staging`이 스테이징 프로젝트에 반영하고 `smoke.sh`로 점검한다.
3. 스테이징에서 확인되면 Leo가 `main`의 커밋에 태그(`git tag v0.1.0 && git push origin v0.1.0`) → Leo가 Actions 화면에서 `production` 배포를 승인 → `deploy-prod`가 운영 프로젝트에 같은 순서로 반영한다. `main`에 없는 커밋의 태그는 거부된다.

각 단계는 실패하면 그 자리에서 멈춘다. DB 마이그레이션은 에이전트·웹보다 먼저 적용되며, 추가만 하므로 앞 버전 코드와도 동작한다.

`smoke.sh` 점검 내용: 에이전트 `/health`의 version이 배포 커밋과 같음 → 웹 `/`·`/me` 200 → `newhire@demo.test` 로그인 → 신입 과제 31개 → 공개 가입 거부(`signup_disabled`) → 토큰 없는 `/chat` 401. 로컬에서는 `EXPECT_VERSION`을 주지 않으면 `dev`를 기대한다.

## 되돌리기

DB는 되돌리지 않는다(마이그레이션은 추가만). 코드만 이전 버전으로 돌린다.

**가장 간단한 방법**: GitHub Actions에서 이전 태그의 `deploy-prod` 실행을 **Re-run all jobs**. 마이그레이션은 이미 적용돼 있어 건너뛰고, 그 태그의 에이전트·웹이 다시 배포된다.

**에이전트만** (Cloud Run 이전 리비전으로 트래픽 전환, 수 초):

```bash
gcloud run revisions list --service agent-prod --region "$REGION" --project "$PROD_PROJECT"
gcloud run services update-traffic agent-prod --region "$REGION" --project "$PROD_PROJECT" \
  --to-revisions <이전 리비전 이름>=100
# 다시 최신으로: gcloud run services update-traffic agent-prod --region "$REGION" --project "$PROD_PROJECT" --to-latest
# 다음 배포(deploy-agent.sh)는 배포 직후 --to-latest로 트래픽을 새 리비전에 돌린다. 롤백한 고정이 다음 배포까지 남지 않는다.
```

**웹만** (Firebase Hosting 이전 릴리스): Firebase 콘솔 → 운영 프로젝트 → Hosting → 해당 사이트 → 릴리스 기록 → 이전 릴리스의 **롤백**. CLI로는

```bash
npx firebase-tools@15.36.0 hosting:clone "$PROD_SITE@<이전 버전 ID>" "$PROD_SITE:live" --project "$PROD_PROJECT"
```

## 운영 점검 항목

운영 기간(한 달) 동안 확인하고 결과를 아래 표에 기록한다(Task 19 Step 6).

| 항목 | 확인 방법 | 결과 |
|---|---|---|
| `agent-prod` 최소 인스턴스 1 | `gcloud run services describe agent-prod --region $REGION --project $PROD_PROJECT --format='value(spec.template.metadata.annotations)'` | |
| `/health` 가동 시간 점검과 알림 | 운영 프로젝트 Cloud Monitoring 가동 시간 확인(`AGENT_URL/health`, 5분 간격) + 알림 채널 | |
| GCP 예산 알림(프로젝트별) | 결제 → 예산 및 알림 | |
| OpenAI 월 한도(환경별) | OpenAI Project → Limits | |
| Supabase 일시 정지 방지 | Actions → `keepalive` 최근 실행이 성공(하루 세 번), 실패 알림 메일 수신 설정 | |
| 공개 가입 꺼짐(두 환경) | `smoke.sh` 5단계 | |
| 최소 인스턴스를 0으로 내릴 날짜 | 운영 시작 + 한 달: `gcloud run services update agent-prod --region $REGION --project $PROD_PROJECT --min-instances 0` | |

## 확인이 필요한 부분 (첫 스테이징 배포에서 검증)

- Firebase CLI가 Workload Identity Federation 자격(서비스 계정 가장)을 그대로 받는지 공식 문서로 확인하지 못했다. `ci`의 미리보기 배포나 `deploy-staging`의 웹 배포가 인증 오류로 실패하면 멈추고 보고한다(키 파일로 우회하지 않는다).
- 배포 계정 역할은 공식 문서 기준(`run.sourceDeveloper`, `serviceUsageConsumer`, 런타임 계정과 빌드용 Compute 계정의 `serviceAccountUser`, `firebasehosting.admin`)에 공개 호출 설정용 `run.admin`을 더했다. 빌드 계정 권한은 첫 스테이징 배포(2026-11-17)에서 빠진 것이 확인돼 추가했다. 권한 오류가 나면 오류의 권한 이름을 보고 추가한다.
- 미리보기 계정은 스테이징 프로젝트의 Hosting 전체(스테이징 라이브 사이트 포함)에 쓸 수 있다. 스테이징은 심사위원이 쓰지 않으므로 받아들인다.
- `smoke.sh` 6단계(토큰 없는 `/chat` → 401)는 `/chat` 경로와 인증(Task 5·12)이 있어야 통과한다.
