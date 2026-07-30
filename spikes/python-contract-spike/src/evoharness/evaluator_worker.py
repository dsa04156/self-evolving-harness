# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
"""External evaluator worker.

This module intentionally uses only the standard library and a narrow JSON file
protocol. It has no mutation/proposer API.
"""

from __future__ import annotations

import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import time
from typing import Any


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value: Any) -> str:
    return sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _safe_candidate_path(root: Path, raw: str) -> Path:
    candidate = Path(raw).resolve(strict=True)
    if candidate != root and root not in candidate.parents:
        raise ValueError("candidate path is outside evaluator root")
    return candidate


def evaluate(request_data: dict[str, Any]) -> dict[str, Any]:
    evaluator_root = Path(request_data["evaluation_root"]).resolve(strict=True)
    candidate = _safe_candidate_path(evaluator_root, request_data["candidate_dir"])
    wall_budget = float(request_data["wall_time_seconds"])
    output_limit = int(request_data.get("max_output_bytes", 200_000))
    started = time.monotonic()
    cases: list[dict[str, Any]] = []
    for case in request_data["cases"]:
        remaining = wall_budget - (time.monotonic() - started)
        if remaining <= 0:
            cases.append(
                {
                    "case_id": case["case_id"],
                    "passed": False,
                    "reason": "matched wall-time budget exhausted",
                    "receipt_hash": digest({"case": case["case_id"], "budget_exhausted": True}),
                }
            )
            continue
        argv = case["argv"]
        if not isinstance(argv, list) or not argv or not all(isinstance(item, str) for item in argv):
            raise ValueError("case argv must be a non-empty string array")
        env = {
            key: os.environ[key]
            for key in ("PATH", "LANG", "LC_ALL", "TMPDIR")
            if key in os.environ
        }
        try:
            completed = subprocess.run(
                argv,
                cwd=candidate,
                env=env,
                capture_output=True,
                timeout=min(float(case.get("timeout_seconds", remaining)), remaining),
                check=False,
            )
            stdout = completed.stdout[:output_limit].decode("utf-8", errors="replace")
            stderr = completed.stderr[:output_limit].decode("utf-8", errors="replace")
            expected_exit = int(case.get("expected_exit_code", 0))
            contains = case.get("stdout_contains")
            passed = completed.returncode == expected_exit and (
                contains is None or str(contains) in stdout
            )
            observed = {
                "case_id": case["case_id"],
                "exit_code": completed.returncode,
                "stdout_hash": sha256(completed.stdout).hexdigest(),
                "stderr_hash": sha256(completed.stderr).hexdigest(),
                "stdout_contains_matched": contains is None or str(contains) in stdout,
            }
            cases.append(
                {
                    **observed,
                    "passed": passed,
                    "reason": "passed" if passed else stderr[-1000:] or "expectation mismatch",
                    "receipt_hash": digest(observed),
                }
            )
        except subprocess.TimeoutExpired:
            observed = {"case_id": case["case_id"], "timeout": True}
            cases.append(
                {
                    **observed,
                    "passed": False,
                    "reason": "case timeout",
                    "receipt_hash": digest(observed),
                }
            )
    elapsed = time.monotonic() - started
    passed_cases = sum(1 for case in cases if case["passed"])
    return {
        "schema_version": 1,
        "cases": cases,
        "passed_cases": passed_cases,
        "total_cases": len(cases),
        "score": passed_cases / len(cases) if cases else 0.0,
        "wall_time_seconds": elapsed,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    request_path = Path(args.request).resolve(strict=True)
    output_path = Path(args.output).resolve(strict=False)
    data = json.loads(request_path.read_text(encoding="utf-8"))
    result = evaluate(data)
    output_path.write_text(json.dumps(result, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
