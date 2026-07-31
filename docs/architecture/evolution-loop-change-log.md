# Evolution Loop Change Log

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

### Evidence and limit

- 64/64 deterministic tests pass with required OS-boundary mode;
- the exact bundle path passes through an external Python process in `isolation_emulated`;
- subordinate-UID evaluator enforcement passes independently on a generic frozen snapshot;
- the two properties are not yet combined in one transaction, so no stronger process-isolation claim is
  made;
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
- executable HarnessFaultBench research fixtures, still deferred;
- live-provider smoke and every empirical research phase under `NP-1`;
- root shipping and final research reports until the combined isolation path is verified.

### Claim impact

The change strengthens deterministic evidence for C-A2 and bounded local evidence for C-A3. It does not
change C-H1–C-H4: all remain unexecuted and unsupported.
