# Statistical Analysis Plan

Status: Gate 1RR design contract; seed count and explicitly named margins follow frozen mine/pilot-only
rules before any gate or final observation

## Experimental units

The primary sampling unit is the task. Rollout seeds are repeated stochastic measurements nested within a
task, not independent tasks. Reports show both task count `n` and rollout count `S`; they never report
`n × S` as the confirmatory sample size.

For method `m`, task `t`, and matched rollout seed `s`, let `Y[m,t,s]` be binary success. Define:

```text
task_success[m,t] = mean_s Y[m,t,s]
pass_rate[m] = mean_t task_success[m,t]
Delta(m,c) = mean_t (task_success[m,t] - task_success[c,t])
```

The primary H2 estimand is the task-average paired pass@1 risk difference `Delta(B6, comparator)` in
percentage points on the final task population.

## Regression estimand

Let the static parent outcome be `P[t,s]`. For tasks with at least one parent success:

```text
task_regression[m,t] =
  sum_s I(P[t,s]=1 and Y[m,t,s]=0) / sum_s I(P[t,s]=1)

regression_rate[m] = mean_eligible_t task_regression[m,t]
absolute_reduction(m,c) = regression_rate[c] - regression_rate[m]
relative_reduction(m,c) = absolute_reduction(m,c) / regression_rate[c]
```

If the control regression rate is zero, relative reduction is undefined and the relative-reduction claim
is not supported. Eligible-task count and parent-success denominator are reported.

H1a compares B6 with B6-ABL to estimate the incremental value of explicit attribution under the same
bounded surface. H1b compares B6 with mandatory B5-SM to evaluate the complete structured method against
a size-matched free-form control. B5-U is descriptive.

## Cost/efficiency estimand

H3 is the paired dedicated mine/pilot comparison B6 versus B6-RAW. Both begin from the same source-event
and deterministic cluster commitments and end at their selected candidate commitments. Primary cost
includes every inference role:

```text
total_system_charged_tokens =
  summarization + mining + attribution + proposal + judge
  + subagent + background + any differing solver inference

cost_ratio = total_system_charged_tokens_B6
             / total_system_charged_tokens_B6_RAW
```

Provider cost micros is co-reported; proposer-context tokens are secondary only. Shared trace-generation
cost is identical and reported both excluded (incremental) and included (standalone). H3 material effect
requires an interval upper bound below `0.80`, not only a point estimate.

Both arms use five fixed candidate slots and the same mine/pilot selector. Invalid, absent, timed-out,
or exhausted slots have quality zero, remain fully charged, and cannot be replaced. Quality
non-inferiority is paired on mine/dedicated-pilot tasks, never `D_gate` or final:

- top-1 attribution margin cannot exceed one HarnessFaultBench mine task: `1/28 = 3.571` percentage
  points;
- selected-candidate targeted-repair pass-rate margin cannot exceed one dedicated-pilot repair task; if
  that set has 45 tasks its maximum is `1/45 = 2.222` points, otherwise it is exactly one divided by the
  frozen task count;
- both are accepted for confirmatory use only if the dedicated pilot demonstrates at least 80% power at
  the frozen rollout count under paired simulation. If not, H3 remains exploratory; margins are not
  widened.

Safety, permission, data, immutable, and audit violations have margin zero.

## Rollout-seed precision rule

Candidate/proposal slots always use the five fixed seeds in the budget contract. Final rollout count `S`
is selected using only dedicated pilot or `D_mine` outcomes:

1. evaluate candidate counts `S ∈ {2, 3, 5, 8}`;
2. for each `S`, use the first `S` values from a precommitted seed stream derived from
   `SHA-256(protocol-draft-seed || index)`;
3. estimate paired-difference variance using the planned hierarchical bootstrap;
4. choose the smallest `S` for which both:
   - Monte Carlo standard error of the overall paired risk difference is at most 1.0 percentage point;
   - seed-level variance contributes at most 20% of total estimated variance.
5. If none qualifies, freeze `S=8`, label the study precision-limited, and do not widen effect or
   non-inferiority margins.

The selected count and exact seed values are signed into the protocol before `D_gate` or final access.

## Hierarchical paired bootstrap

Primary intervals use 10,000 deterministic bootstrap replicates:

1. resample tasks with replacement within preregistered benchmark strata;
2. within each sampled task, resample the matched seed indices with replacement;
3. retain the full vector of method outcomes for every selected task/seed so pairing is never broken;
4. calculate task-level means first, then the task-average estimand.

The bootstrap RNG seed and implementation hash are protocol pins. Two-sided 95% percentile intervals are
primary; exact paired counts and a sensitivity analysis using task-only resampling are reported.
HarnessFaultBench deterministic metrics use exact binomial intervals and no pseudo-seeds.

## Primary comparison hierarchy and multiplicity

1. **Trust gate:** zero immutable/safety/permission/data/audit violations and valid protocol/evidence.
   Failure stops all performance claims.
2. **H1 family:** B6 vs B6-ABL and B6 vs B5-SM regression contrasts. Holm correction controls familywise
   two-sided alpha 0.05. The full H1 wording requires both corrected intervals above zero; the
   preregistered ≥25% relative-reduction wording additionally requires the B5-SM relative-reduction
   interval lower bound to be at least 25%.
3. **H2 family:** B6 vs B0 and B6 vs B4 final pass@1 risk differences. Holm correction at familywise
   alpha 0.05; both must be strictly positive.
4. **H3:** tested only after H1/H2. Cost superiority and both quality non-inferiority conditions form an
   intersection-union claim; the two quality intervals additionally use Holm adjustment.
5. **Matched-budget scaling:** B6 must beat B1, B2, and B3 in Track A with Holm-adjusted positive
   intervals. Otherwise no “better than test-time scaling” wording.
6. **H4 transfer:** exploratory under the Gate-3-frozen second-model contract, one matched model-2 pass
   for B0 and frozen B6, no model-2 evolution or retuning; no confirmatory wording.

Ablations beyond mandatory B6-ABL, benchmark subgroups, cross-model transfer, and B5-U causal
interpretation are exploratory with exact intervals and no significance language.

## Candidate selection and gate statistics

Gate p-values are not confirmatory. All candidates are generated before a single gate batch; one frozen
selection rule chooses one artifact. Final held-out analysis absorbs selection without reusing gate data.

The candidate gate non-inferiority margin remains `PILOT_PENDING`. It is chosen from mine/dedicated-pilot
paired variance and the actual gate task resolution, by the smallest predeclared grid value that achieves
80% retention probability for a truly equal candidate while preserving the maximum tolerated loss
approved at Gate 3. If no value satisfies both, the protocol is revised before gate access rather than
widening the margin after observation. The prior ad hoc −2 point margin is withdrawn.

## Missingness and incidents

Timeout, malformed output, budget exhaustion, missing usage, and candidate-attributable evaluator/verifier
failure are failures. A frozen, method-blinded infrastructure classifier may authorize one symmetric
batch rerun. Original and rerun records remain. No task or method is excluded after labels/results are
unblinded.

## Analysis freeze and reporting

Before final unlock, the analysis program, table shells, method artifacts, task/seed commitments,
bootstrap seed, comparison hierarchy, and protocol hashes are frozen. All point estimates, adjusted and
unadjusted intervals, negative candidates, failures, exclusions, evolution cost, final cost, and
contamination limitations are reported.
