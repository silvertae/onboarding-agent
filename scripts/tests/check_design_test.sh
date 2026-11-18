#!/usr/bin/env bash
# scripts/check-design.sh가 디자인 규칙 위반을 잡고, 허용한 예외는 통과시키는지 가짜 소스 트리로 확인한다.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
check="$here/../check-design.sh"
failures=0

fail() { echo "FAIL: $*"; failures=$((failures + 1)); }

# 한 파일만 든 가짜 src에서 검사를 돌린다: run_case <이름> <기대 종료 코드 0|1> <파일 상대 경로> <파일 내용> [출력에 있어야 할 문구]
run_case() {
  local name="$1" expect="$2" rel="$3" content="$4" want="${5:-}"
  local dir out code=0
  dir="$(mktemp -d)"
  out="$(mktemp)"
  mkdir -p "$dir/$(dirname "$rel")"
  printf '%s\n' "$content" >"$dir/$rel"
  DESIGN_SRC="$dir" bash "$check" >"$out" 2>&1 || code=$?
  if [ "$code" -ne "$expect" ]; then
    fail "$name: 종료 코드 $code (기대 $expect)"
    sed 's/^/    /' "$out"
  elif [ -n "$want" ] && ! grep -qF -- "$want" "$out"; then
    fail "$name: 출력에 '$want' 없음"
    sed 's/^/    /' "$out"
  else
    echo "ok: $name"
  fi
  rm -rf "$dir" "$out"
}

# 위반: 규칙마다 하나씩
run_case "hex 색" 1 features/a/Page.tsx '<p className="text-[#a1261c]">x</p>' "색 hex"
run_case "임의 글자 크기" 1 features/a/Page.tsx '<p className="text-[13px]">x</p>' "임의 글자 크기"
run_case "transition-all" 1 components/X.tsx '<div className="transition-all" />' "transition-all"
run_case "font-bold" 1 features/a/Page.tsx '<h1 className="font-bold">x</h1>' "font-bold"
run_case "bg-white" 1 features/a/Page.tsx '<div className="bg-white" />' "bg-white"
run_case "직접 만든 탭" 1 features/a/Page.tsx '<button role="tab">x</button>' "role=\"tab\""
run_case "직접 만든 라디오" 1 features/a/Page.tsx '<button role="radio">x</button>' "role=\"radio\""
run_case "네이티브 select" 1 features/a/Page.tsx '<select id="s"></select>' "NativeSelect"
run_case "네이티브 체크박스" 1 features/a/Page.tsx '<input type="checkbox" />' "Checkbox"
run_case "버튼 높이 덮어쓰기" 1 features/a/Page.tsx '<Button className="h-11 px-5">x</Button>' "size"
run_case "출력에 파일:줄" 1 features/a/Page.tsx '<p className="text-[13px]">x</p>' "features/a/Page.tsx:1"

# 통과: 규칙에 맞는 코드와 허용한 예외
run_case "토큰만 쓴 코드" 0 features/a/Page.tsx '<p className="text-label text-st-rework-fg bg-card">x</p>'
run_case "인쇄 화면은 hex 허용" 0 features/exam/ExamPrintPage.tsx '<p className="text-[#1d1d1f]">x</p>'
run_case "명함 미리보기는 bg-white 허용" 0 components/BusinessCard.tsx '<div className="bg-white" />'
run_case "SegmentedRadio의 radiogroup" 0 components/SegmentedRadio.tsx '<div role="radiogroup">'
run_case "NativeSelect 안의 select" 0 components/ui/native-select.tsx '<select data-slot="native-select-control" />'
run_case "테스트 파일은 검사하지 않음" 0 features/a/Page.test.tsx 'expect(x).toHaveClass("text-[13px]")'
run_case "design-allow 주석" 0 features/a/Page.tsx '<p className="text-[13px]">x</p> {/* design-allow: 외부 위젯 크기 */}'
run_case "Button 아닌 요소의 h-11" 0 features/a/Page.tsx '<div className="h-11" />'

if [ "$failures" -gt 0 ]; then
  echo "${failures}개 실패"
  exit 1
fi
echo "모두 통과"
