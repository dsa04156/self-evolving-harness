# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import StrEnum
from hashlib import sha256
import json
from typing import Any
from uuid import uuid4


def canonical_json(value: Any) -> str:
    """Serialize a value deterministically for hashes, manifests, and receipts."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def content_hash(value: Any) -> str:
    payload = value if isinstance(value, str) else canonical_json(value)
    return sha256(payload.encode("utf-8")).hexdigest()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class ComponentType(StrEnum):
    SYSTEM_PROMPT = "SystemPrompt"
    TOOL_DESCRIPTION = "ToolDescription"
    TOOL_IMPLEMENTATION = "ToolImplementation"
    CONTEXT_POLICY = "ContextPolicy"
    MEMORY_POLICY = "MemoryPolicy"
    SKILL = "Skill"
    WORKFLOW = "Workflow"
    ROUTING_POLICY = "RoutingPolicy"
    SUBAGENT_CONFIGURATION = "SubagentConfiguration"
    RECOVERY_POLICY = "RecoveryPolicy"
    VERIFICATION_POLICY = "VerificationPolicy"
    PERMISSION_POLICY = "PermissionPolicy"


class MutableClass(StrEnum):
    MUTABLE = "mutable"
    CONDITIONALLY_MUTABLE = "conditionally-mutable"
    IMMUTABLE = "immutable"


MVP_MUTABLE_COMPONENT_TYPES: frozenset[ComponentType] = frozenset(
    {
        ComponentType.SYSTEM_PROMPT,
        ComponentType.TOOL_DESCRIPTION,
        ComponentType.CONTEXT_POLICY,
        ComponentType.MEMORY_POLICY,
        ComponentType.SKILL,
        ComponentType.WORKFLOW,
        ComponentType.ROUTING_POLICY,
        ComponentType.SUBAGENT_CONFIGURATION,
    }
)

MVP_IMMUTABLE_COMPONENT_TYPES: frozenset[ComponentType] = frozenset(
    {
        ComponentType.TOOL_IMPLEMENTATION,
        ComponentType.PERMISSION_POLICY,
        ComponentType.VERIFICATION_POLICY,
    }
)


class SessionState(StrEnum):
    CREATED = "created"
    INITIALIZED = "initialized"
    RUNNING = "running"
    BLOCKED = "blocked"
    RECOVERING = "recovering"
    VALIDATING = "validating"
    COMPLETED = "completed"
    RETIRED = "retired"


class HarnessVersionState(StrEnum):
    DRAFT = "draft"
    CANDIDATE = "candidate"
    STATICALLY_VALIDATED = "statically_validated"
    EVALUATING = "evaluating"
    CANARY = "canary"
    ACTIVE = "active"
    RETIRED = "retired"
    REJECTED = "rejected"
    ROLLED_BACK = "rolled_back"


class EvidenceKind(StrEnum):
    OBSERVED = "observed"
    DERIVED = "derived"


class EvaluationSplit(StrEnum):
    HELD_IN = "held_in"
    HELD_OUT = "held_out"


class EvaluationStrategy(StrEnum):
    STATIC_HARNESS = "static_harness"
    SIMPLE_RETRY = "simple_retry"
    PARALLEL_SAMPLING = "parallel_sampling"
    SEQUENTIAL_REFLECTION = "sequential_reflection"
    PROMPT_ONLY_OPTIMIZATION = "prompt_only_optimization"
    FREE_FORM_WHOLE_HARNESS_REWRITE = "free_form_whole_harness_rewrite"
    ATTRIBUTION_GUIDED_BOUNDED_MUTATION = "attribution_guided_bounded_mutation"


@dataclass(frozen=True, slots=True)
class Provenance:
    source: str
    actor: str
    created_at: str
    parent_hashes: tuple[str, ...] = ()
    notes: str = ""


@dataclass(frozen=True, slots=True)
class ComponentVersion:
    component_id: str
    component_type: ComponentType
    semantic_version: str
    content: Any
    content_hash: str
    dependencies: tuple[str, ...]
    mutable_class: MutableClass
    provenance: Provenance
    evaluation_history: tuple[str, ...] = ()
    active_version: bool = False

    @classmethod
    def create(
        cls,
        *,
        component_id: str,
        component_type: ComponentType,
        semantic_version: str,
        content: Any,
        dependencies: tuple[str, ...] = (),
        mutable_class: MutableClass | None = None,
        provenance: Provenance,
        evaluation_history: tuple[str, ...] = (),
        active_version: bool = False,
    ) -> ComponentVersion:
        if mutable_class is None:
            mutable_class = (
                MutableClass.IMMUTABLE
                if component_type in MVP_IMMUTABLE_COMPONENT_TYPES
                else MutableClass.MUTABLE
            )
        return cls(
            component_id=component_id,
            component_type=component_type,
            semantic_version=semantic_version,
            content=content,
            content_hash=content_hash(content),
            dependencies=dependencies,
            mutable_class=mutable_class,
            provenance=provenance,
            evaluation_history=evaluation_history,
            active_version=active_version,
        )


@dataclass(frozen=True, slots=True)
class RuntimeEvent:
    event_id: str
    session_id: str
    turn_id: str
    sequence: int
    event_type: str
    observed_at: str
    harness_version_id: str
    actor: str
    payload: dict[str, Any]
    schema_version: int = 1


@dataclass(frozen=True, slots=True)
class ObservedFact:
    """A fact emitted by code or a verifier, never an LLM causal claim."""

    fact_type: str
    value: Any
    source_event_ids: tuple[str, ...]
    artifact_hash: str | None = None


@dataclass(frozen=True, slots=True)
class EvidenceReceipt:
    receipt_id: str
    session_id: str
    subject_type: str
    subject_id: str
    issued_at: str
    issuer: str
    facts: tuple[ObservedFact, ...]
    artifact_hashes: dict[str, str]
    previous_receipt_hash: str | None
    receipt_hash: str
    schema_version: int = 1

    @classmethod
    def issue(
        cls,
        *,
        session_id: str,
        subject_type: str,
        subject_id: str,
        issued_at: str,
        issuer: str,
        facts: tuple[ObservedFact, ...],
        artifact_hashes: dict[str, str] | None = None,
        previous_receipt_hash: str | None = None,
        receipt_id: str | None = None,
    ) -> EvidenceReceipt:
        rid = receipt_id or new_id("receipt")
        artifacts = artifact_hashes or {}
        basis = {
            "receipt_id": rid,
            "session_id": session_id,
            "subject_type": subject_type,
            "subject_id": subject_id,
            "issued_at": issued_at,
            "issuer": issuer,
            "facts": [asdict(fact) for fact in facts],
            "artifact_hashes": artifacts,
            "previous_receipt_hash": previous_receipt_hash,
            "schema_version": 1,
        }
        return cls(
            receipt_id=rid,
            session_id=session_id,
            subject_type=subject_type,
            subject_id=subject_id,
            issued_at=issued_at,
            issuer=issuer,
            facts=facts,
            artifact_hashes=artifacts,
            previous_receipt_hash=previous_receipt_hash,
            receipt_hash=content_hash(basis),
        )


@dataclass(frozen=True, slots=True)
class FailurePattern:
    """A deterministic aggregation over observed trace facts."""

    pattern_id: str
    fingerprint: str
    event_type: str
    occurrence_count: int
    affected_trace_ids: tuple[str, ...]
    source_event_ids: tuple[str, ...]
    first_seen_at: str
    last_seen_at: str


@dataclass(frozen=True, slots=True)
class AttributionHypothesis:
    component_ids: tuple[str, ...]
    mechanism: str
    confidence: float
    supporting_event_ids: tuple[str, ...]
    contradicting_event_ids: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class AttributionResult:
    """An explicitly inferential artifact; it cannot itself promote a candidate."""

    attribution_id: str
    failure_pattern_ids: tuple[str, ...]
    hypotheses: tuple[AttributionHypothesis, ...]
    proposer_identity: str
    created_at: str
    prompt_hash: str
    inference_only: bool = True


@dataclass(frozen=True, slots=True)
class ComponentMutation:
    component_id: str
    component_type: ComponentType
    base_content_hash: str
    operation: str
    replacement_content: Any
    predicted_effect: str


@dataclass(frozen=True, slots=True)
class MutationProposal:
    proposal_id: str
    base_harness_version_id: str
    attribution_ids: tuple[str, ...]
    mutations: tuple[ComponentMutation, ...]
    proposer_identity: str
    created_at: str
    risk_notes: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class HarnessVersion:
    harness_version_id: str
    semantic_version: str
    state: HarnessVersionState
    component_refs: dict[str, str]
    parent_version_id: str | None
    proposal_id: str | None
    created_at: str
    manifest_hash: str
    evaluation_history: tuple[str, ...] = ()

    @classmethod
    def create(
        cls,
        *,
        semantic_version: str,
        state: HarnessVersionState,
        component_refs: dict[str, str],
        parent_version_id: str | None,
        proposal_id: str | None,
        created_at: str,
        harness_version_id: str | None = None,
    ) -> HarnessVersion:
        version_id = harness_version_id or new_id("harness")
        basis = {
            "harness_version_id": version_id,
            "semantic_version": semantic_version,
            "component_refs": component_refs,
            "parent_version_id": parent_version_id,
            "proposal_id": proposal_id,
            "created_at": created_at,
        }
        return cls(
            harness_version_id=version_id,
            semantic_version=semantic_version,
            state=state,
            component_refs=component_refs,
            parent_version_id=parent_version_id,
            proposal_id=proposal_id,
            created_at=created_at,
            manifest_hash=content_hash(basis),
        )


@dataclass(frozen=True, slots=True)
class Budget:
    model_id: str
    max_input_tokens: int
    max_output_tokens: int
    max_tool_calls: int
    max_model_calls: int
    wall_time_seconds: float

    @property
    def identity_hash(self) -> str:
        return content_hash(asdict(self))


@dataclass(frozen=True, slots=True)
class BudgetUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    tool_calls: int = 0
    model_calls: int = 0
    wall_time_seconds: float = 0.0


@dataclass(frozen=True, slots=True)
class EvaluationResult:
    evaluation_id: str
    harness_version_id: str
    strategy: EvaluationStrategy
    split: EvaluationSplit
    dataset_hash: str
    evaluator_hash: str
    model_identity_hash: str
    budget: Budget
    usage: BudgetUsage
    score: float
    passed_cases: int
    total_cases: int
    case_receipt_hashes: tuple[str, ...]
    started_at: str
    completed_at: str
    process_exit_code: int


class PromotionOutcome(StrEnum):
    PROMOTE = "promote"
    REJECT = "reject"
    ROLLBACK = "rollback"


@dataclass(frozen=True, slots=True)
class PromotionDecision:
    decision_id: str
    harness_version_id: str
    baseline_version_id: str
    outcome: PromotionOutcome
    evaluation_ids: tuple[str, ...]
    reasons: tuple[str, ...]
    decided_at: str
    decider: str
    previous_active_version_id: str | None
    audit_record_hash: str
