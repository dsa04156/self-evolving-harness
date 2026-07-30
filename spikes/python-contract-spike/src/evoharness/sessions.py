# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import json
import os
from typing import Any

from .models import SessionState, new_id
from .state import InvalidTransition, next_session_actions, session_machine


@dataclass(frozen=True, slots=True)
class SessionRecord:
    session_id: str
    state: SessionState
    harness_version_id: str
    workspace: str
    task: str
    created_at: str
    updated_at: str
    blockers: tuple[str, ...] = ()
    recovery_attempts: int = 0


@dataclass(frozen=True, slots=True)
class OperationResponse:
    ok: bool
    state: dict[str, Any]
    evidence: dict[str, Any]
    next_allowed_actions: tuple[str, ...]


class SessionRepository:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def path_for(self, session_id: str) -> Path:
        if not session_id or "/" in session_id or ".." in session_id:
            raise ValueError("invalid session id")
        return self.root / f"{session_id}.json"

    def create(
        self,
        *,
        harness_version_id: str,
        workspace: Path,
        task: str,
        now: str,
        session_id: str | None = None,
    ) -> SessionRecord:
        record = SessionRecord(
            session_id=session_id or new_id("session"),
            state=SessionState.CREATED,
            harness_version_id=harness_version_id,
            workspace=str(workspace.resolve(strict=False)),
            task=task,
            created_at=now,
            updated_at=now,
        )
        path = self.path_for(record.session_id)
        if path.exists():
            raise FileExistsError(f"session already exists: {record.session_id}")
        self.save(record)
        return record

    def load(self, session_id: str) -> SessionRecord:
        data = json.loads(self.path_for(session_id).read_text(encoding="utf-8"))
        data["state"] = SessionState(data["state"])
        data["blockers"] = tuple(data.get("blockers", ()))
        return SessionRecord(**data)

    def save(self, record: SessionRecord) -> None:
        path = self.path_for(record.session_id)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(asdict(record), ensure_ascii=False, sort_keys=True, indent=2, default=str) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, path)

    def transition(
        self,
        session_id: str,
        target: SessionState,
        *,
        now: str,
        blockers: tuple[str, ...] | None = None,
        recovery_attempts: int | None = None,
    ) -> SessionRecord:
        current = self.load(session_id)
        machine = session_machine(current.state)
        machine.transition(target)
        updated = SessionRecord(
            session_id=current.session_id,
            state=machine.state,
            harness_version_id=current.harness_version_id,
            workspace=current.workspace,
            task=current.task,
            created_at=current.created_at,
            updated_at=now,
            blockers=current.blockers if blockers is None else blockers,
            recovery_attempts=(
                current.recovery_attempts if recovery_attempts is None else recovery_attempts
            ),
        )
        self.save(updated)
        return updated

    def response(
        self,
        session_id: str,
        *,
        evidence: dict[str, Any],
        ok: bool = True,
    ) -> OperationResponse:
        record = self.load(session_id)
        return OperationResponse(
            ok=ok,
            state={
                "sessionId": record.session_id,
                "lifecycle": record.state.value,
                "harnessVersionId": record.harness_version_id,
                "blockers": list(record.blockers),
            },
            evidence=evidence,
            next_allowed_actions=next_session_actions(record.state),
        )


__all__ = ["InvalidTransition", "OperationResponse", "SessionRecord", "SessionRepository"]
