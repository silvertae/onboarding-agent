"""관리자 API 요청 형식. 계약은 docs/contracts.md의 POST /admin/users."""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, BaseModel, Field, model_validator


def _demo_email(value: str) -> str:
    # pydantic EmailStr은 특수 용도 도메인(.test)을 거부한다. 계정 메일은 가상 주소(@demo.test)를 쓰므로
    # email-validator의 test_environment 옵션으로 .test만 추가로 허용한다(그 밖의 형식 검증은 같다).
    try:
        return validate_email(value, check_deliverability=False, test_environment=True).normalized
    except EmailNotValidError as error:
        raise ValueError(f"메일 형식이 아니에요: {error}") from None


DemoEmail = Annotated[str, Field(max_length=254), AfterValidator(_demo_email)]


class CreateUserRequest(BaseModel):
    email: DemoEmail
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=1, max_length=50)
    job_title: str = Field(min_length=1, max_length=50)
    role: Literal["new_hire", "team_trainer", "ops_staff"]  # admin은 만들 수 없다
    department: Literal["hr", "ga", "accounting"] | None = None
    team_id: UUID | None = None
    hire_date: date | None = None
    needs_hq_access: bool = True

    @model_validator(mode="after")
    def _role_fields(self) -> "CreateUserRequest":
        if self.role == "ops_staff":
            if self.department is None:
                raise ValueError("경영지원 담당자는 부서가 필요해요")
            if self.team_id is not None:
                raise ValueError("경영지원 담당자는 팀을 지정하지 않아요")
        else:
            if self.team_id is None:
                raise ValueError("신입·교육 담당자는 팀이 필요해요")
            if self.department is not None:
                raise ValueError("신입·교육 담당자는 부서를 지정하지 않아요")
        if self.role == "new_hire" and self.hire_date is None:
            raise ValueError("신입은 입사일이 필요해요")
        return self


class CreateUserResponse(BaseModel):
    id: UUID
