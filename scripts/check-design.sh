#!/usr/bin/env bash
# 디자인 규칙 검사(.interface-design/system.md). 웹 소스에서 기계로 잡을 수 있는 위반만 막는다.
# 화면의 위계·구성 같은 판단은 PR 전에 /design-review로 본다.
#
# 사용: bash scripts/check-design.sh            (apps/web/src 검사, 위반 있으면 종료 코드 1)
#       DESIGN_SRC=<폴더> bash scripts/check-design.sh
# 예외: 그 줄에 `design-allow: <이유>` 주석을 달면 그 줄은 건너뛴다.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="${DESIGN_SRC:-$root/apps/web/src}"
violations=0

# 검사 대상: .ts/.tsx (테스트 제외). CSS는 토큰 정의(index.css)와 인쇄(print.css)뿐이라 보지 않는다.
files=()
while IFS= read -r f; do files+=("$f"); done < <(
  find "$src" -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.ts' ! -name '*.test.tsx' | sort
)
[ "${#files[@]}" -eq 0 ] && { echo "검사할 파일이 없습니다: $src"; exit 0; }

# rule <정규식(grep -E)> <안내 문구> [허용 파일 경로 정규식]
rule() {
  local pattern="$1" message="$2" allow="${3:-}"
  local f rel line
  for f in "${files[@]}"; do
    rel="${f#"$src"/}"
    if [ -n "$allow" ] && [[ "$rel" =~ $allow ]]; then continue; fi
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      case "$line" in *design-allow*) continue ;; esac
      echo "$rel:${line%%:*}: $message"
      violations=$((violations + 1))
    done < <(grep -nE -- "$pattern" "$f" || true)
  done
}

print_only='^(features/exam/ExamPrintPage\.tsx|components/BusinessCard\.tsx)$'

rule '#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?\b' \
  '색 hex를 직접 쓰지 않는다. index.css의 의미 토큰(bg-st-*, text-alert-*, bg-surface-subtle …)을 쓴다' "$print_only"
rule 'text-\[[0-9.]+(px|rem)\]' \
  '임의 글자 크기 대신 글자 단계(text-micro/label/row/lead/section/title/page, text-xs/sm)를 쓴다' "$print_only"
rule 'transition-all' \
  'transition-all 대신 바뀌는 속성만 적는다(transition-[background-color,…] duration-150 ease-out-ui)'
rule 'font-bold' \
  'font-bold(700)는 쓰지 않는다. 제목·강조는 font-semibold(600)' "$print_only"
rule 'bg-white' \
  'bg-white 대신 bg-card를 쓴다' "$print_only"
rule 'role="(tab|tablist|radio)"' \
  'role="tab"·role="radio"를 단 버튼을 직접 만들지 않는다. components/ui/tabs(SegmentTabs)·components/SegmentedRadio를 쓴다'
rule 'role="radiogroup"' \
  'radiogroup은 components/SegmentedRadio를 쓴다' '^components/SegmentedRadio\.tsx$'
rule '<select[ >]' \
  '네이티브 <select> 대신 components/ui/native-select의 NativeSelect를 쓴다' '^components/ui/native-select\.tsx$'
rule 'type="checkbox"' \
  '네이티브 체크박스 대신 components/ui/checkbox의 Checkbox를 쓴다'
# Button 높이 덮어쓰기: 여는 태그가 여러 줄에 걸쳐도 잡도록 파일 전체를 읽어 <Button …> 하나씩 본다.
# 속성 안의 화살표(=>)는 태그 끝으로 보지 않는다. className="…"과 className={cn('…')} 둘 다 본다.
button_height() {
  local message='Button 높이를 className으로 덮어쓰지 않는다. size(lg 44 / 기본 36 / sm 32)를 고른다'
  local f rel n
  for f in "${files[@]}"; do
    rel="${f#"$src"/}"
    while IFS= read -r n; do
      [ -z "$n" ] && continue
      echo "$rel:$n: $message"
      violations=$((violations + 1))
    done < <(perl -0777 -ne '
      while (/<Button\b((?:=>|[^>])*)>/g) {
        my ($tag, $start) = ($1, $-[0]);
        next if $tag =~ /design-allow/;
        next unless $tag =~ /className=("[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})/;
        next unless $1 =~ /(?<![\w-])h-(?:6|7|8|9|10|11|12)(?![\w-])/;
        print 1 + (substr($_, 0, $start) =~ tr/\n//), "\n";
      }' "$f")
  done
}
button_height

if [ "$violations" -gt 0 ]; then
  echo
  echo "디자인 규칙 위반 ${violations}건. 규칙: .interface-design/system.md"
  echo "정말 필요한 예외면 그 줄에 'design-allow: <이유>' 주석을 단다."
  exit 1
fi
echo "디자인 규칙 검사 통과 (${#files[@]}개 파일)"
