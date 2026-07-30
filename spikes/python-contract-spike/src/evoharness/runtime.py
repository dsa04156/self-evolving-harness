# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import time
from typing import Callable, Sequence

from .context import ContextBuilder
from .evidence import EvidencePlane
from .memory import FilesystemMemory
from .models import (
    Budget,
    BudgetUsage,
    EvidenceReceipt,
    ObservedFact,
    RuntimeEvent,
    SessionState,
    new_id,
)
from .permissions import PermissionPolicy
from .providers import Message, ModelProvider
from .recovery import RecoveryPolicy
from .sessions import SessionRecord, SessionRepository
from .skills import SkillDocument
from .tools import ToolContext, ToolRegistry
from .verification import Verifier


class BudgetExceeded(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class RunResult:
    session: SessionRecord
    answer: str
    usage: BudgetUsage
    verification_passed: bool
    event_log: Path


@dataclass(slots=True)
class _MutableUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    tool_calls: int = 0
    model_calls: int = 0

    def freeze(self, wall_time_seconds: float) -> BudgetUsage:
        return BudgetUsage(
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            tool_calls=self.tool_calls,
            model_calls=self.model_calls,
            wall_time_seconds=wall_time_seconds,
        )


class AgentRuntimeKernel:
    """Owns the task loop; no external coding-agent runtime is delegated to."""

    def __init__(
        self,
        *,
        provider: ModelProvider,
        tools: ToolRegistry,
        context_builder: ContextBuilder,
        verifier: Verifier,
        recovery_policy: RecoveryPolicy,
        permissions: PermissionPolicy,
        sessions: SessionRepository,
        evidence_root: Path,
        memory: FilesystemMemory,
        now: Callable[[], str] | None = None,
        monotonic: Callable[[], float] | None = None,
    ) -> None:
        self.provider = provider
        self.tools = tools
        self.context_builder = context_builder
        self.verifier = verifier
        self.recovery_policy = recovery_policy
        self.permissions = permissions
        self.sessions = sessions
        self.evidence_root = evidence_root
        self.memory = memory
        self.now = now or (lambda: datetime.now(timezone.utc).isoformat())
        self.monotonic = monotonic or time.monotonic

    def run(
        self,
        *,
        task: str,
        workspace: Path,
        harness_version_id: str,
        budget: Budget,
        skills: Sequence[SkillDocument] = (),
        session_id: str | None = None,
    ) -> RunResult:
        workspace = self.permissions.resolve_path(workspace)
        if budget.model_id != self.provider.model_id:
            raise ValueError(
                f"immutable model identity mismatch: budget={budget.model_id} provider={self.provider.model_id}"
            )
        session = self.sessions.create(
            harness_version_id=harness_version_id,
            workspace=workspace,
            task=task,
            now=self.now(),
            session_id=session_id,
        )
        evidence = EvidencePlane(self.evidence_root / session.session_id)
        sequence = 0
        usage = _MutableUsage()
        history: list[Message] = []
        start = self.monotonic()
        retry_attempts = 0
        answer = ""

        def emit(event_type: str, payload: dict[str, object], turn_id: str) -> RuntimeEvent:
            nonlocal sequence
            sequence += 1
            event = RuntimeEvent(
                event_id=new_id("event"),
                session_id=session.session_id,
                turn_id=turn_id,
                sequence=sequence,
                event_type=event_type,
                observed_at=self.now(),
                harness_version_id=harness_version_id,
                actor="runtime-kernel",
                payload=payload,
            )
            evidence.emit_event(event)
            return event

        def transition(target: SessionState, *, blockers: tuple[str, ...] | None = None) -> None:
            nonlocal session
            session = self.sessions.transition(
                session.session_id,
                target,
                now=self.now(),
                blockers=blockers,
                recovery_attempts=retry_attempts,
            )
            emit("session_state_changed", {"state": target.value}, "lifecycle")

        def check_budget() -> None:
            elapsed = self.monotonic() - start
            if elapsed > budget.wall_time_seconds:
                raise BudgetExceeded("wall-time budget exhausted")
            if usage.model_calls >= budget.max_model_calls:
                raise BudgetExceeded("model-call budget exhausted")
            if usage.tool_calls > budget.max_tool_calls:
                raise BudgetExceeded("tool-call budget exhausted")
            if usage.input_tokens > budget.max_input_tokens:
                raise BudgetExceeded("input-token budget exhausted")
            if usage.output_tokens > budget.max_output_tokens:
                raise BudgetExceeded("output-token budget exhausted")

        try:
            transition(SessionState.INITIALIZED)
            transition(SessionState.RUNNING)
            emit(
                "task_execution_started",
                {"task_characters": len(task), "budget_hash": budget.identity_hash},
                "turn_0",
            )

            while True:
                check_budget()
                turn_id = f"turn_{usage.model_calls + 1}"
                snapshot = self.context_builder.build(task=task, history=history, skills=skills)
                emit(
                    "context_constructed",
                    {
                        "characters": snapshot.character_count,
                        "memory_ids": list(snapshot.selected_memory_ids),
                        "skill_names": list(snapshot.selected_skill_names),
                    },
                    turn_id,
                )
                emit("model_request_started", {"model_id": self.provider.model_id}, turn_id)
                response = self.provider.complete(
                    messages=snapshot.messages,
                    tools=self.tools.specs(),
                    max_output_tokens=max(1, budget.max_output_tokens - usage.output_tokens),
                )
                usage.model_calls += 1
                usage.input_tokens += response.usage.input_tokens
                usage.output_tokens += response.usage.output_tokens
                emit(
                    "model_response_observed",
                    {
                        "response_id": response.response_id,
                        "text_characters": len(response.text),
                        "tool_call_count": len(response.tool_calls),
                        "input_tokens": response.usage.input_tokens,
                        "output_tokens": response.usage.output_tokens,
                        "finish_reason": response.finish_reason,
                    },
                    turn_id,
                )
                check_budget()

                if response.text:
                    history.append(Message(role="assistant", content=response.text))
                for call in response.tool_calls:
                    if usage.tool_calls >= budget.max_tool_calls:
                        raise BudgetExceeded("tool-call budget exhausted")
                    history.append(
                        Message(
                            role="assistant_tool_call",
                            call_id=call.call_id,
                            name=call.name,
                            arguments=call.arguments,
                        )
                    )
                    started_event = emit(
                        "tool_execution_started",
                        {"call_id": call.call_id, "tool_name": call.name},
                        turn_id,
                    )
                    result = self.tools.execute(
                        call.name,
                        call.arguments,
                        ToolContext(workspace=workspace, permissions=self.permissions),
                    )
                    usage.tool_calls += 1
                    result_event = emit(
                        "tool_execution_observed",
                        {
                            "call_id": call.call_id,
                            "tool_name": call.name,
                            "ok": result.ok,
                            "error": result.error,
                            "output_characters": len(result.output),
                            "metadata": result.metadata or {},
                        },
                        turn_id,
                    )
                    receipt = EvidenceReceipt.issue(
                        session_id=session.session_id,
                        subject_type="tool_call",
                        subject_id=call.call_id,
                        issued_at=self.now(),
                        issuer="runtime-kernel",
                        facts=(
                            ObservedFact(
                                fact_type="tool_result",
                                value={"tool_name": call.name, "ok": result.ok, "error": result.error},
                                source_event_ids=(started_event.event_id, result_event.event_id),
                            ),
                        ),
                    )
                    evidence.issue_receipt(receipt)
                    history.append(Message(role="tool", call_id=call.call_id, content=result.model_text()))

                if response.tool_calls:
                    continue

                answer = response.text
                transition(SessionState.VALIDATING)
                outcome = self.verifier.verify(workspace=workspace, task=task, answer=answer)
                verification_event = emit(
                    "verification_observed",
                    {
                        "verifier_identity": self.verifier.identity,
                        "passed": outcome.passed,
                        "summary": outcome.summary,
                        "facts": outcome.facts,
                    },
                    turn_id,
                )
                verification_receipt = EvidenceReceipt.issue(
                    session_id=session.session_id,
                    subject_type="task_verification",
                    subject_id=turn_id,
                    issued_at=self.now(),
                    issuer=self.verifier.identity,
                    facts=(
                        ObservedFact(
                            fact_type="verification_result",
                            value={"passed": outcome.passed, "summary": outcome.summary},
                            source_event_ids=(verification_event.event_id,),
                        ),
                    ),
                )
                evidence.issue_receipt(verification_receipt)
                if outcome.passed:
                    transition(SessionState.COMPLETED)
                    emit("task_execution_completed", {"verification_receipt": verification_receipt.receipt_id}, turn_id)
                    self.memory.remember(
                        text=f"Task completed: {task}\nResult: {answer[:2000]}",
                        tags=("task-result", "verified"),
                        source_session_id=session.session_id,
                        harness_version_id=harness_version_id,
                        created_at=self.now(),
                    )
                    break

                decision = self.recovery_policy.decide(
                    failure_kind="verification", attempts=retry_attempts
                )
                if not decision.retryable:
                    transition(SessionState.BLOCKED, blockers=(decision.reason,))
                    emit("task_execution_blocked", {"reason": decision.reason}, turn_id)
                    break
                retry_attempts += 1
                transition(SessionState.RECOVERING)
                emit(
                    "task_retry_scheduled",
                    {
                        "retry_attempt": retry_attempts,
                        "reason": decision.reason,
                        "explicitly_not_harness_evolution": True,
                    },
                    turn_id,
                )
                history.append(Message(role="user", content=outcome.retry_feedback))
                transition(SessionState.RUNNING)

        except Exception as exc:
            if session.state not in {SessionState.BLOCKED, SessionState.COMPLETED, SessionState.RETIRED}:
                try:
                    transition(SessionState.BLOCKED, blockers=(f"{type(exc).__name__}: {exc}",))
                except Exception:
                    pass
            emit(
                "task_execution_exception",
                {"error_type": type(exc).__name__, "message": str(exc)},
                "exception",
            )
            if not isinstance(exc, BudgetExceeded):
                raise

        elapsed = self.monotonic() - start
        evidence.verify_all()
        return RunResult(
            session=session,
            answer=answer,
            usage=usage.freeze(elapsed),
            verification_passed=session.state == SessionState.COMPLETED,
            event_log=evidence.events.path,
        )
