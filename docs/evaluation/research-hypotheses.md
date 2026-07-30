# Preregistered Research Hypotheses

Status: Gate 1R design contract; no performance result exists  
Protocol: `draft-1`

## H1 — Attribution-guided bounded mutation reduces regression

H1 is split into two preregistered contrasts to remove the original causal confound.

### H1a: explicit attribution increment

Under the same declarative mutation grammar, candidate count, component-count/closure-size envelope,
parent/evidence, proposer and evaluation budget, B6 has a lower final pass→fail regression rate than
B6-ABL, which does not receive the explicit `AttributionResult`.

This estimates the incremental value of the explicit attribution artifact/workflow. It does not claim the
ablated proposer performs no causal reasoning.

### H1b: full structured method versus free-form control

B6 has a lower final pass→fail regression rate than mandatory size-matched B5-SM. The strong wording also
requires at least 25% relative regression reduction with its multiplicity-adjusted interval lower bound
at or above 25%.

B5-U remains mandatory descriptive context but does not identify attribution because mutation surface
and edit size differ.

H1 is falsified if either primary corrected contrast fails, matching fails, extra compute/feedback is
used, or final held-out performance worsens.

## H2 — A frozen harness generalizes

A B6 harness generated on `D_mine`, selected once on `D_gate`, and frozen improves no-retry pass@1 over
both static B0 and prompt-only B4 on final held-out task populations under identical per-pass
model/tool/environment/budget contracts.

Primary outcomes:

- Terminal-Bench 2.1 withheld public test task-average paired pass@1 difference;
- temporal holdout replication as the stronger contamination-resistant generalization result.

Public Terminal-Bench exposure risk is disclosed. Search/gate gains alone, retry/test-time scaling,
artifact changes after selection, or an interval including zero do not support H2.

## H3 — Layered evidence reduces total inference cost

From the same raw trace corpus, the layered pipeline

```text
raw trace → per-task report → cross-task failure pattern → mutation evidence packet
```

uses at least 20% less **total system charged inference** than direct raw-trace proposal while preserving
mine/dedicated-pilot attribution and candidate quality.

Primary cost includes summarizer, miner, attribution, proposer, judge, subagent, background, and any
differing solver calls. Provider cost and proposer-context tokens are reported, but proposer-only tokens
cannot establish H3.

Support requires:

- cost-ratio interval upper bound below 0.80;
- attribution and candidate-quality lower bounds above the task-resolution/pilot-validated margins in the
  statistical plan;
- zero immutable/safety/permission/data/audit violations;
- source-event drill-down remains intact.

If pilot power is inadequate, H3 becomes exploratory rather than widening a margin.

## H4 — Cross-model transfer (stretch)

A B6 artifact frozen before transfer evaluation performs better than the same second model under B0,
without re-evolution, model-specific prompt changes, or method selection after transfer results.

The second provider/model identity and rollout contract are frozen at Gate 3. H4 is exploratory unless a
separate powered protocol is approved. Failure or inconclusiveness removes transfer wording but does not
invalidate the architectural claim.

## Hierarchy

1. Immutable/trust/evidence validity is a prerequisite.
2. H1a and H1b are the primary regression family.
3. H2 is the primary reusable-performance family.
4. H3 is secondary.
5. Matched-budget scaling wording requires superiority to B1, B2, and B3.
6. H4 and remaining ablations are exploratory.

Estimands, seed nesting, bootstrap, multiplicity, and margin rules are authoritative in
`statistical-analysis-plan.md`.
