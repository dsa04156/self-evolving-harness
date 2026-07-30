#!/usr/bin/env python3
"""Static Gate 1R contract precheck.

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
    feedback = yaml.safe_load(
        (ROOT / "configs/gate-feedback-policy.yaml").read_text(encoding="utf-8")
    )
    assert feedback["candidateBatch"]["maximumCandidatesPerMethod"] == 5
    assert feedback["gateEvaluation"]["maximumBatchesPerMethod"] == 1
    assert feedback["candidateBatch"]["adaptiveReplacementCandidates"] == 0


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
        "architect/GATE_01R_REVISION_CHECKLIST.md",
    ]
    for relative in required:
        assert (ROOT / relative).exists(), f"missing required artifact: {relative}"


def validate_markdown_links() -> int:
    count = 0
    pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for path in sorted(ROOT.rglob("*.md")):
        if ".codex" in path.parts or "spikes" in path.parts:
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
    validate_required_artifacts()
    links = validate_markdown_links()
    print(
        "PASS",
        f"schemas={len(schema_paths)}",
        "type_registry=valid",
        "splits=28/14/14/14+45/10/34",
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
