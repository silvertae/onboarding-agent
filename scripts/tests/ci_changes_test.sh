#!/usr/bin/env bash
# scripts/ci-changes.sh: PR에서 바뀐 파일 목록(표준 입력)을 보고 무거운 CI 검사가 필요한지 판정한다.
# 문서만 바뀌었을 때만 code=false. 판단이 서지 않으면(빈 목록 등) code=true로 검사를 돌린다.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../ci-changes.sh"
failures=0

check() { # <이름> <기대 code 값> <파일 목록(줄바꿈 구분)>
  local name="$1" expect="$2" files="$3" out code=0
  out="$(printf '%s' "$files" | bash "$script")" || code=$?
  if [ "$code" -eq 0 ] && [ "$out" = "code=$expect" ]; then
    echo "PASS $name"
  else
    echo "FAIL $name (exit $code, 출력 '$out', 기대 code=$expect)"
    failures=$((failures + 1))
  fi
}

check "docs 폴더만"                 false $'docs/screens.md\ndocs/design/onboarding-design/png/S14-documents.png'
check "루트·하위 마크다운만"         false $'CLAUDE.md\nSECURITY.md\n.interface-design/system.md\napps/web/README.md'
check "시안 HTML"                   false 'docs/design/onboarding-design/screens/S14-documents.html'
check "웹 소스가 섞임"               true  $'docs/screens.md\napps/web/src/App.tsx'
check "마이그레이션"                 true  'supabase/migrations/0012_policy_documents.sql'
check "에이전트"                     true  'services/agent/app/assistant.py'
check "스크립트"                     true  'scripts/check-design.sh'
check "워크플로 폴더의 마크다운"     true  '.github/pull_request_template.md'
check "워크플로"                     true  '.github/workflows/ci.yml'
check "빈 목록은 안전하게 검사"      true  ''
check "공백 줄만 있어도 검사"        true  $'\n\n'

if [ "$failures" -gt 0 ]; then
  echo "실패 ${failures}건"
  exit 1
fi
echo "모두 통과"
