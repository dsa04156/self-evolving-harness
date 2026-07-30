# Architect Gate 1RR — Narrow Contract Corrections

Date: 2026-07-30
Project: Standalone Self-Evolving Coding-Agent Harness
Protocol candidate: `draft-1`
Requested decision: `APPROVE`, `REVISE`, or `BLOCK`

## 1. Decision requested and scope

Please decide whether the ten required Gate 1R corrections below are now sufficiently unambiguous to
authorize the bounded Gate 2 implementation prototype.

- Prior Gate 1R packet SHA-256:
  `877981e4f07254c8048ecaf63e4757b1670c5d0bb2c9cc33414bdc21e08fe242`
- Gate 1R `REVISE` response SHA-256:
  `22074e55905067d30bf025634f28e4e73ffec0427d1c442a6c81b3e88919f6cd`
- Correction commit:
  `f3c3cb88c00257700b8c58181c25aa0ed7ccb47e`

This packet contains only:

1. qualification/deployment/rollback/retirement correction;
2. abnormal session termination;
3. the `B6-RAW` H3 control;
4. protocol-lifetime gate governance;
5. the exact candidate-cost formula;
6. the corrected 14-edge multi-cause graph; and
7. explicit H4 disposition and replacement hashes.

The prior review already accepted the bounded novelty statement, immutable manifest/external-record
split, authoritative component registry, closed declarative payloads, runtime-state snapshots,
principal/TCB target, B5-SM/B6-ABL controls, public-test terminology, and claim discipline. Those topics
are not reopened here. No runtime, evaluator, isolation, provider adapter, or executable benchmark
fixture was implemented. No provider, `D_gate`, final, temporal, or withheld-public task was run.

An `APPROVE` authorizes only the Gate 2 standalone runtime and deterministic trust-boundary prototype.
It does not authorize paid-provider work, benchmark evolution, gate/final access, empirical claims, or
deployment outside deterministic tests.

## 2. Harness qualification is separate from deployment

### 2.1 Qualification lifecycle

`HarnessVersionManifest` remains immutable and contains no state. Signed
`HarnessLifecycleRecord` objects project only qualification:

```text
∅ → draft
draft → candidate | rejected
candidate → statically_validated | rejected
statically_validated → evaluating | rejected
evaluating → canary | rejected
canary → approved | rejected
approved → retired
rejected → retired
```

`active` and `rolled_back` are not legal harness states. `approved` means eligible for a new session or
deployment, subject to the separate deployment policy; it does not mean deployed.

### 2.2 Protocol-v1 deployment

Protocol v1 has exactly one channel: `production`. Its latest valid
`DeploymentPointerRecord` is the only representation of deployment.

Qualification and deployment use separate signed decisions:

- `PromotionDecision`: `approve | reject` for one exact candidate;
- `DeploymentDecision`: `initialize | deploy | rollback | decommission` for the production channel.

Every non-decommission deployment decision and pointer record carries:

- exact target harness ID, manifest hash, and qualification-decision ID;
- exact rollback-target harness ID, manifest hash, and qualification-decision ID;
- expected prior generation, target, and pointer-record hash; and
- protocol, policy, actor, time, audit link, and attestation.

CAS rules are:

| Operation | Required prior pointer | Result |
|---|---|---|
| `initialize` | generation `-1`, null target/hash | generation `0`; approved target plus separately approved, composition-equivalent rollback anchor |
| `deploy` | exact current generation/target/record hash | next generation targets approved candidate; prior target remains approved and becomes rollback target |
| `rollback` | exact current generation/target/record hash | next generation targets the retained approved rollback target; displaced target remains approved |
| `decommission` | exact current generation/target/record hash | next generation has null target; no qualification transition |

Initialize records `priorTargetDisposition=none`; every later operation records
`priorTargetDisposition=retained_approved`. Cross-field validation requires the new generation to be the
expected generation plus one, exact protocol equality, recomputed target/rollback hashes, approved
qualification references, and the action-specific target relation. A stale expectation fails closed;
there is no implicit rebase or per-component pointer.

Replacing or rolling back the channel never retires either version. `retired` means ineligible for new
sessions/deployments, not deletion. Retirement is rejected while a version is:

- the production target or registered rollback target;
- pinned by a live session or descendant;
- referenced by a pending evaluation/decision/deployment transaction; or
- under a hold requiring deployment eligibility.

Content, evidence, lineage, negative results, and historical pointer records remain retained.

## 3. Session abnormal termination is explicit

The session schema now admits only the following transition pairs:

| From | Allowed to |
|---|---|
| `∅` | `created` |
| `created` | `initialized`, `retired`, `terminating` |
| `initialized` | `running`, `blocked`, `terminating` |
| `running` | `waiting`, `validating`, `blocked`, `recovering`, `terminating` |
| `waiting` | `running`, `blocked`, `recovering`, `terminating` |
| `blocked` | `recovering`, `terminating` |
| `recovering` | `initialized`, `running`, `blocked`, `terminating` |
| `validating` | `completed`, `running`, `blocked`, `terminating` |
| `completed` | `retired`, `terminating` |
| `terminating` | `terminated` |

`retired` is the normal terminal state; `terminated` is the abnormal terminal state. A transition to
`terminating` or `terminated` requires exactly one of:

```text
initialization_failure
user_cancellation
budget_exhaustion
deadline_expiry
verifier_failure
security_violation
process_crash
unrecoverable_recovery
host_enforced_shutdown
```

`terminating → terminated` is admitted only when the signed record states that descendant leases and
capabilities were revoked, backend processes/jobs were stopped and reaped, provider/tool/feedback
accounting was sealed, and a final evidence receipt was appended. A crash during this transaction is
resumed by the operations owner; it cannot return to a prior state. `terminated` cannot resume. A retry
after abnormal termination creates a new session and causal link. An out-of-band kill without the
matching termination record invalidates the session result.

## 4. H3 now has a raw-evidence counterfactual

The executable baseline matrix names `B6-RAW`:

| Field | B6 layered treatment | B6-RAW control |
|---|---|---|
| source | identical event/receipt IDs and deterministic cluster assignments | identical |
| model | same proposer/attribution model, revision, parameters | same |
| search | five fixed candidate slots/seeds; no replacement | same |
| grammar | same bounded component grammar and attribution workflow | same |
| solver/static work | identical | identical |
| data | mine plus dedicated pilot only; no gate/final | same |
| selector/failure | same frozen mine/pilot selector; invalid/absent/timeout/exhausted slot is charged with quality zero | same |
| evidence representation | per-task reports → failure patterns → mutation evidence packet | canonical raw events/receipts grouped by the same cluster IDs |

The sole treatment difference is evidence representation.

The frozen primary cost direction is:

```text
total_system_charged_tokens(B6) /
total_system_charged_tokens(B6-RAW)
```

measured from the common raw-corpus commitment through selected-candidate commitment. Every differing
summarizer, miner, attribution, proposer, judge, subagent, background, and solver call is charged.
Support requires the ratio interval upper bound below `0.80`, paired non-inferiority for
HarnessFaultBench top-1 attribution and selected-candidate targeted-repair pass rate, source-event
drill-down, and zero trust violations. If the dedicated pilot cannot support the quality margins, H3
becomes exploratory rather than borrowing `D_gate` or widening the margin.

## 5. Gate governance is one-shot for the protocol lifetime

Before the first gate capability exists, the protocol directly pins hashes for:

- the complete method-arm manifest set;
- every content-addressed candidate batch and task-order/seed commitment;
- the candidate-selection rule;
- the gate-report template set; and
- the analysis program.

Protocol-v1 permits one gate unlock and no non-adaptive gate replication. The complete candidate batch
is mine-only and sealed first. Proposer processes stop, and proposer write/provider capabilities are
revoked. Each candidate is evaluated once; there are no adaptive replacement candidates.

Until every confirmatory final evaluation is irrevocably finalized, audit heads are published, and the
protocol is closed to method/candidate changes:

- candidate results and the internal selection packet are readable only by the promoter and audit
  store;
- proposer, runtime developer, protocol author, benchmark author, model-selection personnel, and
  evolution reporter receive nothing; and
- task IDs/text/paths, per-task outcomes, traces, verifier diagnostics, and labels are never released in
  the selection packet.

After final closure, an authorized human release makes this gate exploratory for all subsequent work.
Any later confirmatory protocol must commit a fresh gate split. Merely changing a protocol ID cannot
reset or reuse this gate.

Feedback accounting distinguishes:

- adaptive feedback consumed by the candidate generator: exactly `0`;
- decision evidence charged per method: one result for each of at most five candidates plus one selector
  packet, maximum `6`; and
- audit-retention records: mandatory but not adaptive feedback because they remain unavailable to
  adaptive principals.

Every access records principal, recipient, split/task handle, exact fields, time, purpose, and protocol.
A second unlock/query, pre-final prohibited recipient, task-level leak, or proposer access invalidates
the protocol run.

## 6. Candidate cost exception is an exact integer formula

Formula version is `seh-candidate-cost-v1`. Let `T` be the exact common ordered gate task set and
`n=|T|>0`.

- `Y[m,t]=1` only for an authenticated verifier pass. Failure, invalid output, timeout, cancellation,
  budget exhaustion, or candidate-attributable crash is `0`.
- `U[m,t]` is nonnegative integer total charged tokens. Missing final provider usage is replaced by the
  full pre-admission reservation before aggregation.
- `P_m = Σ_t Y[m,t]`.
- `U_m = Σ_t U[m,t]`, including all failed/timed-out tasks.
- `C_m = U_m/n`.
- `S_m = (P_m+0.5)/(n+1)`.
- `E_m = S_m/(C_m+1 token)`.

The normal path is exactly:

```text
10 * (U_candidate + n) <= 11 * (U_parent + n)
```

If false, the only high-cost exception requires all four integer clauses:

```text
10 * (U_candidate + n) > 11 * (U_parent + n)
P_candidate - P_parent >= 1
fail_to_pass_count - pass_to_fail_count >= 1
20 * (2*P_candidate + 1) * (U_parent + n)
  >= 21 * (2*P_parent + 1) * (U_candidate + n)
```

The last clause is exactly the fixed `E_candidate/E_parent >= 1.05` threshold. Zero reported usage still
receives the one-token term; missing usage is never zero. All tasks remain in `n`.

`CandidateCostGate` stores the common task-set hash, source signed-ledger receipts, integer inputs, exact
cross-product terms, selected path, and result. Validator and promoter independently recompute it.
Mismatch, missing/invalid ledger, unequal task set, or any safety/permission/data/immutable/audit
violation rejects the candidate. No prose exception, alternate smoothing, provider-price substitution,
timeout exclusion, or post-hoc unit change is allowed.

## 7. Corrected HarnessFaultBench multi-cause graph

There are fourteen total final-only edges over seven combined families. The graph is degree four per
family **overall**, not per stratum. Medium and high each contain seven edges and form a degree-two
cycle, so their union gives overall degree four.

| ID | Difficulty | Exact types | Exact mechanisms |
|---:|---|---|---|
| 01 | medium | SystemPrompt + MemoryRetrievalPolicy | `SP_OMIT_OUTPUT_CONTRACT` + `MRP_OMIT_PROJECT_FACTS` |
| 02 | high | SystemPrompt + Skill | `SP_INVERT_TOOL_ORDER` + `SK_OMIT_REQUIRED_STEP` |
| 03 | high | SystemPrompt + WorkflowPolicy | `SP_OMIT_FAILURE_HANDLING` + `WF_SKIP_CONTEXT_CONSTRUCTION` |
| 04 | medium | SystemPrompt + SubagentPrompt | `SP_PREMATURE_COMPLETION` + `SA_OMIT_ARTIFACT_REQUIREMENT` |
| 05 | medium | ContextPolicy + Skill | `CP_EXCLUDE_LATEST_TOOL_RESULT` + `SK_SWAP_EXISTING_STEPS` |
| 06 | high | ContextPolicy + WorkflowPolicy | `CP_TRUNCATE_TASK_REQUIREMENT` + `WF_TOOL_FAILURE_TO_COMPLETE` |
| 07 | high | ContextPolicy + RoutingPolicy | `CP_SELECT_STALE_SESSION_EVENT` + `RT_WRONG_LOW_RULE` |
| 08 | medium | ContextPolicy + ToolDescription | `CP_OMIT_TOOL_CATALOG` + `TD_WRONG_READ_PARAMETER_PROSE` |
| 09 | medium | MemoryRetrievalPolicy + WorkflowPolicy | `MRP_SCORE_TOO_HIGH` + `WF_VERIFY_FAILURE_TO_COMPLETE` |
| 10 | high | MemoryRetrievalPolicy + SubagentPrompt | `MRP_ZERO_RECORD_LIMIT` + `SA_INVERT_SUCCESS_CONDITION` |
| 11 | high | MemoryRetrievalPolicy + ToolDescription | `MRP_RECENCY_SELECTS_DECOY` + `TD_INVERT_EDIT_MODE_PROSE` |
| 12 | medium | Skill + RoutingPolicy | `SK_WRONG_COMPLETION_CHECK` + `RT_WRONG_HIGH_RULE` |
| 13 | high | Skill + ToolDescription | `SK_WRONG_EXISTING_TOOL_GUIDANCE` + `TD_WRONG_RESULT_FIELD_PROSE` |
| 14 | medium | WorkflowPolicy + ToolDescription | `WF_JOB_RESULT_WRONG_STATE` + `TD_GIT_DIFF_SCOPE_PROSE` |

`RoutingPolicy` and `SubagentPrompt` retain exact ground-truth types but share the combined
routing/subagent balance family. The machine check verifies all 14 IDs equal the existing
`sealedTestMultiCause` list, no unordered pair repeats, every family has overall degree four and
per-stratum degree two, and each stratum has seven edges. Therefore the split manifest did not change;
its SHA-256 remains
`fbab1b5bb8c7796cab08ee5c4b3368647edbae4ec99678b408d6e3ff240966fb`.

## 8. H4 disposition

H4 remains an explicitly exploratory stretch hypothesis. At Gate 3—before the first Track B candidate
and before any gate, final, or transfer outcome—the protocol must freeze the second provider/exposed
model identity and revision, parameters, service tier, environment, final task commitments, rollout
seeds, and per-task token/tool/time budget.

Model-2 compares B0 with the already frozen model-1-selected B6 artifact using one matched pass per
task/seed. Model 2 receives zero evolution calls. Model-specific retuning, candidate reselection, or
task-specific mutation is forbidden. Model-1 evolution cost and model-2 inference cost are reported
separately. If the full second-model contract is unavailable by that freeze point, H4 is withdrawn
before results. Positive wording is exploratory only; negative or inconclusive transfer is reported.

## 9. Replacement hashes and local precheck

### Lifecycle, deployment, and session

| Artifact | SHA-256 |
|---|---|
| `schemas/harness-lifecycle-record.schema.json` | `17f3bf41adfdbbe725dc59cbd4d401f714565c30ed8f85f2de01d65fbed46641` |
| `schemas/deployment-decision.schema.json` | `e30c8ba71b7194e230da3366061df8c88326ac40985de38fa849d6ec02c7dd0d` |
| `schemas/deployment-pointer-record.schema.json` | `4cc6811eb0e03e6fc9eee7000dd63587fa913106f32cdcfac90185ae07c41068` |
| `schemas/promotion-decision.schema.json` | `609b3cb60d0ef1b8f3df92e0949a80fbb42425f75fd8146aa2f1ba757d8d40f5` |
| `schemas/session-lifecycle-record.schema.json` | `c0abfa411c5605c5f7563b2e930a66ebd498e74c6609487f56127629df012b8a` |
| `schemas/operation-response.schema.json` | `f8a49c8add54d82db05437ea8e7a31c5ce84a75682ca3bcad7b474e4c8ffa211` |
| `docs/architecture/state-machines.md` | `388663df004f101e8588e3eadda56a663a972936e384694986c3799161f8bfb0` |

### H3, gate, cost, and H4

| Artifact | SHA-256 |
|---|---|
| `schemas/protocol-manifest.schema.json` | `df0cb66c3d98a48482f7a1dc29dd71804f4439d61f8a0d79c796687c56cb3955` |
| `schemas/candidate-cost-gate.schema.json` | `2ea1fb50b522fd9a089e98f21b701626f006b31cce776ff8e789b26ae68adb2c` |
| `configs/gate-feedback-policy.yaml` | `11b6645fd7a659dc920950f7340122f38d3c1f4b87e56d1e26f0d92e96bdcea7` |
| `configs/evaluation-budget.yaml` | `010e508d18e7bca6697841b8ed1c33b8e060f946c6e975eb0a65a353f84d5b4d` |
| `docs/evaluation/baseline-matrix.md` | `2d28bbc7339bc69ed613a09352968e9f3126291ea9311b8bf2414a3698af82a8` |
| `docs/evaluation/data-access-policy.md` | `a39b9ba24131e2fb5945a9c68e1957336ccf8ee550f6470d9280dd53104fd8f1` |
| `docs/evaluation/phase-budget-ledger.md` | `041235930b30d5cd1ce6782d95d088a2b731557ba6c27189607342c021dfaf49` |
| `docs/evaluation/research-hypotheses.md` | `4b12c845ca3f4f6c1f6c3862e1f2279d0bca1479fc03f45214e006f6d308e9b0` |
| `docs/evaluation/statistical-analysis-plan.md` | `93a221dfc8072e99e44fa350df953b1cd5fa9af1f67275ef6ae957c0a3d66930` |
| `docs/evaluation/claim-matrix.md` | `8587eabbef99a3035d227debfe8bcea6872156a7ec32af19373f5da79e5f47cd` |

### Corrected fixture graph

| Artifact | SHA-256 |
|---|---|
| `benchmarks/harness-fault-bench/FIXTURE_SPEC.md` | `fa4ccddac0e91a07c8a6e614b7bd1078f825e71d64e8ceac86981ea7a754d702` |
| `benchmarks/harness-fault-bench/multicause-graph.json` | `00a802e92ed1214d1ae29f81858b894e23fb9cf8cc81f786df7153c84778980c` |
| `schemas/benchmarks/harness-fault-multicause-graph.schema.json` | `3e30c9895102f8821e8a98d3f33e4f9b9c6299690d121559a47c9c0f425fb399` |
| unchanged `benchmarks/splits.json` | `fbab1b5bb8c7796cab08ee5c4b3368647edbae4ec99678b408d6e3ff240966fb` |

Static precheck:

```text
PASS schemas=33 type_registry=valid splits=28/14/14/14+45/10/34
multicause_graph=14_edges_degree4 lifecycle=qualified_deployed_terminated
gate=one_shot h3=B6_vs_B6-RAW spike=quarantined markdown_links=10
```

Validation record SHA-256:
`b10c1421c93028ccf62d765101a04fcc7243c48c98be73434ae4150a6ed8443e`.

## 10. Requested ruling

Please return:

```text
DECISION: APPROVE | REVISE | BLOCK
CORRECTNESS:
EVALUATION FAIRNESS:
GENERALIZATION:
REPRODUCIBILITY:
SECURITY:
CLAIM DISCIPLINE:
BLOCKING FINDINGS:
AUTHORIZED NEXT SCOPE:
```

`APPROVE` should mean only that these design contracts are sufficiently determinate for Gate 2
implementation. If any ambiguity remains, please name the exact record, state transition, formula,
recipient, graph edge, or H4 field that must change. No architecture diagrams are included in this
resubmission.
