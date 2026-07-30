# Harness Evolution Loop

Status: Gate 1R design contract

## Contract

```text
multiple execution traces
→ weakness mining
→ failure clustering
→ component attribution
→ bounded mutation
→ new HarnessVersion
→ isolated validation/evaluation
→ promote, reject, or rollback
```

The evolution loop consumes completed execution evidence; it does not hijack a running session. Its unit
of change is a new `HarnessVersion`.

## Data roles

- `D_mine` may be used for weakness mining, attribution, and proposal generation.
- `D_gate` is held out from proposal generation and is used once by the evaluator for non-adaptive
  candidate selection. The complete candidate batch is sealed and proposer write/provider capability is
  revoked first.
- Final roles comprise genuinely sealed HarnessFaultBench fixtures where governance permits that label,
  a **withheld public** Terminal-Bench test, and a separately governed temporal holdout. None can promote,
  repair, tune, roll back, or select a candidate.

Thus “held-out candidate evaluation” means `D_gate`; it never implies access to a final role.

## Sequence

1. **Snapshot baseline.** Resolve the whole-harness deployment pointer and pin protocol, exact manifest,
   runtime-state snapshot, budget/model/environment, type registry, and `D_mine` commitment.
2. **Collect experience.** Run independent task sessions. Freeze their event chains, verifier outcomes,
   artifacts, usage, and completion receipts.
3. **Layer evidence.** Convert raw events into deterministic per-task reports, then cross-task failure
   patterns. No inference is silently upgraded to fact.
4. **Attribute.** Produce ranked component-cause hypotheses with source event references, confidence,
   alternatives, and producer identity. HarnessFaultBench supplies known injected-fault ground truth for
   measuring this stage.
5. **Propose.** Select one primary mechanism, enforce the bounded mutation contract, check rejected-edit
   memory, and write a proposal. The proposer cannot modify optimizer code, policy, evaluator, data,
   budgets, tool implementations, middleware, model identity, trace/audit code, or promotion logic.
6. **Create candidate batch.** Materialize at most five mine-only candidate manifests. Lifecycle,
   provenance, and lineage are external records; the parent remains active.
7. **Isolate.** Create a Git worktree for file lineage. Launch static validation and evaluation under a
   separate OS/container principal with candidate mounts read-only during execution.
8. **Statically validate.** Validate schemas, DAG, hashes, declared diff, import/capability policy,
   immutable closure, secret scan, and audit ancestry. Failure transitions to `rejected`.
9. **Evaluate independently.** After the batch is sealed and proposer stopped, re-run parent/candidates
   from byte-identical fresh snapshots with common model/task/order/environment/verifier/caps/seeds.
10. **Select once.** Evaluate every candidate at most once in one gate batch. The promoter applies the
    frozen rule; no result can generate a replacement candidate.
11. **Canary.** The selected candidate may run only offline replay or isolated synthetic canary tasks.
    No live user/repository or final task is a canary.
12. **Decide.** Sign promote/reject and request a whole-harness CAS over expected parent, generation, and
    prior pointer hash. Append lifecycle/deployment/audit records; preserve every candidate and failure.

## Gate contract

### Deterministic

- schema validation: 100%;
- immutable file/component diff: zero;
- safety and permission violations: zero;
- audit hash chain: valid;
- rollback restores content hashes exactly to baseline;
- previously passing deterministic tasks with pass→fail: zero.

### Attribution

- HarnessFaultBench single-fault top-1 accuracy: at least 70%;
- single-fault top-3 accuracy: at least 90%;

These are a one-time `D_gate` protocol-readiness gate for the frozen attribution system, not a per-
candidate adaptive query. Multi-cause recall@2 ≥70% is final reporting only and absent from promotion.

### Candidate performance

- at least one targeted `D_mine` failure improves;
- `D_gate` point estimate is no worse than the parent;
- paired non-inferiority margin is filled only by the mine/pilot precision rule before gate access; the
  prior arbitrary −2 point value is withdrawn;
- the exact >10% token-cost exception uses the fixed pass-count/net-conversion/smoothed-efficiency formula
  in `phase-budget-ledger.md`; prose cannot override it;
- safety and permission violations remain zero.

Data/immutable/audit violations also remain zero. Threshold changes require a new protocol ID and exclude
prior runs from confirmatory pooling.

## Evidence packet

Each proposal/evaluation decision links:

- protocol, parent/candidate manifest and runtime-state snapshot hashes;
- failure patterns and attribution;
- changed component refs and canonical diff;
- predicted fix, preservation cases, and predicted regressions;
- rejected-edit nearest matches;
- static-validation results;
- per-task paired outcomes and complete usage ledger;
- evaluator and promotion-policy identities;
- promotion/rejection/rollback reason codes.

## Rollback

Rollback is a lifecycle decision, not an undo command. The promoter:

1. verifies the active version and recorded rollback pointer;
2. re-resolves and hashes the target and exact external lineage/decision;
3. appends one whole-harness deployment CAS record;
4. marks the failed version `rolled_back`;
5. records trigger evidence and before/after IDs;
6. starts new sessions only on the restored version.

Historical sessions, components, proposals, evaluations, and audit events remain intact.

## MVP limitation

The proposer is not self-modifying. Optimizer code, evaluator, model weights, tool implementations, and
middleware are outside the search space. Any later meta-evolution requires a new threat model, evaluator,
protocol, and Architect gate.
