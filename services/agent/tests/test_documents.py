"""documents.py 테스트. 모든 문서 내용은 가상이다."""

import io
from pathlib import Path

import pytest
from docx import Document
from pypdf import PdfWriter

from app.documents import UNREADABLE, UnreadableDocument, extract_text, split_clauses

FIXTURES = Path(__file__).parent / "fixtures"


def test_split_by_article_headings():
    text = (
        "목적 안내\n제1조(목적) 이 규정은...\n제2조 (경조금) ① 본인 결혼 시...\n제2조의2(조위금) ..."
    )
    clauses = split_clauses(text)
    assert [c.label for c in clauses] == ["전문", "제1조", "제2조", "제2조의2"]
    assert [c.heading for c in clauses] == ["", "목적", "경조금", "조위금"]
    assert [c.ord for c in clauses] == [0, 1, 2, 3]
    assert clauses[0].body == "목적 안내"
    assert clauses[1].body == "이 규정은..."
    assert clauses[2].body == "① 본인 결혼 시..."


def test_no_preamble_when_document_starts_with_article():
    clauses = split_clauses("\n  제1조(목적) 가상 규정\n제2조(범위) 범위")
    assert [c.label for c in clauses] == ["제1조", "제2조"]
    assert clauses[0].ord == 0


def test_labels_drop_inner_spaces():
    clauses = split_clauses("제 2 조 (경조금) 내용\n제2조의 2(조위금) 내용")
    assert [c.label for c in clauses] == ["제2조", "제2조의2"]


def test_heading_empty_when_absent():
    clauses = split_clauses("제1조 이 규정은 가상이다.\n둘째 줄")
    assert clauses[0].heading == ""
    assert clauses[0].body == "이 규정은 가상이다.\n둘째 줄"


def test_article_reference_inside_text_is_not_a_split():
    text = "제1조(목적) 이 규정은 제3조에 따른 절차를 따른다.\n제2조(범위) 범위"
    clauses = split_clauses(text)
    assert [c.label for c in clauses] == ["제1조", "제2조"]
    assert "제3조에 따른" in clauses[0].body


def test_no_articles_falls_back_to_paragraph_chunks():
    paragraphs = ["가" * 400 for _ in range(5)]  # 문단 5개, 총 2000자 + 줄바꿈
    clauses = split_clauses("\n".join(paragraphs))
    assert [c.label for c in clauses] == [f"단락 {i}" for i in range(1, len(clauses) + 1)]
    assert len(clauses) >= 2
    assert all(len(c.body) <= 1000 for c in clauses)
    assert all(c.heading == "" for c in clauses)
    # 문단 경계에서 잘렸다: 각 본문은 400자 문단의 정수 배열이다
    for c in clauses:
        assert all(len(p) == 400 for p in c.body.split("\n"))
    assert "\n".join(c.body for c in clauses) == "\n".join(paragraphs)


def test_fallback_single_long_paragraph_is_cut_to_cap():
    clauses = split_clauses("나다라마. " * 600)
    assert len(clauses) >= 3
    assert all(len(c.body) <= 1000 for c in clauses)


def test_long_article_is_split_with_part_labels():
    body = "\n".join("가" * 99 for _ in range(45))  # 약 4500자
    clauses = split_clauses(f"제5조(상한) {body}")
    assert [c.label for c in clauses] == ["제5조 (1/3)", "제5조 (2/3)", "제5조 (3/3)"]
    assert all(len(c.body) <= 2000 for c in clauses)
    assert all(c.heading == "상한" for c in clauses)
    assert [c.ord for c in clauses] == [0, 1, 2]


def test_long_article_without_boundaries_is_hard_cut():
    clauses = split_clauses("제1조(긴글) " + "가" * 4500 + "\n제2조(다음) 짧음")
    assert [c.label for c in clauses] == ["제1조 (1/3)", "제1조 (2/3)", "제1조 (3/3)", "제2조"]
    assert [c.ord for c in clauses] == [0, 1, 2, 3]
    assert all(len(c.body) <= 2000 for c in clauses)


def _docx_bytes(paragraphs: list[str]) -> bytes:
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_extract_docx():
    data = _docx_bytes(["복리후생 규정(가상)", "제1조(목적) 가상 규정", "제2조(경조금) 가상 지급"])
    text = extract_text(data, "docx")
    assert "제1조(목적)" in text
    assert text.count("\n") >= 2


def test_extract_pdf():
    text = extract_text((FIXTURES / "sample-policy.pdf").read_bytes(), "pdf")
    assert "제1조(목적)" in text
    assert "제2조(경조금)" in text
    assert "\x01" not in text


def test_extract_blank_pdf_raises_unreadable():
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    with pytest.raises(UnreadableDocument) as e:
        extract_text(buf.getvalue(), "pdf")
    assert str(e.value) == UNREADABLE


def test_extract_blank_docx_raises_unreadable():
    with pytest.raises(UnreadableDocument):
        extract_text(_docx_bytes(["  ", ""]), "docx")


@pytest.mark.parametrize("file_type", ["pdf", "docx"])
def test_extract_garbage_bytes_raises_unreadable(file_type):
    with pytest.raises(UnreadableDocument) as e:
        extract_text(b"not a pdf", file_type)
    assert str(e.value) == UNREADABLE
