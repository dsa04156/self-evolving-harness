# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import asdict, is_dataclass
import fcntl
from pathlib import Path
import json
import os
from typing import Any, Iterable

from .models import EvidenceReceipt, RuntimeEvent, canonical_json, content_hash


class EvidenceIntegrityError(RuntimeError):
    pass


def _jsonable(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    return value


class HashChainLog:
    """Append-only, hash-chained JSONL log with a process-safe writer lock."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch(exist_ok=True)

    def _last_hash_from_handle(self, handle: Any) -> str | None:
        handle.seek(0)
        last: str | None = None
        for line in handle:
            if not line.strip():
                continue
            record = json.loads(line)
            last = record["record_hash"]
        return last

    def append(self, record_type: str, payload: Any) -> str:
        data = _jsonable(payload)
        with self.path.open("a+", encoding="utf-8") as handle:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            previous_hash = self._last_hash_from_handle(handle)
            basis = {
                "record_type": record_type,
                "payload": data,
                "previous_hash": previous_hash,
            }
            record_hash = content_hash(basis)
            envelope = {**basis, "record_hash": record_hash}
            handle.seek(0, os.SEEK_END)
            handle.write(canonical_json(envelope) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        return record_hash

    def records(self) -> list[dict[str, Any]]:
        with self.path.open("r", encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]

    def verify(self) -> bool:
        previous_hash: str | None = None
        for index, envelope in enumerate(self.records()):
            if envelope.get("previous_hash") != previous_hash:
                raise EvidenceIntegrityError(f"broken previous hash at record {index}")
            basis = {
                "record_type": envelope.get("record_type"),
                "payload": envelope.get("payload"),
                "previous_hash": envelope.get("previous_hash"),
            }
            expected = content_hash(basis)
            if envelope.get("record_hash") != expected:
                raise EvidenceIntegrityError(f"content hash mismatch at record {index}")
            previous_hash = expected
        return True


class EvidencePlane:
    """Stores observations and receipts; inferential attribution is stored separately."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.events = HashChainLog(root / "events.jsonl")
        self.receipts = HashChainLog(root / "receipts.jsonl")
        self.inferences = HashChainLog(root / "inferences.jsonl")

    def emit_event(self, event: RuntimeEvent) -> str:
        return self.events.append("RuntimeEvent", event)

    def issue_receipt(self, receipt: EvidenceReceipt) -> str:
        return self.receipts.append("EvidenceReceipt", receipt)

    def record_inference(self, kind: str, inference: Any) -> str:
        if kind in {"RuntimeEvent", "EvidenceReceipt", "ObservedFact"}:
            raise ValueError("observations cannot be written to the inference log")
        return self.inferences.append(kind, inference)

    def verify_all(self) -> bool:
        return self.events.verify() and self.receipts.verify() and self.inferences.verify()

    def iter_event_payloads(self) -> Iterable[dict[str, Any]]:
        for envelope in self.events.records():
            yield envelope["payload"]
