"""규정 문서(pdf·docx)에서 글자를 뽑고 조항 단위로 나눈다. 순수 함수만 둔다(DB·네트워크·로그 없음)."""

import io
import re
from dataclasses import dataclass
from typing import Literal

import pypdf
from docx import Document

UNREADABLE = "글자를 읽을 수 없는 파일이에요"

ARTICLE_MAX = 2000  # 조항 하나(조각)의 최대 글자 수
CHUNK_TARGET = 800  # 조항 표시가 없을 때 단락 묶음의 목표 글자 수
CHUNK_CAP = 1000  # 같은 경우의 상한

_ARTICLE_RE = re.compile(r"^\s*(제\s*\d+\s*조(?:의\s*\d+)?)\s*(?:\(([^)\n]*)\))?", re.M)
_SENTENCE_END_RE = re.compile(r"(?<=[.!?。])\s+")
# pdf 글꼴에 따라 공백이 제어 문자로 나오는 경우가 있다(줄바꿈·탭은 둔다)
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


class UnreadableDocument(Exception):
    """글자를 읽을 수 없는 문서. 메시지에 문서 내용을 담지 않는다."""


@dataclass
class Clause:
    ord: int
    label: str
    heading: str
    body: str


def extract_text(data: bytes, file_type: Literal["pdf", "docx"]) -> str:
    try:
        if file_type == "docx":
            text = "\n".join(p.text for p in Document(io.BytesIO(data)).paragraphs)
        else:
            reader = pypdf.PdfReader(io.BytesIO(data))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        raise UnreadableDocument(UNREADABLE) from None
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
    if preamble:
        add("전문", "", preamble)
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        add(re.sub(r"\s+", "", m.group(1)), (m.group(2) or "").strip(), text[m.end() : end].strip())
    return clauses
