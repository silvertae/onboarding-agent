"""시험 출제 요청·응답 형식. docs/contracts.md의 /exams/* 계약을 따른다."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints

NonEmpty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Difficulty = Literal["beginner", "intermediate"]
# 기존 문항 하나의 최대 길이. 모델 입력이 끝없이 커지지 않게 막는다(코드가 든 문항도 충분히 들어간다).
PROMPT_MAX = 2000
# 피할 문항(은행에 이미 있는 문항) 목록 상한. 웹은 이 값에 맞춰 잘라 보낸다.
AVOID_PROMPT_MAX = 500
AVOID_MAX_ITEMS = 30


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
    avoid_prompts: list[Annotated[str, StringConstraints(max_length=AVOID_PROMPT_MAX)]] = Field(
        default_factory=list, max_length=AVOID_MAX_ITEMS
    )


class RegenerateRequest(BaseModel):
    topic: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    difficulty: Difficulty
    existing_prompts: list[Annotated[str, StringConstraints(max_length=PROMPT_MAX)]] = Field(
        default_factory=list, max_length=10
    )
    instruction: Annotated[str, StringConstraints(max_length=200)] | None = None
