# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RecoveryDecision:
    action: str
    reason: str
    retryable: bool


@dataclass(frozen=True, slots=True)
class RecoveryPolicy:
    """Task-local recovery only. It never creates or mutates a HarnessVersion."""

    max_task_retries: int = 2
    retry_on_tool_error: bool = True
    retry_on_verification_failure: bool = True

    def decide(self, *, failure_kind: str, attempts: int) -> RecoveryDecision:
        if attempts >= self.max_task_retries:
            return RecoveryDecision("block", "task retry budget exhausted", False)
        if failure_kind == "verification" and self.retry_on_verification_failure:
            return RecoveryDecision("retry_task", "verification failed", True)
        if failure_kind == "tool" and self.retry_on_tool_error:
            return RecoveryDecision("retry_task", "tool execution failed", True)
        return RecoveryDecision("block", f"non-retryable failure: {failure_kind}", False)
