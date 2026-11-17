# 배포 안내

구현 계획 Task 6의 결과물. 환경 구성, Leo가 먼저 할 일, 배포 흐름, 되돌리기, 운영 점검을 담는다.
**이 문서에는 키·비밀번호 값을 절대 적지 않는다.** 값은 Secret Manager와 GitHub Secrets에만 둔다.

## 환경

| | 로컬 | 스테이징 | 운영 |
|---|---|---|---|
| 용도 | 개발·테스트 | `main` 최신, PR 미리보기의 백엔드 | 심사위원 접속 |
| DB·인증 | Supabase CLI | Supabase 무료 프로젝트(별도 조직) | Supabase Pro 프로젝트, 서울(`ap-northeast-2`) |
| 에이전트 | `localhost:8000` | Cloud Run `agent-staging`, 최소 0 | Cloud Run `agent-prod`, 최소 1 |
| 웹 | `localhost:5173` | Firebase Hosting 대상 `staging` + PR 미리보기 채널 | Firebase Hosting 대상 `prod` |
| 배포 계기 | — | `main` 푸시 | `v*` 태그(Leo) |

Cloud Run 공통(`scripts/deploy-agent.sh`): 리전 `asia-northeast3`, 메모리 1Gi, 동시성 20, 최대 인스턴스 3, 요청 제한 시간 300초, 인증 없이 호출 허용(인증은 서비스가 Supabase 토큰으로 직접 한다), 런타임 서비스 계정 `agent-runtime`.

## 파일

| 파일 | 하는 일 |
|---|---|
| `.github/workflows/ci.yml` | PR: 웹 테스트·빌드 / 배포 스크립트 검사 / 로컬 Supabase로 pgTAP·에이전트 pytest / 스테이징 설정 웹을 미리보기 채널(`pr-<번호>`, 7일)에 배포하고 PR에 주소 댓글 |
| `.github/workflows/deploy-staging.yml` | `main` 푸시: 설정 확인 → DB 마이그레이션 → 계정 부트스트랩 → 에이전트 → 웹 → `smoke.sh` |
| `.github/workflows/deploy-prod.yml` | `v*` 태그: 태그 커밋이 `main`에 있는지 확인한 뒤 위와 같은 순서를 운영 대상으로 |
| `scripts/deploy-agent.sh <staging\|prod> <git_sha>` | Cloud Run 배포. 비밀값은 Secret Manager 참조로만 연결 |
| `scripts/smoke.sh <web> <agent> <supabase> <anon_key>` | 배포 후 6단계 점검. `DEMO_PASSWORD` 필요, `EXPECT_VERSION`으로 커밋 확인 |
| `scripts/tests/*` | 위 두 스크립트를 가짜 서버·가짜 gcloud로 검사(CI `배포 스크립트 검사`) |
| `firebase.json`, `.firebaserc` | 호스팅 대상 `staging`·`prod`, SPA 리라이트, `X-Robots-Tag: noindex`, `/assets/**` 장기 캐시, 페이지는 `no-cache` |
| `apps/web/.env.staging`, `.env.production` | 웹 빌드용 공개 값(`VITE_*`)만. `REPLACE_ME`가 남아 있으면 배포가 멈춘다 |

## Leo가 먼저 할 일

에이전트가 대신 할 수 없는 일이다. 아래 명령의 `<...>`는 Leo가 정하는 값으로 바꾼다. 비밀값을 명령 인자로 쓰지 않도록, 값이 필요한 곳은 입력 프롬프트로 받는다.

공통으로 쓰는 셸 변수:

```bash
export PROJECT_ID=<GCP 프로젝트 ID>
export REGION=asia-northeast3
export REPO=<GitHub 소유자>/<저장소>            # 예: 이 저장소의 owner/name
export STAGING_SITE=<스테이징 Hosting 사이트 ID>  # 예: ${PROJECT_ID}-staging
export PROD_SITE=<운영 Hosting 사이트 ID>         # 예: ${PROJECT_ID}-prod
```

### 1. GCP 프로젝트, 결제, API, 예산 알림

```bash
gcloud projects create "$PROJECT_ID"
gcloud billing accounts list                                   # 결제 계정 ID 확인
gcloud billing projects link "$PROJECT_ID" --billing-account=<결제 계정 ID>
gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com compute.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  firebase.googleapis.com firebasehosting.googleapis.com \
  cloudresourcemanager.googleapis.com serviceusage.googleapis.com billingbudgets.googleapis.com

# --source 배포가 쓰는 저장소를 미리 만든다(CI에서 생성 확인 프롬프트가 뜨지 않게)
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker --location="$REGION"

# 예산 알림(금액·통화는 결제 계정 통화에 맞춘다)
gcloud billing budgets create --billing-account=<결제 계정 ID> \
  --display-name="onboarding-agent" --budget-amount=<금액><통화> \
  --filter-projects="projects/$PROJECT_ID" \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
```

### 2. Firebase와 Hosting 사이트 2개

```bash
npx firebase-tools@15.36.0 login
npx firebase-tools@15.36.0 projects:addfirebase "$PROJECT_ID"
npx firebase-tools@15.36.0 hosting:sites:create "$STAGING_SITE" --project "$PROJECT_ID"
npx firebase-tools@15.36.0 hosting:sites:create "$PROD_SITE" --project "$PROJECT_ID"
```

웹 주소는 `https://$STAGING_SITE.web.app`, `https://$PROD_SITE.web.app`이 된다. `.firebaserc`의 `REPLACE_ME_GCP_PROJECT_ID`(두 곳), `REPLACE_ME_STAGING_SITE_ID`, `REPLACE_ME_PROD_SITE_ID`를 바꾸는 작업은 6에서 PR로 한다.

### 3. Supabase 프로젝트 2개

대시보드(supabase.com)에서 만든다. DB 비밀번호는 대시보드에서 생성해 바로 비밀 저장소에 옮기고 다른 곳에 적지 않는다.

| | 운영 | 스테이징 |
|---|---|---|
| 조직 | Pro 플랜 조직 | 별도 무료 조직 |
| 리전 | Northeast Asia (Seoul) `ap-northeast-2` | 아무 곳(서울 권장) |

두 프로젝트 모두:
- **Authentication → Sign In / Providers → "Allow new users to sign up" 끄기** (`smoke.sh` 5단계가 확인한다).
- **Authentication → URL Configuration → Site URL**을 해당 웹 주소로.
- **Project Settings → API Keys**에서 프로젝트 URL, anon 키(공개), service_role 키(비밀)를 확인. 로컬 CLI와 같은 JWT 형식(Legacy API keys)을 쓴다.
- 운영 프로젝트는 **Database → Backups**가 켜져 있는지 확인.

CI용 개인 액세스 토큰: **Account → Access Tokens**에서 하나 만든다(두 조직 모두 접근하는 Leo 계정 토큰). 값은 6에서 GitHub Secret으로만 넣는다.

### 4. OpenAI 키와 Secret Manager

1. platform.openai.com에서 이 서비스 전용 Project를 만들고 Project API 키를 발급한다.
2. 같은 Project의 **Limits**에서 월 사용 한도를 정한다.
3. Secret Manager에 저장한다(값은 화면에 보이지 않게 입력):

```bash
put_secret() {   # 사용법: put_secret <이름>  → 값을 입력하고 Enter
  local value
  read -rs -p "$1 값: " value; echo
  printf '%s' "$value" | gcloud secrets create "$1" --replication-policy=automatic --data-file=-
  unset value
}
put_secret openai-api-key
put_secret supabase-service-role-key-staging
put_secret supabase-service-role-key-prod
```

키를 바꿀 때는 `gcloud secrets versions add <이름> --data-file=-`로 새 버전을 넣는다(배포는 `:latest`를 참조하므로 다음 배포부터 반영된다).

### 5. 서비스 계정과 Workload Identity Federation

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUNTIME=agent-runtime@$PROJECT_ID.iam.gserviceaccount.com
DEPLOYER=github-deployer@$PROJECT_ID.iam.gserviceaccount.com   # 스테이징·운영 배포 (환경 실행만)
PREVIEW=github-preview@$PROJECT_ID.iam.gserviceaccount.com      # PR 미리보기 (Hosting만)

gcloud iam service-accounts create agent-runtime --display-name="에이전트 런타임"
gcloud iam service-accounts create github-deployer --display-name="GitHub Actions 배포"
gcloud iam service-accounts create github-preview --display-name="GitHub Actions PR 미리보기"

# 런타임: 비밀값 읽기만
for s in openai-api-key supabase-service-role-key-staging supabase-service-role-key-prod; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$RUNTIME" --role=roles/secretmanager.secretAccessor
done

# 배포 계정: 소스 배포, 공개 호출 설정, Hosting 배포
for r in roles/run.sourceDeveloper roles/run.admin roles/serviceusage.serviceUsageConsumer \
         roles/firebasehosting.admin roles/serviceusage.apiKeysViewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOYER" --role="$r"
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser

# 미리보기 계정: Hosting만 (Cloud Run·비밀값·DB 권한 없음)
for r in roles/firebasehosting.admin roles/serviceusage.apiKeysViewer roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$PREVIEW" --role="$r"
done

# 소스 빌드에 쓰이는 기본 Compute 서비스 계정
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role=roles/run.builder

# GitHub OIDC (이 저장소에서만)
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc github-repo \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.environment=assertion.environment" \
  --attribute-condition="assertion.repository=='$REPO'"
POOL="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github"

# 배포 계정은 GitHub Environment staging·production에서 도는 작업만 쓸 수 있다.
# PR 작업은 환경이 없으므로 이 계정을 받지 못한다(환경별 실행 브랜치·태그 제한은 6에서).
for e in staging production; do
  gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --role=roles/iam.workloadIdentityUser \
    --member="$POOL/attribute.environment/$e"
done
# 미리보기 계정은 이 저장소의 모든 작업(PR 포함)이 쓸 수 있다.
gcloud iam service-accounts add-iam-policy-binding "$PREVIEW" --role=roles/iam.workloadIdentityUser \
  --member="$POOL/attribute.repository/$REPO"

# 6에서 GCP_WIF_PROVIDER로 쓸 값
gcloud iam workload-identity-pools providers describe github-repo \
  --location=global --workload-identity-pool=github --format='value(name)'
```

### 6. GitHub 변수·비밀값, 공개 값 파일, `main` 보호

에이전트 주소는 배포 전에 정해진다: `https://agent-staging-$PROJECT_NUMBER.$REGION.run.app`, `https://agent-prod-$PROJECT_NUMBER.$REGION.run.app`.

```bash
# 저장소 공통
gh variable set GCP_PROJECT_ID      --repo "$REPO" --body "$PROJECT_ID"
gh variable set GCP_WIF_PROVIDER    --repo "$REPO" --body "<5의 마지막 명령 출력>"
gh variable set GCP_DEPLOY_SERVICE_ACCOUNT  --repo "$REPO" --body "$DEPLOYER"
gh variable set GCP_PREVIEW_SERVICE_ACCOUNT --repo "$REPO" --body "$PREVIEW"
gh secret   set SUPABASE_ACCESS_TOKEN --repo "$REPO"          # 프롬프트에 값 입력

# 환경 만들기: staging은 main 브랜치에서만, production은 v* 태그에서만 실행되게 제한한다.
# 이 제한이 있어야 PR 브랜치가 환경을 선언해 배포 계정을 받는 일을 막는다.
for e in staging production; do
  echo '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' |
    gh api -X PUT "repos/$REPO/environments/$e" --input -
done
gh api -X POST "repos/$REPO/environments/staging/deployment-branch-policies" -f name=main -f type=branch
gh api -X POST "repos/$REPO/environments/production/deployment-branch-policies" -f name='v*' -f type=tag

# 환경별 변수 (staging 예시. production도 같은 이름으로 운영 값을 넣는다)
E=staging
gh variable set SUPABASE_PROJECT_REF --repo "$REPO" --env $E --body "<프로젝트 ref>"
gh variable set SUPABASE_URL         --repo "$REPO" --env $E --body "https://<프로젝트 ref>.supabase.co"
gh variable set SUPABASE_ANON_KEY    --repo "$REPO" --env $E --body "<anon 키(공개 값)>"
gh variable set AGENT_URL            --repo "$REPO" --env $E --body "https://agent-staging-$PROJECT_NUMBER.$REGION.run.app"
gh variable set WEB_URL              --repo "$REPO" --env $E --body "https://$STAGING_SITE.web.app"
gh variable set OPENAI_MODEL         --repo "$REPO" --env $E --body "<모델 이름>"
# 스테이징에만: PR 미리보기 채널 주소를 CORS에 허용
gh variable set ALLOWED_ORIGIN_REGEX --repo "$REPO" --env staging \
  --body "^https://$STAGING_SITE--pr-[0-9]+-[a-z0-9]+\\.web\\.app\$"
# (선택) 관리자 메일. 없으면 admin@demo.test
# gh variable set ADMIN_EMAIL --repo "$REPO" --env $E --body "<관리자 메일>"

# 환경별 비밀값 (각각 프롬프트에 입력. ADMIN_PASSWORD·DEMO_PASSWORD는 12자 이상)
for s in SUPABASE_DB_PASSWORD SUPABASE_SERVICE_ROLE_KEY ADMIN_PASSWORD DEMO_PASSWORD; do
  gh secret set "$s" --repo "$REPO" --env $E
done
```

| 이름 | 위치 | 종류 |
|---|---|---|
| `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`, `GCP_PREVIEW_SERVICE_ACCOUNT` | 저장소 | 변수 |
| `SUPABASE_ACCESS_TOKEN` | 저장소 | 비밀값 |
| `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AGENT_URL`, `WEB_URL`, `OPENAI_MODEL`, (`ADMIN_EMAIL`) | 환경 `staging`·`production` | 변수 |
| `ALLOWED_ORIGIN_REGEX` | 환경 `staging`만 | 변수 |
| `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `DEMO_PASSWORD` | 환경 `staging`·`production` | 비밀값 |

공개 값 파일: `apps/web/.env.staging`, `apps/web/.env.production`의 `REPLACE_ME`를 위 변수와 **같은 값**(Supabase URL, anon 키, 에이전트 주소)으로, `.firebaserc`의 `REPLACE_ME`를 프로젝트 ID·사이트 ID로 바꾼다. 이 변경은 PR로 올린다(Claude Code에 값만 알려 주면 된다. anon 키는 공개 값이다). 배포 워크플로는 파일 값과 GitHub 변수가 다르면 멈춘다.

`main` 보호(PR 필수, CI 필수, 강제 푸시·삭제 금지)와 `v*` 태그 보호(관리자만 만들기·옮기기·지우기). 비공개 저장소에서 환경 실행 제한·브랜치 보호·규칙 세트는 GitHub 유료 플랜(Pro·Team)이어야 쓸 수 있다. **지원되지 않으면 PR 브랜치가 배포 계정을 받을 수 있으므로 알려 달라.**

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
```

```bash
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

`production` 환경에 Leo를 승인자로 추가한다(**Settings → Environments → production → Required reviewers**).

### 끝났는지 확인

```bash
gcloud services list --enabled --project "$PROJECT_ID" | grep -E 'run|cloudbuild|secretmanager|firebasehosting'
gcloud secrets list --project "$PROJECT_ID"                   # 이름 3개
gh variable list --repo "$REPO"; gh variable list --repo "$REPO" --env staging; gh variable list --repo "$REPO" --env production
gh secret list --repo "$REPO" --env staging; gh secret list --repo "$REPO" --env production
grep -n REPLACE_ME apps/web/.env.staging apps/web/.env.production .firebaserc   # 출력 없어야 함
```

## 배포 흐름

1. 작업 브랜치 → PR. `ci`가 테스트하고, 스테이징 설정으로 빌드한 웹을 미리보기 채널 `pr-<번호>`에 올려 PR에 주소를 남긴다. 미리보기 웹은 스테이징 Supabase·스테이징 에이전트를 쓴다.
2. CI 통과 → squash 머지 → `deploy-staging`이 스테이징에 반영하고 `smoke.sh`로 점검한다.
3. 스테이징에서 확인되면 Leo가 `main`의 커밋에 태그(`git tag v0.1.0 && git push origin v0.1.0`) → `deploy-prod`가 운영에 같은 순서로 반영한다. `main`에 없는 커밋의 태그는 거부된다.

각 단계는 실패하면 그 자리에서 멈춘다. DB 마이그레이션은 에이전트·웹보다 먼저 적용되며, 추가만 하므로 앞 버전 코드와도 동작한다.

`smoke.sh` 점검 내용: 에이전트 `/health`의 version이 배포 커밋과 같음 → 웹 `/`·`/me` 200 → `newhire@demo.test` 로그인 → 신입 과제 31개 → 공개 가입 거부 → 토큰 없는 `/chat` 401. 로컬에서는 `EXPECT_VERSION`을 주지 않으면 `dev`를 기대한다.

## 되돌리기

DB는 되돌리지 않는다(마이그레이션은 추가만). 코드만 이전 버전으로 돌린다.

**가장 간단한 방법**: GitHub Actions에서 이전 태그의 `deploy-prod` 실행을 **Re-run all jobs**. 마이그레이션은 이미 적용돼 있어 건너뛰고, 그 태그의 에이전트·웹이 다시 배포된다.

**에이전트만** (Cloud Run 이전 리비전으로 트래픽 전환, 수 초):

```bash
gcloud run revisions list --service agent-prod --region "$REGION" --project "$PROJECT_ID"
gcloud run services update-traffic agent-prod --region "$REGION" --project "$PROJECT_ID" \
  --to-revisions <이전 리비전 이름>=100
# 다시 최신으로: gcloud run services update-traffic agent-prod --region "$REGION" --to-latest
```

**웹만** (Firebase Hosting 이전 릴리스): Firebase 콘솔 → Hosting → 해당 사이트 → 릴리스 기록 → 이전 릴리스의 **롤백**. CLI로는

```bash
npx firebase-tools@15.36.0 hosting:clone "$PROD_SITE:<이전 버전 ID>" "$PROD_SITE:live" --project "$PROJECT_ID"
```

## 운영 점검 항목

운영 기간(한 달) 동안 확인하고 결과를 아래 표에 기록한다(Task 19 Step 6).

| 항목 | 확인 방법 | 결과 |
|---|---|---|
| `agent-prod` 최소 인스턴스 1 | `gcloud run services describe agent-prod --region $REGION --format='value(spec.template.metadata.annotations)'` | |
| `/health` 가동 시간 점검과 알림 | Cloud Monitoring 가동 시간 확인(`AGENT_URL/health`, 5분 간격) + 알림 채널 | |
| GCP 예산 알림 | 결제 → 예산 및 알림 | |
| OpenAI 월 한도 | OpenAI Project → Limits | |
| Supabase 운영이 Pro, 백업 켜짐 | 대시보드 → Billing, Database → Backups | |
| 공개 가입 꺼짐(두 환경) | `smoke.sh` 5단계 | |
| 최소 인스턴스를 0으로 내릴 날짜 | 운영 시작 + 한 달: `gcloud run services update agent-prod --region $REGION --min-instances 0` | |

## 확인이 필요한 부분 (첫 스테이징 배포에서 검증)

- 미리보기 계정의 `firebasehosting.admin`은 프로젝트 단위 권한이라 운영 Hosting 사이트에도 쓸 수 있다(Hosting에는 사이트별 권한이 없다). PR 코드를 실행하는 빌드 작업과 인증하는 배포 작업을 나눠 두어서, 남는 위험은 워크플로 파일을 고칠 수 있는 저장소 쓰기 권한자(현재 Leo와 Claude Code)로 한정된다. 운영 웹을 완전히 떼려면 운영 Hosting을 별도 GCP 프로젝트로 옮겨야 한다.
- Firebase CLI가 Workload Identity Federation 자격(서비스 계정 가장)을 그대로 받는지 공식 문서로 확인하지 못했다. `ci`의 미리보기 배포나 `deploy-staging`의 웹 배포가 인증 오류로 실패하면 멈추고 보고한다(키 파일로 우회하지 않는다).
- 배포 계정 역할은 공식 문서 기준(`run.sourceDeveloper`, `serviceUsageConsumer`, 런타임 계정의 `serviceAccountUser`, `firebasehosting.admin`)에 공개 호출 설정용 `run.admin`을 더했다. 권한 오류가 나면 오류의 권한 이름을 보고 추가한다.
- CI의 `pgTAP·에이전트 테스트`는 `supabase/`(Task 2)가 `main`에 있어야 통과한다. 계정 부트스트랩 단계는 Task 3에서 CI에 추가한다.
