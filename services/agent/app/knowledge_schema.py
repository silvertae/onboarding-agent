"""지식 초안 요청·응답 형식. docs/contracts.md의 /knowledge/* 계약을 따른다."""

from typing import Annotated
from uuid import UUID

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


class DocumentDraftRequest(BaseModel):
    document_id: UUID
    count: int = Field(default=5, ge=1, le=10)


class KnowledgeDraft(BaseModel):
    question: Question
    answer: Answer
    category: Category
    clause_ids: list[UUID] = Field(min_length=1)


class KnowledgeDrafts(BaseModel):
    drafts: list[KnowledgeDraft] = Field(max_length=10)


class ModelDraft(BaseModel):
    """모델이 내는 초안. clause_ids에는 실제 id 대신 이번 요청에서 준 조항 키(D1…)를 쓴다."""

    question: Question
    answer: Answer
    category: Category
    clause_ids: list[str]


class ModelDrafts(BaseModel):
    drafts: list[ModelDraft] = Field(max_length=10)
