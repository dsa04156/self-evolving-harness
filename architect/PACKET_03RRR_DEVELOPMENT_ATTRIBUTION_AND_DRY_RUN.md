# Architect Packet 03RRR — Visible-fixture attribution and mutation dry run

## Requested decision

Return exactly one decision: `APPROVE`, `REVISE`, or `BLOCK`.

This is the narrow follow-up requested by the Round 3RR ruling. Review only
whether the authorized public-fixture development scope was implemented with
the required prediction-before-label, authority, mutation, evaluator, and
quarantine boundaries.

An `APPROVE` decision would accept this development diagnostic and dry-run
plumbing only. It would not complete Gate 3 or authorize a provider call,
research execution, B0–B6, pilot tuning, held-out access, candidate promotion,
deployment, or an empirical claim.

## Scope declaration

Actions performed:

- appended the signed remediation-closure record without modifying the
  original deviation;
- implemented one deterministic label-blind attribution prototype;
- ran it once over the committed 28-occurrence visible semantic `D_mine`
  corpus;
- sealed the complete prediction set before a separate scorer accessed the
  visible-fixture oracle;
- generated one bounded synthetic development candidate;
- evaluated it in a separate local Python process using two synthetic task
  pairs, a deterministic fake-provider contract, and immutable-tool contract;
- immediately and mechanically marked the candidate non-promotable;
- signed a quarantine over the complete generated artifact graph;
- ran deterministic unit, regression, coverage, schema, replay, and governance
  verification.

Actions not performed:

- no API key or provider call;
- no research scheduler or B0–B6 method;
- no gate, final, temporal, withheld-public, multi-cause, or Terminal-Bench task
  body construction or access;
- no research pilot, threshold calibration, or confirmatory attribution run;
- no research candidate selection, promotion, canary, approved state,
  deployment, or production-pointer write;
- no performance, generalization, security, or self-improvement claim;
- no push, release, or publication action.

## Prior governance closure

Original append-only deviation:

- path:
  `governance/deviations/hfb-structural-oracle-2026-07-31.json`
- record hash:
  `sha256:c750a9bb2e00c2e5d15d73fab039d950c3df0e910274c006647b2ae9cc798e00`
- original remediation status remains byte-preserved as `in_progress`.

Separate signed remediation closure:

- path:
  `governance/remediation-closures/hfb-structural-oracle-2026-07-31.json`
- record hash:
  `sha256:b7ef8d04c20c2c2904780b1cca4c758961a1e59b997e9e63d8fa879f5dde6a7a`
- Round 3RR decision hash:
  `sha256:19d1998f6207ba0f67095be9ed21ff649b35c6523aedb165715694c1115d6e74`
- semantic suite commitment:
  `sha256:61c5f01ecb135436df55a76d169a26dac48379d18f31eb8e7d78e04a4e9c40be`
- label-blind corpus commitment:
  `sha256:49f7dcbfaabdc122294b41f30d56f15d5eca6088d7941f07483968bdd58e1a01`
- replacement semantic evidence file SHA-256:
  `sha256:3083ce265e91292582dfbff6320ab8a1f536e9afc50280e18230dcfe434cb876`

`npm run verify:hfb-governance` passes and reports the unchanged deviation,
closure, 28 fixtures, 115 quarantined old artifacts, four permitted
development uses, and seven denied research uses.

The old structural-oracle suite, its 28/28 ground-truth-fed scorer output, the
semantic replacement, and the new diagnostic artifacts remain separate and
content-addressed.

## Exact dry-run source identity

The evidence generator rejects any dirty Git worktree before reading inputs or
writing outputs. It also refuses to overwrite an existing output directory or
quarantine record.

The clean source identity recorded before generation is:

- source commit:
  `34f84f8c651186b6611d402c2f7c8addf5253407`
- source tree:
  `f46df5b11221659818ff2d5a008978f44c337b32`
- sealed evidence commit:
  `f5818ea2aecbc9d0c15ea32a278131bd45e92bd5`

The verifier resolves the recorded commit to the recorded tree, reads each
behavior-bearing implementation from that exact commit with `git show`,
requires byte equality with the current implementation, and recomputes all
implementation digests.

Generation command:

```text
npm run generate:development-attribution-dry-run
```

Independent replay command:

```text
npm run verify:development-attribution-dry-run
```

## Attribution prototype contract

Prototype manifest:

- path:
  `architect/evidence/development-attribution-dry-run/prototype-manifest.json`
- prototype ID: `development.label-blind-attributor.evidence-v1`
- semantic version: `0.1.0`
- rules version: `behavioral-heuristic-v1`
- rank limit: `8`
- minimum behavioral evidence signals: `1`
- per-trace timeout declaration: `1000 ms`
- manifest hash:
  `sha256:4eb086841a2f8f95835173a645ac0826e8b74586ffdd2635c40aef824cd78933`
- implementation hash:
  `sha256:6f0262217b52918ef9030872585b65aaabea2a01756c6a4842343df8f5fef69e`

The complete accessible artifact list in the signed/content-addressed manifest
is exactly:

```text
label_blind_attribution_corpus
```

The explicit forbidden artifact list is:

```text
oracle_package
raw_semantic_execution_package
target_diff
manifest_pairing
fixture_mechanism
expected_outcome
```

The attributor module imports only canonicalization, errors, schema validation,
principal/signature support, and the label-blind corpus TypeScript type. It
does not import the semantic authoring module, benchmark authoring definitions,
scorer, or oracle paths.

Input schemas are closed JSON Schemas:

- `benchmarks/hfb-label-blind-attribution-corpus.schema.json`
- `development-attribution-prototype.schema.json`
- `development-attribution-prediction-set.schema.json`
- `development-attribution-commitment.schema.json`

The generator reads the approved persisted corpus first. The attributor runs
and the proposer signs the complete prediction set before semantic authoring
fixtures or oracle join entries are instantiated. After the seal, the
development scorer reconstructs the public fixtures and requires the rebuilt
corpus and semantic suite commitments to match the approved persisted
commitments exactly.

## Prediction-before-label evidence

Input:

- 24 unique label-blind trace projections;
- 28 total occurrences;
- corpus commitment:
  `sha256:49f7dcbfaabdc122294b41f30d56f15d5eca6088d7941f07483968bdd58e1a01`;
- prior diagnostic results visible to this prototype run: `false`.

Prediction set:

- generated at: `2026-07-31T08:00:00.000Z`;
- prediction-set hash:
  `sha256:530c5393f706f1af06fe084d834cb7ca84dffc4b2b642961af9ac3aa44d1b92d`;
- unique trace statuses:
  `predicted=24, abstained=0, invalid_output=0, failure=0, timeout=0`;
- occurrence statuses:
  `predicted=28, abstained=0, invalid_output=0, failure=0, timeout=0`.

Signed proposer commitment:

- sealed at: `2026-07-31T08:01:00.000Z`;
- commitment hash:
  `sha256:583fea8371ac7a7b5a68470a535c89adbb5aa9ce8fcc4d4157bea46b7ceac393`;
- binds the corpus, prototype manifest, prediction-set hash, all five status
  counts, 24 predictions, 28 occurrences, prior-result visibility, producer
  identity, public key, and Ed25519 attestation.

No trace or occurrence can be silently omitted. Non-predicted states must have
an empty ranking and explicit terminal reason. A predicted state must rank all
eight allowed mutable component labels.

## Separate scorer authority and development diagnostics

The scorer has a distinct evaluator identity and implementation:

- scorer ID: `development-attribution-scorer.v1`;
- scorer implementation hash:
  `sha256:9e7ccbff8d1987e81dc018f4898222f9920db02028449e996f1a2251e6a381b5`;
- oracle access time: `2026-07-31T08:02:00.000Z`;
- signed oracle-access event hash:
  `sha256:60ff1831f5ba1fed769ab1c58e3464e318d070364ebf493731936f41c1713079`;
- scoring time: `2026-07-31T08:03:00.000Z`;
- signed score-report hash:
  `sha256:3e56f58bf7fbc8eb3e6ea3fd37820629c22f8b292c7a520d2e4298ab73f0da2c`.

The access-event constructor rejects access earlier than the signed prediction
seal. Oracle join multiplicities must exactly equal all 28 committed corpus
occurrences. Only the scorer and governance verifier reconstruct oracle labels.

Visible-fixture development diagnostic counts:

- cases: 28;
- top-1 count: 10;
- top-3 count: 21;
- top-8 count: 28;
- abstentions: 0;
- invalid outputs: 0;
- failures: 0;
- timeouts: 0;
- confusion rows are persisted in the signed report.

These are not benchmark accuracy or research attribution performance. Every
relevant artifact carries:

```text
developmentOnly = true
confirmatory = false
publicVisibleFixtures = true
authorizedForResearchEvidence = false
attributionPerformanceClaim = false
```

The values do not satisfy an attribution gate, research threshold, H1–H4
condition, promotion rule, or claim.

## Bounded mutation dry run

The mutation proposer receives the committed label-blind predictions but no
scorer report, oracle label, good/fault pairing, target ID, expected repair, or
semantic oracle package.

One top-1 `WorkflowPolicy` prediction was selected from the sealed prediction
set. The mutation target was a separately constructed synthetic harness, not a
benchmark oracle harness.

Counts and bounded change:

- proposals: 1;
- candidates created: 1;
- changed components: 1;
- changed component type: `WorkflowPolicy`;
- operation: one declarative JSON Patch `replace`;
- before action: `construct_context`;
- after action: `model_turn`;
- structural edit operations: 1;
- normalized token insertions/deletions: 1/1;
- replacement surface: 313 bytes;
- expanded closure delta: 633 bytes, below the frozen 8192-byte ceiling;
- immutable diff count: 0;
- capability IDs added/removed: 0/0;
- admission checks: 7/7 pass.

Mutation record:

- record hash:
  `sha256:c15b27c3c551b8689d0c26db70d724a2bc3372c1b3636fdf8ac707de983c489a`;
- parent:
  `hv-sha256:41691e5ba96081a7bb0d2d3bce93402d643a21a0b3c5a637a43e7c9715d87f33`;
- development candidate:
  `hv-sha256:4d16c0eae8fce973187a26c43ba44a52ab32a539619e278d7c38eb375cdb5089`.

The dry-run service verifies the signed prediction commitment, requires exactly
one enabled mutable component matching the committed top-1 type, creates the
candidate, computes the exact harness diff, and registers the non-promotable
record before returning the proposal record.

## External evaluator and non-promotability

The candidate evaluator is a separate Python process invoked without a shell.
It receives canonical JSON on stdin, has bounded output and wall time, must
produce canonical JSON on stdout, and must emit no stderr. The request exposes
only two synthetic task pairs and these fixed capabilities:

```text
datasetRole = synthetic_development
providerClass = deterministic_fake
toolClass = immutable_builtin
oracleAccess = false
gateAccess = false
finalAccess = false
promotionAccess = false
deploymentAccess = false
```

Evaluator evidence:

- request hash:
  `sha256:9f8ff2abdf4f270be3af47013df41f87f70b0c614ff94a3e5b8cdc676d98ff3c`;
- Python implementation hash:
  `sha256:64e4a289aa32c0764db7307f099b7d23f2d24a29792777e1576037971db8ae67`;
- signed result hash:
  `sha256:2a5e28f3283dec5f886de921da8046af2518c19251cd88689a62dd3b44483b88`;
- seven structural/capability checks passed;
- synthetic task count: 2;
- the synthetic-only output records one fail-to-pass and zero pass-to-fail;
- `researchMetric=false`;
- `promotionSignal=false`.

The synthetic outcomes validate plumbing only. They are deliberately
hand-authored inputs to the external process and are not evidence that the
mutation improved a harness.

Signed non-promotable record:

- record hash:
  `sha256:3b6043b2776df22680b9d669ce3861b076a259b690a29bb8ba8fc254cd37d347`;
- `promotable=false`;
- `authorizedForResearchEvidence=false`;
- forbidden destinations:
  main qualification lifecycle, research selection, canary, approved,
  deployment, production pointer, and research manifest.

`HarnessQualificationStore` checks the shared append-only non-promotable
registry before draft creation and every state transition. The development
destination guard permits only `development_external_evaluator` and
`development_archive`. Direct qualification and canary attempts are rejected
in tests.

## Full artifact quarantine

Signed quarantine:

- path:
  `governance/development-quarantines/attribution-mutation-dry-run-2026-07-31.json`;
- record hash:
  `sha256:8f92524960e1e57528ac89a5da981caa30d92e23d1180486b7631109d9ddf3da`;
- authorization decision hash: exact Round 3RR response hash;
- covered generated artifacts: 18 files total, including the evidence summary;
- evidence hash:
  `sha256:31a2e8ca0506e8d60e41bc7df07de118887dfae4aced965f36fcc0f0b6b7ba5f`.

Allowed use classes:

```text
development_attribution_prototype
development_diagnostic_scoring
development_mutation_dry_run
development_external_evaluation
governance_audit
```

Prohibited use classes:

```text
research_protocol_manifest
attribution_gate
research_threshold
research_candidate_selection
promotion_decision
canary
deployment
production_pointer
claim_table
research_evidence
```

The verifier checks the exact set of file hashes and content identities,
signatures, and graph coverage, then exercises all five allowed and all ten
prohibited policy paths. Every prohibited path is denied.

## Tests and rejected cases

Full deterministic suite:

- tests: 98;
- pass: 98;
- fail: 0;
- skipped: 0;
- line coverage: 94.55%;
- branch coverage: 88.93%;
- function coverage: 92.26%;
- TypeScript check: pass;
- production build: pass;
- 79 closed JSON Schemas compile and validate;
- persisted semantic evidence verification: pass;
- old-suite governance and remediation verification: pass;
- new end-to-end deterministic evidence replay: pass.

Relevant intentional rejection cases:

- oracle access at `sealedAt - 1 ms`: rejected;
- corpus content drift under the approved hash: rejected;
- injected oracle-shaped extra field: rejected by closed schema;
- omitted/mismatched oracle multiplicity: rejected;
- source imports of authoring/oracle/scorer authority into the attributor,
  mutation proposer, or candidate evaluator: forbidden and scanned;
- mutation outside one matching enabled mutable component: rejected;
- mutation above 8192 closure bytes: rejected;
- immutable or capability diff: rejected;
- canary destination: rejected;
- main qualification draft for the candidate: rejected;
- all ten research/promotion/deployment artifact uses: rejected.

Existing adversarial adapter tests additionally cover raw content, task text,
paths, hashes, opaque IDs, harness/component identities, provider metadata,
mutation data, verifier detail, expected values, injected labels, opaque-ID
renaming, and corpus order.

There were no attributor execution failures, invalid outputs, timeouts,
abstentions, candidate evaluator process failures, or admission failures in the
persisted run. Zero counts are present explicitly rather than omitted.

## Deterministic replay result

The independent verifier:

- replays predictions and the Ed25519 prediction commitment byte-for-byte;
- reconstructs the visible oracle only after the commitment;
- replays the signed access event and score report byte-for-byte;
- reconstructs the synthetic parent and bounded candidate identities;
- replays the non-promotable record byte-for-byte;
- reruns the Python external evaluator and reproduces request/result bytes;
- verifies every schema, hash, source pin, signature, cross-reference,
  chronology, import boundary, and quarantine rule.

Final verifier line:

```text
PASS source=34f84f8c651186b6611d402c2f7c8addf5253407 traces=24 occurrences=28 prediction=sha256:530c5393f706f1af06fe084d834cb7ca84dffc4b2b642961af9ac3aa44d1b92d score=sha256:3e56f58bf7fbc8eb3e6ea3fd37820629c22f8b292c7a520d2e4298ab73f0da2c candidate=hv-sha256:4d16c0eae8fce973187a26c43ba44a52ab32a539619e278d7c38eb375cdb5089 evaluation=sha256:2a5e28f3283dec5f886de921da8046af2518c19251cd88689a62dd3b44483b88 evidence=sha256:31a2e8ca0506e8d60e41bc7df07de118887dfae4aced965f36fcc0f0b6b7ba5f quarantine=sha256:8f92524960e1e57528ac89a5da981caa30d92e23d1180486b7631109d9ddf3da allowed=5 prohibited=10 research=false promotable=false
```

## Open issues and requested ruling

Known limitations:

- all 28 traces are visible development fixtures;
- the heuristic was designed with knowledge of the public semantic categories,
  so its diagnostic counts are not independent evidence;
- the fake provider is a canonical known-good request table, not a realistic
  model;
- source-import and schema boundaries are development controls, not hostile
  principal isolation;
- the synthetic evaluator outcomes are plumbing fixtures, not measured task
  performance;
- no matched-budget research protocol has run;
- no real-provider receipt exists because this project has no provider API
  credential and this packet did not authorize or attempt one.

Please rule separately on:

1. whether the prediction-before-label and scorer authority boundary satisfies
   the Round 3RR development requirement;
2. whether the bounded mutation and external evaluator are sufficiently
   isolated from oracle authority;
3. whether non-promotability and quarantine are mechanically complete for this
   scope;
4. whether the development packet may be closed without implying Gate 3 or
   research approval;
5. the next narrow local deterministic scope, if any.

Do not approve any empirical attribution, harness-improvement,
self-evolution, security, generalization, provider, or deployment claim on
this packet.
