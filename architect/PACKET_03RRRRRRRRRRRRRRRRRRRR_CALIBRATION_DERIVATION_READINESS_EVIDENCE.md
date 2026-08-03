# Architect Packet 03RRRRRRRRRRRRRRRRRRRR — Synthetic calibration-derivation readiness evidence

Date: 2026-08-03  
Requested decision: `APPROVE`, `REVISE`, or `BLOCK` for this offline synthetic-readiness implementation only

## Review boundary

This packet reports only the next scope authorized by the Round
03RRRRRRRRRRRRRRRRRRR ruling: content-addressed, pure deterministic public-development programs for
`F`, `G`, `J`, `K`, `L`, and `M`; a closed
`calibration_derivation_program_readiness` schema and signed record; an independent semantic verifier;
one nested independent-verifier statement in one reference-only audit-store receipt; synthetic
conformance tables; and validly re-signed attacks.

It is not a `CalibrationPlanManifest`, calibration envelope, pilot receipt, protocol freeze, budget
freeze, provider/model/environment/price selection, or empirical result. It does not call a provider,
use Codex CLI as a provider backend, request or use a credential, unlock a vault, read a task body,
execute a benchmark or research scheduler, fill a sentinel or margin, allocate a final identity, run
B0–B6, attribute a failure, construct a mutation/candidate, select/promote/deploy, push, publish, or
make a performance, fairness, attribution, generalization, confidentiality, containment, security,
evolution, or self-improvement claim.

## 1. Bound authorization

| Item | Exact identity |
|---|---|
| Authorizing implementation-evidence packet | `architect/PACKET_03RRRRRRRRRRRRRRRRRRR_CALIBRATION_CONTRACT_EVIDENCE.md` |
| Packet raw SHA-256 | `f423c31fdbe44537bfbe8a45d23e85bccf7e3df2121c0962727b0d4af4de3f99` |
| Architect ruling | `.codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrrrr.md` |
| Ruling raw SHA-256 | `cda739fc3e64172150154c95d9c8ce0efa354c52bd030a293e96b503cd8a4862` |
| Decision | `APPROVE` |
| Blocking findings | none |
| Bound numeric-freeze entry | `nfe-sha256:7517cce6f2878429161bd73154d1ef71f5bb8fe27ca3a77e08b4b55b43df268f` |
| Bound calibration contract | `cc-sha256:8d4ffe8fc9fee52dd3b81b58ae8c7ba65b0bafc4f1d7079f91f3e810f20fff9f` |

The approved entry and calibration contract are byte-bound by their existing raw hashes. Neither is
edited. Their 25 pending sentinels, separate statistical-margin group, null final identities, and seven
unresolved trust obligations remain unchanged.

## 2. Non-self-referential source and sealing commits

| Stage | Commit | Tree | Contents |
|---|---|---|---|
| clean implementation source | `83ac355b2505ad601ddf4eb9631aa9a3d1c67be6` | `92d27052490f0197e8e6876e1312fd07a190665b` | pure programs, synthetic vectors, readiness model/schema, independent verifier, generator, verify CLI, tests, docs, exports, commands; no generated readiness record |
| record sealing | `41534f69c4816169219e89bb922e8846a2aa3e61` | `1b262f85676ca41ad0ad201b1e374dc3905b561b` | exactly one readiness record and one reference-only audit receipt |

All 19 source artifacts in the signed record point to the clean implementation commit. The sealing
commit adds exactly two files. Generation required a clean worktree and uses create-exclusive `wx`
writes. A second invocation failed with `EEXIST`; the before/after hashes remained identical and the
worktree remained clean.

No Git push occurred. `origin/main` remains
`8b5f14400a7723c821bc54420e55da58dfa7601b`; local `main` is ahead only.

## 3. Behavior-bearing source hashes

| Artifact | Raw SHA-256 |
|---|---|
| readiness schema | `d1131367582d124ed4a63985dfada42a68414364e795a9eefcd22b0b0107240f` |
| pure derivation programs | `a3dd0330967e4c269b46a88dbf2056eb402ef7003e930ad717c4eaf7112e4e6e` |
| public synthetic vectors | `ac663be24c21f1e96dd25f11fd915c69043814b176f2dc3bf55fdfc3c1f222eb` |
| readiness model/signatures | `d96badfd81742f99fbc20a5c6d90cd065324a7611404cb6ea692e4316c3116e3` |
| independent verifier | `b822c2eb4ff9962a82cbae1ebcac0ea77ee4448d1369a12d3abc81f67210fe03` |
| generator | `7670fd965f99d6179cb63dca8cd692bd9809c4075f760d200a8593900a1a6c07` |
| verify CLI | `01a2e40e9c5c8bb30d546bf057cf0572c29d989fce1898ffa268c05cb9c62ccc` |
| program tests | `29bac90481b2ddb7b0fe03735d2681a31f20c7e1b793dd181a253d557440c59a` |
| readiness/adversarial tests | `d04eef65c081bb01b865406c55014ee671a17df4a97bcbb20dad91db68102858` |
| documentation | `2754869d88aba2f3f22d5fc86596ac074c345c49fc95e3c9d9ca47ebd9da1e2d` |

Each of the six program identities is content-addressed over the exact program-source hash plus its
target, estimator, candidate bound, confidence/failure threshold when applicable, selection rule, tie
rule, and rounding rule.

## 4. Frozen generic program behavior

### F — per-request rollout-token cap

- one to eight explicit candidates; no default candidate;
- required strata are closed, sorted, and present for every candidate;
- one-sided 95% Wilson upper bound with `zMicros=1644854`;
- bound rounded upward to probability micros;
- every stratum must be at most `10,000` probability micros (1%);
- smaller feasible cap wins; duplicate cap values are rejected;
- missing usage must be charged at reservation; incidents and missing strata withdraw.

### G — empirical phase resource caps

- one to eight explicit candidates per closed phase/resource grid;
- the same Wilson rule and measurement-quality dispositions as F;
- smaller feasible raw cap wins;
- selected value rounds upward to the declared positive integer quantum;
- no resource reordering, duplicates, unknown resource type, partial success, or incident exclusion.

### J — synthetic cost-cap arithmetic

- consumes only a structurally and content-addressedly valid selected synthetic G result;
- supplied schedule must declare synthetic pricing, null provider/model/real-price source;
- request cost is exact integer-micro multiplication;
- input and output token-price components are each rationally rounded upward to integer micros before
  summation;
- absent request/input/output cap for any required phase withdraws.

### K and L — rollout count and seed stream

- count grid is exactly and only `{2,3,5,8}`;
- smallest count with MCSE at most 100 basis points and seed-variance share at most 2,000 basis points
  wins;
- no feasible count produces a non-admissible `precision_limited_synthetic_only` result at 8;
- L uses full SHA-256 output under domain `seh.calibration.synthetic.seed-stream.v1` and ascending
  zero-based counters;
- domain, ordering, digest size, and exact count cannot drift.

### M — statistical margins

- one to eight explicit candidates, strictly ordered by allowed loss;
- smaller allowed loss is stricter and wins when feasible;
- power and retention must each be at least 8,000 basis points;
- allowed loss cannot exceed the predeclared maximum or one-task resolution;
- safety margin is exactly zero; no feasible candidate withdraws.

These are generic deterministic program semantics only. The record contains no protocol candidate grid
values, no real price, and no assertion that the estimator will be adequate on a future sample.

## 5. Synthetic-only conformance evidence

The record contains 11 manually authored public-development vectors:

```text
F: smallest-feasible selection
F: missing-usage withdrawal
F: infrastructure-incident withdrawal
F: post-result-grid-modification withdrawal
G: smallest-feasible plus upward resource rounding
J: componentwise upward integer-micro arithmetic
K: smallest feasible count
K: precision-limited count
L: domain-separated zero-based seed order
M: strictest feasible margin
M: no-feasible withdrawal
```

Every vector wrapper and every generated result independently carries:

```text
publicDevelopment                 = true
authorizedForResearchEvidence     = false
admissibleAsNumericFreezeValue    = false
confirmatory                      = false
```

Every input header fixes protected-data, provider-smoke, public-fixture, benchmark, evaluator-vault,
real-price, provider/model-identity, and protected-capability ancestry to absent. The readiness policy
also denies filesystem writes, shell/Git, network, provider, benchmark, and protected-data capabilities.

The independent verifier checks fixed input and result hashes, reruns every program, independently
recomputes every synthetic result ID, and rejects any mismatch. No synthetic result is bound to a
sentinel, statistical margin, `ProtocolManifest`, `BudgetFreezeManifest`, plan, envelope, or research
claim.

## 6. Signed readiness record and audit receipt

### Protocol-author readiness record

| Field | Value |
|---|---|
| Path | `governance/gate3/calibration-derivation-program-readiness.json` |
| Byte size | 47,736 |
| Raw SHA-256 | `ba2b142c7ac81b86ab45685eef53c20fd85e1ca1c4932501e244503a803e8c7c` |
| Content ID | `cdr-sha256:d10bb58f4222876c1dd431c42cdd599e4c2317712abb314fff7e2bd699dfb08d` |
| Internal hash | `sha256:b8c6239012c2a40a7f85fc64642d82d4edaed91eb845a2c1ee84026534cc7a10` |
| Record type | `calibration_derivation_program_readiness` |
| Status | `synthetic_programs_ready_only` |
| Signer | `protocol_author` |
| Programs / vectors | 6 / 11 |

### Reference-only audit-store receipt

| Field | Value |
|---|---|
| Path | `governance/gate3/calibration-derivation-program-readiness-audit-receipt.json` |
| Byte size | 4,406 |
| Raw SHA-256 | `1e1b652b9dfffd584e08c978de812460db2d838ef80a47f0c94d82b947ad54db` |
| Receipt ID | `cdrar-sha256:c236c508f6feaff7fa023e08af690a4aa79faac625172ac4bbe2c2121e5a6466` |
| Internal hash | `sha256:d512613ae24204159f7c2e5a0f58a816bf4c5441ef5e8ae019a99218e26d50cc` |
| Nested statement signer | `independent_verifier` |
| Outer receipt signer | `audit_store` |
| `referenceOnly` / `grantsAuthority` | `true` / `false` |

The protocol author, independent verifier, and audit store are pairwise unequal across principal ID,
instance ID, key ID, public-key digest, and process identity. Each has empty current handles,
delegations, and aliases. The nested verifier statement binds the exact readiness ID, internal hash, raw
bytes, and verification result; the outer audit receipt separately binds and signs that statement.

Only public keys and Ed25519 signatures are serialized. No private key, API key, provider token, browser
material, or reusable capability handle is present.

## 7. Adversarial evidence

The readiness test reconstructs a fresh outer content ID, internal hash, public principal, and valid
protocol-author Ed25519 signature for every mutated record. It verifies the cryptographic signature
before presenting the record to the independent verifier. Thirty-five cryptographically valid modified
readiness records are rejected across:

- cap/margin grid enlargement, actual protocol candidate insertion, and hidden defaults;
- estimator or 95% confidence drift;
- downward rounding or reversed tie rules;
- accepting missing strata, undercharged missing usage, or infrastructure incidents;
- post-result grid or commitment mutation;
- seed domain/order drift;
- MCSE, seed-variance, power, or retention threshold widening;
- active `O -> D`, removal of its prohibition, or a synthetic-to-sentinel binding;
- provider-smoke/public-fixture ancestry and removal of the ancestry prohibition;
- principal/process collapse, role alias, or delegated authority;
- nonzero provider or wall-clock budget;
- final protocol or calibration-envelope identity allocation;
- research/calibration authority or numeric-admissibility escalation;
- a correctly signed readiness record created by a non-protocol-author; and
- source-program artifact-hash substitution.

An additional receipt attack substitutes the referenced readiness bytes without changing either nested
or outer receipt and is rejected. Pure-program tests separately reject more than eight cap candidates,
extra implicit-default fields, missing strata, cost inputs with provider identity, count-grid
enlargement, margin ties, forbidden ancestry, and domain/order changes.

## 8. Deterministic verification results

| Check | Result |
|---|---|
| TypeScript `check` | pass |
| TypeScript `build` | pass |
| Full deterministic suite | 179 tests, 5 suites, 179 pass, 0 fail |
| Full suite duration | 332,891.585514 ms |
| New focused suites | 24 tests, 24 pass, 0 fail |
| Program focused coverage | 96.92% lines, 90.30% branches, 100.00% functions |
| Synthetic-vector builder coverage | 100.00% lines/branches/functions |
| Readiness model coverage | 98.95% lines, 100.00% branches, 88.89% functions |
| Independent verifier coverage | 98.57% lines, 94.87% branches, 84.21% functions |
| Sealed readiness file verifier | pass: 19 artifacts, 6 programs, 11 vectors, 4 withdrawals, 1 precision-limited, 7 unresolved, 0 authorities |
| Existing calibration-contract verifier | pass: 25 sentinels, 8 groups, 12 phases, 7 unresolved, 0 authorities |
| Existing numeric-freeze verifier | pass: 25 sentinels, 7 unresolved, 0 authorities |
| Trust-plane conformance verifier | pass: 7 domains, 52 artifacts, 7 unresolved, 0 authorities |
| Create-exclusive replay | second generation fails `EEXIST`; both sealed raw hashes unchanged |
| New-file secret scan | no API-token, bearer-token, or private-key pattern |
| Worktree | clean |

The full suite re-exercised the standalone model/tool loop, sandbox, sessions, typed components,
worktrees, external evaluator and crash recovery, first-class evolution lifecycle, OS-principal vault and
synthetic custody, matched budgets, provider proxy, promotion/rollback, and trust aggregation without a
regression.

## 9. Exact zero-authority and claim state

Every research execution budget field is zero, including provider/model attempts, tokens, cost, tools,
process/time/CPU/memory/output, vault/protected access, task/calibration execution, feedback,
mutation/candidate/evaluation, selection/promotion/deployment, identity/price selection, plan/envelope,
sentinel/manifest writes, and Git pushes.

All authority flags are false. All research/gate/final/held-out/sealed/temporal/promotion/calibration/
protocol-freeze and numeric-admissibility eligibility flags are false; only
`publicDevelopment=true`. `finalProtocolId`, `budgetFreezeId`, `calibrationPlanManifestId`,
`calibrationEnvelopeId`, and `selectedProtocolValueSetId` are null.

The record claims only that deterministic synthetic programs and conformance checks are implemented.
It explicitly states that calibration was not performed, numeric values were not frozen, estimator
adequacy was not established, and no performance, fairness, attribution, security, evolution, or
self-improvement evidence exists.

## 10. Decision requested

Please decide:

1. Do the six pure programs faithfully implement the previously approved generic grid, estimator,
   selection, tie, rounding, failure, and withdrawal rules without choosing protocol values?
2. Does the signed readiness record remain synthetic-only, non-evidentiary, non-admissible, and
   incapable of writing to pending sentinels or final manifests?
3. Are the content-addressed source bindings, pairwise role separation, nested independent statement,
   reference-only audit receipt, and two-commit layout sufficient for this narrow readiness scope?
4. Do the 35 validly re-signed mutations, exact vector recomputation, aggregate verifiers, and
   create-exclusive replay adequately test the approved attack list?
5. If approved, what is the next strictly offline/no-provider/no-benchmark/no-protected-data scope?

Do not authorize an actual calibration plan/envelope, nonzero budget, credentials, provider/model/real
price selection, task or benchmark access, sentinel or margin fill, final IDs, B0–B6, attribution,
mutation, candidate selection/promotion/deployment, Git push/publication, or empirical claims from this
packet.

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK

SOURCE_AND_SEALING:
PROGRAM_AND_STATISTICAL_SEMANTICS:
SYNTHETIC_INPUT_AND_OUTPUT_BOUNDARY:
IDENTITY_SIGNATURE_AND_AUDIT_BOUNDARY:
ADVERSARIAL_AND_VERIFICATION_EVIDENCE:
ZERO_AUTHORITY_AND_CLAIM_BOUNDARY:
BLOCKING_FINDINGS:
AUTHORIZED_NEXT_SCOPE:
STILL_PROHIBITED:
```
