"""시험 출제 요청·응답 형식. docs/contracts.md의 /exams/* 계약을 따른다."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints

NonEmpty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Difficulty = Literal["beginner", "intermediate"]


class ExamQuestion(BaseModel):
    prompt: NonEmpty
    model_answer: NonEmpty
    rubric: NonEmpty
    points: int = Field(ge=1, le=100)


class GeneratedExam(BaseModel):
    title: str
    questions: list[ExamQuestion]


class GenerateRequest(BaseModel):
    topic: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    difficulty: Difficulty
    question_count: int = Field(ge=1, le=10)
    style: Annotated[str, StringConstraints(max_length=200)] | None = None
    new_hire_id: UUID | None = None


class RegenerateRequest(BaseModel):
    topic: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    difficulty: Difficulty
    existing_prompts: list[str] = Field(default_factory=list, max_length=10)
    instruction: Annotated[str, StringConstraints(max_length=200)] | None = None
