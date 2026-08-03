# Architect Gate: Calibration Terminal Evidence Correction

## Requested decision

Return exactly one primary decision: `APPROVE`, `REVISE`, or `BLOCK`.

Review only the minimum correction authorized by the prior `REVISE`: mutually exclusive terminal
dispositions, exact E0-to-E1 execution/usage accounting, branch-bound E3 verification, aggregate-only
E4 eligibility, three replacement fixtures, the twelve named validly re-signed attacks, and the
append-only v2 readiness seal.

This packet does not request permission for actual calibration, a calibration plan or envelope,
capability issuance, provider/model selection or calls, protected data, a nonzero budget, sentinel or
margin values, final identities, `O`, B0-B6 research, attribution, mutation, candidate selection,
promotion, deployment, push, publication, or an empirical/security/evolution claim.

## Prior decision and exact correction authority

- prior packet:
  `architect/PACKET_03RRRRRRRRRRRRRRRRRRRRRR_CALIBRATION_EVIDENCE_CONTRACT_READINESS_EVIDENCE.md`
- prior packet SHA-256:
  `6b6fef15530868c4a1c00965db36e5222ba56712a6e4f7b4ff60aa38cce79b7e`
- prior ruling:
  `.codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrrrrrrr.md`
- ruling raw SHA-256:
  `0e73d97bc113da856a2ddbb0a38cf40022cb4de0032dbaa96ae93fafcf36914c`
- decision: `REVISE`

The ruling accepted the 14-way closed inventory, exclusive role ownership, body-free disclosure,
one-way E0-E4 graph, unissued capability, source/seal/audit layout, and zero-authority claim
discipline. The sole blocker was one contradictory attempt containing aggregate, withdrawal, scorer
failure, and E4 together, plus incomplete E0-to-E1 execution/usage accounting.

The correction below does not broaden that scope.

## Non-self-referential correction lineage

### Preserved rejected evidence

The rejected readiness and receipt remain unchanged at their original paths. The correction does not
rewrite or delete either artifact. Their exact identities are bound as prior inputs in v2:

```text
prior readiness ID    cecr-sha256:426f217d824d416fbfe49a472a8f1a7fe5a397d9914c5dcf2f498ec96e211c16
prior readiness hash  sha256:1ef20a04ec0d5328def4eda2e988497ed3e2f297ab60905011d2adbfaf351595
prior readiness raw   sha256:03c593cec50b2c446f8d69680df608df914b019945747365f1894134ddfb6830
prior receipt ID      cecrar-sha256:1cdee884a76bacd0807117eda24185e554a8d1f7fd09b476f8e681933cb6988f
prior receipt hash    sha256:39bb021229f501d62811744a8c061de7e89fdbebaa4c678da283779c5fbfcfcb
prior receipt raw     sha256:5a13e826e20f30152dfa610256cd81d08a97951fa812db781bb37a73e2392933
prior ruling raw      sha256:0e73d97bc113da856a2ddbb0a38cf40022cb4de0032dbaa96ae93fafcf36914c
prior decision        REVISE
```

### Clean correction source

```text
commit  0e33dc21fc4aa74bd2800d7c69f9bd74c11d52ee
tree    9c8baad2ee6289fce774abb9d5f0c9b81c18da79
subject fix: enforce calibration terminal evidence accounting
```

This commit changes exactly eight implementation/schema/test/documentation files, with 813 insertions
and 178 deletions. It contains neither v2 generated artifact.

### Append-only seal

```text
commit  9ff245541d79f96366d3108ff12e9a2fc269aaec
tree    2209a1b9103525a60c6aa0b2484aeb2320317d42
subject governance: seal calibration terminal evidence correction
```

The seal adds exactly two new one-line canonical JSON files:

- `governance/gate3/calibration-evidence-contract-readiness-v2.json`
- `governance/gate3/calibration-evidence-contract-readiness-v2-audit-receipt.json`

All 21 source/evidence references in v2 point to the earlier source commit and tree. The references
include the prior rejected readiness, prior receipt, and exact `REVISE` response, so rejection history
cannot be erased or silently relabeled.

Create-exclusive generator replay after sealing failed with `EEXIST`. The worktree remained clean and
the artifact hashes were unchanged.

## Exactly one terminal disposition

Every record in one attempt carries the same opaque `attemptCommitment`. Mixing attempt commitments is
rejected. Exactly one terminal branch must be derivable from E2:

| E2 terminal disposition | Required E3 disposition | Aggregate | Withdrawal | Terminal scorer failure | E4 |
|---|---|---:|---:|---:|---:|
| `aggregate_succeeded` | `verified_aggregate` | exactly 1 | 0 | 0 | exactly 1 |
| `calibration_withdrawn` | `verified_withdrawal` | 0 | exactly 1 | 0 | 0 |
| `calibration_failed` | `verified_failure` | 0 | 0 | at least 1 | 0 |

The verifier computes the branch from signed E2 records rather than trusting an asserted label. It
then requires E3 `disposition`, `terminalRecordIds`, `aggregateRecordId`, `withdrawalRecordId`,
`failureRecordIds`, `aggregateVerified`, and `e4Eligible` to match that branch exactly.

E4 is accepted only when all of these hold:

1. E3 disposition is `verified_aggregate`;
2. exactly one aggregate is present;
3. no withdrawal or terminal scorer failure exists;
4. E3 binds that aggregate and is E4-eligible;
5. E4 depends exclusively on that E3 receipt and references the same aggregate.

Withdrawal or failure attempts containing any E4 record are rejected.

## Aggregate-success completeness

`aggregate_succeeded` additionally requires:

- all expected strata have one complete measurement;
- no `missing_declared` measurement;
- no evaluator failure;
- no executor, evaluator, or scorer incident;
- exact aggregate dependency coverage of every E1 record;
- exact ordered E1 list;
- exact expected and observed stratum sets;
- observed stratum entries reference matching E1 measurements;
- the precommitted grid is unchanged;
- zero unresolved evaluator failures and zero unmatched incidents;
- no withdrawal and no terminal scorer failure.

Absent evidence therefore blocks aggregate success rather than being interpreted as success.

## Exact E0-to-E1 accounting

For each of the two precommitted synthetic strata, the fixture must contain exactly:

- one `CalibrationExecutionReceipt`;
- one `CalibrationUsageReceipt` naming that execution;
- one `CalibrationMeasurementCommitment` naming and depending on both.

The verifier reconstructs the following invariants from signed records:

1. execution strata equal the expected stratum set exactly;
2. usage strata equal the expected stratum set exactly;
3. measurement strata equal the expected stratum set exactly;
4. usage and measurement execution IDs name the matching stratum execution;
5. each measurement names and depends on one matching execution and one matching usage;
6. execution, usage, and measurement accounting-head commitments match;
7. every E0 execution and usage is referenced exactly once by E1;
8. every E0 incident is referenced exactly once by one E1 failure or incident;
9. evaluator failure/incident strata match the referenced E0 incident;
10. every evaluator incident commitment is matched by its stratum measurement;
11. every E1 record is consumed exactly once across E2 dependencies;
12. no E0/E1 orphan, duplicate use, cross-stratum reuse, or unmatched incident is allowed.

All of this remains body-free: IDs and SHA-256 commitments are present, but task bodies, raw outputs,
labels, answers, verifier source, protected paths, credentials, provider/model identities, and numeric
measurements are absent.

## Three replacement deterministic scenarios

The contradictory 14-record attempt was removed. The current builder creates three separate in-memory
attempts, verifies each independently, and discards them:

```text
success     9 records  E0=4 E1=2 E2=1 E3=1 E4=1
            aggregate_succeeded -> verified_aggregate -> E4

withdrawal 12 records  E0=6 E1=4 E2=1 E3=1 E4=0
            missing_declared + evaluator failure -> calibration_withdrawn
            -> verified_withdrawal -> no E4

failure     9 records  E0=4 E1=2 E2=2 E3=1 E4=0
            terminal scorer failure -> calibration_failed
            -> verified_failure -> no E4
```

Across the three fixtures: 30 synthetic records, zero persisted evidence records, zero issued or
consumed capabilities, zero provider/model calls, zero protected accesses, zero final identities,
zero `O`, and zero authority grants.

## Twelve newly required signed attacks

Each modified record is recomputed in the correct content-ID domain, internally rehashed, and signed
with a valid Ed25519 key for its exclusive creator role before the attempt verifier rejects it. The
new test covers all twelve requested families:

1. aggregate plus withdrawal;
2. aggregate plus terminal scorer failure;
3. E4 after `verified_withdrawal`;
4. E4 after `verified_failure`;
5. successful aggregate with `missing_declared`;
6. successful aggregate with evaluator failure;
7. orphan E0 execution;
8. orphan E0 usage;
9. one E0 execution reused by an incompatible E1 measurement;
10. E1 measurement with execution but no usage;
11. E0/E1 stratum mismatch;
12. E3 success disposition mismatching a withdrawal E2 branch.

The pre-existing creator, role-collapse, bypass, ordering, grid substitution, protected-data,
eligibility, nonzero-budget, final-ID, `O`, capability-lifecycle, readiness escalation, wrong-role,
artifact-substitution, and byte-substitution attacks remain in the same suite. The sealed fixture
contract requires a minimum of 30 validly re-signed attack families.

## Nested independent verification and audit binding

The signed v2 readiness binds the exact terminal-scenario contract and its semantic hash. The
independent verifier's signed nested statement now additionally binds:

```text
priorReviseBindingValid=true
threeTerminalScenariosVerified=true
terminalBranchesMutuallyExclusive=true
e0ToE1CoverageExact=true
e3DispositionBoundToE2=true
e4EligibilityExact=true
```

The distinct audit-store signature covers that nested statement and the exact readiness-byte hash.
The receipt remains reference-only and grants no authority. A one-byte readiness substitution is
rejected under both signature layers.

## Sealed identities

```text
readiness ID        cecr-sha256:4aae7c02ac8f68d0aa06546316d76f35bbe4e1b6260736a1c457013e98d3ca6b
readiness hash      sha256:539f6d1677c7df0bb169b00145515c08564b370feaf3eaae17c1ae968d1ae384
readiness raw       sha256:e234e26afdf182037fd50b958b77e1dae2e238a96b5d00818980765160dd60bc
readiness bytes     27254

audit receipt ID    cecrar-sha256:0a251f2a424467e03572631dce0cf15086004d1f46941dbf347df0782e056841
audit receipt hash  sha256:306568c906cbec81d25839da3cc1aee72fad574b40dc04a119c313af71042b8f
audit receipt raw   sha256:7e50ba0cbfbd475c1a3c787ec9e059d1d61737d54936707ac1750224e39731b3
audit bytes         4590
```

## Validation evidence

Commands and results:

```text
npm run check                         PASS
npm run build                         PASS
npm test                              PASS, 199/199, 8 suites
focused evidence test                 PASS, 14/14, 2 suites
verify:calibration-contract           PASS
verify:calibration-derivation-readiness PASS
verify:calibration-plan-assembly-readiness PASS
verify:calibration-evidence-readiness PASS
generator replay                      rejected with EEXIST
git diff --check                      PASS
worktree after seal/replay            clean
```

Full deterministic duration: `348891.728195 ms`.

Focused coverage:

| Source | Lines | Branches | Functions |
|---|---:|---:|---:|
| `calibration-evidence-contracts.ts` | 99.54% | 96.15% | 100.00% |
| `calibration-evidence-readiness.ts` | 100.00% | 100.00% | 100.00% |
| `calibration-evidence-readiness-verifier.ts` | 97.64% | 97.62% | 76.47% |

A changed-file scan found no API key, private-key block, bearer token, AWS access key, credential,
`.env` value, actual provider/model identity, or private signing material. Known synthetic secret
sentinels elsewhere in historical tests are unchanged and were not transmitted.

No provider or paid API was called. No repository push occurred; `origin/main` remains at the earlier
public commit recorded by the publication-governance history.

## Exact current non-authority state

```text
actualEvidenceRecords=[]
actualCapabilities=[]
researchExecutionBudget=all zero
calibrationPlanCreated=false
calibrationEnvelopeCreated=false
calibrationCapabilityIssued=false
calibrationCapabilityConsumed=false
calibrationExecutionAuthorized=false
protectedDataAccessAuthorized=false
evidenceAdmissionAuthorized=false
numericFreezeWriteAuthorized=false
protocolManifestWriteAuthorized=false
budgetFreezeWriteAuthorized=false
oProposalAuthorized=false
oActivationAuthorized=false
promotionAuthorized=false
deploymentAuthorized=false
all future identity fields=null
```

The seven trust-plane obligations remain unresolved. This correction is structural conformance
evidence only. It is not calibration evidence and establishes no estimator adequacy, matched-budget
fairness, performance, attribution, generalization, containment, security certification, evolution,
or self-improvement.

## Decision requested

Please decide whether the prior sole blocker is closed:

1. Are terminal aggregate, withdrawal, and failure outcomes now mutually exclusive per attempt?
2. Is E3 bound exactly to the selected E2 terminal branch?
3. Is E4 correctly forbidden after withdrawal/failure and permitted only after verified aggregate?
4. Is E0-to-E1 execution/usage/stratum/accounting/incident coverage exact and fail-closed?
5. Do the three fixtures and twelve new signed attacks cover the authorized correction?
6. Does the append-only v2 source/seal/audit lineage preserve the rejected evidence and remain
   non-self-referential?
7. Are the zero-authority state and bounded claims still exact?

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK

RATIONALE:
...

REQUIRED CHANGES:
...

RISKS / MISSING EVIDENCE:
...

NEXT AUTHORIZED SCOPE:
...

STILL PROHIBITED:
...
```
