# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, TypeVar

from .models import HarnessVersionState, SessionState


class InvalidTransition(ValueError):
    pass


SESSION_TRANSITIONS: dict[SessionState, frozenset[SessionState]] = {
    SessionState.CREATED: frozenset({SessionState.INITIALIZED, SessionState.RETIRED}),
    SessionState.INITIALIZED: frozenset({SessionState.RUNNING, SessionState.BLOCKED, SessionState.RETIRED}),
    SessionState.RUNNING: frozenset(
        {SessionState.BLOCKED, SessionState.RECOVERING, SessionState.VALIDATING, SessionState.RETIRED}
    ),
    SessionState.BLOCKED: frozenset({SessionState.RECOVERING, SessionState.RETIRED}),
    SessionState.RECOVERING: frozenset(
        {SessionState.RUNNING, SessionState.VALIDATING, SessionState.BLOCKED, SessionState.RETIRED}
    ),
    SessionState.VALIDATING: frozenset(
        {SessionState.COMPLETED, SessionState.RECOVERING, SessionState.BLOCKED, SessionState.RETIRED}
    ),
    SessionState.COMPLETED: frozenset({SessionState.RETIRED}),
    SessionState.RETIRED: frozenset(),
}

HARNESS_TRANSITIONS: dict[HarnessVersionState, frozenset[HarnessVersionState]] = {
    HarnessVersionState.DRAFT: frozenset(
        {HarnessVersionState.CANDIDATE, HarnessVersionState.REJECTED}
    ),
    HarnessVersionState.CANDIDATE: frozenset(
        {HarnessVersionState.STATICALLY_VALIDATED, HarnessVersionState.REJECTED}
    ),
    HarnessVersionState.STATICALLY_VALIDATED: frozenset(
        {HarnessVersionState.EVALUATING, HarnessVersionState.REJECTED}
    ),
    HarnessVersionState.EVALUATING: frozenset(
        {HarnessVersionState.CANARY, HarnessVersionState.REJECTED}
    ),
    HarnessVersionState.CANARY: frozenset(
        {HarnessVersionState.ACTIVE, HarnessVersionState.REJECTED, HarnessVersionState.ROLLED_BACK}
    ),
    HarnessVersionState.ACTIVE: frozenset(
        {HarnessVersionState.RETIRED, HarnessVersionState.ROLLED_BACK}
    ),
    HarnessVersionState.RETIRED: frozenset(),
    HarnessVersionState.REJECTED: frozenset(),
    HarnessVersionState.ROLLED_BACK: frozenset(),
}

StateT = TypeVar("StateT", SessionState, HarnessVersionState)


@dataclass(slots=True)
class StateMachine(Generic[StateT]):
    state: StateT
    transitions: dict[StateT, frozenset[StateT]]

    def can_transition(self, target: StateT) -> bool:
        return target in self.transitions[self.state]

    def transition(self, target: StateT) -> StateT:
        if not self.can_transition(target):
            raise InvalidTransition(f"invalid transition: {self.state.value} -> {target.value}")
        self.state = target
        return self.state


def session_machine(state: SessionState = SessionState.CREATED) -> StateMachine[SessionState]:
    return StateMachine(state=state, transitions=SESSION_TRANSITIONS)


def harness_machine(
    state: HarnessVersionState = HarnessVersionState.DRAFT,
) -> StateMachine[HarnessVersionState]:
    return StateMachine(state=state, transitions=HARNESS_TRANSITIONS)


def next_session_actions(state: SessionState) -> tuple[str, ...]:
    """Forcing-function view used by every operations response."""
    mapping = {
        SessionState.CREATED: ("initialize", "retire"),
        SessionState.INITIALIZED: ("run", "block", "retire"),
        SessionState.RUNNING: ("observe", "block", "recover", "validate", "retire"),
        SessionState.BLOCKED: ("observe", "recover", "retire"),
        SessionState.RECOVERING: ("observe", "resume", "validate", "block", "retire"),
        SessionState.VALIDATING: ("observe", "complete", "recover", "block", "retire"),
        SessionState.COMPLETED: ("observe", "retire"),
        SessionState.RETIRED: ("observe",),
    }
    return mapping[state]
