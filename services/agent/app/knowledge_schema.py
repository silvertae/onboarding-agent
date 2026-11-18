"""지식 초안 요청·응답 형식. docs/contracts.md의 /knowledge/* 계약을 따른다."""

from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

Question = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Answer = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Category = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class DraftAnswerRequest(BaseModel):
    question: Question


class ClauseRef(BaseModel):
    id: str
    document_title: str
    label: str
    heading: str


class DraftAnswer(BaseModel):
    question: Question
    answer: Answer
    category: Category
    clauses: list[ClauseRef] = Field(min_length=1)


class DraftAnswerResponse(BaseModel):
    found: bool
    draft: DraftAnswer | None = None
