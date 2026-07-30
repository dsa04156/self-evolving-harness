# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import os
import subprocess
from typing import Any, Callable, Mapping

from .permissions import PermissionPolicy
from .providers import ToolSpec


@dataclass(frozen=True, slots=True)
class ToolResult:
    ok: bool
    output: str
    error: str | None = None
    metadata: dict[str, Any] | None = None

    def model_text(self) -> str:
        return json.dumps(
            {
                "ok": self.ok,
                "output": self.output,
                "error": self.error,
                "metadata": self.metadata or {},
            },
            ensure_ascii=False,
            sort_keys=True,
        )


@dataclass(frozen=True, slots=True)
class ToolContext:
    workspace: Path
    permissions: PermissionPolicy


ToolExecutor = Callable[[Mapping[str, Any], ToolContext], ToolResult]


@dataclass(frozen=True, slots=True)
class RegisteredTool:
    spec: ToolSpec
    execute: ToolExecutor


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, RegisteredTool] = {}

    def register(self, tool: RegisteredTool) -> None:
        if tool.spec.name in self._tools:
            raise ValueError(f"duplicate tool: {tool.spec.name}")
        self._tools[tool.spec.name] = tool

    def specs(self) -> tuple[ToolSpec, ...]:
        return tuple(tool.spec for tool in self._tools.values())

    def execute(self, name: str, arguments: Mapping[str, Any], context: ToolContext) -> ToolResult:
        context.permissions.assert_tool(name)
        if name not in self._tools:
            return ToolResult(ok=False, output="", error=f"unknown tool: {name}")
        try:
            self._validate(self._tools[name].spec.parameters, arguments)
            return self._tools[name].execute(arguments, context)
        except Exception as exc:
            return ToolResult(ok=False, output="", error=f"{type(exc).__name__}: {exc}")

    @staticmethod
    def _validate(schema: Mapping[str, Any], arguments: Mapping[str, Any]) -> None:
        if not isinstance(arguments, Mapping):
            raise TypeError("tool arguments must be an object")
        for required in schema.get("required", []):
            if required not in arguments:
                raise ValueError(f"missing required argument: {required}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            unknown = set(arguments) - set(properties)
            if unknown:
                raise ValueError(f"unknown arguments: {sorted(unknown)}")
        expected_types = {"string": str, "integer": int, "boolean": bool, "array": list, "object": dict}
        for key, value in arguments.items():
            declared = properties.get(key, {}).get("type")
            expected = expected_types.get(declared)
            if expected is not None and not isinstance(value, expected):
                raise TypeError(f"{key} must be {declared}")


def _truncate(data: bytes, limit: int) -> tuple[str, bool]:
    truncated = len(data) > limit
    value = data[:limit].decode("utf-8", errors="replace")
    return value, truncated


def _read(arguments: Mapping[str, Any], context: ToolContext) -> ToolResult:
    path = context.permissions.resolve_path(str(arguments["path"]))
    offset = int(arguments.get("offset", 0))
    limit = int(arguments.get("limit", context.permissions.max_output_bytes))
    if offset < 0 or limit <= 0:
        raise ValueError("offset must be non-negative and limit must be positive")
    data = path.read_bytes()[offset : offset + min(limit, context.permissions.max_output_bytes)]
    return ToolResult(ok=True, output=data.decode("utf-8", errors="replace"), metadata={"path": str(path)})


def _write(arguments: Mapping[str, Any], context: ToolContext) -> ToolResult:
    path = context.permissions.resolve_path(str(arguments["path"]), write=True)
    content = str(arguments["content"])
    overwrite = bool(arguments.get("overwrite", False))
    if path.exists() and not overwrite:
        raise FileExistsError("destination exists; set overwrite=true")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return ToolResult(
        ok=True,
        output=f"wrote {len(content.encode('utf-8'))} bytes",
        metadata={"path": str(path)},
    )


def _edit(arguments: Mapping[str, Any], context: ToolContext) -> ToolResult:
    path = context.permissions.resolve_path(str(arguments["path"]), write=True)
    old = str(arguments["old"])
    new = str(arguments["new"])
    replace_all = bool(arguments.get("replace_all", False))
    text = path.read_text(encoding="utf-8")
    occurrences = text.count(old)
    if occurrences == 0:
        raise ValueError("old text not found")
    if occurrences > 1 and not replace_all:
        raise ValueError(f"old text occurs {occurrences} times; set replace_all=true")
    changed = text.replace(old, new) if replace_all else text.replace(old, new, 1)
    path.write_text(changed, encoding="utf-8")
    return ToolResult(ok=True, output=f"replaced {occurrences if replace_all else 1} occurrence(s)")


def _run_process(
    argv: list[str],
    *,
    cwd: Path,
    context: ToolContext,
    command_for_policy: str,
    is_git_mutation: bool = False,
) -> ToolResult:
    context.permissions.assert_command(command_for_policy, is_git_mutation=is_git_mutation)
    env = context.permissions.sanitized_environment(dict(os.environ))
    completed = subprocess.run(
        argv,
        cwd=cwd,
        env=env,
        capture_output=True,
        timeout=context.permissions.command_timeout_seconds,
        check=False,
    )
    combined = completed.stdout + (b"\n" if completed.stdout and completed.stderr else b"") + completed.stderr
    output, truncated = _truncate(combined, context.permissions.max_output_bytes)
    return ToolResult(
        ok=completed.returncode == 0,
        output=output,
        error=None if completed.returncode == 0 else f"exit code {completed.returncode}",
        metadata={"exit_code": completed.returncode, "truncated": truncated},
    )


def _bash(arguments: Mapping[str, Any], context: ToolContext) -> ToolResult:
    command = str(arguments["command"])
    cwd = context.permissions.resolve_path(str(arguments.get("cwd", context.workspace)))
    return _run_process(
        ["bash", "--noprofile", "--norc", "-c", command],
        cwd=cwd,
        context=context,
        command_for_policy=command,
    )


READ_ONLY_GIT_SUBCOMMANDS = frozenset(
    {"status", "diff", "log", "show", "rev-parse", "branch", "ls-files", "grep", "blame"}
)


def _git(arguments: Mapping[str, Any], context: ToolContext) -> ToolResult:
    args = [str(value) for value in arguments["args"]]
    if not args:
        raise ValueError("git args cannot be empty")
    cwd = context.permissions.resolve_path(str(arguments.get("cwd", context.workspace)))
    mutation = args[0] not in READ_ONLY_GIT_SUBCOMMANDS
    command = "git " + " ".join(args)
    return _run_process(
        ["git", *args],
        cwd=cwd,
        context=context,
        command_for_policy=command,
        is_git_mutation=mutation,
    )


def default_tool_registry() -> ToolRegistry:
    registry = ToolRegistry()
    object_schema = {"type": "object", "additionalProperties": False}
    registry.register(
        RegisteredTool(
            ToolSpec(
                name="read",
                description="Read a UTF-8 file inside the authorized workspace.",
                parameters={
                    **object_schema,
                    "properties": {
                        "path": {"type": "string"},
                        "offset": {"type": "integer"},
                        "limit": {"type": "integer"},
                    },
                    "required": ["path"],
                },
            ),
            _read,
        )
    )
    registry.register(
        RegisteredTool(
            ToolSpec(
                name="write",
                description="Create or explicitly overwrite a UTF-8 file inside the workspace.",
                parameters={
                    **object_schema,
                    "properties": {
                        "path": {"type": "string"},
                        "content": {"type": "string"},
                        "overwrite": {"type": "boolean"},
                    },
                    "required": ["path", "content"],
                },
            ),
            _write,
        )
    )
    registry.register(
        RegisteredTool(
            ToolSpec(
                name="edit",
                description="Replace an exact text fragment in one workspace file.",
                parameters={
                    **object_schema,
                    "properties": {
                        "path": {"type": "string"},
                        "old": {"type": "string"},
                        "new": {"type": "string"},
                        "replace_all": {"type": "boolean"},
                    },
                    "required": ["path", "old", "new"],
                },
            ),
            _edit,
        )
    )
    registry.register(
        RegisteredTool(
            ToolSpec(
                name="bash",
                description="Run a bounded non-interactive bash command inside the workspace.",
                parameters={
                    **object_schema,
                    "properties": {"command": {"type": "string"}, "cwd": {"type": "string"}},
                    "required": ["command"],
                },
            ),
            _bash,
        )
    )
    registry.register(
        RegisteredTool(
            ToolSpec(
                name="git",
                description="Run git with an argv array inside the workspace.",
                parameters={
                    **object_schema,
                    "properties": {
                        "args": {"type": "array", "items": {"type": "string"}},
                        "cwd": {"type": "string"},
                    },
                    "required": ["args"],
                },
            ),
            _git,
        )
    )
    return registry
