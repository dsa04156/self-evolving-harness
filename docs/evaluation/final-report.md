# Deterministic MVP Final Report

Report date: 2026-08-03
Evaluation scope: implementation and local trust-boundary conformance
Final research verdict: **REVISE**

## Executive finding

The standalone harness implementation is complete against the deterministic MVP acceptance contract.
It owns the task loop and the harness-evolution loop, connects the kernel to durable operations and
evidence, and passes deterministic fake-provider, tool, lifecycle, mutation, evaluator, deployment,
rollback, sandbox, and governance tests.

The empirical research program is not complete. No actual B0–B6 provider experiment, private gate,
sealed held-out evaluation, or temporal holdout has run. Therefore this report does not approve a
self-improvement, generalization, cost-superiority, or test-time-scaling claim.

## Implementation decision

| Dimension | Decision | Basis |
|---|---|---|
| Standalone runtime | PASS | No external coding harness appears in the runtime call graph; managed FakeProvider CLI completes. |
| Inner/outer lifecycle separation | PASS | Different stores, IDs, transition graphs, receipts, and tests; retry cannot create a candidate. |
| Component mutation boundary | PASS | Closed type registry, immutable closure, bounded proposal, admission, and bundle gates. |
| Operations/evidence | PASS | Complete operations API, signed lifecycle/receipt chains, event and artifact projection. |
| Subagents/backend jobs | PASS | Signed descendant lifecycle, inherited pins, reduced permissions, shared budget charging, cancellation/orphan recovery. |
| Candidate isolation/evaluation | PASS within local TCB | Exact Git candidate snapshot, read-only bundle, authenticated external evaluator, failure recovery. |
| Promotion/rejection/rollback | PASS | Qualification and deployment decisions are separate, signed, append-only, and CAS protected. |
| Threat controls | PASS only for enumerated local tests | Host root/kernel and distributed containment remain out of scope. |
| Reproducibility | PASS for deterministic profile | Pinned toolchain, fake provider, schemas, full test and verifier command. |

## Research hypotheses

| Hypothesis | Result | Reason |
|---|---|---|
| H1: attribution-guided bounded mutation lowers pass→fail regression | NOT TESTED | Public deterministic fixtures are diagnostic and cannot serve as independent evidence. |
| H2: frozen evolved harness improves sealed pass@1 | NOT TESTED | No provider and no sealed final run. |
| H3: layered evidence reduces tokens without quality loss | NOT TESTED | Accounting exists; paired provider rollout does not. |
| H4: cross-model transfer | NOT TESTED | No first or second live model contract was executed. |

No hypothesis is treated as supported, and no p-value, confidence interval, or effect size is invented.

## Baseline and budget readiness

B0–B6 semantics, B5 size matching, B6 attribution ablation, Track A/Track B separation, K=5 slots,
phase accounts, failed/cancelled/cached usage, tool calls, feedback, descendants, background jobs, and
wall time are represented in executable contracts. The exact provider/model revision and numeric
rollout caps remain pilot-pending. Filling them requires a real provider credential and a new signed
protocol freeze before gate/final access.

## Data status

- HarnessFaultBench mine IDs and semantic development executions exist.
- Gate, sealed single-fault, sealed multi-cause, and temporal task bodies are not admitted to the public
  proposer path.
- Terminal-Bench 2.1 45/10/34 IDs are frozen from the cited repository, but no task body was executed.
- Published diagnostic artifacts remain permanently `publicDevelopment=true` and cannot be laundered
  into confirmatory evidence.

## Negative results and deviations

The public-development publication deviation, structural-oracle contamination, rejected mutation
paths, and non-promotable diagnostic outputs remain preserved. Architect approval of deterministic
plumbing is not substituted for evaluator evidence. The absence of a provider experiment is reported
as an unresolved research obligation rather than disguised as a successful self-evolution result.

## Final gate

- **Architecture:** APPROVE for deterministic MVP.
- **Correctness/reproducibility:** APPROVE within pinned local profile after `npm run verify:release`.
- **Security:** APPROVE only for the enumerated local threat model; no certification claim.
- **Novelty:** REVISE until the combined systems contribution is evaluated against prior art and
  baselines with independent evidence.
- **Generalization/performance:** REVISE; unexecuted.
- **Overall research claim:** **REVISE**, not APPROVE and not BLOCK.

`BLOCK` becomes mandatory if a future run leaks gate/final data, changes immutable components, uses
unmatched compute, fails audit replay, or cannot reproduce the frozen result.
