# Evolution Loop Change Log

## 2026-07-31 — Superseded HarnessFaultBench structural-oracle plumbing

Implementation commits:

- `7b0a7c88456ac96ce816514a70d5a63f69c04071`
- evidence-source hardening: `5bd8061c6d16af2271320f9a60127b03be71dc7e`

- all 28 visible mine IDs generated schema-valid, content-addressed known-good and faulty harnesses;
- each pair differs in exactly one declared mutable component and one declarative patch;
- immutable permission, safety, budget, fake-model identity, runtime contract, tool implementation, and
  capability sets remain fixed;
- the label-oracle runner selected good-pass/fault-fail and intervention outcomes from manifest
  identities and reproduced three identical trace hashes;
- the public builder rejects gate, final, and multi-cause body construction;
- the persisted suite commitment is `sha256:a48496598ee5ebef2ca4678e25c59d5a7666fc25e2ee16317ad933f715364b41`.

Architect Round 3R ruled that this work exceeded the prior authorization and that payload semantics did
not cause its results. The entire artifact graph is signed and mechanically quarantined under
`governance/deviations/hfb-structural-oracle-2026-07-31.json`. The label-fed 28/28 result is a scorer
self-test only; the commitment is superseded development evidence and cannot enter a research protocol.

## 2026-07-31 — Candidate bundle across subordinate OS principals

Implementation commit: `222b9209203a6f5b38dac41aebe89b2cfdc652e0`

- the OS-boundary fixture now creates parent/candidate manifests through the real component registry;
- the exact candidate bundle is committed, frozen, and mounted into evaluator UID 1103;
- operations UID 1101 submits the registry-generated parent/candidate IDs through the authenticated
  evaluator socket;
- evaluator configuration pins snapshot hash, bundle ID, and candidate HarnessVersion ID;
- a twelfth adversarial mode substitutes the candidate ID in an otherwise signed request and is rejected
  without a final result;
- the evidence artifact records source base, candidate commit/tree/snapshot, bundle ID, candidate ID,
  public principal keys, and all adversarial outcomes without retaining private keys.

## 2026-07-31 — Canonical candidate bundle and external evaluator bridge

Implementation commit: `e64967c6d24ad6f070c3783e7115f667b1c92be1`

### Added

- complete candidate component-closure and payload export;
- a schema-validated `CandidateHarnessBundle` whose content ID binds protocol, parent, candidate,
  source base commit, manifest, and every closure entry;
- a deterministic Git commit containing only `.seh-candidate-bundle.json`;
- a filesystem snapshot descriptor that binds base/head/tree/path/blob/mode/size/content;
- read-only snapshot materialization and artifact-retention receipt;
- a coordinator adapter that launches the external evaluator against the prepared snapshot;
- evaluator-side bundle, manifest, payload, closure, and request candidate-ID verification.

### Hardened

- candidate Git bytes bypass repository clean/smudge filters through
  `git hash-object --no-filters`;
- false bundle content IDs are rejected before any worktree write;
- candidate commit parent and changed-path set are checked exactly;
- mounted descriptor, configured bundle ID, configured HarnessVersion ID, and request ID must agree.

### Evidence at that commit

- 64/64 deterministic tests pass with required OS-boundary mode;
- the exact bundle path passed through an external Python process in `isolation_emulated`;
- the combined subordinate-UID transaction was completed by `8c3bfde`;
- C-H1–C-H4 remain unexecuted and unsupported.

## 2026-07-31 — First-class deterministic coordinator

Implementation commit: `819be3eaa05b159effe2abf0f069cba673055731`

### Added

- a signed, append-only `EvolutionRunRecord` schema and store;
- a separate evolution-run lifecycle:
  `created → weaknesses_mined → attributed → candidate_created → statically_validated → evaluating
  → evaluated → decided`, with terminal `failed`;
- an authoritative coordinator for mining, attribution, mutation, admission, evaluation, and
  qualification;
- candidate/parent, proposal, evidence, protocol, receipt, and snapshot pinning;
- deterministic approve, reject, evaluator-failure, duplicate-rejection, parent-preservation, and exact
  lifecycle tests.

### Corrected

- proposal state no longer treats static admission as success:
  `pending → admitted → accepted or rejected`;
- promotion reason codes now canonicalize every non-alphanumeric separator to the frozen schema form;
- evaluator failure rejects an unqualified candidate exactly once and does not create an adaptive
  replacement;
- a task retry cannot count as evolution because the candidate ID must differ from its parent.

### Explicitly deferred at that commit

- candidate bundle materialization and external-evaluator integration, completed by `e64967c`;
- semantically executable HarnessFaultBench research fixtures, still deferred;
- live-provider smoke and every empirical research phase under `NP-1`;
- root shipping and final research reports until the combined isolation path is verified.

### Claim impact

The change strengthens deterministic evidence for C-A2 and bounded local evidence for C-A3. It does not
change C-H1–C-H4: all remain unexecuted and unsupported.
