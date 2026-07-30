# Falsification Contract

The project defaults to `REVISE` or `BLOCK` when evidence does not support its exact claim. A retry,
reflection, prompt reinjection, one favorable seed, or mine/gate gain is never called general
self-improvement.

## H1 is falsified when

- B6 does not reduce regression versus B6-ABL after correction;
- B6 does not reduce regression versus B5-SM after correction;
- B5-SM/B6-ABL candidate, component-count, closure-size, feedback, or compute matching fails;
- the ≥25% relative reduction lower bound is not reached for the strong H1b wording;
- the result exists only versus unmatched B5-U;
- added inference/feedback or a different final task-time contract explains the difference; or
- any trust-plane violation occurs.

## H2 is falsified when

- either B6−B0 or B6−B4 corrected final pass@1 interval includes zero or is negative;
- improvement occurs only on mine/gate;
- the selected manifest changes after gate;
- final evaluation uses retry, reflection, oracle selection, task-specific mutation, unequal tools, or
  unequal per-pass budgets;
- public-test contamination is hidden; or
- temporal replication declines when a temporal-generalization claim is attempted.

## H3 is falsified or demoted when

- the total-system charged-token ratio interval is not below 0.80;
- work is merely shifted from proposer to summarizer/attribution/judge/subagent;
- a quality lower bound crosses its frozen non-inferiority margin;
- pilot power is inadequate (demote to exploratory; do not widen);
- trace compression loses source-event drill-down;
- failed/cancelled/cached/reasoning/background calls are missing; or
- raw/layered arms receive different data or feedback.

## H4 is unsupported when

- the second model was selected after seeing results;
- any model-specific retuning/re-evolution occurs;
- point estimate is nonpositive or interval includes zero; or
- the target provider/model contract drifts incompatibly.

## Claim disposition

| Evidence | Disposition |
|---|---|
| Trust gates, H1 family, and H2 family pass | bounded performance wording may proceed to final Architect review |
| Architecture works but H1 or H2 fails | `REVISE`; restrict to architecture, attribution measurement, safety design, or negative results |
| B6 fails any corrected B1/B2/B3 comparison | delete test-time-scaling superiority wording |
| Only train/validation improves | `REVISE`; report overfitting |
| Temporal result is negative | no temporal-generalization claim; report negative result |
| Leakage, unmatched compute, evaluator impersonation, protocol mixing, immutable mutation, or atomic-activation failure | `BLOCK` |
| Audit replay or independent reproduction fails | `BLOCK` |

## Amendment rule

Mine/dedicated pilot may fill only fields explicitly marked `PILOT_PENDING`: exact model/environment/caps,
final rollout count/seeds, second model identity, and predeclared margin fields. It cannot change task
IDs, role membership, hypotheses, evaluator, fixture semantics, baseline definitions, primary estimands,
comparison hierarchy, or report selection.

Any post-freeze change produces a new protocol ID. Results from different protocols cannot be pooled as
one confirmatory experiment.
