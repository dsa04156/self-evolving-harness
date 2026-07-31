# Evolution Loop Change Log

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

### Explicitly deferred

- materializing the candidate component closure into a detached Git worktree;
- freezing that exact committed bundle and passing its read-only snapshot through the coordinator to the
  OS-external evaluator;
- executable HarnessFaultBench research fixtures;
- live-provider smoke and every empirical research phase under `NP-1`;
- root shipping and final research reports until the combined isolation path is verified.

### Claim impact

The change strengthens deterministic evidence for C-A2 and bounded local evidence for C-A3. It does not
change C-H1–C-H4: all remain unexecuted and unsupported.
