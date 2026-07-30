#!/usr/bin/env python3
"""Static Gate 1RRR contract precheck.

This is design-artifact validation, not runtime/evaluator implementation evidence.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any

import yaml
from jsonschema import Draft202012Validator, RefResolver


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_ROOT = ROOT / "schemas"


def canonical_json_bytes(value: Any) -> bytes:
    """JCS-equivalent for these ASCII/integer-only contract identities."""
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def resolve_pointer(document: Any, fragment: str, source: Path) -> None:
    if not fragment:
        return
    if not fragment.startswith("/"):
        raise AssertionError(f"{source}: unsupported JSON fragment #{fragment}")
    value = document
    for raw in fragment[1:].split("/"):
        token = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(value, list):
            value = value[int(token)]
        else:
            assert token in value, f"{source}: missing JSON pointer token {token!r}"
            value = value[token]


def validate_schema_set() -> tuple[list[Path], dict[str, Any]]:
    schema_paths = sorted(SCHEMA_ROOT.rglob("*.schema.json"))
    schema_store: dict[str, Any] = {}

    for path in schema_paths:
        schema = load_json(path)
        Draft202012Validator.check_schema(schema)
        schema_id = schema.get("$id")
        assert schema_id, f"{path}: missing $id"
        schema_store[schema_id] = schema

        for ref in iter_refs(schema):
            if ref.startswith("#"):
                resolve_pointer(schema, ref[1:], path)
                continue
            target_name, _, fragment = ref.partition("#")
            target = (path.parent / target_name).resolve()
            assert target.is_relative_to(SCHEMA_ROOT.resolve()), (
                f"{path}: reference escapes schema root: {ref}"
            )
            assert target.exists(), f"{path}: missing reference target {ref}"
            resolve_pointer(load_json(target), fragment, path)

    return schema_paths, schema_store


def iter_refs(value: Any):
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "$ref":
                yield item
            else:
                yield from iter_refs(item)
    elif isinstance(value, list):
        for item in value:
            yield from iter_refs(item)


def validate_type_registry(schema_store: dict[str, Any]) -> None:
    path = ROOT / "configs/component-type-registry.json"
    instance = load_json(path)
    schema = load_json(SCHEMA_ROOT / "component-type-registry.schema.json")
    resolver = RefResolver.from_schema(schema, store=schema_store)
    Draft202012Validator(schema, resolver=resolver).validate(instance)

    digest = sha256_hex(canonical_json_bytes(instance["identity"]))
    assert instance["typeRegistryId"] == f"ctr-sha256:{digest}"
    assert instance["registryHash"] == f"sha256:{digest}"

    entries = instance["identity"]["entries"]
    ids = [entry["typeEntryId"] for entry in entries]
    types = [entry["componentType"] for entry in entries]
    assert ids == sorted(ids), "type registry entries are not canonical-order sorted"
    assert len(ids) == len(set(ids)), "duplicate typeEntryId"
    assert len(types) == len(set(types)), "duplicate componentType"

    expected_mutable = {
        "SystemPrompt",
        "ContextPolicy",
        "MemoryRetrievalPolicy",
        "Skill",
        "WorkflowPolicy",
        "RoutingPolicy",
        "SubagentPrompt",
        "ToolDescription",
    }
    enabled = {entry["componentType"] for entry in entries if entry["mvpMutationEnabled"]}
    assert enabled == expected_mutable
    for entry in entries:
        if entry["mvpMutationEnabled"]:
            assert entry["mutableClass"] == "mutable"
            assert entry["candidateMayContainExecutableBytes"] is False

    contract_by_language = {
        "seh.prompt-markdown.v1": "prompt-payload.schema.json",
        "seh.context-policy.v1": "context-policy-payload.schema.json",
        "seh.memory-retrieval-policy.v1": "memory-retrieval-policy-payload.schema.json",
        "seh.skill.v1": "skill-payload.schema.json",
        "seh.workflow.v1": "workflow-payload.schema.json",
        "seh.routing-policy.v1": "routing-policy-payload.schema.json",
        "seh.tool-description.v1": "tool-description-payload.schema.json",
        "seh.policy-json.v1": "policy-json-payload.schema.json",
        "seh.immutable-artifact.v1": "immutable-artifact-descriptor.schema.json",
    }
    expected_hashes = {
        language: "sha256:"
        + sha256_hex(
            canonical_json_bytes(
                load_json(SCHEMA_ROOT / "payloads" / schema_file)
            )
        )
        for language, schema_file in contract_by_language.items()
    }
    for entry in entries:
        languages = entry["allowedPayloadLanguages"]
        assert len(languages) == 1, "v1 registry requires one language per type"
        assert entry["payloadContractHash"] == expected_hashes[languages[0]], (
            f"{entry['typeEntryId']}: stale payload contract hash"
        )


def validate_splits() -> None:
    split = load_json(ROOT / "benchmarks/splits.json")
    assert split["protocolVersion"] == "draft-1"

    hfb = split["harnessFaultBenchV0"]
    expected = {
        "mine": 28,
        "gate": 14,
        "sealedTestSingleFault": 14,
        "sealedTestMultiCause": 14,
    }
    for key, count in expected.items():
        assert len(hfb[key]) == count, f"HFB {key}: expected {count}"
    hfb_ids = [item for key in expected for item in hfb[key]]
    assert len(hfb_ids) == len(set(hfb_ids)), "HFB split overlap"

    families = [
        "system-prompt",
        "context-policy",
        "memory-retrieval-policy",
        "skill",
        "workflow-policy",
        "routing-subagent",
        "tool-description",
    ]
    for family in families:
        assert sum(f"-{family}-" in item for item in hfb["mine"]) == 4
        assert sum(f"-{family}-" in item for item in hfb["gate"]) == 2
        assert (
            sum(f"-{family}-" in item for item in hfb["sealedTestSingleFault"])
            == 2
        )

    terminal = split["terminalBench21"]
    assert "sealedTest" not in terminal
    assert len(terminal["train"]) == 45
    assert len(terminal["validation"]) == 10
    assert len(terminal["withheldPublicTest"]) == 34
    terminal_ids = (
        terminal["train"]
        + terminal["validation"]
        + terminal["withheldPublicTest"]
    )
    assert len(terminal_ids) == len(set(terminal_ids)), "Terminal-Bench split overlap"

    graph_path = ROOT / "benchmarks/harness-fault-bench/multicause-graph.json"
    graph = load_json(graph_path)
    graph_schema = load_json(
        SCHEMA_ROOT / "benchmarks/harness-fault-multicause-graph.schema.json"
    )
    Draft202012Validator(graph_schema).validate(graph)
    edges = graph["edges"]
    assert [edge["caseId"] for edge in edges] == sorted(
        edge["caseId"] for edge in edges
    )
    assert [edge["caseId"] for edge in edges] == hfb["sealedTestMultiCause"]
    unordered_pairs = {
        tuple(sorted((edge["familyA"], edge["familyB"]))) for edge in edges
    }
    assert len(unordered_pairs) == 14, "duplicate multi-cause family edge"
    for family in graph["combinedFamilies"]:
        overall = sum(
            family in (edge["familyA"], edge["familyB"]) for edge in edges
        )
        assert overall == 4, f"{family}: expected overall degree 4"
        for difficulty in ("medium", "high"):
            degree = sum(
                edge["difficulty"] == difficulty
                and family in (edge["familyA"], edge["familyB"])
                for edge in edges
            )
            assert degree == 2, (
                f"{family}/{difficulty}: expected stratum degree 2"
            )
    assert sum(edge["difficulty"] == "medium" for edge in edges) == 7
    assert sum(edge["difficulty"] == "high" for edge in edges) == 7


def validate_yaml() -> None:
    for path in sorted((ROOT / "configs").glob("*.yaml")):
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
        assert isinstance(data, dict), f"{path}: YAML root must be a mapping"
    budget = yaml.safe_load(
        (ROOT / "configs/evaluation-budget.yaml").read_text(encoding="utf-8")
    )
    assert budget["trackA"]["kSolverAttemptSlotsPerTask"] == 5
    assert budget["trackB"]["kCandidateManifestsPerMethod"] == 5
    assert budget["trackB"]["adaptiveReplacementCandidates"] == 0
    h3 = budget["h3RepresentationExperiment"]
    assert h3["treatment"] == "B6"
    assert h3["control"] == "B6-RAW"
    assert h3["onlyDifference"] == "evidence_representation"
    assert h3["gateAccess"] is False and h3["finalAccess"] is False
    assert h3["candidateSlotsPerArm"] == 5
    cost = budget["candidateCostGate"]
    assert cost["formulaVersion"] == "seh-candidate-cost-v1"
    assert cost["successSmoothingAlpha"] == 0.5
    assert cost["successSmoothingDenominatorAddend"] == 1
    assert cost["tokenSmoothingTokens"] == 1
    assert cost["normalMaximumRatio"] == 1.10
    assert (
        cost["highCostException"][
            "minimumSmoothedSuccessPerTokenRatioImprovement"
        ]
        == 1.05
    )
    h4 = budget["h4TransferExperiment"]
    assert h4["status"] == "exploratory"
    assert h4["secondModelEvolutionCalls"] == 0
    assert h4["modelSpecificRetuning"] is False
    feedback = yaml.safe_load(
        (ROOT / "configs/gate-feedback-policy.yaml").read_text(encoding="utf-8")
    )
    assert feedback["protocolLifetime"]["accessMode"] == "one_shot_per_protocol"
    assert feedback["protocolLifetime"]["maximumGateUnlocks"] == 1
    assert feedback["protocolLifetime"]["nonAdaptiveReplicationAllowed"] is False
    assert feedback["candidateBatch"]["maximumCandidatesPerMethod"] == 5
    assert feedback["gateEvaluation"]["maximumBatchesPerMethod"] == 1
    assert feedback["candidateBatch"]["adaptiveReplacementCandidates"] == 0
    assert set(
        feedback["internalSelectionPacket"][
            "readableUntilConfirmatoryFinalizationBy"
        ]
    ) == {"promoter", "audit_store"}
    assert (
        feedback["feedbackAccounting"][
            "adaptiveFeedbackEventsConsumedByCandidateGenerator"
        ]
        == 0
    )
    assert (
        feedback["feedbackAccounting"]["maximumDecisionEvidenceEventsPerMethod"]
        == 6
    )


def validate_spike_quarantine() -> None:
    assert not (ROOT / "pyproject.toml").exists()
    assert not list((ROOT / "src").rglob("*.py"))
    spike = ROOT / "spikes/python-contract-spike"
    assert spike.exists()
    sums = spike / "ARCHIVED_SHA256SUMS"
    for line in sums.read_text(encoding="utf-8").splitlines():
        digest, relative = line.split("  ", 1)
        assert sha256_hex((spike / relative).read_bytes()) == digest


def validate_manifest_separation() -> None:
    component = load_json(SCHEMA_ROOT / "harness-component.schema.json")
    harness = load_json(SCHEMA_ROOT / "harness-version.schema.json")

    def property_names(value: Any) -> set[str]:
        names: set[str] = set()
        if isinstance(value, dict):
            properties = value.get("properties")
            if isinstance(properties, dict):
                names.update(properties)
            for child in value.values():
                names.update(property_names(child))
        elif isinstance(value, list):
            for child in value:
                names.update(property_names(child))
        return names

    component_names = property_names(component)
    harness_names = property_names(harness)
    for forbidden in ("evaluationHistory", "activeVersion", "mutableClass", "provenance"):
        assert forbidden not in component_names
    for forbidden in (
        "lifecycle",
        "stateHistory",
        "evaluationResultIds",
        "promotionDecisionId",
        "rollbackVersionId",
    ):
        assert forbidden not in harness_names
    deployment = load_json(SCHEMA_ROOT / "deployment-pointer-record.schema.json")
    assert "component" not in deployment["properties"], "per-component activation field"
    assert deployment["properties"]["channelId"]["const"] == "production"
    assert set(deployment["properties"]["operation"]["enum"]) == {
        "initialize",
        "deploy",
        "rollback",
        "decommission",
    }
    for field in (
        "rollbackTargetHarnessVersionId",
        "rollbackTargetManifestHash",
        "rollbackTargetQualificationDecisionId",
    ):
        assert field in deployment["required"]
    assert deployment["properties"]["schemaVersion"]["const"] == 3
    expected_tuple_fields = set(
        load_json(SCHEMA_ROOT / "deployment-decision.schema.json")["$defs"][
            "pointerExpectation"
        ]["required"]
    )
    assert expected_tuple_fields == {
        "generation",
        "harnessVersionId",
        "manifestHash",
        "targetQualificationDecisionId",
        "rollbackTargetHarnessVersionId",
        "rollbackTargetManifestHash",
        "rollbackTargetQualificationDecisionId",
        "pointerRecordHash",
    }
    null_anchor_rule = deployment["allOf"][1]
    for field in (
        "rollbackTargetHarnessVersionId",
        "rollbackTargetManifestHash",
        "rollbackTargetQualificationDecisionId",
    ):
        assert null_anchor_rule["then"]["properties"][field]["type"] == "null"
    initialization_rule = deployment["allOf"][2]
    assert initialization_rule["then"]["properties"]["expectedBefore"][
        "properties"
    ]["generation"]["const"] == -1
    assert initialization_rule["then"]["properties"]["after"]["properties"][
        "generation"
    ]["const"] == 0
    assert initialization_rule["then"]["properties"]["priorTargetDisposition"][
        "const"
    ] == "none"
    assert initialization_rule["else"]["properties"][
        "priorTargetDisposition"
    ]["const"] == "retained_approved"
    rollback_rule = deployment["allOf"][3]
    assert rollback_rule["if"]["properties"]["operation"]["const"] == "rollback"

    protocol = load_json(SCHEMA_ROOT / "protocol-manifest.schema.json")
    assert protocol["properties"]["schemaVersion"]["const"] == 2
    protocol_pins = set(
        protocol["properties"]["identity"]["properties"]["pins"]["required"]
    )
    assert {
        "methodArmManifestSet",
        "candidateSelectionRule",
        "gateReportTemplateSet",
        "analysisProgram",
    } <= protocol_pins


def validate_lifecycle_contracts() -> None:
    harness = load_json(SCHEMA_ROOT / "harness-lifecycle-record.schema.json")
    harness_states = set(harness["properties"]["toState"]["enum"])
    assert "approved" in harness_states
    assert "active" not in harness_states
    assert "rolled_back" not in harness_states
    harness_pairs: dict[str | None, set[str]] = {}
    for branch in harness["oneOf"]:
        pair = branch["properties"]
        source_schema = pair["fromState"]
        source = None if source_schema.get("type") == "null" else source_schema.get("const")
        target_schema = pair["toState"]
        targets = set(
            target_schema["enum"]
            if "enum" in target_schema
            else [target_schema["const"]]
        )
        harness_pairs[source] = targets
    assert harness_pairs == {
        None: {"draft"},
        "draft": {"candidate", "rejected"},
        "candidate": {"statically_validated", "rejected"},
        "statically_validated": {"evaluating", "rejected"},
        "evaluating": {"canary", "rejected"},
        "canary": {"approved", "rejected"},
        "approved": {"retired"},
        "rejected": {"retired"},
    }

    promotion = load_json(SCHEMA_ROOT / "promotion-decision.schema.json")
    assert set(promotion["properties"]["action"]["enum"]) == {
        "approve",
        "reject",
    }
    for forbidden in ("channelId", "expectedDeployment", "rollbackTargetHarnessVersionId"):
        assert forbidden not in promotion["properties"]

    deployment_decision = load_json(SCHEMA_ROOT / "deployment-decision.schema.json")
    assert deployment_decision["properties"]["schemaVersion"]["const"] == 2
    assert deployment_decision["properties"]["channelId"]["const"] == "production"
    for field in (
        "rollbackTargetHarnessVersionId",
        "rollbackTargetManifestHash",
        "rollbackTargetQualificationDecisionId",
    ):
        assert field in deployment_decision["required"]
    decision_initialization_rule = deployment_decision["allOf"][2]
    assert decision_initialization_rule["then"]["properties"]["expectedBefore"][
        "properties"
    ]["generation"]["const"] == -1
    assert decision_initialization_rule["then"]["properties"]["target"][
        "properties"
    ]["generation"]["const"] == 0
    decision_rollback_rule = deployment_decision["allOf"][3]
    assert decision_rollback_rule["if"]["properties"]["action"]["const"] == (
        "rollback"
    )

    # Executable model of the frozen cross-object rules. This is a static
    # contract precheck, not deployment machinery.
    harness_a = ("hv-a", "sha-a", "approve-a")
    harness_c = ("hv-c", "sha-c", "approve-c")

    def transition(
        prior: tuple[int, tuple[str, str, str] | None, tuple[str, str, str] | None],
        operation: str,
        target: tuple[str, str, str] | None = None,
    ):
        generation, prior_target, prior_rollback = prior
        if operation == "initialize":
            assert generation == -1 and prior_target is None and prior_rollback is None
            assert target is not None
            return (0, target, None)
        assert generation >= 0 and prior_target is not None
        if operation == "deploy":
            assert target is not None
            return (generation + 1, target, prior_target)
        if operation == "rollback":
            assert prior_rollback is not None
            return (generation + 1, prior_rollback, prior_target)
        if operation == "decommission":
            return (generation + 1, None, None)
        raise AssertionError(f"unknown deployment operation: {operation}")

    initialized = transition((-1, None, None), "initialize", harness_a)
    assert initialized == (0, harness_a, None)
    try:
        transition(initialized, "rollback")
    except AssertionError:
        pass
    else:
        raise AssertionError("rollback before first deploy must fail")
    deployed = transition(initialized, "deploy", harness_c)
    assert deployed == (1, harness_c, harness_a)
    rolled_back = transition(deployed, "rollback")
    assert rolled_back == (2, harness_a, harness_c)
    assert transition(rolled_back, "rollback") == (3, harness_c, harness_a)
    assert transition(rolled_back, "decommission") == (3, None, None)

    # The signed decision and appended pointer record must encode the same
    # complete transition. Schema validation fixes each record's shape; this
    # cross-object predicate fixes equality and action semantics.
    prior_pointer = {
        "generation": 1,
        "harnessVersionId": harness_c[0],
        "manifestHash": harness_c[1],
        "targetQualificationDecisionId": harness_c[2],
        "rollbackTargetHarnessVersionId": harness_a[0],
        "rollbackTargetManifestHash": harness_a[1],
        "rollbackTargetQualificationDecisionId": harness_a[2],
        "pointerRecordHash": "pointer-hash-1",
    }
    rollback_decision = {
        "deploymentDecisionId": "deploy-decision-2",
        "protocolId": "protocol-1",
        "action": "rollback",
        "channelId": "production",
        "expectedBefore": dict(prior_pointer),
        "target": {
            "generation": 2,
            "harnessVersionId": harness_a[0],
            "manifestHash": harness_a[1],
        },
        "targetQualificationDecisionId": harness_a[2],
        "rollbackTargetHarnessVersionId": harness_c[0],
        "rollbackTargetManifestHash": harness_c[1],
        "rollbackTargetQualificationDecisionId": harness_c[2],
    }
    rollback_record = {
        "deploymentDecisionId": "deploy-decision-2",
        "protocolId": "protocol-1",
        "operation": "rollback",
        "channelId": "production",
        "expectedBefore": dict(prior_pointer),
        "after": dict(rollback_decision["target"]),
        "targetQualificationDecisionId": harness_a[2],
        "rollbackTargetHarnessVersionId": harness_c[0],
        "rollbackTargetManifestHash": harness_c[1],
        "rollbackTargetQualificationDecisionId": harness_c[2],
    }

    def deployment_pair_valid(
        decision: dict[str, Any], record: dict[str, Any]
    ) -> bool:
        if decision["deploymentDecisionId"] != record["deploymentDecisionId"]:
            return False
        if decision["protocolId"] != record["protocolId"]:
            return False
        if decision["channelId"] != record["channelId"]:
            return False
        if decision["action"] != record["operation"]:
            return False
        if decision["expectedBefore"] != record["expectedBefore"]:
            return False
        if decision["target"] != record["after"]:
            return False
        for field in (
            "targetQualificationDecisionId",
            "rollbackTargetHarnessVersionId",
            "rollbackTargetManifestHash",
            "rollbackTargetQualificationDecisionId",
        ):
            if decision[field] != record[field]:
                return False

        prior = decision["expectedBefore"]
        prior_target = (
            prior["harnessVersionId"],
            prior["manifestHash"],
            prior["targetQualificationDecisionId"],
        )
        prior_rollback = (
            (
                prior["rollbackTargetHarnessVersionId"],
                prior["rollbackTargetManifestHash"],
                prior["rollbackTargetQualificationDecisionId"],
            )
            if prior["rollbackTargetHarnessVersionId"] is not None
            else None
        )
        requested_target = (
            decision["target"]["harnessVersionId"],
            decision["target"]["manifestHash"],
            decision["targetQualificationDecisionId"],
        )
        try:
            expected = transition(
                (prior["generation"], prior_target, prior_rollback),
                decision["action"],
                requested_target,
            )
        except AssertionError:
            return False
        expected_generation, expected_target, expected_rollback = expected
        actual_target = requested_target
        actual_rollback = (
            (
                decision["rollbackTargetHarnessVersionId"],
                decision["rollbackTargetManifestHash"],
                decision["rollbackTargetQualificationDecisionId"],
            )
            if decision["rollbackTargetHarnessVersionId"] is not None
            else None
        )
        return (
            decision["target"]["generation"] == expected_generation
            and actual_target == expected_target
            and actual_rollback == expected_rollback
        )

    assert deployment_pair_valid(rollback_decision, rollback_record)
    non_swapping_record = dict(rollback_record)
    non_swapping_record["rollbackTargetHarnessVersionId"] = harness_a[0]
    assert not deployment_pair_valid(rollback_decision, non_swapping_record)
    non_swapping_decision = dict(rollback_decision)
    non_swapping_decision["rollbackTargetHarnessVersionId"] = harness_a[0]
    non_swapping_record = dict(rollback_record)
    non_swapping_record["rollbackTargetHarnessVersionId"] = harness_a[0]
    assert not deployment_pair_valid(non_swapping_decision, non_swapping_record)

    session = load_json(SCHEMA_ROOT / "session-lifecycle-record.schema.json")
    assert session["properties"]["schemaVersion"]["const"] == 2
    session_states = set(session["properties"]["toState"]["enum"])
    assert {"terminating", "terminated"} <= session_states
    reasons = set(
        session["properties"]["terminationReason"]["oneOf"][1]["enum"]
    )
    assert reasons == {
        "initialization_failure",
        "user_cancellation",
        "budget_exhaustion",
        "deadline_expiry",
        "verifier_failure",
        "security_violation",
        "process_crash",
        "unrecoverable_recovery",
        "host_enforced_shutdown",
    }
    assert "terminationTransaction" in session["required"]
    transaction = session["properties"]["terminationTransaction"]["oneOf"][1]
    assert set(transaction["required"]) == {
        "terminationTransactionId",
        "initiatingRecordId",
        "preTerminationState",
        "initiatingPrincipal",
        "reason",
    }
    assert session["allOf"][0]["then"]["properties"][
        "terminationTransaction"
    ]["type"] == "object"
    assert session["allOf"][0]["else"]["properties"][
        "terminationTransaction"
    ]["type"] == "null"
    session_pairs: dict[str | None, set[str]] = {}
    for branch in session["oneOf"]:
        pair = branch["properties"]
        source_schema = pair["fromState"]
        source = None if source_schema.get("type") == "null" else source_schema.get("const")
        target_schema = pair["toState"]
        targets = set(
            target_schema["enum"]
            if "enum" in target_schema
            else [target_schema["const"]]
        )
        session_pairs[source] = targets
    assert session_pairs == {
        None: {"created"},
        "created": {"initialized", "retired", "terminating"},
        "initialized": {"running", "blocked", "terminating"},
        "running": {
            "waiting",
            "validating",
            "blocked",
            "recovering",
            "terminating",
        },
        "waiting": {"running", "blocked", "recovering", "terminating"},
        "blocked": {"recovering", "terminating"},
        "recovering": {"initialized", "running", "blocked", "terminating"},
        "validating": {"completed", "running", "blocked", "terminating"},
        "completed": {"retired", "terminating"},
        "terminating": {"terminated"},
    }

    # Cross-record continuity examples. The production validator must resolve
    # the referenced record and enforce the same comparisons.
    initiating_descriptor = {
        "terminationTransactionId": "ttx-1",
        "initiatingRecordId": "slr-1",
        "preTerminationState": "running",
        "initiatingPrincipal": "operations-owner-1",
        "reason": "process_crash",
    }
    initiating_record = {
        "recordId": "slr-1",
        "protocolId": "protocol-1",
        "sessionId": "session-1",
        "harnessVersionId": "harness-1",
        "runtimeStateSnapshotId": "snapshot-1",
        "fromState": "running",
        "toState": "terminating",
        "terminationReason": "process_crash",
        "terminationTransaction": initiating_descriptor,
        "evidenceReceiptIds": ["receipt-init"],
        "transitionedBy": "operations-owner-1",
    }
    final_record = {
        "recordId": "slr-2",
        "protocolId": "protocol-1",
        "sessionId": "session-1",
        "harnessVersionId": "harness-1",
        "runtimeStateSnapshotId": "snapshot-1",
        "fromState": "terminating",
        "toState": "terminated",
        "terminationReason": "process_crash",
        "terminationTransaction": dict(initiating_descriptor),
        "evidenceReceiptIds": ["receipt-init", "receipt-final"],
    }

    def termination_pair_valid(initiating: dict[str, Any], final: dict[str, Any]) -> bool:
        descriptor = initiating["terminationTransaction"]
        if descriptor["initiatingRecordId"] != initiating["recordId"]:
            return False
        if descriptor["preTerminationState"] != initiating["fromState"]:
            return False
        if descriptor["initiatingPrincipal"] != initiating["transitionedBy"]:
            return False
        if descriptor["reason"] != initiating["terminationReason"]:
            return False
        if final["terminationTransaction"] != descriptor:
            return False
        if final["terminationReason"] != descriptor["reason"]:
            return False
        for field in (
            "protocolId",
            "sessionId",
            "harnessVersionId",
            "runtimeStateSnapshotId",
        ):
            if final[field] != initiating[field]:
                return False
        if not set(initiating["evidenceReceiptIds"]) <= set(
            final["evidenceReceiptIds"]
        ):
            return False
        return final["fromState"] == "terminating" and final["toState"] == "terminated"

    assert termination_pair_valid(initiating_record, final_record)
    conflicting_final = dict(final_record)
    conflicting_final["terminationReason"] = "security_violation"
    assert not termination_pair_valid(initiating_record, conflicting_final)
    conflicting_descriptor = dict(final_record)
    conflicting_descriptor["terminationTransaction"] = dict(
        initiating_descriptor, reason="security_violation"
    )
    assert not termination_pair_valid(initiating_record, conflicting_descriptor)
    conflicting_origin = dict(final_record)
    conflicting_origin["terminationTransaction"] = dict(
        initiating_descriptor, preTerminationState="waiting"
    )
    assert not termination_pair_valid(initiating_record, conflicting_origin)
    conflicting_principal = dict(final_record)
    conflicting_principal["terminationTransaction"] = dict(
        initiating_descriptor, initiatingPrincipal="operations-owner-2"
    )
    assert not termination_pair_valid(initiating_record, conflicting_principal)

    def termination_completion_set_valid(
        initiating: dict[str, Any], finals: list[dict[str, Any]]
    ) -> bool:
        return len(finals) <= 1 and all(
            termination_pair_valid(initiating, item)
            for item in finals
        )

    assert termination_completion_set_valid(initiating_record, [final_record])
    assert not termination_completion_set_valid(
        initiating_record, [final_record, dict(final_record)]
    ), "duplicate terminal completion must fail"

    state_contract = (
        ROOT / "docs/architecture/state-machines.md"
    ).read_text(encoding="utf-8")
    for fragment in (
        "new.target = prior.rollbackTarget",
        "new.rollbackTarget = prior.target",
        "Rollback is prohibited after initialize",
        "repeats `D` byte-for-byte",
        "duplicate/conflicting final",
    ):
        assert fragment in state_contract, f"missing lifecycle invariant: {fragment}"
    operations = load_json(SCHEMA_ROOT / "operation-response.schema.json")
    assert "terminate" in operations["properties"]["operation"]["enum"]
    assert {"terminating", "terminated"} <= set(
        operations["properties"]["state"]["enum"]
    )


def validate_cost_formula() -> None:
    cost_schema = load_json(SCHEMA_ROOT / "candidate-cost-gate.schema.json")
    assert cost_schema["properties"]["formulaVersion"]["const"] == (
        "seh-candidate-cost-v1"
    )
    assert {
        "gateTaskSetHash",
        "candidateCostTerm",
        "parentCostTerm",
        "normalThresholdLeft",
        "normalThresholdRight",
        "highCostEfficiencyLeft",
        "highCostEfficiencyRight",
    } <= set(cost_schema["required"])
    assert not {
        "costRatio",
        "efficiencyRatio",
        "candidateSmoothedPassRate",
        "parentSmoothedPassRate",
    } & set(cost_schema["properties"])
    ledger = (
        ROOT / "docs/evaluation/phase-budget-ledger.md"
    ).read_text(encoding="utf-8")
    required_formula_fragments = (
        "10 * (U_candidate + n) <= 11 * (U_parent + n)",
        "10 * (U_candidate + n) > 11 * (U_parent + n)",
        "P_candidate - P_parent >= 1",
        "fail_to_pass_count - pass_to_fail_count >= 1",
        "20 * (2*P_candidate + 1) * (U_parent + n)",
        ">= 21 * (2*P_parent + 1) * (U_candidate + n)",
        "Missing usage never",
        "Validator and promoter independently recompute",
    )
    for fragment in required_formula_fragments:
        assert fragment in ledger, f"missing cost formula fragment: {fragment}"


def validate_required_artifacts() -> None:
    required = [
        "docs/architecture/canonicalization-and-hashing.md",
        "docs/architecture/mutable-payload-contract.md",
        "docs/architecture/runtime-state-snapshot.md",
        "docs/architecture/principal-capability-matrix.md",
        "docs/architecture/tcb-and-authenticated-protocol.md",
        "docs/architecture/validator-and-adversarial-acceptance.md",
        "docs/evaluation/metric-split-matrix.md",
        "docs/evaluation/baseline-matrix.md",
        "docs/evaluation/phase-budget-ledger.md",
        "docs/evaluation/statistical-analysis-plan.md",
        "docs/evaluation/temporal-holdout-governance.md",
        "docs/evaluation/claim-matrix.md",
        "benchmarks/harness-fault-bench/FIXTURE_SPEC.md",
        "benchmarks/harness-fault-bench/multicause-graph.json",
        "architect/GATE_01R_REVISION_CHECKLIST.md",
        "architect/GATE_01RR_REVISION_CHECKLIST.md",
        "architect/GATE_01RRR_REVISION_CHECKLIST.md",
        "docs/evaluation/gate1rrr-validation.md",
    ]
    for relative in required:
        assert (ROOT / relative).exists(), f"missing required artifact: {relative}"


def validate_markdown_links() -> int:
    count = 0
    pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for path in sorted(ROOT.rglob("*.md")):
        if any(
            excluded in path.parts
            for excluded in (
                ".codex",
                ".seh",
                ".venv",
                "coverage",
                "node_modules",
                "output",
                "spikes",
            )
        ):
            continue
        for target in pattern.findall(path.read_text(encoding="utf-8")):
            if target.startswith(("http://", "https://", "#", "/")):
                continue
            clean = target.split("#", 1)[0]
            if not clean:
                continue
            count += 1
            assert (path.parent / clean).resolve().exists(), (
                f"{path}: broken Markdown link {target}"
            )
    return count


def main() -> int:
    schema_paths, schema_store = validate_schema_set()
    validate_type_registry(schema_store)
    validate_splits()
    validate_yaml()
    validate_spike_quarantine()
    validate_manifest_separation()
    validate_lifecycle_contracts()
    validate_cost_formula()
    validate_required_artifacts()
    links = validate_markdown_links()
    print(
        "PASS",
        f"schemas={len(schema_paths)}",
        "type_registry=valid",
        "splits=28/14/14/14+45/10/34",
        "multicause_graph=14_edges_degree4",
        "lifecycle=qualified_deployed_terminated",
        "deployment=null_anchor_swap",
        "termination=transaction_bound",
        "gate=one_shot",
        "h3=B6_vs_B6-RAW",
        "spike=quarantined",
        f"markdown_links={links}",
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
        raise
