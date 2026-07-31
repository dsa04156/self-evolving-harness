# Architect Packet 03RRRRR — Publication-governance closure

## Requested decision

Review only the publication-governance corrections ordered by Round 03RRRR. Return one decision:
`APPROVE`, `REVISE`, or `BLOCK`.

Do not reopen the already accepted eight-principal process boundary, prediction seal, proposer
authority, actual standalone-runtime evaluation, evaluator derivation, recursive non-promotability,
or evidence reconstruction except where this correction creates a direct regression.

If approved, state the exact next authorized scope. If revised, identify the smallest remaining
publication-governance defect and do not authorize broader research work.

## Governing decision

- prior response:
  `.codex/gpt-pro-architect/responses/response-3rrrr.md`
- exact response SHA-256:
  `deab2175380d472a8581ab4baed07af8518fde3ffa0a90a6457bb03a234db9cf`
- decision: `REVISE`
- correction-only authorization: one corrective commit and push containing the signed publication
  deviation, public-exposure ledger, permanent validators and negative tests, append-only closure,
  six root-document updates, and this narrow review packet

No protocol bump was made. No research protocol was executed.

## Corrective source identity and publication

- repository: `https://github.com/dsa04156/self-evolving-harness`
- owner / remote / branch: `dsa04156` / `origin` / `main`
- parent: `a5d82564cece5ecb776a27c86512c3ec56f32787`
- corrective commit:
  `8b5f14400a7723c821bc54420e55da58dfa7601b`
- corrective tree:
  `1237af51815e9fd941c62ceb130d063584e13331`
- remote verification:
  `refs/heads/main = 8b5f14400a7723c821bc54420e55da58dfa7601b`
- push count after the 03RRRR ruling: one
- corrective commit count after the prior remote head: one
- release tag / packaged release / announcement: none

This packet was necessarily created locally after the corrective commit and push because it binds
their exact commit and tree identities. It is not part of the corrective tree and has not been
committed or pushed. No second commit or push was made. The transport copy is byte-identical and is
used only for the authorized review.

## Signed publication deviation

Path:
`governance/publication-deviations/github-publication-2026-07-31.json`

- deviation ID:
  `publication-deviation.github-development.2026-07-31`
- signed record hash:
  `sha256:86a013e41c99fb1cf60e2d6377105ce88931c6f1416f829d791b5f76673eef4b`
- file SHA-256:
  `e033e076c6b9b7fb54e1987a654741703afb8ec06d35ba95242c3dfc704b2b78`
- file bytes: 5,312
- signer role: `protocol_author`
- original remediation state: `in_progress`

The signed record binds:

1. the exact Round 03RRR approval response:
   `sha256:ac0637a0c8a17ff77c9db732ed4b2632acc825526f7b632c8ff57d89074370e3`;
2. the exact Round 03RRRR corrective response above;
3. the exact user instruction requesting periodic updates to the new GitHub repository, plus its
   text hash and the fact that a message timestamp was not recorded;
4. repository URL, owner, remote, branch;
5. implementation commit/tree
   `88e39cdebf1df4db7688fff592363f5f867533ce` /
   `ccb20381cc3308cb71954789614144575870eb83`;
6. evidence commit/tree
   `a5d82564cece5ecb776a27c86512c3ec56f32787` /
   `1bbc1a7623460cf52907758e7ee93149e18a0aec`;
7. the three exact observed `origin/main` publication events:
   - `c041f7405790e9ff85af621b468b547adbfa4987`,
     tree `2911cf9e6d51561dab6541a98a0697d8015a3cc8`,
     `2026-07-31T15:16:46+09:00`;
   - `88e39cdebf1df4db7688fff592363f5f867533ce`,
     tree `ccb20381cc3308cb71954789614144575870eb83`,
     `2026-07-31T15:22:04+09:00`;
   - `a5d82564cece5ecb776a27c86512c3ec56f32787`,
     tree `1bbc1a7623460cf52907758e7ee93149e18a0aec`,
     `2026-07-31T15:31:50+09:00`;
8. the authorization boundary exceeded and permanent exposure consequences; and
9. `providerCall=false`, `researchExecution=false`, `gateOrFinalAccess=false`, `promotion=false`,
   `deployment=false`, and `credentialPublication=false`.

The deviation was not rewritten to claim closure.

## Content-addressed published inventory

Path: `governance/public-exposure/inventory-a5d8256.json`

- snapshot commit/tree:
  `a5d82564cece5ecb776a27c86512c3ec56f32787` /
  `1bbc1a7623460cf52907758e7ee93149e18a0aec`
- tracked paths: 510
- unique Git blobs: 501
- inventory hash:
  `sha256:1765dbf575a1997b9e2915c3e1cbbd7118135fd76dff02df28765bc8561decb6`
- file SHA-256:
  `1f6897015ddd7876681544e0ff1f548e9b8990863576ced73a7d507c2d70d8e4`
- file bytes: 132,850

Each path records Git mode, object type, Git object ID, byte size, and SHA-256. The independent
verifier reconstructs all entries from `git ls-tree` and `git cat-file` at the exact historical
commit and requires canonical byte equality with the persisted inventory.

## Secret scan

The historical snapshot's 501 unique blobs were scanned for:

- private-key PEM blocks;
- OpenAI-style live-key shapes;
- GitHub personal-access-token shapes;
- AWS access-key shapes; and
- actual `.env` or non-template `.env.*` paths.

Result:

- actual secret matches: 0
- actual environment files: 0
- private keys published: false
- recorded false-positive sentinel:
  `sk-validation-mode-must-ignore-this`

The sentinel occurs in a redaction test and is recorded exactly rather than silently ignored. After
removing only that literal, the complete historical blob scan returns no actual match. Variable names
such as `OPENAI_API_KEY` are not credentials.

## Signed public-exposure ledger

Path: `governance/public-exposure/ledger-a5d8256.json`

- ledger ID: `public-exposure.origin-main.a5d8256`
- signed ledger hash:
  `sha256:2c6ba47d7940ffdfa371d123811bd5945a040a9601008411ca9a88d622d53ee6`
- file SHA-256:
  `cff54b321d017fc73d3fbad701c9d734b8ea3acbb881526889360d38881b0da7`
- file bytes: 627,638
- exposure entries: 632
- hash-like identifiers extracted from published process-boundary evidence: 109
- artifact classes represented: 13 of 13

Class counts:

| Class | Count |
| --- | ---: |
| development_candidate | 22 |
| development_corpus | 2 |
| development_documentation | 78 |
| development_evaluation | 76 |
| development_execution | 16 |
| development_fixture | 84 |
| development_oracle | 30 |
| development_prediction | 3 |
| development_prototype | 7 |
| development_quarantine | 30 |
| development_receipt | 27 |
| development_score | 4 |
| published_source | 253 |

Duplicate Git blobs are grouped by content and retain every path alias. Signed embedded container
records separately cover prototype manifests, corpora, predictions and commitments, oracle access,
scores, mutation proposals, candidate closure, runtime execution, evaluation, non-promotability,
taint, eight role receipts, and the final receipt.

Every ledger entry has these schema-enforced constants:

```text
publicDevelopment=true
eligibleForHeldOut=false
eligibleForSealed=false
eligibleForTemporalHoldout=false
eligibleForGate=false
eligibleForFinal=false
confirmatory=false
authorizedForResearchEvidence=false
authorizedForPromotion=false
```

The prohibited uses are exactly:
`held_out`, `sealed`, `temporal_holdout`, `gate`, `final`, `confirmatory`,
`research_selection`, `promotion`, `research_evidence`, and `claim_table`.

Allowed uses are only `public_development`, `governance_audit`, and `development_archive`.

## Permanent validator and anti-laundering behavior

Implementation:
`src/governance/publication-exposure.ts`

- file SHA-256:
  `2dc3e69618c55e48e4072f437e45881619dbdb7228e10f3ef593dcfbe6a36e82`

Closed schemas:

- `published-artifact-inventory.schema.json`
- `publication-deviation-record.schema.json`
- `public-exposure-ledger.schema.json`
- `publication-remediation-closure.schema.json`

The validator matches and propagates exposure by:

- exposure ID;
- artifact ID;
- path;
- Git blob ID;
- content hash;
- alias;
- dependency;
- wrapper; and
- provenance reference.

Graph traversal is recursive. It denies reset claims based on a new protocol version, Git history
rewrite, or repository deletion. Restricted-use admission is denied whenever any reachable node is
public. Signed-record identity, canonical ordering, eligibility constants, response bindings,
inventory bindings, and append-only deviation/closure identities are verified.

## Deterministic negative cases

Test path: `test/publication-exposure.test.ts`

- file SHA-256:
  `7c7ab8b0eb17effb0896f2c6ed00e5d0fb5016d89acdcb710400716b45cdfab8`
- focused tests: 7/7 passed

The cases prove rejection of:

1. every direct prohibited-use reference;
2. public development fixtures in future gate and final use;
3. a published corpus relabeled under a fresh sealed split ID but retaining its content;
4. a copied public candidate entering research selection;
5. indirect dependency laundering;
6. wrapper laundering;
7. provenance laundering;
8. a new protocol claiming exposure reset;
9. Git history rewrite claiming restored secrecy;
10. repository deletion claiming restored secrecy;
11. documentation/claim-table use describing the diagnostic as independent evaluation;
12. mutated eligibility and closure bindings; and
13. append-only ID reuse with different signed content.

Allowed governance-audit/development/archive admissions are also tested.

## Separate signed remediation closure

Path:
`governance/publication-remediation-closures/github-publication-2026-07-31.json`

- closure ID:
  `publication-remediation.github-development.2026-07-31`
- signed record hash:
  `sha256:242c889c616eab9c33787a1bd606c21e961e0f5be56e26eb466a4c0a84bb6cd6`
- file SHA-256:
  `f1436b5a13c4465c3cf61c98b67de4048cc9b77994e385f3e10f2451ad2625ba`
- file bytes: 3,705

The closure references the unchanged deviation record/hash, inventory hash, ledger ID/hash, exact
Round 03RRRR response, and the implementation/test/verifier source hashes. It records:

```text
originalDeviationWasModified=false
originalStatusObserved=in_progress
closureStatus=closed_by_append_only_record
outstandingActions=[]
publicDevelopmentArtifactsPermanent=true
heldOutEligibilityRestored=false
researchEvidenceAuthorized=false
promotionAuthorized=false
providerUsed=false
selfImprovementClaim=false
```

The signing private key was ephemeral and is not persisted. Each record contains only the public
principal and Ed25519 attestation needed for offline verification.

## Root documentation

The required factual updates exist in:

- `README.md`
- `ARCHITECTURE.md`
- `SECURITY.md`
- `REPRODUCIBILITY.md`
- `LIMITATIONS.md`
- `NEGATIVE_RESULTS.md`

Every document states the permanent `publicDevelopment=true` and
`authorizedForResearchEvidence=false` boundary. They distinguish deterministic development plumbing
from independent evaluation and explicitly deny provider, B0–B6, held-out, promotion, security,
generalization, and self-improvement claims.

## Clean-commit validation

All commands below ran after commit `8b5f144...` with an empty Git status and before this local packet
was created:

```text
npm run verify:publication-governance
PASS paths=510 exposures=632 embedded=109 classes=13 restricted=10

npm run verify:development-process-boundary
verified=true roleCount=8 adversarialRejectionCount=7 receiptCount=9
providerUsed=false researchEvidenceAuthorized=false promotionAuthorized=false

npm run build
PASS

npm test
tests=109 pass=109 fail=0 cancelled=0 skipped=0 todo=0
```

The complete suite reran existing deterministic tests as explicitly ordered by the Round 03RRRR
correction. It did not generate a new persisted attribution set, score report, mutation proposal,
candidate, runtime comparison, evaluator result, or process-boundary evidence artifact.

## Scope and external-action statement

After the Round 03RRRR response:

- real provider/API use: no
- API key request or storage: no
- new attribution run: no
- new scorer release/run: no
- new mutation proposal/candidate construction: no
- new runtime comparison/evaluator evidence run: no
- research scheduler or B0–B6: no
- held-out/sealed/temporal/gate/final data access or construction: no
- research selection: no
- promotion/canary/deployment/production-pointer change: no
- release tag/package/announcement: no
- empirical performance/attribution/generalization/security/self-improvement claim: no
- corrective Git commit: one
- corrective Git push: one
- Architect packet transmission requested here: one, to the existing pinned Pro conversation

OxyGent was identified as useful additional prior art, but no OxyGent source-ledger expansion was
performed in this correction-only scope.

## Decision questions

1. Does the signed deviation faithfully preserve and bind the publication-scope violation?
2. Is the exact historical public inventory complete and independently reconstructable?
3. Does the exposure ledger cover the required public development artifact classes and embedded
   evidence identities?
4. Is permanent non-eligibility mechanically enforced across direct, copy, alias, dependency,
   wrapper, provenance, protocol-reset, history-rewrite, and deletion paths?
5. Does the separate signed closure preserve append-only governance?
6. Are the secret-scan and root-document disclosures sufficient?
7. Is Round 03RRRR publication governance now closed without authorizing research evidence?

Requested terminal form:

```text
DECISION: APPROVE | REVISE | BLOCK
PUBLICATION_DEVIATION:
INVENTORY_AND_SECRET_SCAN:
EXPOSURE_LEDGER:
ANTI_LAUNDERING:
REMEDIATION_CLOSURE:
VALIDATION:
CLAIM_DISCIPLINE:
BLOCKING_FINDINGS:
AUTHORIZED_NEXT_SCOPE:
```
