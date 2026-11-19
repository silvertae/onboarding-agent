"""규정 문서(pdf·docx)에서 글자를 뽑고 조항 단위로 나눈다. 순수 함수만 둔다(DB·네트워크·로그 없음)."""

import io
import re
import zipfile
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Literal

import pypdf
from docx import Document
from docx.oxml.ns import qn
from docx.table import _Cell
from docx.text.paragraph import Paragraph

UNREADABLE = "글자를 읽을 수 없는 파일이에요"

TOO_LARGE = "문서가 너무 커요. 나눠서 올려 주세요."
MAX_DOCX_UNCOMPRESSED = 30 * 1024 * 1024  # docx(zip) 압축을 풀었을 때 합계 바이트
MAX_PDF_PAGES = 300
MAX_TEXT_CHARS = 1_000_000
MAX_DOCX_CELLS = 20_000  # 표 칸 수(읽은 w:tc 개수) 상한

PREAMBLE_MIN = 20  # 전문이 이보다 짧으면(공백 제외) 문서 제목만 있는 줄로 보고 버린다

ARTICLE_MAX = 2000  # 조항 하나(조각)의 최대 글자 수
CHUNK_TARGET = 800  # 조항 표시가 없을 때 단락 묶음의 목표 글자 수
CHUNK_CAP = 1000  # 같은 경우의 상한

_ARTICLE_RE = re.compile(
    r"^[ \t]*(제[ \t]*\d+[ \t]*조(?:의[ \t]*\d+)?)(?![가-힣0-9])[ \t]*(?:[(（]([^)）\n]*)[)）])?", re.M
)
_SENTENCE_END_RE = re.compile(r"(?<=[.!?。])\s+")
# pdf 글꼴에 따라 공백이 제어 문자로 나오는 경우가 있다(줄바꿈·탭은 둔다)
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


class DocumentRejected(Exception):
    """처리할 수 없는 문서. 호출자는 이 예외를 받아 str(e)를 문서의 실패 사유로 저장한다."""


class UnreadableDocument(DocumentRejected):
    """글자를 읽을 수 없는 문서. 메시지에 문서 내용을 담지 않는다."""


class DocumentTooLarge(DocumentRejected):
    """문서가 너무 크다. 메시지에 문서 내용을 담지 않는다."""


@dataclass
class Clause:
    ord: int
    label: str
    heading: str
    body: str


def _docx_text(doc) -> str:
    """본문을 문서 순서대로 읽는다. 표의 행은 셀 글자를 " | "로 이은 한 줄이다.

    셀은 실제 w:tc 요소를 한 번씩만 읽는다(gridSpan은 무시, 세로 병합의 이어지는 칸은 건너뜀).
    글자 수와 셀 수는 읽는 도중에 세어 상한을 넘으면 바로 멈춘다.
    """
    lines: list[str] = []
    total = 0
    cells_seen = 0

    def add(line: str) -> None:
        nonlocal total
        total += len(line) + 1
        if total > MAX_TEXT_CHARS:
            raise DocumentTooLarge(TOO_LARGE)
        lines.append(line)

    for block in doc.iter_inner_content():
        if isinstance(block, Paragraph):
            add(block.text)
            continue
        for row in block.rows:
            cells: list[str] = []
            for tc in row._tr.tc_lst:
                cells_seen += 1
                if cells_seen > MAX_DOCX_CELLS:
                    raise DocumentTooLarge(TOO_LARGE)
                tcPr = tc.tcPr
                v_merge = tcPr.find(qn("w:vMerge")) if tcPr is not None else None
                if v_merge is not None and v_merge.get(qn("w:val")) != "restart":
                    cells.append("")  # 세로 병합의 이어지는 칸. 열 위치를 맞춘다
                    continue
                cells.append(_Cell(tc, block).text.strip())
            if any(cells):
                add(" | ".join(cells))
    return "\n".join(lines)


def extract_text(data: bytes, file_type: Literal["pdf", "docx"]) -> str:
    try:
        if file_type == "docx":
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if sum(i.file_size for i in archive.infolist()) > MAX_DOCX_UNCOMPRESSED:
                    raise DocumentTooLarge(TOO_LARGE)
            text = _docx_text(Document(io.BytesIO(data)))
        else:
            reader = pypdf.PdfReader(io.BytesIO(data))
            if len(reader.pages) > MAX_PDF_PAGES:
                raise DocumentTooLarge(TOO_LARGE)
            pages: list[str] = []
            total = 0
            for page in reader.pages:
                page_text = page.extract_text() or ""
                total += len(page_text) + 1
                if total > MAX_TEXT_CHARS:
                    raise DocumentTooLarge(TOO_LARGE)
                pages.append(page_text)
            text = "\n".join(pages)
    except DocumentTooLarge:
        raise DocumentTooLarge(TOO_LARGE) from None
    except Exception:
        raise UnreadableDocument(UNREADABLE) from None
    if len(text) > MAX_TEXT_CHARS:
        raise DocumentTooLarge(TOO_LARGE)
    text = _CONTROL_RE.sub(" ", text.replace("\r\n", "\n").replace("\r", "\n"))
    if not text.strip():
        raise UnreadableDocument(UNREADABLE)
    return text


def _units(text: str, limit: int) -> list[tuple[str, str]]:
    """limit 이하 조각으로 나눈다. (앞에 붙일 구분자, 조각). 문단 → 문장 끝 → 강제 자르기 순."""
    units: list[tuple[str, str]] = []
    for paragraph in text.split("\n"):
        if not paragraph.strip():
            continue
        sep = "\n"
        for sentence in _SENTENCE_END_RE.split(paragraph):
            for start in range(0, len(sentence), limit):
                units.append((sep, sentence[start : start + limit]))
                sep = ""
            sep = " "
    return units


def _pack(text: str, target: int, cap: int) -> list[str]:
    """조각을 target을 넘기기 전까지 이어 붙인다. 조각 하나는 cap까지 허용."""
    chunks: list[str] = []
    current = ""
    for sep, piece in _units(text, cap):
        if current and len(current) + len(sep) + len(piece) > target:
            chunks.append(current)
            current = piece
        else:
            current = current + sep + piece if current else piece
    if current:
        chunks.append(current)
    return chunks


def split_clauses(text: str) -> list[Clause]:
    matches = list(_ARTICLE_RE.finditer(text))
    if not matches:
        chunks = _pack(text, CHUNK_TARGET, CHUNK_CAP)
        return [Clause(i, f"단락 {i + 1}", "", c) for i, c in enumerate(chunks)]

    clauses: list[Clause] = []

    def add(label: str, heading: str, body: str) -> None:
        parts = _pack(body, ARTICLE_MAX, ARTICLE_MAX) if len(body) > ARTICLE_MAX else [body]
        for i, part in enumerate(parts, 1):
            part_label = f"{label} ({i}/{len(parts)})" if len(parts) > 1 else label
            clauses.append(Clause(len(clauses), part_label, heading, part))

    preamble = text[: matches[0].start()].strip()
    if len(re.sub(r"\s+", "", preamble)) >= PREAMBLE_MIN:
        add("전문", "", preamble)
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        add(re.sub(r"\s+", "", m.group(1)), (m.group(2) or "").strip(), text[m.end() : end].strip())
    return clauses


async def build_clause_payload(
    clauses: list[Clause], embed_fn: Callable[[list[str]], Awaitable[list[list[float]]]]
) -> list[dict]:
    """조항마다 임베딩해 replace_document_clauses의 p_clauses 형태로 만든다. 임베딩 오류는 그대로 올라간다."""
    texts = [f"{c.label or ''} {c.heading or ''}".strip() + "\n" + c.body for c in clauses]
    vectors = await embed_fn(texts)
    return [
        {"ord": c.ord, "label": c.label, "heading": c.heading, "body": c.body, "embedding": v}
        for c, v in zip(clauses, vectors, strict=True)
    ]
