"""가상 시드 문서(복리후생 규정 docx, 취업규칙 발췌 pdf) 검사. DB 없이 돈다."""

import importlib.util
import re
from pathlib import Path

import pytest

from app.documents import extract_text, split_clauses

ROOT = Path(__file__).resolve().parents[3]
SEED_DIR = ROOT / "supabase" / "seed-docs"
WELFARE = SEED_DIR / "welfare-policy.docx"
WORK_RULES = SEED_DIR / "work-rules.pdf"


def _load(path: Path, file_type: str) -> str:
    return extract_text(path.read_bytes(), file_type)  # type: ignore[arg-type]


@pytest.fixture(scope="module")
def welfare_text() -> str:
    return _load(WELFARE, "docx")


@pytest.fixture(scope="module")
def work_text() -> str:
    return _load(WORK_RULES, "pdf")


def _by_label(text: str) -> dict:
    return {c.label: c for c in split_clauses(text)}


def test_seed_docs_split(welfare_text, work_text):
    for text in (welfare_text, work_text):
        clauses = split_clauses(text)
        assert len(clauses) >= 5
        labelled = [c for c in clauses if c.label.startswith("제")]
        assert labelled[0].label == "제1조"


def test_welfare_clauses(welfare_text):
    clauses = _by_label(welfare_text)
    assert len([c for c in clauses if c.startswith("제")]) >= 12
    c8 = clauses["제8조"]
    assert c8.heading == "경조금"
    assert "50만 원(가상)" in c8.body
    assert "구분 | 금액 | 특별휴가" in c8.body
    assert "본인 결혼 | 50만 원(가상) | 5일" in c8.body
    assert "결혼일 전후 30일" in c8.body
    assert "자녀 결혼 | 30만 원(가상) | 1일" in c8.body
    c9 = clauses["제9조"]
    assert c9.heading == "조위금"
    assert "50만 원" in c9.body
    c12 = clauses["제12조"]
    assert c12.heading == "복지포인트"
    assert "100만 원" in c12.body
    c14 = clauses["제14조"]
    assert "1만 2천 원" in c14.body


def test_work_rules_clauses(work_text):
    clauses = _by_label(work_text)
    assert len([c for c in clauses if c.startswith("제")]) >= 6
    c21 = clauses["제21조"]
    assert c21.heading == "연차휴가"
    assert "15일" in c21.body
    assert "최대 11일" in c21.body
    assert any(c.heading == "근무시간" for c in clauses.values())
    assert any("재택" in c.heading for c in clauses.values())


def test_unanswered_demo_topics_stay_out(welfare_text, work_text):
    for text in (welfare_text, work_text):
        assert "출장비" not in text
        assert "동호회 가입비" not in text


def test_no_real_names_and_amounts_are_virtual(welfare_text, work_text):
    for text in (welfare_text, work_text):
        for line in text.splitlines():
            assert "님" not in line, line
            if re.search(r"\d\s*원", line):
                assert "가상" in line, line


def test_committed_docx_matches_generator(tmp_path, welfare_text):
    spec = importlib.util.spec_from_file_location(
        "make_seed_docs", Path(__file__).resolve().parents[1] / "scripts" / "make_seed_docs.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out = tmp_path / "welfare.docx"
    mod.write_docx(out)
    assert extract_text(out.read_bytes(), "docx") == welfare_text
    # PDF의 원문(HTML)도 생성기가 만든 조항 제목과 맞는다
    html = mod.build_work_rules_html()
    for label, heading, _ in mod.WORK_RULES_ARTICLES:
        assert f"{label}({heading})" in html
