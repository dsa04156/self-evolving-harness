# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import re
from typing import Iterable


class PermissionDenied(PermissionError):
    pass


DEFAULT_DENIED_COMMAND_PATTERNS = (
    r"(^|\s)rm\s+-[^\n]*r[^\n]*f",
    r"(^|\s)git\s+reset\s+--hard(\s|$)",
    r"(^|\s)git\s+clean\s+-[^\n]*f",
    r"(^|\s)(sudo|su)(\s|$)",
    r"(^|\s)(curl|wget)[^\n]*\|\s*(sh|bash)(\s|$)",
)


@dataclass(frozen=True, slots=True)
class PermissionPolicy:
    """Immutable runtime policy. Candidates may reference but never rewrite it."""

    workspace_roots: tuple[Path, ...]
    allowed_tools: frozenset[str]
    allow_network: bool = False
    allow_write: bool = True
    allow_git_mutation: bool = True
    command_timeout_seconds: float = 30.0
    max_output_bytes: int = 1_000_000
    denied_command_patterns: tuple[str, ...] = field(default=DEFAULT_DENIED_COMMAND_PATTERNS)

    def __post_init__(self) -> None:
        normalized = tuple(root.expanduser().resolve(strict=False) for root in self.workspace_roots)
        object.__setattr__(self, "workspace_roots", normalized)
        if not normalized:
            raise ValueError("at least one workspace root is required")
        if self.command_timeout_seconds <= 0:
            raise ValueError("command timeout must be positive")
        if self.max_output_bytes <= 0:
            raise ValueError("max output bytes must be positive")

    def assert_tool(self, tool_name: str) -> None:
        if tool_name not in self.allowed_tools:
            raise PermissionDenied(f"tool not allowed: {tool_name}")

    def resolve_path(self, raw_path: str | Path, *, write: bool = False) -> Path:
        if write and not self.allow_write:
            raise PermissionDenied("filesystem writes are disabled")
        path = Path(raw_path).expanduser()
        if not path.is_absolute():
            path = self.workspace_roots[0] / path
        resolved = path.resolve(strict=False)
        if not any(resolved == root or root in resolved.parents for root in self.workspace_roots):
            raise PermissionDenied(f"path escapes workspace: {raw_path}")
        return resolved

    def assert_command(self, command: str, *, is_git_mutation: bool = False) -> None:
        if is_git_mutation and not self.allow_git_mutation:
            raise PermissionDenied("git mutation is disabled")
        for pattern in self.denied_command_patterns:
            if re.search(pattern, command, flags=re.IGNORECASE):
                raise PermissionDenied(f"command denied by immutable policy: {pattern}")

    def sanitized_environment(self, source: dict[str, str] | None = None) -> dict[str, str]:
        source = source or {}
        allowed_names: Iterable[str] = (
            "PATH",
            "LANG",
            "LC_ALL",
            "TERM",
            "TMPDIR",
            "GIT_AUTHOR_NAME",
            "GIT_AUTHOR_EMAIL",
            "GIT_COMMITTER_NAME",
            "GIT_COMMITTER_EMAIL",
        )
        return {key: source[key] for key in allowed_names if key in source}
