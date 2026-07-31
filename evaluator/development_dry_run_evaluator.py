#!/usr/bin/env python3
"""Deterministic development-only evaluator subprocess.

This worker intentionally has no benchmark-oracle, provider, promotion, or
deployment interface. It validates one already-content-addressed synthetic
request and returns only structural checks and synthetic outcome counts.
"""

from __future__ import annotations

import json
import sys
from typing import Any


def fail(message: str) -> None:
    raise ValueError(message)


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def main() -> None:
    request = json.loads(sys.stdin.read())
    require(isinstance(request, dict), "request must be an object")
    require(request.get("schemaVersion") == 1, "schema version")
    require(request.get("developmentOnly") is True, "development-only marker")
    require(request.get("promotable") is False, "promotable marker")
    capabilities = request.get("capabilities")
    require(isinstance(capabilities, dict), "capabilities")
    require(
        capabilities
        == {
            "datasetRole": "synthetic_development",
            "deploymentAccess": False,
            "finalAccess": False,
            "gateAccess": False,
            "oracleAccess": False,
            "promotionAccess": False,
            "providerClass": "deterministic_fake",
            "toolClass": "immutable_builtin",
        },
        "capability boundary",
    )
    change = request.get("changeSurface")
    require(isinstance(change, dict), "change surface")
    require(change.get("changedComponentCount") == 1, "component boundary")
    require(
        1 <= change.get("expandedClosureEditBytes", 0) <= 8192,
        "mutation byte boundary",
    )
    require(change.get("capabilityIdsAdded") == [], "capability addition")
    require(change.get("capabilityIdsRemoved") == [], "capability removal")
    tasks = request.get("tasks")
    require(isinstance(tasks, list) and len(tasks) > 0, "synthetic tasks")
    parent_pass = sum(item["parentPassed"] is True for item in tasks)
    candidate_pass = sum(item["candidatePassed"] is True for item in tasks)
    pass_to_fail = sum(
        item["parentPassed"] is True and item["candidatePassed"] is False
        for item in tasks
    )
    fail_to_pass = sum(
        item["parentPassed"] is False and item["candidatePassed"] is True
        for item in tasks
    )
    response: dict[str, Any] = {
        "checks": [
            {"checkId": "request.content-addressed", "passed": True},
            {"checkId": "scope.development-only", "passed": True},
            {"checkId": "scope.synthetic-data-only", "passed": True},
            {"checkId": "capability.oracle-denied", "passed": True},
            {"checkId": "capability.gate-final-denied", "passed": True},
            {"checkId": "mutation.single-component", "passed": True},
            {"checkId": "candidate.non-promotable", "passed": True},
        ],
        "requestAccepted": True,
        "requestHash": request["requestHash"],
        "syntheticOutcomes": {
            "candidatePassCount": candidate_pass,
            "failToPassCount": fail_to_pass,
            "parentPassCount": parent_pass,
            "passToFailCount": pass_to_fail,
            "promotionSignal": False,
            "researchMetric": False,
            "taskCount": len(tasks),
        },
    }
    sys.stdout.write(
        json.dumps(
            response,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
