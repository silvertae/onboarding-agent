"""GA-07 기본 서식 "명함 신청서.xlsx"를 만든다. 내용은 모두 가상이다(설계 2026-11-20-business-card-form-design.md 4.6).

실제 명함 신청 양식과 같은 구조(시트 2개, 부문 드롭다운, VLOOKUP 자동 채움)만 따른다.
부문·직급 목록은 supabase/migrations/0015_business_card_form.sql의 GA-07 칸 정의와 같아야 하고,
tests/test_business_card_form.py가 로컬 DB와 비교해 확인한다.

    cd services/agent && uv run python scripts/make_business_card_form.py
"""

from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parents[3] / "supabase" / "seed-forms" / "GA-07" / "명함 신청서.xlsx"

JOB_TITLES = [
    ("사원", "Associate"), ("대리", "Assistant Manager"), ("과장", "Manager"), ("차장", "Deputy General Manager"),
    ("부장", "General Manager"), ("선임", "Senior Associate"), ("책임", "Senior Manager"), ("수석", "Principal"),
    ("팀장", "Team Leader"), ("그룹장", "Group Leader"), ("본부장", "Head of Division"), ("부문장", "Head of Sector"),
    ("대표이사", "CEO"),
]
UNITS = [("본부", "Division"), ("부문", "Sector"), ("사업부", "Business Unit"), ("그룹", "Group"), ("센터", "Center"), ("팀", "Team")]
# (부문, 영문명, 조직 단위). 단위가 None이면 영문 부문이 빈 값(공란).
DIVISIONS = [
    ("공란", "", None),
    ("AI 부문", "Artificial Intelligence", "부문"),
    ("AI 그룹 / AI본부", "Artificial Intelligence", "그룹"),
    ("플랫폼 본부", "Platform", "본부"),
    ("클라우드 사업부 / 플랫폼본부", "Cloud", "사업부"),
    ("데이터 사업부 / 플랫폼본부", "Data", "사업부"),
    ("산업솔루션 본부", "Industrial Solution", "본부"),
    ("스마트팩토리 사업부 / 산업솔루션본부", "Smart Factory", "사업부"),
    ("전략컨설팅 본부", "Strategy Consulting", "본부"),
    ("경영지원 본부", "Corporate Support", "본부"),
    ("인사총무팀 / 경영지원본부", "HR & General Affairs", "팀"),
]
NOTES = [
    ("직책이 있는 경우", "직책명을 표기", "OOO 팀장", "OOO Team Leader"),
    ("직책이 없는 경우", "직급을 표기", "OOO 책임", "OOO Senior Manager"),
    ("공통", "위 표의 명칭만 사용", "", ""),
]
HEADER = ["이름", "영문이름", "직급", "외부용 직급", "영문직급", "자격증명", "부문", "영문부문", "이메일아이디", "휴대폰", "팩스번호"]
EXAMPLE = ["김하늘", "Haneul Kim", "사원", None, None, None, "AI 그룹 / AI본부", None, "haneul.kim", "010-0000-0000", None]

HEAD_FILL = PatternFill("solid", fgColor="1F3A68")
REQUIRED_FILL = PatternFill("solid", fgColor="FFF2CC")
AUTO_FILL = PatternFill("solid", fgColor="E2EFDA")
THIN = Side(style="thin", color="BFBFBF")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _head(ws, row: int, col: int, values: list[str]) -> None:
    for i, v in enumerate(values):
        c = ws.cell(row=row, column=col + i, value=v)
        c.font, c.fill, c.border = Font(bold=True, color="FFFFFF"), HEAD_FILL, BOX
        c.alignment = Alignment(horizontal="center")


def _reference(ws) -> tuple[str, str]:
    """명함참고 시트. (직급표 범위, 부문표 범위)를 돌려준다."""
    ws["B2"] = "1.1. 직급 및 영문직급"
    ws["B2"].font = Font(bold=True)
    _head(ws, 4, 2, ["직급", "영문직급"])
    for i, (ko, en) in enumerate(JOB_TITLES):
        ws.cell(row=5 + i, column=2, value=ko).border = BOX
        ws.cell(row=5 + i, column=3, value=en).border = BOX
    title_end = 5 + len(JOB_TITLES) - 1

    unit_head = title_end + 3
    ws.cell(row=unit_head, column=2, value="1.2. 조직명 및 영문조직명").font = Font(bold=True)
    _head(ws, unit_head + 1, 2, ["조직명", "영문"])
    unit_row = {}
    for i, (ko, en) in enumerate(UNITS):
        r = unit_head + 2 + i
        ws.cell(row=r, column=2, value=ko).border = BOX
        ws.cell(row=r, column=3, value=en).border = BOX
        unit_row[ko] = r

    div_head = unit_head + 2 + len(UNITS) + 2
    ws.cell(row=div_head, column=2, value="2.1. 부문 및 영문부문").font = Font(bold=True)
    ws.cell(row=div_head + 1, column=2, value="* 소속 사업부를 고른다(사업부가 없으면 팀·본부)")
    _head(ws, div_head + 2, 2, ["부문", "영문명", "영문부문"])
    div_start = div_head + 3
    for i, (ko, en, unit) in enumerate(DIVISIONS):
        r = div_start + i
        ws.cell(row=r, column=2, value=ko).border = BOX
        ws.cell(row=r, column=3, value=en or None).border = BOX
        ws.cell(row=r, column=4, value=f'=C{r}&" "&C${unit_row[unit]}' if unit else None).border = BOX
    div_end = div_start + len(DIVISIONS) - 1

    note_head = div_end + 3
    ws.cell(row=note_head, column=2, value="2.2. 명함 표시 참고사항").font = Font(bold=True)
    _head(ws, note_head + 1, 2, ["구분", "기준", "한글 적용 예", "영문 적용 예"])
    for i, row in enumerate(NOTES):
        for j, v in enumerate(row):
            ws.cell(row=note_head + 2 + i, column=2 + j, value=v or None).border = BOX
    ws.cell(row=note_head + 2 + len(NOTES) + 1, column=2, value="* 학위·자격은 담당자와 협의해 덧붙일 수 있다")

    for col, width in zip("ABCDE", (2, 34, 32, 34, 24)):
        ws.column_dimensions[col].width = width
    return f"$B$5:$C${title_end}", f"$B${div_start}:$D${div_end}"


def build(path: Path) -> None:
    wb = Workbook()
    ref = wb.active
    assert ref is not None
    ref.title = "명함참고"
    titles, divisions = _reference(ref)
    div_values = divisions.split(":")[0] + ":" + divisions.split(":")[1].replace("$D$", "$B$")

    ws = wb.create_sheet("명함신청양식")
    ws["B2"] = "명함 신청 작성양식"
    ws["B2"].font = Font(bold=True, size=13)
    ws["H2"] = "목록에서 선택"
    ws["H2"].font = Font(bold=True)
    _head(ws, 3, 2, HEADER)
    for i, v in enumerate(EXAMPLE):
        ws.cell(row=4, column=2 + i, value=v)
    ws["F4"] = f"=IFERROR(VLOOKUP(D4,'명함참고'!{titles},2,FALSE),\"\")"
    ws["I4"] = f"=IFERROR(VLOOKUP(H4,'명함참고'!{divisions},3,FALSE),\"\")"
    for col in "BCDFHIJK":
        ws[f"{col}4"].fill = AUTO_FILL if col in "FI" else REQUIRED_FILL
    for col in "BCDEFGHIJKL":
        ws[f"{col}4"].border = BOX

    dv = DataValidation(type="list", formula1=f"='명함참고'!{div_values}", allow_blank=True)
    dv.add("H4:H20")
    ws.add_data_validation(dv)

    for r, (label, fill) in enumerate((("필수입력", REQUIRED_FILL), ("자동선택", AUTO_FILL), ("선택입력", None)), start=7):
        c = ws.cell(row=r, column=2, value=label)
        c.border = BOX
        if fill:
            c.fill = fill

    for col, width in zip("ABCDEFGHIJKL", (2, 10, 14, 10, 12, 20, 10, 34, 30, 14, 16, 12)):
        ws.column_dimensions[col].width = width
    wb.active = 1
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


if __name__ == "__main__":
    build(OUT)
    print(f"[make-business-card-form] {OUT}")
