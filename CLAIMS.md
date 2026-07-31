# Claim Registry

Status: **preregistered; no performance result exists**

## Architectural claims

### C-A1 — Independent runtime ownership

The system owns its model loop, context, tools, session, evidence, verification, and recovery. It
does not invoke Codex, Gajae-Code, OpenCode, or another coding-agent runtime as its core executor.

Required evidence: executable call graph, provider/tool fakes, source/import inspection, and process
evidence proving that an agent run does not invoke an external harness binary. Codex CLI may be present
and used to develop the repository; presence in the development environment is not a runtime
dependency.

### C-A2 — Lifecycle separation

Task retry/recovery and harness evolution are separate state machines. An evolution event cannot
exist without a new immutable version manifest.

Required evidence: schema constraints, transition tests, forged-event rejection, and audit replay.

### C-A3 — Bounded mutable authority

MVP candidates can modify only the preregistered component surface. Evaluator, data, permissions,
model identity, budgets, audit, tool implementations, middleware, and optimizer remain unchanged.

Required evidence: process/permission tests, immutable diff gate, content hashes, and adversarial
mutation tests.

## Confirmatory research claims

### C-H1 — Explicit attribution and the bounded method lower regression

H1a compares B6 with mandatory size-matched `B6-ABL` to estimate the incremental value of the explicit
attribution artifact. H1b compares B6 with mandatory size-matched free-form B5-SM. Strong H1b wording
requires a multiplicity-adjusted relative-regression-reduction lower bound of at least 25%.

Falsified when either corrected contrast fails, size/compute/feedback matching fails, or only unmatched
B5-U is favorable.

### C-H2 — Reusable held-out improvement

After equal evolutionary budgets among B4–B6 and identical final per-pass contracts, a frozen evolved
harness improves final held-out pass@1 over static and prompt-only harnesses. Static B0 has zero evolution
cost and is an anchor, not an equal-development-budget arm.

Falsified when improvement is absent, limited to mine/gate splits, confidence intervals include
zero, or extra task retries explain the effect.

### C-H3 — Layered evidence efficiency

In a dedicated paired experiment, B6 layered evidence reduces total charged system inference by at least
20% without materially reducing mine/dedicated-pilot attribution or selected-candidate targeted-repair
quality relative to `B6-RAW`. The arms differ only in evidence representation.

Falsified when the total-cost ratio interval is not below 0.80, work is shifted to another role, or
quality crosses a pilot-validated task-resolution margin. Proposer tokens are secondary.

### C-H4 — Cross-model transfer (stretch)

A harness evolved on model 1 transfers positively to a Gate-3-frozen second model without re-evolution,
retuning, or candidate reselection. Model-2 B0 and frozen B6 receive one matched pass per task/seed and
model 2 receives zero evolution calls.

H4 is exploratory and is withdrawn before results if the complete second-model contract cannot be frozen
before the first Track B candidate. It is unsupported by negative/inconclusive transfer, drift, or any
model-specific retuning.

## Claim-strength rules

- Under development profile `NP-1`, only deterministic architectural-conformance evidence is
  generated. The live OpenAI adapter, benchmark, and all C-H1–C-H4 claims remain unexecuted and
  unsupported.
- A single improved score is reported as a case result, never as self-improvement.
- Training/validation gains without final held-out gains support only an engineering case study.
- “Better than test-time scaling” requires Holm-adjusted positive intervals versus all three
  preregistered parallel, sequential, and task-specific scaling baselines.
- Terminal-Bench is always described as a withheld public test with contamination risk.
- Security wording is limited to the exact Gate 2 OS-boundary adversarial tests; hashes are
  tamper-evident under stated assumptions, not tamper-proof.
- If performance gates fail, claims contract to architecture, safety boundaries, observability,
  or negative results.
- Leakage, unmatched compute, immutable-boundary violations, or failed replication produce
  `BLOCK`, not a softened performance claim.

## Current evidence status

Evidence snapshot: implementation commit
`5bd8061c6d16af2271320f9a60127b03be71dc7e`, tree
`8d0113de86a79bb0a95aa48c48817520acf7c55e`.

| Claim | Current status | Evidence boundary |
|---|---|---|
| C-A1 | partially supported | Local source/import inspection and deterministic runtime tests find no Codex, Gajae-Code, or OpenCode invocation. The real-provider path is intentionally unexecuted under `NP-1`, so no live process-level provider claim is made. |
| C-A2 | deterministically supported | The signed evolution-run journal requires a new candidate ID distinct from its parent, enforces an independent lifecycle, and passes approve, reject, failure, replay, and illegal-transition tests. |
| C-A3 | deterministically and locally OS-boundary supported | Registry, closure, admission, canonical bundle, exact Git snapshot, external evaluator, and immutable-boundary tests pass within the documented local TCB. The same registry-generated candidate bundle passes under operations UID 1101 and evaluator UID 1103; a signed candidate-ID substitution is rejected. |
| C-H1–C-H4 | unexecuted and unsupported | No candidate attribution-performance run, live provider, gate, final, temporal evaluation, or B0–B6 comparison has run. |

HarnessFaultBench has 28 superseded structural-oracle plumbing fixtures and a persisted development
commitment. Their runner selected outcomes from ground-truth component and manifest identities, so the
28/28 result proves only structure/scorer plumbing. A signed governance deviation classifies the full
artifact graph as development-only, non-confirmatory, and unauthorized for research evidence. It is
not evidence for C-H1–C-H4.

The current result is an architectural-conformance artifact. It is not evidence that the harness
improves itself, generalizes, beats a baseline, or performs safely outside the stated local threat model.
