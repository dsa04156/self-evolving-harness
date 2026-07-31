# Architect Packet 03RRRRRR — Historical publication completeness

## Requested decision

Review only the historical-publication completeness correction authorized by Round 03RRRRR. Return
one decision: `APPROVE`, `REVISE`, or `BLOCK`.

Do not reopen the previously accepted process boundary or snapshot-level publication controls except
where this correction creates a direct regression. If approved, state the exact next authorized
scope. If revised, identify the smallest remaining publication-governance defect.

## Governing decision and scope

- prior response:
  `.codex/gpt-pro-architect/responses/response-3rrrrr.md`
- exact response SHA-256:
  `9df707631279d1b423822c9e3011e3b564a245a09660217912dc8297577cd267`
- prior decision: `REVISE`
- authorized work: local-only historical public-object inventory, expanded scan, replacement ledger,
  historical anti-laundering tests, superseding signed closure, and narrow resubmission
- prohibited during correction: any additional Git push, provider call, attribution/scorer/mutation/
  candidate/evaluator run, B0–B6 execution, research selection, promotion, deployment, or empirical
  claim

No protocol version was changed and no research protocol was executed.

## Local corrective identity and remote non-publication

- repository: `https://github.com/dsa04156/self-evolving-harness`
- parent / current remote:
  `8b5f14400a7723c821bc54420e55da58dfa7601b`
- local corrective commit:
  `39b69be04185317f56a47183a2f78b9afde5ef6c`
- local corrective tree:
  `ecded4539d0e8be967691cd501d013e89eac9333`
- clean worktree after commit: yes
- observed remote after clean validation:
  `refs/heads/main = 8b5f14400a7723c821bc54420e55da58dfa7601b`
- additional push after Round 03RRRRR: none

This packet is intentionally local and post-commit so it can bind the exact corrective commit and
tree without self-reference. Neither the corrective commit nor this packet has been pushed.

## Append-only preservation

The following existing records remain byte-identical:

- signed deviation:
  `governance/publication-deviations/github-publication-2026-07-31.json`
- snapshot inventory:
  `governance/public-exposure/inventory-a5d8256.json`
- snapshot ledger:
  `governance/public-exposure/ledger-a5d8256.json`
- premature closure:
  `governance/publication-remediation-closures/github-publication-2026-07-31.json`

The premature closure file SHA-256 is still
`f1436b5a13c4465c3cf61c98b67de4048cc9b77994e385f3e10f2451ad2625ba`.
The historical verifier rejects any byte drift in that file. The prior inventory, ledger, and
closure were not rewritten; the correction appends new records.

## Historical traversal roots

The persisted inventory records these four explicit publication roots independently of current ref
reachability:

| Ordinal | Commit | Tree | Observed publication time |
| ---: | --- | --- | --- |
| 0 | `c041f7405790e9ff85af621b468b547adbfa4987` | `2911cf9e6d51561dab6541a98a0697d8015a3cc8` | `2026-07-31T15:16:46+09:00` |
| 1 | `88e39cdebf1df4db7688fff592363f5f867533ce` | `ccb20381cc3308cb71954789614144575870eb83` | `2026-07-31T15:22:04+09:00` |
| 2 | `a5d82564cece5ecb776a27c86512c3ec56f32787` | `1bbc1a7623460cf52907758e7ee93149e18a0aec` | `2026-07-31T15:31:50+09:00` |
| 3 | `8b5f14400a7723c821bc54420e55da58dfa7601b` | `1237af51815e9fd941c62ceb130d063584e13331` | `2026-07-31T16:07:47+09:00` |

Generator traversal:

1. `git rev-list` independently from each explicit root;
2. a union of all reachable commits, including every explicit root even if a later ref no longer
   reaches it;
3. raw commit, tree, and blob bytes through typed `git cat-file`;
4. recursive tree enumeration at every commit;
5. every `(commit, root tree, path, mode, blob)` observation; and
6. every add, modify, mode-change, and deletion transition. This history has no merge commit, so
   first-parent transition enumeration covers every parent edge.

The verifier does not trust the generator's inventory universe. It independently reconstructs the
union with `git rev-list --objects` for each root, checks every object type and raw-byte SHA-256,
re-enumerates every commit tree, rebuilds path maps and transitions, and compares canonical values.

## Old-versus-new inventory

New path:
`governance/public-exposure/historical-inventory-through-8b5f144.json`

- inventory ID:
  `historical-public-inventory.origin-main.through-8b5f144`
- signed content hash:
  `sha256:2de86e4033a8a60fcfe0be3f28dbf8938697fbeca941876419f8d0837fe2a0a3`
- file SHA-256:
  `df906c22cfd58912390036594f202118e6a81212491235b79a0be84f99ceb383`
- file bytes: 5,624,100

| Population | Prior snapshot record | Historical-union record |
| --- | ---: | ---: |
| explicit publication roots | 1 | 4 |
| reachable commits | not recorded | 64 |
| unique recursive trees | not recorded | 456 |
| unique blobs | 501 | 878 |
| per-commit path observations | 510 latest-tree paths | 19,742 |
| path transitions | not recorded | 891 |
| paths at `a5d8256` | 510 | 510 |
| blobs at `a5d8256` | 501 | 501 |
| paths at corrective `8b5f144` | outside prior inventory | 532 |
| blobs at corrective `8b5f144` | outside prior inventory | 522 |
| historical-only blobs relative to the `a5d8256` tree | omitted | 350 |
| blobs first exposed by corrective `8b5f144` | omitted | 27 |

Every commit/tree/blob records the roots that exposed it and its first exposure. Every blob records
all historical path aliases, both snapshot-presence flags, byte size, Git object ID, and SHA-256.
Path observations retain the mode at every commit; transitions retain before/after object and mode,
including deletion.

## Expanded secret and environment-file scan

The scan population is the complete 878-blob historical union and all 19,742 path observations:

- unique blobs scanned: 878
- historical-only blobs scanned: 350
- corrective-only blobs scanned: 27
- path observations scanned for `.env` / non-template `.env.*`: 19,742
- actual secret matches: 0
- actual environment files: 0
- private keys published: false
- exact recorded false-positive literal:
  `sk-validation-mode-must-ignore-this`

Only that literal is removed before pattern evaluation. The scan checks private-key PEM blocks,
OpenAI-style live-key shapes, GitHub token shapes, and AWS access-key shapes. The independent
verifier re-reads every blob directly from Git and repeats the scan; it does not trust the persisted
zero counts.

## Replacement historical exposure ledger

New path:
`governance/public-exposure/historical-ledger-through-8b5f144.json`

- ledger ID:
  `historical-public-exposure.origin-main.through-8b5f144`
- signed ledger hash:
  `sha256:52d22b10543d23fa0f7d268de029514c7ab8e62a3ab39277ade4d0c37da1e035`
- file SHA-256:
  `55c0286d13b4c47723c3c0ebb83eac315604bb199de5d2259c2f89fe266bd91b`
- file bytes: 4,767,107
- total exposure artifacts: 2,567
- Git object artifacts: 1,398 = 64 commits + 456 trees + 878 blobs
- embedded content-addressed identifiers: 1,169
- represented artifact classes: 13 of 13

The ledger binds the prior ledger ID/hash and the complete historical inventory ID/hash. It permits
exactly one exposure entry per Git object and rejects missing, extra, or duplicate object entries.
Blob path sets must equal the inventory path sets. It permanently retains the same eligibility
constants and allowed/prohibited use classes as the prior ledger.

The policy matches exposure ID, artifact ID, path, Git object ID, content hash, and alias, then
recursively follows dependency, wrapper, and provenance edges. Protocol version, history rewrite,
repository deletion, and current-ref unreachability cannot reset exposure.

## Required historical negative cases

Implementation:
`src/governance/historical-publication-exposure.ts`

- file SHA-256:
  `ef531e182c941c16f30b6952c6011a4d7cc87d7ff888fb6a0e5c0be398081340`

Test:
`test/historical-publication-exposure.test.ts`

- file SHA-256:
  `8d64cf506661a812a52c20713c440023542dc9f4e4a4d93abe1ce626d6de74c6`
- focused tests: 8/8 passed

The tests deny all five cases required by Round 03RRRRR:

1. a file present only in an earlier public commit after deletion;
2. the deleted historical blob copied under a new path;
3. source introduced only by corrective commit `8b5f144...`;
4. a known public commit after it becomes unreachable; and
5. a manifest whose only public dependency is a historical blob absent from the latest tree.

They additionally prove signed union/ledger/closure verification, rejection of duplicate Git-object
exposure laundering, and append-only closure identity preservation.

## Independent verifier

Path:
`scripts/verify-historical-publication-governance.ts`

- file SHA-256:
  `836e462324534ee55f034dc3e567af6af953fa3d396a8feeb1524f1ad1d18930`

Clean-commit output:

```text
PASS roots=4 commits=64 trees=456 blobs=878 observations=19742 transitions=891
historicalOnly=350 correctiveOnly=27 artifacts=2567 secrets=0
inventory=sha256:2de86e4033a8a60fcfe0be3f28dbf8938697fbeca941876419f8d0837fe2a0a3
ledger=sha256:52d22b10543d23fa0f7d268de029514c7ab8e62a3ab39277ade4d0c37da1e035
closure=sha256:8e799888c08194ef884e68df45071d7e0dfc9337e2974b8b2adfa61ce30d5929
```

It also checks that `origin/main` remains the recorded corrective commit and that all validator
source hashes bound into the superseding closure still match.

## Superseding signed closure

New path:
`governance/publication-remediation-closures/github-publication-superseding-2026-07-31.json`

- closure ID:
  `publication-remediation.github-development.superseding.2026-07-31`
- signed record hash:
  `sha256:8e799888c08194ef884e68df45071d7e0dfc9337e2974b8b2adfa61ce30d5929`
- file SHA-256:
  `2ab95e9896a09ad0f4e3bc5e2f45e0708165d8e7d1c30d937fd70c3b39cead49`
- file bytes: 4,417

The closure binds:

- the original deviation ID/hash;
- the prior premature closure ID/hash and exact file SHA-256;
- the Round 03RRRRR `REVISE` response SHA-256;
- the complete historical inventory ID/hash;
- the replacement historical ledger ID/hash;
- expanded scan counts;
- exact implementation, test, and independent-verifier hashes; and
- `priorClosureModified=false`, `priorClosureWasPremature=true`.

It explicitly records:

```text
closureStatus=superseded_by_complete_historical_union
publicDevelopmentArtifactsPermanent=true
heldOutEligibilityRestored=false
researchEvidenceAuthorized=false
promotionAuthorized=false
providerUsed=false
selfImprovementClaim=false
additionalPushPerformed=false
```

The signing private key was ephemeral and was not persisted. Only the public principal and Ed25519
attestation remain for offline verification.

## Clean local-commit validation

All successful commands below ran at clean local commit `39b69be...`:

```text
npm run verify:publication-governance
PASS snapshot=a5d8256... paths=510 exposures=632 embedded=109 classes=13 restricted=10

npm run verify:historical-publication-governance
PASS roots=4 commits=64 trees=456 blobs=878 observations=19742 transitions=891
     historicalOnly=350 correctiveOnly=27 artifacts=2567 secrets=0

npm run build
PASS

explicit complete suite, excluding Unix audit transport file
tests=116 pass=116 fail=0 cancelled=0 skipped=0 todo=0

isolated Unix audit transport file
tests=1 pass=1 fail=0 cancelled=0 skipped=0 todo=0

total deterministic test set
tests=117 pass=117 fail=0 cancelled=0 skipped=0 todo=0

git diff --check HEAD^ HEAD
PASS

git status --porcelain=v1
empty

git ls-remote --heads origin main
8b5f14400a7723c821bc54420e55da58dfa7601b refs/heads/main
```

One earlier monolithic `npm test` attempt was not counted as evidence: all emitted cases were passing,
but the existing Unix audit test missed a child `close` event under full-suite concurrency and waited
indefinitely after its Python child had already exited. That exact run was terminated. The Unix test
then passed twice in isolation, including once from the clean corrective commit. No product or audit
test source was changed to conceal the race; the complete 117-test set is reported above as two
successful commands.

The complete suite used only deterministic/fake/provider-absence paths. It did not persist new
attribution, score, mutation, candidate, evaluator, or process-boundary evidence artifacts.

## Scope and claim boundary

After Round 03RRRRR:

- additional Git push: no
- real provider/API use or API-key storage: no
- attribution, scorer, mutation, candidate, or evaluator execution: no
- B0–B6, pilot, gate/final/temporal/withheld-public construction or access: no
- research selection, promotion, canary, deployment, or production-pointer change: no
- release, package, announcement, or publication claim: no
- empirical performance, attribution-performance, generalization, containment, security, or
  self-improvement claim: no

OxyGent remains queued only as possible exact-SHA prior art after this publication-governance gate.
No OxyGent source, code, adapter, dependency, or runtime was used in this correction.

## Decision questions

1. Does the four-root object union completely account for recorded historical and corrective public
   exposure independently of the current branch tip?
2. Are every commit, recursive tree, blob, per-commit path/mode alias, and later deletion/change
   state independently reconstructable?
3. Does the expanded scan establish the result for historical-only and corrective-only bytes?
4. Does the replacement ledger permanently cover all public Git objects and embedded identifiers,
   including copy/alias/dependency/wrapper/provenance laundering?
5. Does the superseding signed closure preserve the prior premature closure byte-for-byte while
   binding the corrected records?
6. Is publication governance complete without restoring held-out eligibility or authorizing any
   research claim?

Requested terminal form:

```text
DECISION: APPROVE | REVISE | BLOCK
HISTORICAL_UNION:
SECRET_SCAN:
EXPOSURE_LEDGER:
ANTI_LAUNDERING:
SUPERSEDING_CLOSURE:
VALIDATION:
CLAIM_DISCIPLINE:
BLOCKING_FINDINGS:
AUTHORIZED_NEXT_SCOPE:
```
