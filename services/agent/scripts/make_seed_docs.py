"""가상 시드 문서 2개를 만든다. 내용은 모두 가상이다(회사·사람·금액).

- supabase/seed-docs/welfare-policy.docx  복리후생 규정(가상): python-docx로 바로 쓴다.
- supabase/seed-docs/work-rules.pdf       취업규칙 발췌(가상): HTML을 만들고 Playwright로 한 번 인쇄한다.

사용법은 supabase/seed-docs/README.md. 사람 이름과 실제 회사명은 넣지 않는다.
금액에는 반드시 "(가상)" 또는 "가상 금액"을 붙인다. 동호회 가입비·출장비는 일부러 적지 않는다(데모의 미답변 질문).
"""

from __future__ import annotations

import html
import sys
from pathlib import Path

from docx import Document

REPO_ROOT = Path(__file__).resolve().parents[3]
SEED_DIR = REPO_ROOT / "supabase" / "seed-docs"

WELFARE_TITLE = "복리후생 규정(가상)"
WORK_RULES_TITLE = "취업규칙 발췌(가상)"

# 조항: (라벨, 제목, 항 목록). 항은 ①②… 로 시작한다.
WELFARE_ARTICLES: list[tuple[str, str, list[str]]] = [
    ("제1조", "목적", [
        "① 이 규정은 회사 임직원의 복리후생 제도의 운영 기준을 정한다.",
        "② 이 문서는 시연용 가상 문서이며 모든 금액은 가상이다.(가상 문서)",
    ]),
    ("제2조", "적용 범위", [
        "① 이 규정은 회사에 재직 중인 모든 임직원에게 적용한다.",
        "② 수습 기간 중인 구성원도 이 규정의 지원을 받을 수 있다.",
    ]),
    ("제3조", "정의", [
        "① 복리후생은 급여 외에 회사가 구성원에게 제공하는 지원을 말한다.",
        "② 지원 신청은 경영지원 담당자가 접수하고 확인한다.",
    ]),
    ("제4조", "건강검진", [
        "① 회사는 구성원에게 연 1회 종합 건강검진을 지원한다.",
        "② 검진 기관과 일정은 경영지원 담당자가 공지한다.",
    ]),
    ("제5조", "교육 지원", [
        "① 회사는 직무 관련 교육 과정의 수강료를 지원할 수 있다.",
        "② 교육을 신청하려면 팀장의 승인을 받아야 한다.",
        "③ 교육을 마치면 수료 내용을 팀에 공유한다.",
    ]),
    ("제6조", "도서 지원", [
        "① 회사는 직무와 관련된 도서 구입을 지원한다.",
        "② 구입한 도서는 팀 서가에 두고 함께 읽는다.",
    ]),
    ("제7조", "동호회 지원", [
        "① 구성원 3명 이상이 모이면 사내 동호회를 만들 수 있다.",
        "② 동호회 지원 내용은 경영지원 담당자에게 문의한다.",
    ]),
    ("제8조", "경조금", [
        "① 구성원에게 경사가 있으면 아래 표의 경조금과 특별휴가를 지원한다.",
        # 표는 TABLE_AFTER_ITEM 위치(첫 항 뒤)에 들어간다
        "② 경조금은 증빙 서류를 제출한 뒤 지급하며 모든 금액은 가상이다.",
        "③ 경조금은 결혼일 전후 30일 안에 인사팀에 신청한다.",
    ]),
    ("제9조", "조위금", [
        "① 임직원의 배우자 또는 부모가 사망한 경우 조위금 50만 원(가상 금액)과 특별휴가 5일을 준다.",
    ]),
    ("제10조", "휴양 시설", [
        "① 회사는 제휴 휴양 시설을 구성원이 할인된 가격으로 쓸 수 있게 한다.",
        "② 예약은 경영지원 담당자를 통해 한다.",
    ]),
    ("제11조", "사내 간식", [
        "① 회사는 휴게 공간에 간식과 음료를 비치한다.",
        "② 비치 품목은 구성원 의견을 모아 정한다.",
    ]),
    ("제12조", "복지포인트", [
        "① 회사는 매년 1월 1일 임직원에게 복지포인트 100만 원(가상 금액)을 지급한다.",
        "② 연중 입사자는 입사한 달부터 남은 달 수에 비례해 지급한다.",
    ]),
    ("제13조", "휴가 지원", [
        "① 회사는 구성원이 쓰는 휴가를 눈치 보지 않고 쓸 수 있게 장려한다.",
        "② 휴가 일수와 사용 방법은 취업규칙에서 정한다.",
    ]),
    ("제14조", "야근 식대", [
        "① 오후 8시 이후까지 근무하면 1만 2천 원(가상 금액)의 식대를 지원한다.",
        "② 야근 식대는 근무 기록과 영수증으로 확인한다.",
    ]),
    ("제15조", "신청과 지급", [
        "① 지원을 받으려면 경영지원 담당자에게 신청서를 낸다.",
        "② 지급은 신청을 확인한 뒤 가까운 급여일에 한다.",
    ]),
    ("제16조", "시행", [
        "① 이 규정은 공포한 날부터 시행한다.",
        "② 이 규정에서 정하지 않은 사항은 회사의 다른 규정에 따른다.",
    ]),
]

# 제8조 표: 첫 행은 머리글
WELFARE_TABLE_ARTICLE = "제8조"
WELFARE_TABLE: list[tuple[str, str, str]] = [
    ("구분", "금액", "특별휴가"),
    ("본인 결혼", "50만 원(가상)", "5일"),
    ("자녀 결혼", "30만 원(가상)", "1일"),
    ("자녀 출생", "10만 원(가상)", "3일"),
]

WORK_RULES_ARTICLES: list[tuple[str, str, list[str]]] = [
    ("제1조", "목적", [
        "① 이 규칙은 회사 구성원의 근로 조건과 복무 기준을 정하는 것을 목적으로 한다.",
        "② 이 문서는 시연용 가상 문서의 발췌본이다.",
    ]),
    ("제2조", "적용 범위", [
        "① 이 규칙은 회사에 재직 중인 모든 구성원에게 적용한다.",
    ]),
    ("제10조", "근무시간", [
        "① 근무시간은 하루 8시간, 주 40시간을 원칙으로 한다.",
        "② 기본 근무는 오전 9시에 시작하여 오후 6시에 마친다.",
        "③ 업무상 필요하면 팀장의 승인을 받아 근무시간을 조정할 수 있다.",
    ]),
    ("제11조", "휴게시간", [
        "① 근무시간 중 낮 12시부터 오후 1시까지 휴게시간을 둔다.",
        "② 휴게시간은 자유롭게 쓸 수 있다.",
    ]),
    ("제20조", "휴일", [
        "① 토요일과 일요일, 법정 공휴일은 휴일로 한다.",
        "② 회사 창립기념일도 휴일로 한다.",
    ]),
    ("제21조", "연차휴가", [
        "① 1년 동안 80% 이상 출근한 직원에게 15일의 연차휴가를 준다.",
        "② 입사 첫해에는 1개월 개근 시 1일의 연차휴가를 주며, 최대 11일로 한다.",
        "③ 연차휴가는 사용하려는 날의 3일 전까지 팀장에게 신청한다.",
    ]),
    ("제22조", "병가", [
        "① 질병이나 부상으로 근무하기 어려우면 병가를 신청할 수 있다.",
        "② 병가가 3일 이상이면 진단서를 낸다.",
    ]),
    ("제30조", "재택근무", [
        "① 업무 특성상 필요하면 주 2일 범위에서 재택근무를 할 수 있다.",
        "② 재택근무는 사전에 팀장의 승인을 받아야 한다.",
        "③ 재택근무 중에도 기본 근무시간을 지키고 연락이 닿아야 한다.",
    ]),
    ("제31조", "보안 준수", [
        "① 재택근무 중에는 회사 자료가 밖으로 새지 않도록 주의한다.",
    ]),
]


def write_docx(path: Path) -> None:
    doc = Document()
    doc.add_heading(WELFARE_TITLE, level=0)
    for label, heading, items in WELFARE_ARTICLES:
        doc.add_paragraph(f"{label}({heading})")
        for n, item in enumerate(items):
            doc.add_paragraph(item)
            if label == WELFARE_TABLE_ARTICLE and n == 0:
                table = doc.add_table(rows=len(WELFARE_TABLE), cols=3)
                table.style = "Table Grid"
                for r, row in enumerate(WELFARE_TABLE):
                    for c, value in enumerate(row):
                        table.cell(r, c).text = value
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(path))


def build_work_rules_html() -> str:
    body = [f"<h1>{html.escape(WORK_RULES_TITLE)}</h1>"]
    for label, heading, items in WORK_RULES_ARTICLES:
        body.append(f"<h2>{html.escape(label)}({html.escape(heading)})</h2>")
        body.extend(f"<p>{html.escape(item)}</p>" for item in items)
    style = (
        "body{font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;font-size:11pt;line-height:1.6;margin:0}"
        "h1{font-size:18pt}h2{font-size:12pt;margin:18px 0 4px}p{margin:2px 0}"
    )
    return (
        f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{html.escape(WORK_RULES_TITLE)}</title>'
        f"<style>{style}</style></head><body>{''.join(body)}</body></html>"
    )


def main(argv: list[str]) -> int:
    html_path = Path(argv[1] if len(argv) > 1 else "work-rules.html")
    write_docx(SEED_DIR / "welfare-policy.docx")
    html_path.write_text(build_work_rules_html(), encoding="utf-8")
    pdf_path = SEED_DIR / "work-rules.pdf"
    print(f"docx 작성: {SEED_DIR / 'welfare-policy.docx'}")
    print(f"HTML 작성: {html_path}")
    print("PDF는 Playwright로 한 번 인쇄한다(README 참고). 예:")
    print(
        "  node -e \"const {chromium}=require('<repo>/scripts/design/node_modules/playwright');"
        "(async()=>{const b=await chromium.launch({channel:'chrome'});const p=await b.newPage();"
        f"await p.setContent(require('fs').readFileSync('{html_path}','utf8'));"
        f"await p.pdf({{path:'{pdf_path}',format:'A4',margin:{{top:'20mm',bottom:'20mm',left:'18mm',right:'18mm'}}}});"
        'await b.close()})()"'
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
