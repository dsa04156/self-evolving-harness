# Architect Packet 03RRRRRRRRRRRRRRRRR — No-execution numeric derivation and calibration contract

Date: 2026-08-03  
Requested decision: `APPROVE`, `REVISE`, or `BLOCK` for this preregistration only

## Review boundary

This packet defines future derivation rules for the unresolved numeric-freeze fields. It implements
nothing, selects no provider/model, allocates no budget, fills no sentinel, and runs no task or pilot.

The current entry remains exactly:

```text
entryId: nfe-sha256:7517cce6f2878429161bd73154d1ef71f5bb8fe27ca3a77e08b4b55b43df268f
research_protocol_numeric_freeze: unresolved
evidencePresent: false
finalProtocolId: null
budgetFreezeId: null
authoritiesGranted: 0
```

No Git push, credential request/use, provider or model call, Codex-CLI-as-provider path, benchmark/vault
access, task execution, research scheduler, B0–B6 run, attribution, mutation, candidate, selection,
promotion, deployment, publication, or empirical claim occurs in this packet.

## 1. Prior approval and immutable input

| Item | Identity |
|---|---|
| Prior packet | `architect/PACKET_03RRRRRRRRRRRRRRRR_NUMERIC_FREEZE_ENTRY_EVIDENCE.md` |
| Prior packet SHA-256 | `6adbec974e9f994cb2dac92bbcb4f831611c5a19635296b8c52831ab9b3ccee6` |
| Prior response | `.codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrr.md` |
| Prior response SHA-256 | `8552851015a6fc09659677442710da6b1227a12943b52f1289d9dd51f4bea3ab` |
| Approved entry raw SHA-256 | `432b341bf40096134d787381fb963c12266e2d73db97e079946614335ad01391` |
| Conformance raw SHA-256 | `9195b10340ac8687d151fd10c910af973b5f07c264fd32fd318bc08c312f3323` |
| Outstanding-obligations raw SHA-256 | `4fbc10b5febaac8296d53d7a97720c1c4b28bcd4a5bd9ef0582e77b11f586f58` |
| Additional push | `false` |

Only the approved 25 sentinels and eight pending groups are accepted. No value, spelling, expansion, or
location changes.

## 2. Exact pending inventory

### Eight groups

```text
seeds.finalRolloutCount
seeds.finalRolloutValues
identity
phases
perRequest.rolloutTokenCapT
environment
statisticalMargins
h4SecondModelIdentity
```

### Twenty-five sentinel paths

| # | Exact path | Exact sentinel | Expansion |
|---:|---|---|---:|
| 1 | `seeds.finalRolloutCount` | `PILOT_PENDING_BY_PRECISION_RULE` | 1 |
| 2 | `seeds.finalRolloutValues` | `PILOT_PENDING_AFTER_COUNT_FREEZE` | 1 |
| 3 | `h4TransferExperiment.secondProviderAndModelIdentity` | `PILOT_PENDING` | 1 |
| 4 | `identity.provider` | `PILOT_PENDING` | 1 |
| 5 | `identity.modelId` | `PILOT_PENDING` | 1 |
| 6 | `identity.modelRevision` | `PILOT_PENDING` | 1 |
| 7 | `identity.serviceTier` | `PILOT_PENDING` | 1 |
| 8 | `identity.reproducibilityTier` | `PILOT_PENDING` | 1 |
| 9 | `identity.parameters.reasoningEffort` | `PILOT_PENDING` | 1 |
| 10 | `identity.parameters.temperature` | `PILOT_PENDING` | 1 |
| 11 | `identity.parameters.topP` | `PILOT_PENDING` | 1 |
| 12 | `phases.*.providerModelRequestAttempts` | `PILOT_PENDING` | 12 |
| 13 | `phases.*.totalChargedTokens` | `PILOT_PENDING` | 12 |
| 14 | `phases.*.providerCostMicros` | `PILOT_PENDING` | 12 |
| 15 | `phases.*.toolAttempts` | `PILOT_PENDING` | 12 |
| 16 | `phases.*.feedbackEvents` | `PILOT_PENDING` | 12 |
| 17 | `phases.*.wallClockSeconds` | `PILOT_PENDING` | 12 |
| 18 | `phases.*.processCount` | `PILOT_PENDING` | 12 |
| 19 | `phases.*.cpuSeconds` | `PILOT_PENDING` | 12 |
| 20 | `phases.*.memoryMiB` | `PILOT_PENDING` | 12 |
| 21 | `phases.*.outputBytes` | `PILOT_PENDING` | 12 |
| 22 | `perRequest.rolloutTokenCapT` | `PILOT_PENDING` | 1 |
| 23 | `environment.containerImageDigest` | `PILOT_PENDING` | 1 |
| 24 | `environment.toolchainDigest` | `PILOT_PENDING` | 1 |
| 25 | `environment.networkPolicyDigest` | `PILOT_PENDING` | 1 |

The ten phase wildcards expand only over the existing 12 phase IDs: `mine_trace_generation`,
`evidence_summarization`, `weakness_mining`, `attribution`, `proposal`, `static_validation`,
`gate_evaluation`, `gate_selection`, `offline_canary`, `track_a_task_search`, `final_solving`, and
`temporal_replication`.

`statisticalMargins` is an existing group marker, not a literal YAML sentinel. Its documented targets
are H3 attribution, H3 candidate-repair, and candidate-gate non-inferiority. A future schema must name
them under a new reviewed entry identity; they are not retroactively added to the 25 sentinels.

## 3. Exactly one derivation class per pending path/group

The allowed classes are closed:

```text
normative_contract_value
environment_identity_dependent
provider_or_model_identity_dependent
mine_calibration_required
dedicated_pilot_required
withdraw_if_not_estimable
```

Assignments:

| Pending path or group | Class |
|---|---|
| `seeds.finalRolloutCount` | `dedicated_pilot_required` |
| `seeds.finalRolloutValues` | `normative_contract_value` |
| `h4TransferExperiment.secondProviderAndModelIdentity` / `h4SecondModelIdentity` | `withdraw_if_not_estimable` |
| `identity.provider` | `provider_or_model_identity_dependent` |
| `identity.modelId` | `provider_or_model_identity_dependent` |
| `identity.modelRevision` | `provider_or_model_identity_dependent` |
| `identity.serviceTier` | `provider_or_model_identity_dependent` |
| `identity.reproducibilityTier` | `provider_or_model_identity_dependent` |
| `identity.parameters.reasoningEffort` | `provider_or_model_identity_dependent` |
| `identity.parameters.temperature` | `provider_or_model_identity_dependent` |
| `identity.parameters.topP` | `provider_or_model_identity_dependent` |
| `phases.*.providerModelRequestAttempts` | `dedicated_pilot_required` |
| `phases.*.totalChargedTokens` | `dedicated_pilot_required` |
| `phases.*.providerCostMicros` | `provider_or_model_identity_dependent` |
| `phases.*.toolAttempts` | `dedicated_pilot_required` |
| `phases.*.feedbackEvents` | `normative_contract_value` |
| `phases.*.wallClockSeconds` | `dedicated_pilot_required` |
| `phases.*.processCount` | `normative_contract_value` |
| `phases.*.cpuSeconds` | `dedicated_pilot_required` |
| `phases.*.memoryMiB` | `dedicated_pilot_required` |
| `phases.*.outputBytes` | `dedicated_pilot_required` |
| `perRequest.rolloutTokenCapT` | `dedicated_pilot_required` |
| `environment.containerImageDigest` | `environment_identity_dependent` |
| `environment.toolchainDigest` | `environment_identity_dependent` |
| `environment.networkPolicyDigest` | `environment_identity_dependent` |
| `statisticalMargins` | `dedicated_pilot_required` |

`mine_calibration_required` is unused in protocol v1; fairness and precision limits use a separately
authorized dedicated pilot. Any class change requires a new entry identity and review.

## 4. Acyclic dependency graph

Nodes:

```text
A = immutable policies, schemas, methods, accounting rules, split-role commitments
B = primary provider/model/revision/tier/parameter/reproducibility identities
C = container/toolchain/network identities
D = separately approved calibration execution envelope and dedicated-pilot commitment
E = signed dedicated-pilot measurements and incident/missingness ledger
F = per-request rolloutTokenCapT
G = phase call/token/tool/time/CPU/memory/output caps
H = normative phase feedback/process caps
I = signed provider price schedule and currency/micro-unit rule
J = phase providerCostMicros caps
K = final rollout count
L = exact final rollout seed values
M = statistical margins
N = H4 second identity or signed H4-withdrawal disposition
O = joint ProtocolManifest + BudgetFreezeManifest freeze transaction
```

Edges:

```text
A -> B, C, D, H, N
B -> D, F, G, I, N
C -> D, F, G
D -> E
E -> F, G, K, M
F -> G
G + I -> J
A -> K, L, M
K -> L
B + C + F + G + H + J + K + L + M + N -> O
```

There is no edge from `O` back to calibration. Envelope `D` is a separate, pre-authorized,
non-research budget and is never copied into `F`, `G`, or `J`; the derived budget cannot fund its own
derivation.

Any cycle, missing predecessor, implicit default, unpinned price, or unresolved node blocks `O`. H4
withdrawal resolves `N`; it is not a placeholder or post-result model choice.

## 5. Future deterministic derivation rules

No rule below is executed here. All candidate grids and estimator code must be content-addressed before
the first later calibration access.

### 5.1 Provider/model and environment identities (`B`, `C`, `I`, `N`)

- Future data role: public provider documentation, signed identity-probe metadata, reproducible build
  outputs, and signed network-policy bytes; no task result.
- Sampling unit: one identity assertion or build artifact, not a benchmark task.
- Rule: adapter and independent verifier check the exact identity tuple. Environment values are SHA-256
  of canonical image, toolchain-lock, and network-policy artifacts. Cost uses one signed dated schedule.
- Units/rounding/ties: identities are exact strings/digests; price arithmetic uses integer micros and
  rounds cost upward. Conflicting identities or prices fail; no tie is selected by convenience.
- Minimum evidence: one consistent identity receipt, one independent verification, and one artifact per
  environment digest. This packet selects none.
- Maximum candidates: one primary identity tuple may enter a protocol. H4 permits one precommitted second
  tuple or a signed withdrawal; there is no result-driven identity tournament.
- Stop/failure: unsupported parameter, mutable/unversioned model identity, unverifiable environment,
  missing exact price basis, or unavailable second tuple blocks the relevant protocol; H4 alone is
  withdrawn before any result rather than silently retuned.

### 5.2 Per-request token cap `T` (`F`)

- Future data role: dedicated pilot only; gate/final/temporal/withheld data forbidden.
- Sampling unit: one charged provider request, stratified by planned inference role and method arm.
- Estimator: construct at most eight monotonically increasing, provider-admissible caps from the
  precommitted pilot rule. Choose the smallest cap whose one-sided 95% upper confidence bound for
  cap-attributable truncation is at most 1% in every planned role and method arm.
- Units/rounding/ties: charged tokens under the frozen accounting formula; round upward to the provider's
  accepted token quantum; a tie selects the smaller cap.
- Minimum evidence/precision: every planned role×method stratum must contain an uncensored valid request
  and enough units to meet the bound. Missing usage is charged at the proposed reservation, never
  imputed downward.
- Stop/failure: if no candidate satisfies the bound, if provider accounting is not reproducible, or if
  any required stratum is absent, withdraw the execution protocol and redesign before gate access.
  Never widen the 1% criterion after observing protected results.

### 5.3 Phase resource caps (`G`, `H`, `J`)

- Future data: dedicated pilot for empirical caps, immutable workflow cardinalities for normative caps,
  and a signed price schedule for cost.
- Sampling unit: one complete task×method×seed phase transaction. Requests and tools remain nested usage,
  not independent tasks.
- Estimator: per phase/resource, test at most eight upward-rounded caps and choose the smallest whose
  one-sided 95% upper bound for cap-attributable failure is at most 1% in every reachable method stratum.
  Cost is calculated upward from call/token caps and price, never fitted from spend.
- Normative fields: `feedbackEvents` is derived from the already-fixed feedback-release graph;
  `processCount` is derived from the frozen principal/process topology. Neither may be inflated because
  a pilot happened to consume more.
- Units: integer attempts, events, processes, seconds, CPU seconds, MiB, bytes, charged tokens, and cost
  micros. All resource caps round upward; equal feasible candidates select the smaller cap.
- Minimum evidence: every reachable phase×method stratum is observed and meets its bound. An unreachable
  planned phase requires a new reviewed protocol, not an unobserved cap.
- Stop/failure: no feasible candidate, incomplete stratum, infrastructure incident, accounting mismatch,
  or cap-induced arm asymmetry blocks the freeze. Unused budget expires; no cross-phase, task, candidate,
  seed, method, or track reallocation is introduced.

### 5.4 Final rollout count and values (`K`, `L`)

- Future data role: dedicated pilot only.
- Sampling unit: task; rollout seeds are nested repeated measurements.
- Estimator: apply the existing hierarchical paired-bootstrap rule to candidate counts
  `S in {2,3,5,8}`. Select the smallest `S` with overall paired-risk-difference Monte Carlo standard
  error at most one percentage point and seed-level variance at most 20% of total variance.
- Units/rounding/ties: integer seed count; choose the smaller qualifying count. Exact values are the first
  `S` outputs of the precommitted SHA-256 seed stream and require no empirical selection.
- Minimum evidence/precision: every planned paired comparison has task-paired pilot outcomes sufficient
  for the two thresholds.
- Maximum candidates: four counts, already fixed by the statistical plan.
- Stop/failure: if none qualifies, freeze count eight with `precision_limited=true` as already specified;
  do not widen effects or margins. Any seed change after protected access creates a new protocol and
  cannot pool confirmatory evidence.

### 5.5 Statistical margins (`M`)

- Future data role: dedicated pilot outcomes plus public precommitted task-count resolution only.
- Sampling unit: paired task; seeds remain nested.
- Estimator: use the frozen paired/hierarchical program. H3 attribution and candidate-repair margins
  cannot exceed one respective task resolution. Gate non-inferiority chooses the smallest precommitted
  grid member with at least 80% equal-candidate retention and the predeclared maximum tolerated loss.
- Units/rounding/ties: percentage points; round toward the stricter/smaller loss. Ties choose the stricter
  margin.
- Minimum evidence/power: at least 80% paired-simulation power at the frozen rollout count. Safety,
  permission, data, immutable, and audit margins remain exactly zero.
- Maximum candidates: the future calibration contract must enumerate a finite grid of at most eight
  margin candidates before pilot access.
- Stop/failure: if power/retention and loss constraints cannot both be met, H3 remains exploratory or the
  protocol is revised before gate access. A margin is never widened after gate/final results.

## 6. Atomic freeze and amendment semantics

The future manifests are created in one joint transaction only after `B`–`N` resolve and verify. A
non-self-referential envelope derives final IDs only after all payload bytes exist.

Forbidden:

- partial or per-field activation;
- treating a sentinel, classification, pilot plan, or entry record as a value;
- allocating a final ID before all required identities and numbers exist;
- inheriting any value, budget, provenance, wrapper, or supersession link from the synthetic
  provider-smoke fixture;
- filling a field from gate, final, temporal, withheld-public, scorer-oracle, promotion, or deployment
  information; and
- changing a frozen value without a new protocol ID and permanent non-pooling of earlier evidence.

The atomic transaction does not itself grant execution. A separate Architect ruling must accept the
completed manifests before any research capability can exist.

## 7. Future authority and data boundary

Only after a later approval could these roles participate:

| Role | Future permitted input/output | Always absent |
|---|---|---|
| protocol author | signed plan, public identities, derived aggregate proposal | task bodies, labels, per-task outcomes, credentials |
| calibration scheduler | one consumed dedicated-pilot capability under a separate envelope | gate/final/temporal/withheld handles, promotion state |
| calibration executor | current pilot task inside evaluator sandbox | cross-task memory, candidate writes, gate/final paths |
| calibration evaluator/scorer | pilot task/verifier read-only; bounded metric projection | protocol mutation, proposer output, promotion key |
| budget accountant | provider/tool/process usage receipts | task body, verifier detail, candidate content |
| independent verifier | manifests, commitments, receipts, aggregate derivation inputs | credentials, mutable proposal authority |
| audit store | append-only hashes, signed decisions, incident/failure records | task body, provider secret, policy mutation |
| provider proxy | exact later identity and bounded request capability | benchmark split map, promotion/deployment state |

Proposer, runtime developer, benchmark author, model selector, promoter, deployer, and reporter receive
no pilot task-level outcome or gate/final/temporal/withheld/oracle/promotion information.

No such capability or credential exists or is requested now.

## 8. Proposed future evidence contract

Before any calibrated value could enter a freeze, a later implementation would require:

1. a signed closed `CalibrationPlanManifest` binding source/tree, entry, classes, DAG, estimator hashes,
   grids, precision rules, roles, data role, and separate envelope;
2. one-time dataset-role capability commitments containing opaque handles only;
3. signed provider/model/environment/price identity receipts;
4. append-only request, token, tool, feedback, process, CPU, memory, output, failure, cancellation,
   timeout, missing-usage, and incident ledgers;
5. pre-result commitments for task order, strata, seed stream, estimator, table shells, and abort rules;
6. evaluator-only raw measurements and a blinded aggregate record with source commitments, selected
   rule branch, rejected values, and failure/withdrawal outcomes;
7. an independent verification receipt proving no protected role or forbidden ancestry was used;
8. a protocol-author proposal that imports only verified derived aggregates, never raw protected data;
9. an append-only audit head linking accepted and rejected/aborted derivations; and
10. a new Architect packet and explicit ruling before final manifests or research execution.

Missing, contaminated, post-result-edited, unversioned, partial, or role-collapsed evidence permanently
fails the attempt; re-signing cannot repair it.

## 9. Current exact no-execution state

```text
providerExecutionAuthorized   = false
researchEvidenceAuthorized    = false
candidateSelectionAuthorized  = false
promotionAuthorized           = false
deploymentAuthorized          = false
claimAuthorityGranted         = false

finalProtocolId = null
budgetFreezeId  = null

provider/model calls          = 0
task/pilot/calibration runs   = 0
protected-data accesses       = 0
nonzero budgets allocated     = 0
Git pushes                    = 0
```

## Decision requested

Please decide:

1. Is the exact inventory preserved without silently filling or inventing a sentinel?
2. Are the derivation classes mutually exclusive and defensible?
3. Is the dependency graph acyclic, especially the separation between a future calibration envelope
   and the research budget it would derive?
4. Are the future deterministic rules specific enough to prevent post-result discretion while still
   assigning no values today?
5. Are atomic freeze, role/data separation, evidence, failure, and withdrawal semantics sufficient?
6. If approved, may the next local scope implement only the closed calibration-contract schema,
   deterministic independent verifier, validly re-signed adversarial tests, and one zero-execution
   signed public-development contract under another two-commit layout?

Do not authorize calibration/provider/benchmark/research execution or a final protocol freeze from this
packet.

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK

INVENTORY_AND_CLASSIFICATION:
DEPENDENCY_GRAPH:
DERIVATION_RULES:
ATOMIC_FREEZE:
AUTHORITY_AND_DATA_BOUNDARY:
EVIDENCE_AND_FAILURE_CONTRACT:
BLOCKING_FINDINGS:
AUTHORIZED_NEXT_SCOPE:
STILL_PROHIBITED:
```
