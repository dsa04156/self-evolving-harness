# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import json
import re
from typing import Iterable

from .evidence import HashChainLog
from .models import new_id


TOKEN_PATTERN = re.compile(r"[\w.-]+", flags=re.UNICODE)


@dataclass(frozen=True, slots=True)
class MemoryEntry:
    memory_id: str
    created_at: str
    text: str
    tags: tuple[str, ...]
    source_session_id: str
    harness_version_id: str


class FilesystemMemory:
    """Persistent, inspectable memory; retrieval is deterministic and policy bounded."""

    def __init__(self, root: Path) -> None:
        self.log = HashChainLog(root / "memory.jsonl")

    def remember(
        self,
        *,
        text: str,
        tags: Iterable[str],
        source_session_id: str,
        harness_version_id: str,
        created_at: str,
    ) -> MemoryEntry:
        entry = MemoryEntry(
            memory_id=new_id("memory"),
            created_at=created_at,
            text=text,
            tags=tuple(sorted(set(tags))),
            source_session_id=source_session_id,
            harness_version_id=harness_version_id,
        )
        self.log.append("MemoryEntry", entry)
        return entry

    def all(self) -> list[MemoryEntry]:
        entries: list[MemoryEntry] = []
        for envelope in self.log.records():
            payload = envelope["payload"]
            payload["tags"] = tuple(payload.get("tags", ()))
            entries.append(MemoryEntry(**payload))
        return entries

    def retrieve(self, query: str, *, limit: int = 5) -> tuple[MemoryEntry, ...]:
        query_tokens = {token.casefold() for token in TOKEN_PATTERN.findall(query)}
        scored: list[tuple[int, str, MemoryEntry]] = []
        for entry in self.all():
            haystack = " ".join((entry.text, *entry.tags))
            tokens = {token.casefold() for token in TOKEN_PATTERN.findall(haystack)}
            score = len(query_tokens & tokens)
            if score:
                scored.append((score, entry.created_at, entry))
        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        return tuple(item[2] for item in scored[: max(0, limit)])

    def export_json(self) -> str:
        return json.dumps([asdict(entry) for entry in self.all()], ensure_ascii=False, indent=2)
