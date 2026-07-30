# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
from typing import Iterable, Sequence

from .models import (
    Budget,
    BudgetUsage,
    EvaluationResult,
    EvaluationSplit,
    EvaluationStrategy,
    new_id,
)


@dataclass(frozen=True, slots=True)
class BenchmarkCase:
    case_id: str
    argv: tuple[str, ...]
    expected_exit_code: int = 0
    stdout_contains: str | None = None
    timeout_seconds: float = 30.0


ALL_STRATEGIES = frozenset(EvaluationStrategy)


class ExternalEvaluator:
    """Launches the immutable evaluator as a separate process with a file protocol."""

    def __init__(self, worker_path: Path | None = None) -> None:
        self.worker_path = worker_path or Path(__file__).with_name("evaluator_worker.py")

    def evaluate(
        self,
        *,
        candidate_dir: Path,
        evaluation_root: Path,
        harness_version_id: str,
        strategy: EvaluationStrategy,
        split: EvaluationSplit,
        cases: Sequence[BenchmarkCase],
        dataset_hash: str,
        evaluator_hash: str,
        model_identity_hash: str,
        budget: Budget,
    ) -> EvaluationResult:
        candidate_dir = candidate_dir.resolve(strict=True)
        evaluation_root = evaluation_root.resolve(strict=True)
        if candidate_dir != evaluation_root and evaluation_root not in candidate_dir.parents:
            raise ValueError("candidate is outside evaluation root")
        started_at = datetime.now(timezone.utc).isoformat()
        with tempfile.TemporaryDirectory(prefix="evoharness-eval-") as temp:
            temp_root = Path(temp)
            request_path = temp_root / "request.json"
            output_path = temp_root / "output.json"
            request_payload = {
                "schema_version": 1,
                "candidate_dir": str(candidate_dir),
                "evaluation_root": str(evaluation_root),
                "wall_time_seconds": budget.wall_time_seconds,
                "max_output_bytes": 200_000,
                "cases": [asdict(case) for case in cases],
            }
            request_path.write_text(
                json.dumps(request_payload, sort_keys=True, indent=2) + "\n", encoding="utf-8"
            )
            env = {
                key: os.environ[key]
                for key in ("PATH", "LANG", "LC_ALL", "TMPDIR")
                if key in os.environ
            }
            completed = subprocess.run(
                [
                    sys.executable,
                    str(self.worker_path),
                    "--request",
                    str(request_path),
                    "--output",
                    str(output_path),
                ],
                cwd=self.worker_path.parent,
                env=env,
                capture_output=True,
                text=True,
                timeout=budget.wall_time_seconds + 5.0,
                check=False,
            )
            if completed.returncode != 0 or not output_path.exists():
                raise RuntimeError(
                    f"external evaluator failed ({completed.returncode}): {completed.stderr[-2000:]}"
                )
            observed = json.loads(output_path.read_text(encoding="utf-8"))
        return EvaluationResult(
            evaluation_id=new_id("evaluation"),
            harness_version_id=harness_version_id,
            strategy=strategy,
            split=split,
            dataset_hash=dataset_hash,
            evaluator_hash=evaluator_hash,
            model_identity_hash=model_identity_hash,
            budget=budget,
            usage=BudgetUsage(
                tool_calls=len(cases),
                wall_time_seconds=float(observed["wall_time_seconds"]),
            ),
            score=float(observed["score"]),
            passed_cases=int(observed["passed_cases"]),
            total_cases=int(observed["total_cases"]),
            case_receipt_hashes=tuple(case["receipt_hash"] for case in observed["cases"]),
            started_at=started_at,
            completed_at=datetime.now(timezone.utc).isoformat(),
            process_exit_code=completed.returncode,
        )


class MatchedBudgetProtocol:
    """Rejects comparisons that change model, dataset, evaluator, or resource budget."""

    def validate(self, results: Iterable[EvaluationResult], *, require_all_strategies: bool = False) -> None:
        values = tuple(results)
        if not values:
            raise ValueError("no evaluation results")
        identities = {
            (
                value.dataset_hash,
                value.evaluator_hash,
                value.model_identity_hash,
                value.budget.identity_hash,
            )
            for value in values
        }
        if len(identities) != 1:
            raise ValueError("evaluation results are not matched-budget comparable")
        for value in values:
            if value.usage.input_tokens > value.budget.max_input_tokens:
                raise ValueError(f"input-token budget exceeded: {value.evaluation_id}")
            if value.usage.output_tokens > value.budget.max_output_tokens:
                raise ValueError(f"output-token budget exceeded: {value.evaluation_id}")
            if value.usage.tool_calls > value.budget.max_tool_calls:
                raise ValueError(f"tool-call budget exceeded: {value.evaluation_id}")
            if value.usage.model_calls > value.budget.max_model_calls:
                raise ValueError(f"model-call budget exceeded: {value.evaluation_id}")
            if value.usage.wall_time_seconds > value.budget.wall_time_seconds:
                raise ValueError(f"wall-time budget exceeded: {value.evaluation_id}")
        if require_all_strategies:
            for split in EvaluationSplit:
                present = {value.strategy for value in values if value.split == split}
                if present != ALL_STRATEGIES:
                    missing = ALL_STRATEGIES - present
                    raise ValueError(
                        f"missing strategies for {split.value}: {sorted(item.value for item in missing)}"
                    )

    def candidate_beats_static(
        self,
        results: Iterable[EvaluationResult],
        *,
        minimum_held_out_gain: float = 0.0,
    ) -> tuple[bool, tuple[str, ...]]:
        values = tuple(results)
        self.validate(values)
        reasons: list[str] = []
        for split in EvaluationSplit:
            static = [
                value
                for value in values
                if value.split == split and value.strategy == EvaluationStrategy.STATIC_HARNESS
            ]
            candidate = [
                value
                for value in values
                if value.split == split
                and value.strategy == EvaluationStrategy.ATTRIBUTION_GUIDED_BOUNDED_MUTATION
            ]
            if len(static) != 1 or len(candidate) != 1:
                reasons.append(f"{split.value}: exactly one static and candidate result required")
                continue
            delta = candidate[0].score - static[0].score
            required = minimum_held_out_gain if split == EvaluationSplit.HELD_OUT else 0.0
            if delta < required:
                reasons.append(
                    f"{split.value}: candidate delta {delta:.6f} is below required {required:.6f}"
                )
        return not reasons, tuple(reasons or ["held-in non-regression and held-out gain satisfied"])
