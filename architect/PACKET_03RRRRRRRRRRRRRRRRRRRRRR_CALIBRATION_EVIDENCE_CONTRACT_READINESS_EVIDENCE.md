# Architect Gate: Body-Free Calibration Evidence Contract Readiness

## Requested decision

Return exactly one primary decision: `APPROVE`, `REVISE`, or `BLOCK`.

This packet requests review only of the offline, public-development, body-free E0-E4 evidence
contract package authorized by the previous Architect ruling. It does not request approval to run a
calibration, issue a capability, select a provider/model/environment, allocate a nonzero budget,
read protected data, fill a sentinel, create `O`, or make an empirical/security/evolution claim.

If approved, state a narrow next authorized scope and repeat everything that remains prohibited.

## Prior authorization

The immediately preceding ruling is:

- path: `.codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrrrrrr.md`
- raw SHA-256: `094b31e93575c388a48b7a7f2482a0f7320c2dad0b8323e1eda1a09f93a6931c`
- decision: `APPROVE`

It authorized closed, body-free contracts for E0 through E4; exclusive record ownership; the
one-way `E0 -> E1 -> E2 -> E3 -> E4` graph; field-level disclosure limits; a synthetic unissued
one-time capability descriptor; deterministic semantic verification; validly re-signed attacks; and
one two-commit public-development readiness record plus a reference-only audit receipt.

## Scope disposition

Every persisted readiness object and every in-memory conformance fixture has:

```text
publicDevelopment=true
synthetic=true
authorizedForResearchEvidence=false
admissibleAsCalibrationEvidence=false
admissibleAsNumericFreezeValue=false
confirmatory=false
```

There is no actual calibration evidence record in either sealed artifact. The 14-record chain exists
only as a deterministic, synthetic, body-free conformance fixture. It is constructed in memory,
verified, and discarded. It has `executionOccurred=false`, zero usage, and no protected input.

## Non-self-referential two-commit construction

### Clean implementation source

```text
commit  8b92f1965c0c3b6b515fc486de29f151bcf0d2cc
tree    95b7836d5defd9ad2174443f16f5c33e295d8641
subject feat: preregister calibration evidence contracts
```

This commit contains 11 files and 3,223 inserted lines:

- `schemas/calibration-evidence-contracts.schema.json`
- `schemas/calibration-evidence-readiness.schema.json`
- `src/governance/calibration-evidence-contracts.ts`
- `src/governance/calibration-evidence-readiness.ts`
- `src/governance/calibration-evidence-readiness-verifier.ts`
- `scripts/create-calibration-evidence-readiness.ts`
- `scripts/verify-calibration-evidence-readiness.ts`
- `test/calibration-evidence-readiness.test.ts`
- `docs/evaluation/calibration-evidence-contract-readiness.md`
- `src/index.ts`
- `package.json`

It contains neither generated readiness JSON file.

### Sealing commit

```text
commit  526a2233fe9f58762a69961b25d740abe8ba6f98
tree    1c2a214eea93eb39d98f9a7ffe831cf772faa460
subject governance: seal calibration evidence contract readiness
```

This commit adds exactly two files, one canonical-JSON line each:

- `governance/gate3/calibration-evidence-contract-readiness.json`
- `governance/gate3/calibration-evidence-contract-readiness-audit-receipt.json`

All 18 behavior/evidence artifact references in the readiness record point to the earlier source
commit and tree. Neither generated artifact claims that its own bytes existed in that source tree.

Create-exclusive replay after the sealing commit failed with `EEXIST` on the readiness path. Before
and after the replay attempt, the raw hashes remained:

```text
03c593cec50b2c446f8d69680df608df914b019945747365f1894134ddfb6830  readiness
5a13e826e20f30152dfa610256cd81d08a97951fa812db781bb37a73e2392933  audit receipt
```

The replay left the worktree clean.

## Closed record inventory and exclusive ownership

The contract schema is a closed 14-way union: 13 signed evidence record shapes plus one synthetic
capability descriptor. Every payload definition and the capability definition has
`additionalProperties=false`; record variants also use `unevaluatedProperties=false`.

| Stage | Exclusive creator | Closed record types |
|---|---|---|
| E0 | `calibration_executor` | `CalibrationExecutionReceipt`, `CalibrationUsageReceipt`, `CalibrationIncidentRecord` |
| E1 | `calibration_evaluator` | `CalibrationMeasurementCommitment`, `CalibrationEvaluatorFailureRecord`, `CalibrationEvaluatorIncidentRecord` |
| E2 | `calibration_scorer` | `AggregateCalibrationCommitment`, `RejectedDerivationCandidateCommitment`, `CalibrationWithdrawalRecord`, `CalibrationScorerFailureRecord`, `CalibrationScorerIncidentRecord` |
| E3 | `independent_verifier` | `CalibrationVerificationReceipt` |
| E4 | `protocol_author` | `ProtocolAuthorDerivedValueProposal` |

For every signed evidence record, the record type determines the only permitted creator role, stage,
and ID domain. The creator directly signs the complete body. The schema and semantic verifier reject
wrong-role creators, delegated creation, proxies, wrappers, aliases, co-signing, and combined record
types.

The readiness record binds six pairwise-disjoint principals:

```text
calibration_executor
calibration_evaluator
calibration_scorer
independent_verifier
protocol_author
audit_store
```

They must differ across principal ID, instance ID, key ID, Ed25519 public-key digest, and process
identity. Every role has empty current handles, delegation IDs, proxy IDs, wrapper IDs, aliases, and
co-signer IDs. `modelIdentityHash` is absent. Only public principals and attestations are serialized;
private signing keys are process-local and are not written.

## One-way evidence graph

The only permitted immediate edges are:

```text
E0 -> E1
E1 -> E2
E2 -> E3
E3 -> E4
```

Every dependency binds exact record ID, internal hash, stage, and type. E0 must have no predecessor;
each later record must have at least one record from exactly the immediately preceding stage. The
synthetic chain must contain every stage in order.

The semantic verifier additionally requires:

- the aggregate's dependency set and ordered E1 list to cover every E1 record exactly;
- every expected opaque stratum to have exactly one normalized measurement commitment;
- aggregate expected/observed stratum sets to equal the capability's precommitted set;
- `missing_declared` measurements to have a matching evaluator failure record;
- measurement incident commitments and executor incidents to have matching E1 incident records;
- aggregate failure and incident coverage to be exact;
- the E2 grid commitment to equal the pre-result capability grid commitment;
- the E3 dependency and verification sets to cover every E2 record exactly;
- E3 to reference the one aggregate; and
- E4 to depend only on E3 and reference the same E3-verified aggregate.

The following are explicitly rejected:

```text
E0 -> E2/E3/E4
E1 -> E3/E4
E2 -> E4
evaluator_raw -> E2
E1 -> O
E2 -> O
E4 -> O without a later accepted freeze transaction
```

No freeze transaction exists in this package, so every E4 fixture has `freezeTransactionId=null`,
`finalProtocolId=null`, `oProposalId=null`, `oActivationId=null`, and `grantsAuthority=false`.

## Field-level disclosure matrix

| Stage | Permitted body-free disclosure | Prohibited material |
|---|---|---|
| E0 | opaque execution, accounting, and incident commitments | task body, raw model output, verifier source, label, answer, credential, protected path |
| E1 | normalized measurement commitment, missingness state, incident/failure commitment | raw material and direct release to protocol author |
| E2 | ordered E1 references, grid/rejected-candidate commitments, rule branch, precision commitment, withdrawal state | evaluator raw input or protected access |
| E3 | reference-only aggregate verification commitment | derived value or underlying protected material |
| E4 | independently verified aggregate reference and derived-value commitment | unverified aggregate, promotion/deployment state, underlying protected material |

The independent verifier parses the exact contract-schema bytes from the source commit, requires all
14 payload/capability definitions to be closed, and recursively rejects forbidden disclosure property
names. Commitment fields accept only `sha256:<64 lowercase hex>` strings. The schema contains no
field for a real task body, verifier logic, expected answer, credential, protected path, raw output,
promotion state, or deployment state.

## Synthetic one-time capability descriptor

The descriptor contains only synthetic opaque SHA-256 commitments for a non-dataset, no-plan,
value-free grid, zero budget, and two synthetic strata. It is not a real handle or issuance record.

Its exact current lifecycle is:

```json
{
  "issued": false,
  "consumed": false,
  "handle": null,
  "executionAuthorized": false,
  "issuanceReceiptId": null,
  "consumptionReceiptId": null
}
```

Its replay state is:

```json
{
  "maximumConsumptionCount": 1,
  "observedConsumptionCount": 0,
  "replayDetected": false,
  "replayAccepted": false
}
```

No task body, verifier logic, label, answer, filesystem path, real handle, provider credential,
actual model identity, or active authority is present. Mutation of issuance, consumption, handle,
execution authority, or observed-consumption count is rejected.

## Synthetic conformance fixture

The in-memory fixture has 14 signed body-free records:

```text
E0  3
E1  4
E2  5
E3  1
E4  1
```

It uses two synthetic opaque stratum commitments. It exercises complete and declared-missingness
paths plus executor/evaluator/scorer incident and failure commitments. It contains no numeric
measurement, candidate value, task material, provider response, benchmark reference, or real result.
All 14 record budgets are zero and all 14 dispositions are public-development/non-admissible.

The fixture is never serialized into either governance output. The readiness record has:

```text
actualEvidenceRecords=[]
actualCapabilities=[]
actualEvidenceRecordsPersisted=0
fixturesPersistedAsCalibrationEvidence=false
```

## Validly re-signed and semantic attacks

Thirty attacks mutate a signed evidence or readiness record, recompute its content identity and
internal hash, and apply a fresh cryptographically valid Ed25519 signature before verification.
Rejection therefore does not depend on a stale outer hash/signature. They cover:

1. wrong E0 creator role;
2. combined payload type;
3. wrapper creation;
4. E0-to-E2 scorer bypass;
5. E1-to-E4 direct author release;
6. duplicate expected stratum;
7. omitted expected stratum;
8. omitted evaluator failure coverage;
9. omitted evaluator incident coverage;
10. post-result grid substitution;
11. scorer raw-evaluator access;
12. scorer protected-data access;
13. evaluator direct protocol-author release;
14. unverified aggregate use;
15. calibration-evidence eligibility escalation;
16. nonzero provider/model-call budget;
17. final protocol identity allocation;
18. O proposal allocation;
19. O activation allocation;
20. record-level authority grant;
21. readiness capability issuance;
22. readiness nonzero budget;
23. persisted actual-evidence insertion;
24. readiness final identity allocation;
25. readiness O proposal allocation;
26. readiness execution-authority escalation;
27. readiness research-evidence eligibility escalation;
28. signed evaluator/scorer role collapse;
29. valid readiness signature from a non-protocol-author; and
30. source-artifact hash substitution.

Thirteen additional fail-closed cases exercise pairwise identity collapse, delegation, proxying,
aliasing, co-signing, missing/reordered stages, five capability lifecycle/replay mutations, and exact
readiness-byte substitution under the nested verifier and outer audit signatures.

## Signed readiness and audit identities

Readiness artifact:

```text
path          governance/gate3/calibration-evidence-contract-readiness.json
size          24,204 bytes
raw SHA-256   03c593cec50b2c446f8d69680df608df914b019945747365f1894134ddfb6830
record ID     cecr-sha256:426f217d824d416fbfe49a472a8f1a7fe5a397d9914c5dcf2f498ec96e211c16
internal hash sha256:1ef20a04ec0d5328def4eda2e988497ed3e2f297ab60905011d2adbfaf351595
```

Reference-only audit receipt:

```text
path          governance/gate3/calibration-evidence-contract-readiness-audit-receipt.json
size          4,394 bytes
raw SHA-256   5a13e826e20f30152dfa610256cd81d08a97951fa812db781bb37a73e2392933
record ID     cecrar-sha256:1cdee884a76bacd0807117eda24185e554a8d1f7fd09b476f8e681933cb6988f
internal hash sha256:39bb021229f501d62811744a8c061de7e89fdbebaa4c678da283779c5fbfcfcb
```

The protocol author signs the readiness body. The nested independent-verifier statement binds the
exact readiness ID, internal hash, raw-byte hash, source bindings, semantic results, and zero-authority
state. The audit store signs the separate reference-only receipt. Substitution of one readiness byte
invalidates both verification layers.

## Behavior-bearing source hashes

```text
868cc1b2a82d9d273ea8a9db8f21766b78a7aae03097671478ff6c35b1fb0fff  schemas/calibration-evidence-contracts.schema.json
1f46b09a948c210597f99e731c5ce22f1a34dcc526ff312bba9bda89bef5546e  schemas/calibration-evidence-readiness.schema.json
102b253f4bb3865d03dc50774c769b08316461bef66f167250e2d1d0cb61dc5c  src/governance/calibration-evidence-contracts.ts
5dff0ab96fd54df55e0a68eba4995436803f67d50aac8bd7122b9a636e4a0ab6  src/governance/calibration-evidence-readiness.ts
4004bef03d3adf668af9c9849506540aeed36906aad58e73674f01e43dd8b59b  src/governance/calibration-evidence-readiness-verifier.ts
412b14b1555cf4fd60c3e9505c792f98af6f4e6b35e78b99d19c5ae9e7000e84  test/calibration-evidence-readiness.test.ts
```

The readiness record also content-addresses the generator, verification CLI, documentation, common
schema, principal implementation, public exports, package manifest, prior assembly readiness and
receipt, prior evidence packet/ruling, and unchanged outstanding-obligations matrix.

Semantic contract hashes:

```text
inventory                       sha256:c22e8b699632f76821b6297ecf545a312b5fc07c1cb73cca4a43a780b9e42006
ownership matrix                sha256:38af67afcf4c72683b3b3af2f5c4383e04b957aba979f41bc6decc66bf09fa3c
disclosure matrix               sha256:addd18d148b44fe6fe386ce3be4afada7b2339dcb781cf6af3772e8288204024
graph contract                  sha256:6cb18820afbe4e792f082ae414189ee185a9c985569249024e3586928e64333f
synthetic capability descriptor sha256:acf19020c7e9b21be7e5f72c23a10c5a692484b8b5c28a4f18e2c3b9eecf6d0b
zero budget                     sha256:76453d1ee9bb0dfb7cc94ee396f18e36f755d93488fab0b84cbe5dab3cb0f178
authority state                 sha256:70cc9046f19f86ab02519f58d8ad67efe8e52959a3ba15ef6feccc54a8b2c0c9
eligibility state               sha256:7958c7029219a4825526487a6be4c279630cdf3c96d9061e81be66c6d6b3b5a3
```

## Verification results

Commands:

```bash
npm run check
npx -y node@24.18.1 --import tsx --test test/calibration-evidence-readiness.test.ts
npx -y node@24.18.1 --import tsx --test --experimental-test-coverage test/calibration-evidence-readiness.test.ts
npm test
npm run verify:calibration-evidence-readiness
```

Results:

```text
TypeScript strict check                    pass
all JSON schemas compile                  pass (130 schemas)
focused evidence tests                    13/13 pass
full deterministic regression suite       198/198 pass
full suite duration                        347,913.41052 ms
validly re-signed record attacks           30/30 rejected
additional semantic/replay/byte attacks    13/13 rejected
source artifact bindings                  18/18 pass
contract record types                     13/13 present
synthetic conformance records              14/14 verified in memory only
unresolved trust obligations               7 (unchanged)
actual evidence records                    0
issued capabilities                        0
consumed capabilities                      0
provider/model request attempts            0
protected-data accesses                    0
final identities allocated                 0
O proposals / activations                  0 / 0
authorities granted                        0
```

Focused coverage on the new core files:

```text
calibration-evidence-contracts.ts          99.79% lines / 97.47% branches / 100% functions
calibration-evidence-readiness.ts          100% lines / 100% branches / 100% functions
calibration-evidence-readiness-verifier.ts 96.84% lines / 97.44% branches / 76.47% functions
```

The unexecuted verifier functions are the real Git-reader adapter methods; the sealed verification CLI
exercised those methods separately and passed against the exact source commit.

## Zero-budget, zero-authority, and absent identities

All of the following are exactly zero in the readiness and every synthetic record:

```text
provider/model requests, charged tokens, provider cost, tool attempts,
wall-clock execution budget, process count, CPU seconds, memory MiB,
output bytes, protected-data accesses
```

All of the following are null:

```text
finalProtocolId
budgetFreezeId
calibrationPlanManifestId
calibrationEnvelopeId
selectedProtocolValueSetId
capabilityId
capabilityHandle
freezeTransactionId
oProposalId
oActivationId
```

All execution, evidence-admission, freeze-write, protocol-write, budget-write, O, promotion, and
deployment authority flags are false. The audit receipt has `referenceOnly=true` and
`grantsAuthority=false`.

## Secret, data, and repository checks

- No private-key block, API-token pattern, bearer token, or AWS access-key pattern was found in the
  new source or sealed artifacts.
- No provider credential was requested, read, stored, or used.
- No API, provider, model, Codex CLI backend, benchmark, evaluator vault, task body, raw output,
  protected task path, real dataset handle, or numeric measurement was accessed.
- No sentinel or statistical margin was filled.
- No calibration plan/envelope, protocol/budget identity, freeze transaction, or `O` record was
  created.
- No existing governance artifact or outstanding-obligations body was modified.
- The worktree was clean after verification and replay rejection.
- No Git push was performed. `origin/main` remains
  `8b5f14400a7723c821bc54420e55da58dfa7601b`.

## Claim boundary

The evidence supports only this narrow claim:

> Closed, body-free public-development schemas for E0-E4, a one-way semantic graph verifier, an
> unissued synthetic capability descriptor, and a two-layer signed readiness/audit chain were locally
> implemented and deterministically verified.

It does not establish estimator adequacy, sample sufficiency, real capability security, provider or
model identity, environment reproducibility, pricing, calibration validity, numeric admissibility,
matched-budget fairness, performance, attribution, generalization, confidentiality, containment,
security certification, evolution, or self-improvement.

## Requested review questions

1. Are all 13 record shapes sufficiently closed and body-free for this readiness scope?
2. Is exclusive role ownership cryptographically and semantically separated enough to prevent
   evaluator/scorer collapse, wrappers, delegation, proxying, aliasing, and co-signing?
3. Does the immediate-predecessor graph plus cross-stage completeness logic correctly prevent E0/E1
   bypass and unverified E4 release?
4. Do the disclosure schemas and exact commitment domains prevent protected/raw material from being
   smuggled into E0-E4 fields?
5. Does the descriptor remain clearly non-issued, non-consumed, replay-free, and non-authorizing?
6. Are the validly re-signed attacks and independent receipt sufficient for this non-empirical scope?
7. Does the two-commit construction preserve non-self-reference and append-only auditability?
8. Has the implementation stayed inside the prior authorization and claim boundary?

Please identify any blocking finding precisely. If the decision is `APPROVE`, authorize only the next
smallest offline step needed toward a future calibration freeze, and keep actual execution, real data,
nonzero budgets, provider credentials/calls, sentinel filling, final identities, `O`, promotion,
deployment, and empirical/security/evolution claims prohibited unless separately reviewed.
