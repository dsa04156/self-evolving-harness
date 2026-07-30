# Gap Analysis

## Problem that is already solved

Existing systems demonstrate each of the following in isolation or in overlapping combinations:

- production-grade agent loops, tools, permissions, events, and durable sessions;
- deterministic operations control, recovery, and receipts;
- reusable skills/hooks/adapters;
- filesystem candidate archives and worktrees;
- observability-driven trace analysis;
- weakness mining, bounded proposals, regression validation, and rejected-edit memory;
- open-ended whole-agent code evolution; and
- matched-budget criticism with disjoint Terminal-Bench 2.1 splits.

Building another loop around a model, or another `evaluate → edit → rerun` script, would not be a
meaningful contribution.

## Genuine unresolved systems question

Can one standalone coding-agent runtime make harness evolution a first-class lifecycle while preserving
an enforceable separation between:

1. session-local execution/retry/recovery;
2. versioned mutable harness components;
3. observed evidence and inferred causal explanations; and
4. immutable evaluation, data, permissions, budgets, identity, promotion, and audit?

The inspected prior art does not demonstrate this complete enforcement boundary and its deterministic
failure-attribution evaluation in one independent runtime.

## Proposed answer

The design adds three linked contracts:

- **Typed version contract:** every candidate is a new `HarnessVersion` over a content-addressed
  component DAG; mutation authority is checked against `mutableClass`.
- **Evidence contract:** operational facts and verifier outcomes are hash chained; attributions are
  explicitly labelled inferences with source events, confidence, producer, and alternatives.
- **Trust contract:** proposer, evaluator, and promoter are different principals. Candidate worktrees
  provide file lineage only; sandbox/UID/container policy provides authority isolation. Sealed data,
  model identity, budgets, evaluator, and audit are never mounted writable—or, for the proposer,
  mounted at all.

## What would make the gap collapse

The project is not sufficiently distinct if any of these occur:

- runtime execution is delegated to Codex, Gajae-Code, OpenCode, NexAU, DeepAgent, or another agent
  harness;
- “evolution” merely edits an active prompt or retries the same task;
- components are free-form files without immutable manifests and candidate versions;
- evaluator separation is only a prompt instruction or directory convention;
- attribution is unmeasured LLM explanation rather than tested against injected defects;
- final tasks influence mutation, thresholds, or protocol choices;
- compute matching covers only iteration count while hiding tokens, model calls, tools, or wall time.

## Research risks

1. **Novelty risk:** Self-Harness already contains bounded proposals, explicit lineage, held-out
   regression, and rejected-edit logging. The contribution must therefore be systems enforcement and
   evaluation, not those algorithmic ideas.
2. **Effect-size risk:** the 2026 evaluation critique found only marginal held-out transfer. The expected
   result may be negative.
3. **Attribution risk:** component defects can interact, making a single top-1 cause artificial. The
   benchmark therefore includes a sealed multi-cause set and reports top-k/recall.
4. **Isolation risk:** a Git worktree is not a security boundary. Process identity, mounts, network, and
   output channels must be tested adversarially.
5. **Budget risk:** meta-agent calls can silently add compute. A single ledger must charge solver,
   proposer, judge, summarizer, and evaluator-side model calls consistently.
6. **Benchmark risk:** synthetic attribution accuracy may not predict real Terminal-Bench improvement.
   The two tracks must be reported separately.

## Gate 1 recommendation

Proceed only as a **conditional systems prototype**. Gate 1 should approve the contracts and an ADR, not a
performance or novelty claim. If the external architect concludes that content-addressed component
lifecycles plus a separated trust plane are insufficiently distinct from Self-Harness/AHE, the correct
decision is `REVISE`.
