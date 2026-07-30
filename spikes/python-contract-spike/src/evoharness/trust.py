# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from .models import (
    ComponentType,
    MVP_MUTABLE_COMPONENT_TYPES,
    MutationProposal,
    content_hash,
)


PROTECTED_ASSETS = frozenset(
    {
        "evaluator",
        "permission_policy",
        "safety_policy",
        "benchmark_data",
        "budget",
        "model_identity",
        "audit_log",
        "optimizer_code",
        "middleware",
        "tool_implementation",
    }
)


@dataclass(frozen=True, slots=True)
class TrustManifest:
    evaluator_hash: str
    benchmark_hashes: tuple[str, ...]
    permission_policy_hash: str
    safety_policy_hash: str
    budget_hash: str
    model_identity_hash: str
    optimizer_hash: str
    audit_log_path: str
    created_at: str

    @property
    def manifest_hash(self) -> str:
        return content_hash(asdict(self))


@dataclass(frozen=True, slots=True)
class MutationLimits:
    max_components: int = 3
    max_replacement_characters: int = 20_000
    allowed_types: frozenset[ComponentType] = MVP_MUTABLE_COMPONENT_TYPES


class ImmutableTrustPlane:
    """Validates candidate scope without exposing mutation capabilities to the proposer."""

    def __init__(self, manifest: TrustManifest, limits: MutationLimits | None = None) -> None:
        self.manifest = manifest
        self.limits = limits or MutationLimits()
        self._sealed_hash = manifest.manifest_hash

    def verify_seal(self) -> None:
        if self.manifest.manifest_hash != self._sealed_hash:
            raise RuntimeError("immutable trust manifest changed in memory")

    def authorize(self, proposal: MutationProposal) -> None:
        self.verify_seal()
        if not proposal.mutations:
            raise PermissionError("empty mutation proposal")
        if len(proposal.mutations) > self.limits.max_components:
            raise PermissionError("mutation component limit exceeded")
        seen: set[str] = set()
        total_characters = 0
        for mutation in proposal.mutations:
            if mutation.component_id in seen:
                raise PermissionError(f"component mutated more than once: {mutation.component_id}")
            seen.add(mutation.component_id)
            if mutation.component_type not in self.limits.allowed_types:
                raise PermissionError(f"component type is outside MVP mutation scope: {mutation.component_type}")
            if mutation.operation != "replace":
                raise PermissionError(f"unsupported bounded mutation operation: {mutation.operation}")
            total_characters += len(str(mutation.replacement_content))
        if total_characters > self.limits.max_replacement_characters:
            raise PermissionError("mutation replacement size limit exceeded")

    def assert_protected_hashes(
        self,
        *,
        evaluator_hash: str,
        benchmark_hashes: Iterable[str],
        budget_hash: str,
        model_identity_hash: str,
    ) -> None:
        self.verify_seal()
        checks = {
            "evaluator": evaluator_hash == self.manifest.evaluator_hash,
            "benchmark_data": tuple(benchmark_hashes) == self.manifest.benchmark_hashes,
            "budget": budget_hash == self.manifest.budget_hash,
            "model_identity": model_identity_hash == self.manifest.model_identity_hash,
        }
        changed = [name for name, unchanged in checks.items() if not unchanged]
        if changed:
            raise PermissionError(f"candidate attempted to cross immutable boundary: {changed}")


def hash_file(path: Path) -> str:
    return content_hash(path.read_bytes().hex())
