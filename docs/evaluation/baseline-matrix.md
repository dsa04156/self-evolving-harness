# Executable Baseline Matrix

Status: Gate 1R design contract

All compared arms use the same provider/model configuration, immutable runtime/tool/policy set,
environment snapshot, task order commitment, input visibility for that arm, and host-side accounting.
`B0` is a low-compute anchor; it is not described as receiving equal development compute.

## Method definitions

| Arm | Mutable artifact | Attribution output | Scope | Feedback | Reusable Track B artifact |
|---|---|---|---|---|---:|
| B0 Static | none | none | one direct trajectory | none before final answer | initial harness anchor |
| B1 Parallel sampling | none | none | up to five independent trajectories | outcomes used only by fixed selector | no |
| B2 Sequential refinement | none | none | up to five attempts; later attempts see prior standardized packet | one packet per completed attempt | no |
| B3 Task-specific harness scaling | ephemeral current-task harness | none | up to five solve/mutate cycles; never reused/promoted | one packet per completed attempt | no |
| B4 Prompt-only evolution | `SystemPrompt` only | no component attribution | five candidates in Track B | mine only, then one gate batch | yes |
| B5-U Free-form mutable-bundle rewrite | any/all MVP-mutable declarative components | no required attribution | unconstrained within immutable boundary and method budget | mine only, then one gate batch | yes |
| B5-SM Size-matched free-form control | any MVP-mutable declarative component(s) | no attribution | candidate/component/closure-size matched to B6 | identical to B6 except attribution | yes |
| B6-ABL Bounded attribution ablation | same bounded grammar as B6 | **withheld** | same candidate count, component-count envelope, closure edit-size envelope, preservation fields, and proposal budget as B6 | identical to B6 | yes |
| B6 Proposed | bounded declarative components | ranked `AttributionResult` | one component for single cause, at most two explicit multi-cause, expanded closure ceiling | mine only, then one gate batch | yes |

`B5-SM` and `B6-ABL` are mandatory controls, not optional ablations and not additional headline B
numbers. B5-U is reported but cannot identify the effect of attribution or boundedness.

## B5-SM matching

For each preregistered B6 candidate slot, the trusted controller releases to the B5-SM proposer only:

- candidate slot and proposal seed;
- target changed-component count, without component identities;
- target expanded-closure edit bytes and replacement-surface bytes;
- common total proposal/model/tool/time/feedback limits.

B5-SM must be within ±10% of both byte measures and have the same changed-component count. It receives no
attribution, target component, predicted mechanism, or B6 gate outcome. Failure to construct a valid
match inside the common proposal budget is a failed candidate slot; limits are not expanded.

## B6-ABL matching

B6-ABL receives the same raw/layered mine evidence condition, payload schemas, one/two-component rule,
8 KiB defense ceiling, candidate count, proposal seed, preservation/rejected-edit requirements, and
numeric size envelope as B6. It does not receive the ranked component IDs, scores, or mechanism text in
`AttributionResult`. It must explicitly record `attributionMode: ablated`.

Because a proposer can still reason about failures, this contrast estimates the incremental value of the
explicit attribution artifact/workflow, not an impossible condition of “no causal reasoning.”

## Track A: matched task-time compute utility

`K_A = 5` means five maximum solver-attempt slots per task for B1–B6. B0 uses exactly one and leaves the
rest unused.

- One fixed seed is assigned to each slot: `1729`, `271828`, `314159`, `161803`, `57721`.
- B1–B6 share the exact total provider-call, charged-token, tool-call, feedback, wall-clock, process,
  CPU, memory, and output caps.
- All solver, reflection, summarization, attribution, proposal, judge, subagent, and background work
  debits that one task-search envelope. Meta work can therefore leave insufficient budget for all five
  solver slots.
- Adaptive arms receive only the standardized prior-attempt packet: binary outcome, closed failure class,
  and usage. No arm receives hidden verifier diagnostics.
- B3–B6 task-specific artifacts are ephemeral and cannot enter memory, another task, deployment, or the
  reusable-harness claim.
- Unused budget expires; it cannot move to another task, seed, phase, or method.

Track A supports compute-allocation and test-time-scaling comparisons only.

## Track B: reusable harness

`K_B = 5` means five complete candidate-manifest slots per evolutionary arm, generated as a non-adaptive
mine-only batch with the five fixed proposal seeds. It is not solver retry count.

| Phase | B0 | B4 | B5-U | B5-SM | B6-ABL | B6 |
|---|---:|---:|---:|---:|---:|---:|
| shared `D_mine` trace corpus | performance anchor receives no development | same corpus | same | same | same | same |
| candidate slots | 0 | 5 | 5 | 5 | 5 | 5 |
| gate evaluations | 0 | one/candidate | one/candidate | one/candidate | one/candidate | one/candidate |
| adaptive gate replacements | 0 | 0 | 0 | 0 | 0 | 0 |
| selected frozen artifacts | initial | at most 1 | at most 1 | at most 1 | at most 1 | at most 1 |
| final trajectories/task/rollout seed | 1 | 1 | 1 | 1 | 1 | 1 |
| final mutation/reflection/retry | none | none | none | none | none | none |

B4–B6 arms receive equal development cap vectors for all common phases. B0 has zero evolution cost and is
reported as a performance/cost anchor, not a matched-development method.

## Feedback/data contract

- Candidate generation sees `D_mine` only.
- Complete candidate batches are sealed before `D_gate`.
- One gate evaluation per candidate and one fixed selection occur.
- The proposer is stopped before gate and cannot act on the aggregate report.
- Final roles never select, promote, tune, repair, or roll back.

## Claims supported

| Comparison | Interpretation |
|---|---|
| B6 vs B6-ABL | incremental effect of explicit attribution under bounded, size-matched mutation |
| B6 vs B5-SM | combined structured attribution/bounded workflow versus size-matched free-form selection |
| B6 vs B5-U | descriptive robustness versus unconstrained mutable-bundle search |
| B6 vs B4 | added value beyond prompt-only evolution |
| B6 vs B0 in Track B | frozen reusable-harness improvement, with evolution cost separately reported |
| B6 vs B1/B2/B3 in Track A | matched task-time compute allocation; requires multiplicity-controlled superiority to all three |

## Failure and incident accounting

Budget exhaustion, malformed output, candidate-attributable verifier crash, timeout, denied capability,
missing usage, and invalid evidence are failures. A method-blinded environment-wide incident may trigger
one symmetric batch rerun only when the frozen incident classifier says infrastructure—not candidate—
caused it. Original attempts and the rerun remain in the audit trail.
