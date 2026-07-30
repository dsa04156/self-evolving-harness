# Data Access and Feedback Policy

Status: Gate 1R design contract

## Dataset roles

| Role | Purpose | Proposer visibility | Solver visibility | Evaluator visibility |
|---|---|---|---|---|
| `D_mine` | weakness mining and candidate generation | redacted task reports and authorized source events | current task input | full read-only |
| `D_gate` | one non-adaptive candidate selection | none while candidate writing is possible; phase-closed aggregate report is non-actionable | current task only in isolated evaluation | full read-only |
| sealed HFB final | final attribution measurement | none | current deterministic task only | final-unlock read-only |
| Terminal-Bench withheld public test | final performance/matched-budget measurement with public-contamination caveat | no cross-task evolution; task-specific Track A methods see only current task | current task after final unlock | final-unlock read-only |
| temporal holdout | post-freeze replication | none | current task in final replication | final-unlock read-only |
| dedicated pilot | fill enumerated pending margins/budgets/seeds | allowed pilot report | current task | pilot authorization only |

The solver necessarily receives a task it is solving. Data confidentiality applies to proposer,
cross-task memory, unselected methods, paths, verifier detail, and future adaptation—not to the current
task input inside an authorized evaluator sandbox.

## Non-adaptive gate transaction

1. Each evolutionary method generates at most five content-addressed candidates using `D_mine` only.
2. The complete batch, order commitment, proposal seeds, and hashes are sealed.
3. Proposer processes stop and their write/provider capabilities are revoked.
4. Each candidate is evaluated once in one `D_gate` batch.
5. The promoter applies the frozen lexicographic selection rule and chooses at most one artifact.
6. Only after selection, a single bounded aggregate report is released to reporting/audit. It cannot be
   consumed by another proposer run under this protocol.
7. Every candidate result and the selection packet count as feedback events, including failed or
   cancelled releases.

Maximums and exact fields are in `configs/gate-feedback-policy.yaml`. A second gate query, replacement
candidate, per-task result, diagnostic, or proposer access invalidates the protocol run.

## Principal mounts

### Proposer

Readable:

- redacted `D_mine` evidence packet;
- parent whole-harness manifest and mutable parent payloads;
- protocol type registry, mutable payload schemas, mutation contract;
- rejected-proposal summaries scrubbed of gate/final details.

Writable:

- one staging worktree and content-addressed proposal output under its phase capability.

Absent:

- benchmark root/split paths, `D_gate`, any final role, evaluator/verifier code or output;
- trust-plane configuration, deployment pointer, provider key, audit/promoter/evaluator keys;
- other candidate worktrees and runtime memory.

### Evaluator

Readable:

- exact protocol, evaluator/verifier, parent/candidate manifests, runtime-state snapshot;
- only the split authorized by an opaque phase/task capability.

Writable:

- fresh paired workspaces and a bounded result/artifact channel.

It cannot change candidates, policies, splits, budgets, registry, or audit history.

### Promoter

Readable:

- static-validation, mine, gate, offline-canary and audit records allowed by the metric matrix.

Absent:

- task content, verifier detail, final results, provider capability, proposer worktree.

It signs a decision and requests whole-harness CAS; it does not write a filesystem pointer directly.

The principal/mount/network/secret matrix is authoritative in
`docs/architecture/principal-capability-matrix.md`.

## Split commitments

- HarnessFaultBench IDs and role membership are in `benchmarks/splits.json`; executable semantics are
  frozen by `FIXTURE_SPEC.md` before fixture implementation.
- Terminal-Bench 2.1 uses the exact public 45/10/34 IDs from
  `rethinking-harness-evolution/code@ffd1ba1c2c3e31099264f630b9ed44aec63a86a7`.
- Its 34-task final role is named `withheldPublicTest`, not sealed.
- Task bodies live outside candidate repositories; Git worktrees are not access control.
- Final role capabilities require Gate 3 protocol freeze and one signed final-batch authorization.
- Every access logs principal, protocol, dataset role, opaque handle, purpose, and content commitment.

## Final-result transaction

Before unlock, all method artifacts, seed count, task order/randomization, analysis code, and report
tables are content-addressed. One evaluator batch may execute all preregistered frozen methods so paired
comparisons share conditions. No method is added after results are visible.

Task-level final traces remain evaluator-only. Aggregate and paired analysis artifacts release only after
the batch is finalized and audit heads are published. Final crashes follow the preregistered failure rule;
they cannot trigger candidate repair. A confirmed environment-wide incident can cause a symmetric,
method-blinded batch rerun only under the incident rule.

## Leakage response

Any unauthorized read, mount, message, error side channel, task body, verifier detail, ground-truth
label, task-level result, or cross-task final memory write:

1. emits `data_access_violation`;
2. invalidates the affected candidate/batch;
3. blocks promotion and final claims;
4. rotates genuinely confidential task material when possible;
5. requires a new protocol if confidentiality or analysis independence cannot be restored.

Public Terminal-Bench exposure before the experiment is a contamination limitation, not a security
breach. Experiment-created access outside the policy is still a protocol violation.
