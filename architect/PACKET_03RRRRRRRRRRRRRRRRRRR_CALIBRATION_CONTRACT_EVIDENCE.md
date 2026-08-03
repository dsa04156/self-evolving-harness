# Architect Packet 03RRRRRRRRRRRRRRRRRRR — Zero-execution calibration-contract evidence

Date: 2026-08-03  
Requested decision: `APPROVE`, `REVISE`, or `BLOCK` for the authorized offline implementation only

## Review boundary

This packet reports the implementation evidence authorized by the Round
03RRRRRRRRRRRRRRRRRR ruling. It contains one closed calibration-contract schema, one deterministic
semantic verifier, one protocol-author-signed public-development preregistration, one reference-only
audit receipt, validly re-signed attacks, and directly relevant documentation under a two-commit
layout.

It does not perform calibration, select or call a provider/model, request or use credentials, unlock a
benchmark or vault, access a task body, fill a sentinel, allocate a nonzero budget or final identity,
run B0–B6, construct a mutation/candidate, select/promote/deploy, push, publish, or make an empirical,
security, evolution, or self-improvement claim.

## 1. Bound authorization

| Item | Exact identity |
|---|---|
| Separation packet | `architect/PACKET_03RRRRRRRRRRRRRRRRRR_EVALUATOR_SCORER_SEPARATION.md` |
| Separation packet raw SHA-256 | `d7ae7b647c58ff735dbd676390dd79300d26011ef8db85a8b3b979537c172ac6` |
| Architect ruling | `.codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrrr.md` |
| Architect ruling raw SHA-256 | `809987398f5abf6045cf62d6e91153332a406d3f671f784c37339f5a6a57e443` |
| Decision | `APPROVE` |
| Blocking findings | none |
| Approved numeric-freeze entry | `nfe-sha256:7517cce6f2878429161bd73154d1ef71f5bb8fe27ca3a77e08b4b55b43df268f` |

The implementation preserves the accepted preregistration packet and its `REVISE` ruling rather than
rewriting that history. The later separation packet and `APPROVE` ruling are a distinct signed
correction binding.

## 2. Non-self-referential source and sealing commits

| Stage | Commit | Tree | Contents |
|---|---|---|---|
| clean implementation source | `f8e9df2053c958131fd47385e688f6560b3034c3` | `a60897009ddf04b0a4ffb09c5f948d4bcc08a721` | schema, model, independent verifier, generator, verify CLI, tests, docs, principal-role definitions, exports, commands |
| record sealing | `4c13b841a30413bc617999edd429829181acbce6` | `108b91b442d6ee972354e5e225ee6f391ffb8a58` | exactly one signed contract and one reference-only audit receipt |

Every one of the contract's 22 artifact references points to the clean source commit. Neither generated
record names itself as source evidence. Generation required a clean worktree and used create-exclusive
file semantics.

## 3. Signed contract and audit receipt

### Calibration contract

| Field | Value |
|---|---|
| Path | `governance/gate3/calibration-contract-preregistration.json` |
| Byte size | 30,461 |
| Raw SHA-256 | `5231c0152ee359e42c1879ecc4d1740c8eafde132bd501f8e4196f217128d22d` |
| Content ID | `cc-sha256:8d4ffe8fc9fee52dd3b81b58ae8c7ba65b0bafc4f1d7079f91f3e810f20fff9f` |
| Internal contract hash | `sha256:004bd1d7ae369a6e29978117d83539dec90633f3da3f6d1a0c5d5a6fbf3c8f56` |
| Signer role | `protocol_author` |
| `zeroExecution` | `true` |
| `status` | `preregistered_only` |
| `evidencePresent` | `false` |
| `authorizedForResearchEvidence` | `false` |
| `finalProtocolId` / `budgetFreezeId` | `null` / `null` |

The record contains public principals and Ed25519 attestations only. It contains no private signing key,
provider credential, API token, browser material, or reusable capability handle.

### Reference-only audit receipt

| Field | Value |
|---|---|
| Path | `governance/gate3/calibration-contract-preregistration-audit-receipt.json` |
| Byte size | 2,514 |
| Raw SHA-256 | `b3a43954c251d7b991c7e6d27b30ec6e353ebec506ae809b0a615eaa8375b270` |
| Receipt ID | `ccar-sha256:5991e59e2f7e0b11a74616c2e4f6be347b64560c9782857c21d2764a95dbee9f` |
| Internal receipt hash | `sha256:0f4ed49ee4941dcd9c1cdcc5abef5418f8445bdea7f7ea9c6ad2bfb17f7429a4` |
| Signer role | `audit_store` |
| Contract body duplicated | `false` |

The receipt carries only contract path, source commit/tree, byte size, raw hash, content identity,
verification flags, audit identity, and attestation. It grants no authority.

## 4. Closed numeric and derivation contract

The schema and semantic verifier jointly bind:

- exactly 25 original sentinels and eight original pending groups;
- the existing 12 phase IDs and wildcard expansion;
- six closed derivation classes and 26 assignments, including the non-sentinel
  `statisticalMargins` group;
- five deterministic rule families with the accepted candidate bounds, sampling units, selection,
  precision, rounding/tie, failure, and withdrawal dispositions;
- the 15-node acyclic numeric dependency graph and the prohibition on `O -> D`;
- joint-only atomic `ProtocolManifest + BudgetFreezeManifest` freeze after all payload bytes exist;
- no sentinel/classification/default/synthetic fixture/protected result/unverified E1/E2 as a value;
- amendment only under a new protocol identity with permanent evidence non-pooling; and
- all seven outstanding trust obligations still `unresolved` with `evidencePresent=false`.

No derivation rule is executed by this artifact.

## 5. Evaluator/scorer trust separation

The contract carries separate future public identities for `calibration_evaluator` and
`calibration_scorer`. The verifier checks inequality of:

```text
principalId
instanceId
keyId
publicKeyDigest
processIdentity
writableMountRoot
```

It additionally checks distinct canonical mount-source and backing-object identities, public-key
digest correctness, disjoint namespaces, empty delegation/alias/rotation/current-handle arrays, and
`mounted=false` for both reserved roots.

Closed matrices cover:

- two reserved future mounts with no current write capability;
- four-role data access for evaluator, scorer, independent verifier, and protocol author;
- seven future capability descriptions, all `granted=false`, `delegable=false`, handle `null`;
- four signed one-way message flows; and
- ten record classes with exactly one creator each and proxy/wrap/alias/delegate/co-sign/reuse denied.

The scorer cannot read task bodies, raw output, verifier source, credentials/provider capability, or
evaluator raw storage. The independent verifier cannot read evaluator raw bytes or create measurements
or aggregates. The protocol author cannot read task-level measurements or evaluator/scorer private
storage.

## 6. Evidence graph

Required nodes and flow:

```text
A + B + C -> D
D -> E0
E0 -> E1
E1 + signed accounting + frozen scoring program -> E2
E2 + reference-only E1 roots -> E3
E3 -> E4
E4 -> F, G, K, M
accepted prerequisites + F/G/H/J/K/L/M/N -> O
```

Forbidden edges are exact:

```text
E1 -> E4
E0 -> E2
evaluator_raw -> E2
E1 -> O
E2 -> O
O -> D
```

The verifier compares the complete node/edge sets, not only selected edges.

## 7. Adversarial contract

`test/calibration-contract.test.ts` rebuilds the outer content ID, internal hash, public-principal
binding, and valid protocol-author signature after each contract mutation. Rejection therefore cannot
be attributed merely to a stale outer signature.

Thirty-one validly signed contract attacks are rejected across:

- all six evaluator/scorer identity inequalities;
- same underlying canonical mount source or backing object under aliases;
- inconsistent duplicate mount matrix;
- delegated capability, role alias, or granted current capability;
- scorer protected-data access;
- protocol-author task-measurement access;
- verifier evaluator-raw access;
- evaluator aggregate creation, verifier measurement creation, or combined record type;
- direct evaluator-to-author release, scorer executor-receipt bypass, evaluator-raw edge, or graph
  omission;
- sentinel, group, or derivation-class drift;
- nonzero provider and wall-clock budget;
- premature final protocol ID;
- calibration/research authority or eligibility escalation; and
- a correctly signed contract from the wrong creator role.

One additional audit attack substitutes contract bytes without changing the receipt and is rejected.

## 8. Deterministic verification results

| Check | Result |
|---|---|
| TypeScript `check` | pass |
| TypeScript `build` | pass |
| Full deterministic suite | 155 tests, 3 suites, 155 pass, 0 fail |
| Full suite duration | 317,207 ms |
| Contract-focused suite | 8 tests, 8 pass, 0 fail |
| Contract model focused coverage | 100.00% lines, 100.00% branches, 100.00% functions |
| Independent verifier focused coverage | 98.77% lines, 98.21% branches, 84.21% functions |
| Independent calibration-contract file verifier | pass |
| Existing numeric-freeze file verifier | pass |
| Aggregate trust-plane conformance verifier | pass; 7 domains, 52 artifacts, 7 unresolved obligations, 0 authorities |
| New secret scan | no API-token or private-key pattern in implementation, contract, or receipt |
| Repository private-key marker scan | no tracked private-key marker |
| Worktree after asynchronous test cleanup | clean |
| Remote non-publication | local and remote `origin/main` both remain `8b5f14400a7723c821bc54420e55da58dfa7601b` |

The full suite exercised the existing runtime loop, tools/sandbox, session lifecycle, versioned
components, worktree isolation, external evaluator, evolution lifecycle, vault/OS principals,
synthetic custody, recovery, promotion/rollback, and trust aggregation without a regression.

## 9. Exact zero-authority state

```text
provider/model request attempts = 0
provider tokens/cost            = 0
runtime tool attempts           = 0
task/calibration executions     = 0
process/time/CPU/memory/output  = 0
vault/protected accesses        = 0
feedback/research schedulers    = 0
mutation/candidate/evaluation   = 0
selection/promotion/deployment  = 0
Git pushes                      = 0

providerExecutionAuthorized      = false
calibrationExecutionAuthorized   = false
contractActivationAuthorized     = false
protectedDataAccessAuthorized    = false
researchEvidenceAuthorized       = false
candidateSelectionAuthorized     = false
promotionAuthorized              = false
deploymentAuthorized             = false
claimAuthorityGranted            = false

finalProtocolId = null
budgetFreezeId  = null
```

## 10. Decision requested

Please decide:

1. Does the schema plus semantic verifier faithfully implement the accepted numeric, atomic-freeze,
   failure, evaluator/scorer, mount/data/capability/message/creator, and E0–E4 contracts?
2. Does the two-commit layout prevent record self-reference and bind every behavior-bearing source?
3. Is the signed contract still strictly zero-execution, public-development-only, non-evidentiary, and
   non-authorizing?
4. Are the validly re-signed attacks and independent artifact verification sufficient for this narrow
   implementation scope?
5. If approved, what is the next strictly offline, no-provider, no-benchmark, no-research scope before
   any calibration envelope or nonzero budget could be considered?

Do not authorize provider/model/benchmark/calibration/research execution, credentials, nonzero budgets,
sentinel fill, final IDs, B0–B6, candidate selection, promotion, deployment, push/publication, or claims
from this packet.

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK

SOURCE_AND_SEALING:
SCHEMA_AND_SEMANTIC_ADMISSION:
IDENTITY_MOUNT_DATA_CAPABILITY_BOUNDARY:
MESSAGE_RECORD_AND_EVIDENCE_GRAPH:
ADVERSARIAL_AND_VERIFICATION_EVIDENCE:
ZERO_AUTHORITY_AND_CLAIM_BOUNDARY:
BLOCKING_FINDINGS:
AUTHORIZED_NEXT_SCOPE:
STILL_PROHIBITED:
```
