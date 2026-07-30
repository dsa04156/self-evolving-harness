# Phase-Specific Budget Ledger

Status: Gate 1RR design contract; numeric fields marked `PILOT_PENDING` are frozen at Gate 3 before gate or
final access

## Phase taxonomy

Every provider, tool, feedback, process, and wall-clock event belongs to exactly one phase and method.

| Phase ID | Includes | Track A | Track B |
|---|---|---:|---:|
| `mine_trace_generation` | baseline solver trajectories and tools that create the common mine corpus | optional pilot only | yes |
| `evidence_summarization` | per-task reports, trace conversion, layered evidence | task search when used | yes |
| `weakness_mining` | clustering/failure-pattern model calls | task search when used | yes |
| `attribution` | attribution model and validation calls | B6 only | B6 and attribution experiment |
| `proposal` | prompt/mutation/reflection/subagent calls creating candidates | B3–B6 | B4–B6 |
| `static_validation` | canonical/schema/closure/security checks | yes | yes |
| `gate_evaluation` | candidate/parent solver calls, tools, binary verifier releases | no | one batch |
| `gate_selection` | fixed judge/promoter computation and released packet | no | one selection |
| `offline_canary` | isolated replay/synthetic canary | no | selected candidate only |
| `track_a_task_search` | all solver/meta/judge work under the per-task K envelope | B1–B6 | no |
| `final_solving` | exactly one pass per method/task/rollout seed | final Track A utility | final Track B |
| `temporal_replication` | frozen artifact on later temporal protocol | no | replication only |

Deterministic verifier/static-validator CPU, memory, and wall time are recorded in a separate
`deterministicCompute` section. They are never converted into model tokens.

## Provider accounting

For each attempted provider request the proxy records role, phase, method, task/candidate, request ID,
status, reservation, and provider telemetry.

```text
totalChargedTokens =
  uncachedInputTokens
  + cachedInputTokens
  + outputTokens
  + nonoverlappingReasoningTokens
```

The adapter declares whether reasoning is included in output and prevents double counting. Cached input
counts in full for matched-token caps even if priced at a discount. Provider invoice cost is separately
recorded as integer micros.

- completed call: charge provider-reported usage, bounded below by locally counted request/stream tokens;
- failed call with usage: charge the greater of provider-reported and locally observed usage;
- failed/cancelled/timeout call without final usage: charge the full reserved per-request token cap;
- rejected provider request after proxy admission: charge any observed provider usage and one call
  attempt;
- retry: a new fully charged request;
- hidden-reasoning telemetry unavailable: mark unavailable, use provider billed output/total and the
  frozen conservative estimator; comparisons using incompatible telemetry are invalid;
- cached/replayed provider response: charge the original token amount to the requesting method and mark
  cache status; methods cannot gain a free cache asymmetrically.

All roles—solver, proposer, summarizer, miner, attribution, judge, reflection, subagent, and background
job—use the sole provider proxy and the same phase account.

## Tool, feedback, and time accounting

- A tool attempt is charged after schema admission and before permission/dispatch; denied, failed, and
  timed-out attempts remain visible and charged as attempts.
- Subagent spawn, job poll/cancel, filesystem, shell, Git, and verifier-facing broker operations count.
- One signed result released for a candidate is one feedback event; the final selection packet is one
  additional event. Failed and cancelled releases count.
- Elapsed wall clock starts at phase admission and ends after final artifact/audit acknowledgement.
  Waiting on provider, child, tool, retry backoff, and cleanup is included.
- Parallel calls consume the same call/token/tool caps; parallelism does not multiply budgets.
- CPU-seconds, peak RSS, process count, output bytes, and provider concurrency are host measured.

## Equality and exhaustion

- B1–B6 Track A receive the same per-task hard cap vector and five solver-slot ceiling. B0 uses one direct
  slot and is an anchor.
- B4, B5-U, B5-SM, B6-ABL, and B6 Track B receive the same common development phase cap vector and five
  candidate slots. Method-specific phases can remain unused but cannot borrow from another phase.
- No task, candidate, seed, phase, track, or method can borrow unused resources from another.
- The first exhausted hard cap stops new work. A previously committed valid terminal result remains
  eligible; otherwise the unit fails.
- Unused cap is reported as unused and expires. No padding calls are allowed.
- A cancelled/invalid candidate still consumes every resource used before cancellation.

## Development versus final cost

Reports show, separately:

1. shared upstream `D_mine` corpus generation cost;
2. method-incremental evolution cost after that shared corpus;
3. standalone evolution cost, conservatively allocating the full shared corpus to each method;
4. gate and canary cost;
5. final inference cost per task and per successful task;
6. deterministic verifier/validator compute;
7. realized versus capped resources.

B0 has zero evolution cost. It is never described as having an equal development budget.

For a deployment volume `N`, report:

```text
expected_successes_m(N) = N * final_pass_rate_m
total_provider_cost_m(N) = evolution_cost_m + N * final_cost_per_task_m
successes_per_cost_m(N) = expected_successes_m(N) / total_provider_cost_m(N)
```

The break-even `N` is the smallest preregistered grid value where B6's successes-per-cost exceeds a
comparator. If none exists, report no break-even. This is sensitivity analysis, not observed deployment.

## Candidate operational cost gate

Formula version: `seh-candidate-cost-v1`.

Let `T` be the exact common ordered `D_gate` task set and `n = |T| > 0`. Parent and candidate must have
one terminal record for every task; no task is excluded.

- `Y[m,t] = 1` only for an authenticated verifier pass; failure, invalid output, timeout, cancellation,
  budget exhaustion, or candidate-attributable crash is zero.
- `U[m,t]` is the nonnegative integer `totalChargedTokens` from the signed phase ledger. Missing final
  provider usage is replaced by the full pre-admission reservation before this formula runs.
- `P_m = Σ_t Y[m,t]`.
- `U_m = Σ_t U[m,t]`, including failed and timed-out tasks.
- `C_m = U_m / n` charged tokens per task.
- `S_m = (P_m + 0.5) / (n + 1)`, the fixed Jeffreys-smoothed pass rate.
- `E_m = S_m / (C_m + 1 token)`, smoothed success per charged token.
- `R_C = (C_candidate + 1) / (C_parent + 1)`.
- `R_E = E_candidate / E_parent`.

The normal path requires `R_C <= 1.10`. The validator computes it without floating point:

```text
10 * (U_candidate + n) <= 11 * (U_parent + n)
```

If that inequality is false, the only high-cost exception requires every clause:

```text
10 * (U_candidate + n) > 11 * (U_parent + n)
P_candidate - P_parent >= 1
fail_to_pass_count - pass_to_fail_count >= 1
20 * (2*P_candidate + 1) * (U_parent + n)
  >= 21 * (2*P_parent + 1) * (U_candidate + n)
```

The last inequality is exactly `R_E >= 1.05`; the fixed constants are 0.5 success pseudocount in both
binary outcomes and one charged token in each denominator. Counts are over the same task pairs.
Zero observed usage is valid and still receives the one-token smoothing term. Missing usage never
becomes zero: reservation charging occurs first.

The signed `CandidateCostGate` stores the common task-set hash, all source ledger receipt IDs, integer
inputs, exact cross-product terms, selected path, and result. Validator and promoter independently recompute the integer
inequalities. A mismatch, invalid/missing ledger, unequal task set, or any safety, permission, data,
immutable, or audit violation rejects the candidate before the cost exception. No prose argument,
alternative smoothing, provider-price substitution, timeout exclusion, or post-hoc unit change is
allowed.

Provider cost micros, tool attempts, wall clock, and peak resources form a reported secondary vector.
They cannot be omitted or substituted for the primary scalar post hoc.
