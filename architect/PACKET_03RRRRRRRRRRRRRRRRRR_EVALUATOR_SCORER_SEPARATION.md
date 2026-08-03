# Architect Packet 03RRRRRRRRRRRRRRRRRR — Calibration evaluator/scorer separation

Date: 2026-08-03  
Requested decision: `APPROVE`, `REVISE`, or `BLOCK` for the sole Round
03RRRRRRRRRRRRRRRRR trust-contract defect

## Review boundary

This packet corrects exactly one phrase and its downstream authority flow:

```text
calibration evaluator/scorer
```

becomes two inequality-constrained authorities:

```text
calibration_evaluator
calibration_scorer
```

It does not modify the accepted inventory, derivation classes, dependency prerequisites, numeric
rules, atomic-freeze semantics, failure thresholds, pending values, or zero-authority state. It does
not implement or sign a calibration contract.

No push, credentials, provider/model selection or call, nonzero budget, Codex-CLI provider path,
benchmark/vault access, task/pilot/research execution, sentinel fill, final ID, B0–B6 run, attribution,
mutation, candidate, selection, promotion, deployment, publication, or empirical claim occurs.

## 1. Bound prior decision

| Item | Identity |
|---|---|
| Prior packet | `architect/PACKET_03RRRRRRRRRRRRRRRRR_NUMERIC_DERIVATION_PREREGISTRATION.md` |
| Prior packet SHA-256 | `bffddeb8f9c7614f0ee7be5adb49cfd977b89ee3e607253b6f29e8629af61239` |
| Prior response | `.codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrr.md` |
| Prior response SHA-256 | `f002f7808d5377035dee1f5dbb060faf6e79802f86249c59b6a45f2f55e9d3f0` |
| Decision-record commit/tree | `df79044610e3c3e8cddf471ad95f8c9c86f3a001` / `87afbc71e0eb75e1e82b1c3fb4bd0f37175fb046` |
| Numeric-freeze entry ID | `nfe-sha256:7517cce6f2878429161bd73154d1ef71f5bb8fe27ca3a77e08b4b55b43df268f` |

The prior ruling accepted the exact 25 sentinels, eight groups, six-class assignments, 12-phase
expansion, acyclic envelope/measurement/derivation/freeze DAG, all numeric derivation rules, atomic
freeze, proposed evidence set, fail-closed history, null final IDs, and false authority flags. Those
sections remain normative by their exact packet hash. This correction neither restates nor amends them.

## 2. Distinct authority identities

The future closed contract must carry two separate identity objects:

| Property | Evaluator | Scorer |
|---|---|---|
| role | exact `calibration_evaluator` | exact `calibration_scorer` |
| principal namespace | `principal.calibration.evaluator.*` | `principal.calibration.scorer.*` |
| key namespace | `key.calibration.evaluator.*` | `key.calibration.scorer.*` |
| process identity | dedicated evaluator principal | dedicated scorer principal |
| signing purpose | task measurement commitment | aggregate derivation commitment |

Admission requires all of the following inequalities:

```text
evaluator.principalId       != scorer.principalId
evaluator.instanceId        != scorer.instanceId
evaluator.keyId             != scorer.keyId
evaluator.publicKeyDigest   != scorer.publicKeyDigest
evaluator.processIdentity   != scorer.processIdentity
evaluator.writableMountRoot != scorer.writableMountRoot
```

The structural schema uses disjoint role/principal/key namespaces and a required closed
`authoritySeparation` object. The mandatory semantic schema-admission verifier checks the cross-field
inequalities, since standard JSON Schema cannot compare arbitrary sibling values. Structural validation
without that semantic admission is not a valid contract.

Neither principal may hold the other role, key, process credential, writable mount, record-creation
capability, or a delegation that produces the same effect. Key rotation preserves inequality and
appends lineage; it never temporarily reuses the other authority's key.

## 3. Mount and data classes

| Authority | Readable | Writable | Absent |
|---|---|---|---|
| `calibration_evaluator` | one current opaque dedicated-pilot capability; current task body inside the sandbox; read-only verifier capability; frozen execution environment; executor event/usage/incident stream | evaluator-only raw measurement store; signed task measurement commitments; evaluator incident/failure records | aggregate output; protocol mutation; proposer/candidate data; promoter/deployment keys; other tasks; gate/final/temporal/withheld paths |
| `calibration_scorer` | signed evaluator commitments; opaque task/stratum commitments; signed accounting records; frozen scoring/estimator program; precommitted grids and abort rules | signed aggregate calibration commitments; rejected-grid commitments; scorer incident/failure/withdrawal records | task body; raw conversation/output; verifier source; provider credential/request capability; evaluator raw mount; protocol mutation; proposer/promotion/deployment state |

The evaluator may invoke only a later-authorized bounded execution capability for the current pilot
task; it never receives a reusable provider credential. The scorer has zero provider/model and runtime
tool authority and runs only the frozen deterministic scoring program.

The protocol author sees neither mount. It may read only an independently verified aggregate envelope,
rejected-value commitments, and a failure or withdrawal disposition.

## 4. Closed message and record contract

### Executor to evaluator

Evaluator accepts only signed:

```text
CalibrationExecutionReceipt
CalibrationUsageReceipt
CalibrationIncidentRecord
```

Each binds opaque task/stratum commitment, execution source, environment, request/usage ledger heads,
and current capability consumption. It carries no gate/final handle.

Evaluator alone may emit:

```text
CalibrationMeasurementCommitment
CalibrationEvaluatorFailureRecord
CalibrationEvaluatorIncidentRecord
```

`CalibrationMeasurementCommitment` binds task-level normalized measurements, raw-measurement content
commitments, accounting heads, missingness/incident state, estimator-input version, and producer
attestation. The raw body stays on the evaluator mount.

### Evaluator to scorer

Scorer accepts a measurement only when:

- record type is exactly `CalibrationMeasurementCommitment`;
- producer role, principal, key, and signature match the admitted evaluator;
- source/environment/accounting/task commitments match the frozen plan;
- no raw task, verifier, prompt, response, credential, or protected path field exists; and
- every expected stratum is present or has a signed terminal failure record.

Scorer alone may emit:

```text
AggregateCalibrationCommitment
RejectedDerivationCandidateCommitment
CalibrationWithdrawalRecord
CalibrationScorerFailureRecord
CalibrationScorerIncidentRecord
```

The aggregate binds the ordered evaluator commitment set, frozen program/hash, candidate grid, selected
rule branch, rejected candidates, precision/power checks, stopping disposition, and scorer attestation.
It cannot embed evaluator raw bytes or create a final protocol/budget ID.

### Scorer to independent verifier to protocol author

The independent verifier accepts the signed aggregate plus reference-only evaluator/accounting roots and
emits `CalibrationVerificationReceipt`. It checks identities, inequalities, signatures, record-type
ownership, graph completeness, numeric-rule execution, forbidden fields, contamination, and zero
authority. It neither produces measurements nor selects a value.

Only a verified receipt plus the referenced aggregate may enter
`ProtocolAuthorDerivedValueProposal`. The author proposal cannot reference evaluator raw storage,
individual task bodies, or a direct evaluator message.

## 5. Exclusive record-creation matrix

| Record class | Sole creator | Explicitly forbidden creators |
|---|---|---|
| task measurement commitment | `calibration_evaluator` | scorer, verifier, author, proposer, promoter |
| aggregate/rejected-grid/withdrawal commitment | `calibration_scorer` | evaluator, verifier, author, proposer, promoter |
| verification receipt | independent verifier | evaluator, scorer, author |
| derived-value proposal | protocol author | evaluator, scorer, verifier |

Every receiver verifies the creator role before schema admission. A valid signature from the wrong role
is rejected. A role may not proxy, wrap, alias, delegate, co-sign, or reuse another record type.

## 6. Corrected dependency and evidence graph

The prior node `E = measurements` is refined without changing its predecessors or numeric successors:

```text
D = separately approved calibration envelope
E0 = calibration executor receipts
E1 = evaluator task-measurement commitments
E2 = scorer aggregate/rejected/withdrawal commitment
E3 = independent verification receipt
E4 = protocol-author derived-value proposal
F/G/K/M = accepted prior derived numeric nodes
O = accepted prior joint freeze transaction
```

Edges:

```text
A + B + C -> D
D -> E0
E0 -> E1
E1 + signed accounting + frozen scoring program -> E2
E2 + reference-only E1 roots -> E3
E3 -> E4
E4 -> F, G, K, M
accepted prior prerequisites + F/G/H/J/K/L/M/N -> O
```

Forbidden edges:

```text
E1 -> E4             # no evaluator-to-author value release
E0 -> E2             # scorer cannot bypass evaluator commitment
evaluator raw -> E2  # scorer cannot read raw task material
E1 or E2 -> O        # no unverified direct freeze input
O -> D               # research budget cannot fund calibration
```

The scorer's aggregate is derived only from admitted evaluator commitments. The verifier checks it but
does not collapse into either producer.

## 7. Anti-collapse admission and attacks

A future implementation must reject, including after otherwise valid re-signing:

1. equal principal IDs, instance IDs, key IDs, public-key digests, process identities, or writable roots;
2. role alias maps such as `calibration_evaluator_scoring=true`;
3. a combined evaluator/scorer record type or shared union write capability;
4. scorer task-body, verifier-source, raw-output, credential, provider-call, or evaluator-mount access;
5. evaluator `AggregateCalibrationCommitment` creation authority;
6. author access to task-level measurements or evaluator raw roots;
7. direct evaluator-to-author derived-value release;
8. delegated, wrapped, proxied, co-signed, inherited, or temporary capabilities that join both roles;
9. scorer aggregation from executor receipts without evaluator commitments; and
10. verifier, author, proposer, or promoter producing either measurement or aggregate records.

Any collapse permanently fails that calibration attempt. Splitting identities after results does not
repair it, and a verifier receipt cannot retroactively create independence.

## 8. Unchanged zero-execution and claim boundary

```text
providerExecutionAuthorized   = false
researchEvidenceAuthorized    = false
candidateSelectionAuthorized  = false
promotionAuthorized           = false
deploymentAuthorized          = false
claimAuthorityGranted         = false

finalProtocolId = null
budgetFreezeId  = null

provider/model calls        = 0
calibration/task executions = 0
protected-data accesses     = 0
nonzero budgets             = 0
Git pushes                  = 0
```

The 25 sentinels, eight groups, derivation classes, candidate-set bounds, confidence/power rules,
rounding/ties, stopping/withdrawal rules, synthetic-fixture exclusion, atomic freeze, evidence history,
and seven unresolved obligations remain byte-identical in their existing artifacts.

## Decision requested

Please decide:

1. Does this remove the sole evaluator/scorer role-collapse defect?
2. Are identity, key, mount, message, data, capability, and exclusive-creation boundaries sufficient?
3. Does the one-way signed graph prevent scorer protected-data access and direct evaluator-to-author
   release?
4. Are the anti-alias/delegation attacks sufficient for the later schema/verifier contract?
5. If approved, may the next local scope implement only one closed zero-execution calibration-contract
   schema, one signed public-development contract, one independent verifier, the named validly re-signed
   attacks, one reference-only audit receipt, and directly relevant documentation under a
   non-self-referential two-commit layout?

Do not authorize calibration/provider/benchmark/research execution or final freeze from this packet.

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK

IDENTITY_AND_KEY_SEPARATION:
MOUNT_DATA_CAPABILITY_BOUNDARY:
MESSAGE_AND_RECORD_OWNERSHIP:
DEPENDENCY_AND_EVIDENCE_GRAPH:
ANTI_COLLAPSE_TEST_CONTRACT:
UNCHANGED_NUMERIC_AND_AUTHORITY_STATE:
BLOCKING_FINDINGS:
AUTHORIZED_NEXT_SCOPE:
STILL_PROHIBITED:
```
