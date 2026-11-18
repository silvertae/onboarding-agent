#!/usr/bin/env bash
# scripts/design/push-shots.sh를 임시 로컬 원격(bare 저장소)에 돌려 업로드·실패 처리를 확인한다. 네트워크·gh 없이 돈다.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
push="$here/../design/push-shots.sh"
failures=0
fail() { echo "FAIL: $*"; failures=$((failures + 1)); }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git init -q --bare "$work/origin.git"
git init -q "$work/clone"
git -C "$work/clone" remote add origin "$work/origin.git"
git -C "$work/clone" -c user.name=t -c user.email=t@example.invalid commit -q --allow-empty -m init
printf 'png-1' >"$work/cmp-1.png"
printf 'png-2' >"$work/cmp-2.png"

run() { # <출력 파일> <인자...>
  local out="$1"; shift
  (cd "$work/clone" && SHOTS_REPO=owner/repo GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid \
    GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid bash "$push" "$@") >"$out" 2>&1
}

# 없는 파일이 하나라도 있으면 아무것도 올리지 않고 실패한다
out="$work/missing.out"
if run "$out" pr-1 "$work/cmp-1.png" "$work/nope.png"; then
  fail "없는 파일인데 성공함"
elif git -C "$work/origin.git" rev-parse -q --verify refs/heads/pr-screenshots >/dev/null; then
  fail "없는 파일인데 pr-screenshots 브랜치가 생김"
elif ! grep -q "nope.png" "$out"; then
  fail "없는 파일 이름을 알려 주지 않음"; sed 's/^/    /' "$out"
else
  echo "ok: 없는 파일이면 올리지 않음"
fi

# 처음 올리면 브랜치를 만들고, 마크다운 줄과 커밋 SHA를 출력한다
out="$work/first.out"
if run "$out" pr-1 "$work/cmp-1.png" "$work/cmp-2.png"; then
  sha="$(tail -1 "$out")"
  if [ "$(git -C "$work/origin.git" rev-parse refs/heads/pr-screenshots)" != "$sha" ]; then
    fail "마지막 줄이 브랜치 커밋 SHA가 아님"
  elif ! git -C "$work/origin.git" cat-file -e "$sha:pr-1/cmp-2.png"; then
    fail "pr-1/cmp-2.png가 커밋에 없음"
  elif ! grep -qF "![cmp-1](https://raw.githubusercontent.com/owner/repo/$sha/pr-1/cmp-1.png)" "$out"; then
    fail "마크다운 줄이 없음"; sed 's/^/    /' "$out"
  else
    echo "ok: 처음 올리기"
  fi
else
  fail "정상 업로드가 실패함"; sed 's/^/    /' "$out"
fi

# 두 번째는 앞 커밋 위에 쌓고 앞 이미지를 지우지 않는다
out="$work/second.out"
if run "$out" pr-2 "$work/cmp-1.png"; then
  sha="$(tail -1 "$out")"
  if ! git -C "$work/origin.git" cat-file -e "$sha:pr-1/cmp-1.png" || ! git -C "$work/origin.git" cat-file -e "$sha:pr-2/cmp-1.png"; then
    fail "두 번째 업로드가 앞 이미지를 지움"
  else
    echo "ok: 이어서 올리기"
  fi
else
  fail "두 번째 업로드가 실패함"; sed 's/^/    /' "$out"
fi

# 작업 브랜치는 그대로다
if [ "$(git -C "$work/clone" rev-list --count HEAD)" != 1 ] || [ -n "$(git -C "$work/clone" status --porcelain)" ]; then
  fail "작업 브랜치나 작업 폴더가 바뀜"
else
  echo "ok: 작업 브랜치 그대로"
fi

if [ "$failures" -gt 0 ]; then echo "${failures}개 실패"; exit 1; fi
echo "모두 통과"
