#!/usr/bin/env bash
# PR에서 바뀐 파일 목록(표준 입력, 한 줄에 하나)을 보고 무거운 CI 검사가 필요한지 판정한다.
# 출력: code=true(검사 필요) 또는 code=false(문서만 바뀜). ci.yml의 changes 작업이 GITHUB_OUTPUT에 쓴다.
#
# 문서로 보는 것: docs/ 아래 모든 파일, 그리고 .github/ 밖의 *.md.
# 그 밖의 파일이 하나라도 있거나 목록이 비어 있으면 code=true다(모르면 검사한다).
set -euo pipefail

seen=0
while IFS= read -r file || [ -n "$file" ]; do
  [ -z "$file" ] && continue
  seen=1
  case "$file" in
    .github/*) echo "code=true"; exit 0 ;;
    docs/*) ;;
    *.md) ;;
    *) echo "code=true"; exit 0 ;;
  esac
done

if [ "$seen" -eq 0 ]; then
  echo "code=true"
else
  echo "code=false"
fi
