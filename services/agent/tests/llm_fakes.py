"""테스트용 가짜 모델. 실제 모델 대신 턴마다 정해 둔 응답을 돌려준다."""

from typing import cast

from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pydantic import Field


class ScriptedLlm(BaseLlm):
    """턴마다 정해 둔 응답을 돌려준다. 턴이 함수면 요청을 받아 응답을 만든다. Exception이면 그 턴에서 던진다."""

    model: str = "scripted"
    turns: list = Field(default_factory=list)
    requests: list[LlmRequest] = Field(default_factory=list)

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False):
        self.requests.append(llm_request)
        turn = self.turns[len(self.requests) - 1]
        if callable(turn):
            turn = turn(llm_request)
        if isinstance(turn, Exception):
            raise turn
        for response in cast(list[LlmResponse], turn):
            yield response


def text_turn(text: str) -> list[LlmResponse]:
    """실제 스트리밍처럼 조각(partial) 두 개 뒤에 합친 응답 하나."""
    half = len(text) // 2
    parts = [text[:half], text[half:]]
    chunks = [
        LlmResponse(content=types.Content(role="model", parts=[types.Part(text=p)]), partial=True)
        for p in parts
    ]
    final = LlmResponse(
        content=types.Content(role="model", parts=[types.Part(text=text)]), partial=False, turn_complete=True
    )
    return [*chunks, final]


def chunk_turn(*chunks: str) -> list[LlmResponse]:
    """정해 둔 조각대로 흘려보낸 뒤 합친 응답 하나."""
    partials = [
        LlmResponse(content=types.Content(role="model", parts=[types.Part(text=c)]), partial=True) for c in chunks
    ]
    final = LlmResponse(
        content=types.Content(role="model", parts=[types.Part(text="".join(chunks))]), partial=False, turn_complete=True
    )
    return [*partials, final]


def call_turn(*calls: tuple[str, dict]) -> list[LlmResponse]:
    """도구 호출 응답 하나. calls는 (도구 이름, 인자) 쌍이다."""
    parts = [types.Part(function_call=types.FunctionCall(name=name, args=args)) for name, args in calls]
    return [LlmResponse(content=types.Content(role="model", parts=parts), partial=False, turn_complete=True)]


def tool_results(request: LlmRequest, name: str) -> list[dict]:
    """요청에 담긴 도구 응답 가운데 이름이 name인 것들의 결과(dict)."""
    found = []
    for content in request.contents:
        for part in content.parts or []:
            if part.function_response and part.function_response.name == name:
                found.append(part.function_response.response or {})
    return found
