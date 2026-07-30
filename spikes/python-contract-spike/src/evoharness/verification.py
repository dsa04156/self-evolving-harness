# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess
from typing import Protocol, Sequence

from .permissions import PermissionPolicy


@dataclass(frozen=True, slots=True)
class VerificationOutcome:
    passed: bool
    summary: str
    facts: dict[str, object]
    retry_feedback: str = ""


class Verifier(Protocol):
    @property
    def identity(self) -> str: ...

    def verify(self, *, workspace: Path, task: str, answer: str) -> VerificationOutcome: ...


class TextCompletionVerifier:
    @property
    def identity(self) -> str:
        return "text-completion-verifier-v1"

    def verify(self, *, workspace: Path, task: str, answer: str) -> VerificationOutcome:
        del workspace, task
        passed = bool(answer.strip())
        return VerificationOutcome(
            passed=passed,
            summary="non-empty final answer" if passed else "empty final answer",
            facts={"answer_non_empty": passed, "answer_characters": len(answer)},
            retry_feedback="Provide a concrete final answer." if not passed else "",
        )


class CommandVerifier:
    """Runs immutable argv-based checks; command definitions live in the trust manifest."""

    def __init__(
        self,
        *,
        commands: Sequence[Sequence[str]],
        permissions: PermissionPolicy,
        identity: str = "command-verifier-v1",
    ) -> None:
        self.commands = tuple(tuple(command) for command in commands)
        self.permissions = permissions
        self._identity = identity

    @property
    def identity(self) -> str:
        return self._identity

    def verify(self, *, workspace: Path, task: str, answer: str) -> VerificationOutcome:
        del task, answer
        results: list[dict[str, object]] = []
        for command in self.commands:
            if not command:
                continue
            command_text = " ".join(command)
            self.permissions.assert_command(command_text)
            completed = subprocess.run(
                list(command),
                cwd=workspace,
                env=self.permissions.sanitized_environment(),
                capture_output=True,
                timeout=self.permissions.command_timeout_seconds,
                check=False,
            )
            results.append(
                {
                    "argv": list(command),
                    "exit_code": completed.returncode,
                    "stdout_hash_basis": completed.stdout.decode("utf-8", errors="replace")[
                        : self.permissions.max_output_bytes
                    ],
                    "stderr_hash_basis": completed.stderr.decode("utf-8", errors="replace")[
                        : self.permissions.max_output_bytes
                    ],
                }
            )
            if completed.returncode != 0:
                return VerificationOutcome(
                    passed=False,
                    summary=f"verification failed: {command_text}",
                    facts={"commands": results},
                    retry_feedback=f"Fix the failure from: {command_text}",
                )
        return VerificationOutcome(passed=True, summary="all verification commands passed", facts={"commands": results})
