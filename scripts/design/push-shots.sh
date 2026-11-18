#!/usr/bin/env bash
# PR 설명에 넣을 이미지를 이미지 전용 브랜치 pr-screenshots에 올린다(main에 머지하지 않는 orphan 브랜치).
# gh로는 PR에 이미지를 직접 올릴 수 없어서, 커밋 SHA로 고정한 raw 주소를 PR 본문에 쓴다.
#
# 사용: bash scripts/design/push-shots.sh <브랜치 안 폴더 이름> <png...>
# 출력: PR 본문에 붙일 마크다운 이미지 줄들, 마지막 줄에 커밋 SHA
# 저장소 루트에서 실행한다. 작업 브랜치와 작업 폴더는 건드리지 않는다(임시 index로 커밋).
set -uo pipefail

[ "$#" -ge 2 ] || { echo "사용: $0 <폴더 이름> <png...>" >&2; exit 2; }
dest="$1"; shift
branch=pr-screenshots
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

for attempt in 1 2 3; do
  GIT_INDEX_FILE="$(mktemp -u)"
  export GIT_INDEX_FILE
  parent="$(git ls-remote --heads origin "$branch" | cut -f1)"
  if [ -n "$parent" ]; then
    git fetch -q origin "$branch" && git read-tree "$parent" || exit 1
  else
    readme="$(printf '# PR screenshots\n\nPR 설명에 넣는 화면 전·후 비교 이미지만 둔다. main에 머지하지 않는다. 화면의 사람·데이터는 모두 가상이다.\n' | git hash-object -w --stdin)"
    git update-index --add --cacheinfo "100644,$readme,README.md"
  fi
  for f in "$@"; do
    blob="$(git hash-object -w "$f")"
    git update-index --add --cacheinfo "100644,$blob,$dest/$(basename "$f")"
  done
  tree="$(git write-tree)"
  if [ -n "$parent" ]; then
    commit="$(git commit-tree "$tree" -p "$parent" -m "chore: screenshots for $dest")"
  else
    commit="$(git commit-tree "$tree" -m "chore: start $branch (images for PR descriptions only)")"
  fi
  rm -f "$GIT_INDEX_FILE"
  unset GIT_INDEX_FILE
  if git push -q origin "$commit:refs/heads/$branch" 2>/dev/null; then
    for f in "$@"; do
      echo "![$(basename "$f" .png)](https://raw.githubusercontent.com/$repo/$commit/$dest/$(basename "$f"))"
    done
    echo "$commit"
    exit 0
  fi
  # 다른 세션이 먼저 올렸으면 새 끝을 받아 다시 만든다
  sleep $((attempt * 3))
done
echo "pr-screenshots에 올리지 못했습니다" >&2
exit 1
