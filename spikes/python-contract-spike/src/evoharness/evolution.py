# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping

from .evidence import EvidencePlane
from .models import (
    AttributionHypothesis,
    AttributionResult,
    ComponentType,
    ComponentVersion,
    FailurePattern,
    HarnessVersion,
    HarnessVersionState,
    MutableClass,
    MutationProposal,
    Provenance,
    RuntimeEvent,
    content_hash,
    new_id,
)
from .registry import HarnessRegistry, bump_patch
from .trust import ImmutableTrustPlane
from .worktrees import CandidateWorktree, GitWorktreeManager


FAILURE_EVENT_TYPES = frozenset(
    {
        "task_execution_exception",
        "task_execution_blocked",
        "verification_observed",
        "tool_execution_observed",
    }
)


def _is_failure(event: Mapping[str, Any]) -> bool:
    event_type = event.get("event_type")
    payload = event.get("payload") or {}
    if event_type not in FAILURE_EVENT_TYPES:
        return False
    if event_type == "verification_observed":
        return payload.get("passed") is False
    if event_type == "tool_execution_observed":
        return payload.get("ok") is False
    return True


class WeaknessMiner:
    """Aggregates multiple traces without making causal claims."""

    def mine(self, traces: Iterable[Iterable[Mapping[str, Any]]]) -> tuple[FailurePattern, ...]:
        buckets: dict[str, list[Mapping[str, Any]]] = {}
        for trace in traces:
            for event in trace:
                if not _is_failure(event):
                    continue
                payload = event.get("payload") or {}
                fingerprint_basis = {
                    "event_type": event.get("event_type"),
                    "tool_name": payload.get("tool_name"),
                    "error_type": payload.get("error_type"),
                    "summary": payload.get("summary"),
                    "reason": payload.get("reason"),
                }
                fingerprint = content_hash(fingerprint_basis)
                buckets.setdefault(fingerprint, []).append(event)
        patterns: list[FailurePattern] = []
        for fingerprint, events in sorted(buckets.items()):
            timestamps = sorted(str(event.get("observed_at", "")) for event in events)
            patterns.append(
                FailurePattern(
                    pattern_id=new_id("pattern"),
                    fingerprint=fingerprint,
                    event_type=str(events[0].get("event_type")),
                    occurrence_count=len(events),
                    affected_trace_ids=tuple(
                        sorted({str(event.get("session_id", "")) for event in events})
                    ),
                    source_event_ids=tuple(str(event.get("event_id", "")) for event in events),
                    first_seen_at=timestamps[0],
                    last_seen_at=timestamps[-1],
                )
            )
        return tuple(patterns)


DEFAULT_ATTRIBUTION_SURFACES: dict[str, tuple[ComponentType, ...]] = {
    "tool_execution_observed": (ComponentType.TOOL_DESCRIPTION, ComponentType.SYSTEM_PROMPT),
    "verification_observed": (
        ComponentType.WORKFLOW,
        ComponentType.SYSTEM_PROMPT,
        ComponentType.CONTEXT_POLICY,
    ),
    "task_execution_blocked": (
        ComponentType.WORKFLOW,
        ComponentType.ROUTING_POLICY,
        ComponentType.MEMORY_POLICY,
    ),
    "task_execution_exception": (
        ComponentType.WORKFLOW,
        ComponentType.CONTEXT_POLICY,
        ComponentType.ROUTING_POLICY,
    ),
}


class RuleBasedAttributor:
    """Produces labeled inference from observed FailurePatterns; it is not an evaluator."""

    def __init__(self, component_ids_by_type: Mapping[ComponentType, tuple[str, ...]]) -> None:
        self.component_ids_by_type = component_ids_by_type

    def attribute(
        self,
        patterns: Iterable[FailurePattern],
        *,
        proposer_identity: str = "rule-attributor-v1",
        created_at: str | None = None,
    ) -> AttributionResult:
        pattern_list = tuple(patterns)
        hypotheses: list[AttributionHypothesis] = []
        for pattern in pattern_list:
            surfaces = DEFAULT_ATTRIBUTION_SURFACES.get(pattern.event_type, (ComponentType.WORKFLOW,))
            component_ids = tuple(
                component_id
                for surface in surfaces
                for component_id in self.component_ids_by_type.get(surface, ())
            )
            hypotheses.append(
                AttributionHypothesis(
                    component_ids=component_ids,
                    mechanism=f"{pattern.event_type} may be influenced by {', '.join(item.value for item in surfaces)}",
                    confidence=min(0.85, 0.45 + 0.05 * pattern.occurrence_count),
                    supporting_event_ids=pattern.source_event_ids,
                )
            )
        prompt_basis = {
            "patterns": [asdict(pattern) for pattern in pattern_list],
            "mapping": {
                key.value: [value.value for value in values]
                for key, values in {
                    event: surfaces for event, surfaces in DEFAULT_ATTRIBUTION_SURFACES.items()
                }.items()
            },
        }
        return AttributionResult(
            attribution_id=new_id("attribution"),
            failure_pattern_ids=tuple(pattern.pattern_id for pattern in pattern_list),
            hypotheses=tuple(hypotheses),
            proposer_identity=proposer_identity,
            created_at=created_at or datetime.now(timezone.utc).isoformat(),
            prompt_hash=content_hash(prompt_basis),
        )


class BoundedMutator:
    """Creates a new candidate version; never edits an active version in place."""

    def __init__(
        self,
        *,
        registry: HarnessRegistry,
        trust: ImmutableTrustPlane,
        worktrees: GitWorktreeManager,
    ) -> None:
        self.registry = registry
        self.trust = trust
        self.worktrees = worktrees

    def create_candidate(
        self,
        proposal: MutationProposal,
        *,
        base_ref: str,
        created_at: str,
    ) -> tuple[HarnessVersion, CandidateWorktree]:
        self.trust.authorize(proposal)
        base = self.registry.load_version(proposal.base_harness_version_id)
        refs = dict(base.component_refs)
        for mutation in proposal.mutations:
            if mutation.component_id not in refs:
                raise KeyError(f"mutation targets a component outside the base graph: {mutation.component_id}")
            if refs[mutation.component_id] != mutation.base_content_hash:
                raise ValueError(f"stale base content hash for {mutation.component_id}")
            previous = self.registry.component_by_hash(
                mutation.component_id, mutation.base_content_hash
            )
            if previous.component_type != mutation.component_type:
                raise ValueError(f"component type mismatch for {mutation.component_id}")
            if previous.mutable_class == MutableClass.IMMUTABLE:
                raise PermissionError(f"immutable component: {mutation.component_id}")
            candidate_component = ComponentVersion.create(
                component_id=previous.component_id,
                component_type=previous.component_type,
                semantic_version=bump_patch(previous.semantic_version),
                content=mutation.replacement_content,
                dependencies=previous.dependencies,
                mutable_class=previous.mutable_class,
                provenance=Provenance(
                    source="bounded-mutation",
                    actor=proposal.proposer_identity,
                    created_at=created_at,
                    parent_hashes=(previous.content_hash,),
                    notes=mutation.predicted_effect,
                ),
                evaluation_history=(),
            )
            self.registry.register_component(candidate_component)
            refs[mutation.component_id] = candidate_component.content_hash

        version = HarnessVersion.create(
            semantic_version=bump_patch(base.semantic_version),
            state=HarnessVersionState.DRAFT,
            component_refs=refs,
            parent_version_id=base.harness_version_id,
            proposal_id=proposal.proposal_id,
            created_at=created_at,
        )
        self.registry.register_version(version)
        version = self.registry.transition_version(
            version.harness_version_id, HarnessVersionState.CANDIDATE
        )
        handle = self.worktrees.create(
            candidate_id=version.harness_version_id,
            base_ref=base_ref,
        )
        self.worktrees.write_candidate_manifest(
            handle,
            {
                "harness_version_id": version.harness_version_id,
                "parent_version_id": version.parent_version_id,
                "manifest_hash": version.manifest_hash,
                "proposal_id": proposal.proposal_id,
                "component_refs": version.component_refs,
                "trust_manifest_hash": self.trust.manifest.manifest_hash,
            },
        )
        return version, handle

    def static_validate(self, version_id: str) -> HarnessVersion:
        version = self.registry.load_version(version_id)
        if version.state != HarnessVersionState.CANDIDATE:
            raise ValueError("only a candidate can be statically validated")
        self.trust.verify_seal()
        self.registry.validate_graph(version.component_refs)
        for component_id, wanted_hash in version.component_refs.items():
            component = self.registry.component_by_hash(component_id, wanted_hash)
            if component.component_type in {
                ComponentType.TOOL_IMPLEMENTATION,
                ComponentType.PERMISSION_POLICY,
                ComponentType.VERIFICATION_POLICY,
            }:
                parent = self.registry.load_version(version.parent_version_id or "")
                if parent.component_refs.get(component_id) != wanted_hash:
                    raise PermissionError(f"protected component changed: {component_id}")
        return self.registry.transition_version(
            version_id, HarnessVersionState.STATICALLY_VALIDATED
        )


def load_trace(plane: EvidencePlane) -> tuple[dict[str, Any], ...]:
    return tuple(plane.iter_event_payloads())
