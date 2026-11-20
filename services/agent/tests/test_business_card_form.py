"""GA-07 기본 서식 "명함 신청서.xlsx" 검사. 부문·직급 목록이 DB의 GA-07 칸 정의와 같은지 본다(로컬 Supabase 필요)."""

import os
import re
from pathlib import Path
from typing import Any, cast

import pytest
from openpyxl import load_workbook
from supabase import create_client

REPO_DIR = Path(__file__).resolve().parents[3]
WORKBOOK = REPO_DIR / "supabase" / "seed-forms" / "GA-07" / "명함 신청서.xlsx"
ORG_ID = "00000000-0000-0000-0000-000000000001"
HEADER = ["이름", "영문이름", "직급", "외부용 직급", "영문직급", "자격증명", "부문", "영문부문", "이메일아이디", "휴대폰", "팩스번호"]


@pytest.fixture(scope="module")
def wb():
    return load_workbook(WORKBOOK)


@pytest.fixture(scope="module")
def schema() -> dict[str, dict]:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        pytest.fail("환경변수 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 없습니다. 'supabase start' 후 'npm run test:agent'로 실행하세요.")
    rows = cast(list[dict[str, Any]], (
        create_client(url, key).table("task_templates").select("form_schema")
        .eq("org_id", ORG_ID).eq("code", "GA-07").execute().data
    ))
    return {f["key"]: f for f in rows[0]["form_schema"]["fields"]}


def _division_rows(wb):
    """부문 드롭다운이 가리키는 범위의 (부문 셀) 목록."""
    dv = wb["명함신청양식"].data_validations.dataValidation
    assert len(dv) == 1 and dv[0].type == "list"
    sheet, cells = dv[0].formula1.lstrip("=").split("!")
    return wb[sheet.strip("'")], [row[0] for row in wb[sheet.strip("'")][cells.replace("$", "")]]


def test_sheets_and_header(wb):
    assert wb.sheetnames == ["명함참고", "명함신청양식"]
    ws = wb["명함신청양식"]
    assert [ws.cell(row=3, column=c).value for c in range(2, 13)] == HEADER


def test_division_dropdown_matches_ga07_schema(wb, schema):
    _, cells = _division_rows(wb)
    assert [c.value for c in cells] == [o["value"] for o in schema["division"]["options"]]


def test_english_division_matches_schema(wb, schema):
    ws, cells = _division_rows(wb)
    got = []
    for cell in cells:
        formula = ws.cell(row=cell.row, column=cell.column + 2).value
        if formula in (None, ""):
            got.append("")
            continue
        m = re.fullmatch(r'=C(\d+)&" "&C\$(\d+)', formula)
        assert m, formula
        got.append(f'{ws[f"C{m[1]}"].value} {ws[f"C{m[2]}"].value}')
    assert got == [o["english"] for o in schema["division"]["options"]]


def test_job_titles_match_schema(wb, schema):
    ws = wb["명함참고"]
    titles = {}
    for row in ws.iter_rows(min_row=5, max_row=30, min_col=2, max_col=3):
        if row[0].value is None:
            break
        titles[row[0].value] = row[1].value
    assert titles == schema["job_title"]["english"]


def test_lookups_point_at_reference_tables(wb):
    ws = wb["명함신청양식"]
    assert ws["F4"].value.startswith("=IFERROR(VLOOKUP(D4,'명함참고'!$B$5:$C$")
    assert ws["I4"].value.startswith("=IFERROR(VLOOKUP(H4,'명함참고'!$B$")


def test_example_row_is_virtual(wb):
    ws = wb["명함신청양식"]
    assert (ws["B4"].value, ws["C4"].value, ws["D4"].value, ws["H4"].value) == ("김하늘", "Haneul Kim", "사원", "AI 그룹 / AI본부")
    assert (ws["J4"].value, ws["K4"].value, ws["L4"].value) == ("haneul.kim", "010-0000-0000", None)
    for sheet in wb.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                assert "@" not in str(cell.value or ""), f"{sheet.title}!{cell.coordinate}"
