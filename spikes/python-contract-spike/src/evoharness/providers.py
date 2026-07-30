# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from typing import Any, Protocol, Sequence
from urllib import error, request


@dataclass(frozen=True, slots=True)
class Message:
    role: str
    content: str = ""
    call_id: str | None = None
    name: str | None = None
    arguments: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ToolCall:
    call_id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ModelUsage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass(frozen=True, slots=True)
class ModelResponse:
    text: str
    tool_calls: tuple[ToolCall, ...] = ()
    usage: ModelUsage = field(default_factory=ModelUsage)
    finish_reason: str = "stop"
    response_id: str | None = None


class ModelProvider(Protocol):
    @property
    def model_id(self) -> str: ...

    def complete(
        self,
        *,
        messages: Sequence[Message],
        tools: Sequence[ToolSpec],
        max_output_tokens: int,
    ) -> ModelResponse: ...


class FakeModelProvider:
    """Deterministic scripted provider for runtime and evolution tests."""

    def __init__(self, responses: Sequence[ModelResponse], model_id: str = "fake-model-v1") -> None:
        self._responses = list(responses)
        self._index = 0
        self._model_id = model_id
        self.requests: list[tuple[tuple[Message, ...], tuple[ToolSpec, ...], int]] = []

    @property
    def model_id(self) -> str:
        return self._model_id

    def complete(
        self,
        *,
        messages: Sequence[Message],
        tools: Sequence[ToolSpec],
        max_output_tokens: int,
    ) -> ModelResponse:
        self.requests.append((tuple(messages), tuple(tools), max_output_tokens))
        if self._index >= len(self._responses):
            raise RuntimeError("fake model response script exhausted")
        response = self._responses[self._index]
        self._index += 1
        return response


class OpenAIResponsesProvider:
    """Minimal real adapter for the OpenAI Responses API using only the stdlib."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str = "https://api.openai.com/v1",
        timeout_seconds: float = 120.0,
    ) -> None:
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required")
        self._model_id = model or os.environ.get("OPENAI_MODEL", "gpt-5.6-terra")
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    @property
    def model_id(self) -> str:
        return self._model_id

    def _input_items(self, messages: Sequence[Message]) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for message in messages:
            if message.role in {"system", "user", "assistant"}:
                items.append({"role": message.role, "content": message.content})
            elif message.role == "assistant_tool_call":
                items.append(
                    {
                        "type": "function_call",
                        "call_id": message.call_id,
                        "name": message.name,
                        "arguments": json.dumps(message.arguments or {}, ensure_ascii=False),
                    }
                )
            elif message.role == "tool":
                items.append(
                    {
                        "type": "function_call_output",
                        "call_id": message.call_id,
                        "output": message.content,
                    }
                )
            else:
                raise ValueError(f"unsupported message role: {message.role}")
        return items

    def complete(
        self,
        *,
        messages: Sequence[Message],
        tools: Sequence[ToolSpec],
        max_output_tokens: int,
    ) -> ModelResponse:
        payload = {
            "model": self.model_id,
            "input": self._input_items(messages),
            "tools": [
                {
                    "type": "function",
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                    "strict": True,
                }
                for tool in tools
            ],
            "max_output_tokens": max_output_tokens,
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        http_request = request.Request(
            f"{self.base_url}/responses",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "evoharness/0.1.0",
            },
        )
        try:
            with request.urlopen(http_request, timeout=self.timeout_seconds) as response:
                data = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"OpenAI Responses API HTTP {exc.code}: {detail[:1000]}") from exc
        except error.URLError as exc:
            raise RuntimeError(f"OpenAI Responses API transport error: {exc.reason}") from exc

        text_parts: list[str] = []
        calls: list[ToolCall] = []
        for item in data.get("output", []):
            if item.get("type") == "function_call":
                raw_arguments = item.get("arguments", "{}")
                try:
                    arguments = json.loads(raw_arguments)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"model returned invalid tool arguments for {item.get('name')}") from exc
                calls.append(
                    ToolCall(
                        call_id=item["call_id"],
                        name=item["name"],
                        arguments=arguments,
                    )
                )
            elif item.get("type") == "message":
                for block in item.get("content", []):
                    if block.get("type") == "output_text":
                        text_parts.append(block.get("text", ""))
        usage = data.get("usage") or {}
        return ModelResponse(
            text="".join(text_parts),
            tool_calls=tuple(calls),
            usage=ModelUsage(
                input_tokens=int(usage.get("input_tokens", 0)),
                output_tokens=int(usage.get("output_tokens", 0)),
            ),
            finish_reason=data.get("status", "completed"),
            response_id=data.get("id"),
        )
