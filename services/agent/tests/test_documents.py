"""documents.py 테스트. 모든 문서 내용은 가상이다."""

import io
import time
import zipfile
from pathlib import Path

import pytest
from docx import Document
from pypdf import PdfWriter

import app.documents as documents
from app.documents import (
    TOO_LARGE,
    UNREADABLE,
    DocumentRejected,
    DocumentTooLarge,
    UnreadableDocument,
    extract_text,
    split_clauses,
)

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


def test_heading_does_not_cross_newline():
    c = split_clauses("제1조\n(1) 내용 하나")[0]
    assert (c.label, c.heading, c.body) == ("제1조", "", "(1) 내용 하나")


def test_heading_with_space_before_parenthesis():
    c = split_clauses("제1조 (목적) 본문")[0]
    assert (c.label, c.heading, c.body) == ("제1조", "목적", "본문")


def test_article_body_length_boundary():
    assert len(split_clauses("제1조(경계) " + "가" * 2000)) == 1
    two = split_clauses("제1조(경계) " + "가" * 2001)
    assert [c.label for c in two] == ["제1조 (1/2)", "제1조 (2/2)"]


def test_many_blank_lines_before_article_is_fast():
    start = time.perf_counter()
    clauses = split_clauses("\n" * 200_000 + "제1조(목적) x")
    assert time.perf_counter() - start < 3.0
    assert [c.label for c in clauses] == ["제1조"]


def _pdf_bytes(pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=50, height=50)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_huge_uncompressed_docx_is_too_large():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("word/big.bin", bytes(31 * 1024 * 1024))
    with pytest.raises(DocumentTooLarge) as e:
        extract_text(buf.getvalue(), "docx")
    assert str(e.value) == TOO_LARGE


def test_too_many_pdf_pages_is_too_large():
    with pytest.raises(DocumentTooLarge) as e:
        extract_text(_pdf_bytes(301), "pdf")
    assert str(e.value) == TOO_LARGE


def test_too_large_is_not_unreadable():
    assert not issubclass(DocumentTooLarge, UnreadableDocument)


def test_text_cap_for_docx(monkeypatch):
    monkeypatch.setattr(documents, "MAX_TEXT_CHARS", 10)
    with pytest.raises(DocumentTooLarge):
        extract_text(_docx_bytes(["가" * 11]), "docx")


def test_text_cap_for_pdf(monkeypatch):
    monkeypatch.setattr(documents, "MAX_TEXT_CHARS", 10)
    with pytest.raises(DocumentTooLarge):
        extract_text((FIXTURES / "sample-policy.pdf").read_bytes(), "pdf")


def test_rejections_share_parent():
    assert issubclass(UnreadableDocument, DocumentRejected)
    assert issubclass(DocumentTooLarge, DocumentRejected)


def _docx_with_table(paragraphs: list[str], rows: list[list[str]], merge_first_row: bool = False) -> bytes:
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    table = doc.add_table(rows=len(rows), cols=len(rows[0]))
    for r, row in enumerate(rows):
        for c, text in enumerate(row):
            table.cell(r, c).text = text
    if merge_first_row:
        table.cell(0, 0).merge(table.cell(0, len(rows[0]) - 1))
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_docx_table_rows_are_kept_in_order():
    data = _docx_with_table(["제8조(경조금)"], [["본인 결혼", "50만 원(가상)"], ["", "빈칸"]])
    text = extract_text(data, "docx")
    assert text.index("제8조") < text.index("본인 결혼 | 50만 원(가상)")
    assert "\n빈칸" in text
    clauses = split_clauses(text)
    assert "50만 원(가상)" in clauses[0].body


def test_docx_merged_cells_are_deduplicated():
    text = extract_text(_docx_with_table([], [["합계", "", ""]], merge_first_row=True), "docx")
    assert text.strip() == "합계"


def test_docx_with_only_table_is_readable():
    assert "50만 원" in extract_text(_docx_with_table([], [["결혼", "50만 원(가상)"]]), "docx")


def test_line_start_cross_references_do_not_split():
    clauses = split_clauses("제1조(목적) 세부 절차는\n제3조에 따른다.\n제2조(범위) 본문")
    assert [c.label for c in clauses] == ["제1조", "제2조"]
    assert "제3조에 따른다." in clauses[0].body
    for ref in ["제3조의 규정", "제2조의2에 따라"]:
        assert [c.label for c in split_clauses(f"제1조(목적) 가\n{ref}")] == ["제1조"]


def test_real_article_forms_still_split():
    assert [c.label for c in split_clauses("제1조 본문\n제2조의2(조위금) x")] == ["제1조", "제2조의2"]
    assert split_clauses("제2조의2(조위금) x")[0].heading == "조위금"


def test_full_width_parentheses_heading():
    c = split_clauses("제2조（경조금） 본문")[0]
    assert (c.label, c.heading, c.body) == ("제2조", "경조금", "본문")


def _table_docx(build) -> bytes:
    doc = Document()
    build(doc)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_huge_grid_span_is_read_once_and_fast():
    from docx.oxml import parse_xml

    def build(doc):
        t = doc.add_table(rows=1, cols=1)
        t.cell(0, 0).text = "가상 항목"
        tcPr = t.cell(0, 0)._tc.get_or_add_tcPr()
        tcPr.append(parse_xml(
            '<w:gridSpan xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:val="10000"/>'
        ))

    data = _table_docx(build)
    start = time.perf_counter()
    text = extract_text(data, "docx")
    assert time.perf_counter() - start < 3.0
    assert text.strip() == "가상 항목"


def test_vertically_merged_text_appears_once():
    def build(doc):
        t = doc.add_table(rows=3, cols=2)
        t.cell(0, 0).text = "구분"
        t.cell(0, 1).text = "a"
        t.cell(1, 1).text = "b"
        t.cell(2, 1).text = "c"
        t.cell(0, 0).merge(t.cell(2, 0))

    text = extract_text(_table_docx(build), "docx")
    assert text.count("구분") == 1


def test_table_text_cap_applies_while_accumulating(monkeypatch):
    monkeypatch.setattr(documents, "MAX_TEXT_CHARS", 50)

    def build(doc):
        t = doc.add_table(rows=20, cols=1)
        for r in t.rows:
            r.cells[0].text = "가" * 10

    with pytest.raises(DocumentTooLarge):
        extract_text(_table_docx(build), "docx")


def test_table_cell_count_cap(monkeypatch):
    monkeypatch.setattr(documents, "MAX_DOCX_CELLS", 5)

    def build(doc):
        t = doc.add_table(rows=4, cols=2)
        for r in t.rows:
            for c in r.cells:
                c.text = "x"

    with pytest.raises(DocumentTooLarge):
        extract_text(_table_docx(build), "docx")
