# Temporal Holdout Governance

Status: Gate 1R design contract

The temporal holdout is authored or collected only after the core protocol and frozen harness artifacts
exist. It is not used to evolve, select, promote, tune, repair, or roll back anything.

## Separation of roles

- At least two task authors operate under benchmark-author identities separate from runtime, proposer,
  evaluator, promoter, and primary experiment analyst.
- Authors receive the task-format/inclusion contract and public runtime/tool interface, but no candidate
  manifests, method labels, mine/gate/final outcomes, traces, attribution, failure clusters, or rejected
  edits.
- An independent reviewer who did not author a task validates it against inclusion rules.
- The evaluator operator receives sealed task packages only after authorship/review is complete.
- Authors and reviewers receive no candidate outcomes until the replication batch, audit heads, and
  analysis artifact are irreversibly finalized.

Access is enforced by separate accounts/mounts and audited messages, not an honor-system prompt.

## Timeline and protocol relation

1. Core `protocol-v1` freezes harness artifacts, evaluator interface, tools, authoring rules, analysis
   code, and the temporal target count before authors start.
2. Authors create tasks after the signed core freeze timestamp.
3. Each task and verifier receives a timestamped content hash and authorship/review record before any
   candidate execution.
4. A replication-only `protocol-v1-temporal-r1` pins those new task/verifier/split hashes while retaining
   the exact frozen harness/evaluator/model/tool/statistical pins.
5. No evolution or gate capability exists in that replication protocol.

The temporal protocol is reported separately; records are not pooled under the core protocol ID.

## Target and inclusion rules

Target: 20 accepted tasks; minimum publishable replication set: 15. If fewer than 15 pass pre-execution
validation, the temporal experiment is reported as not run/underfilled rather than lowering criteria.

A task is included only if, before candidate execution:

- creation/collection timestamp is after the core freeze;
- specification, starting repository/files, allowed tools, resource bounds, and deterministic verifier are
  complete and content-addressed;
- a competent solver can complete it with the frozen public tool interface and no undisclosed network or
  secret;
- verifier has an unambiguous binary primary outcome, deterministic replay, and no dependency on model
  prose/style except declared artifacts;
- known-good reference behavior passes and at least one preregistered negative control fails;
- task does not directly mention this harness, candidate prompts, known mine/gate failures, or method
  names;
- task family, language/domain, difficulty proxy, and expected tool profile fit the predeclared balancing
  quotas;
- license and provenance allow evaluation/disclosure;
- independent reviewer signs inclusion.

Reject before execution for ambiguity, flaky verifier, unavailable dependency, hidden credential,
duplicate/near-duplicate, unsafe requirement, license failure, scope excess, or quota excess. Rejection
reason and hashes are retained. No post-outcome task exclusion is permitted.

## Balancing

Before authorship, the 20 target slots are allocated across:

- at least four programming/tool domains;
- at least three difficulty bands based on deterministic reference steps/tool calls;
- no more than 25% from one source project, language, or author;
- a mixture of debugging, implementation, transformation, testing, and repository operations.

Authors fill slots without seeing method performance. Unfilled slots remain missing; they are not
reassigned after outcomes.

## Verifier freeze

Verifier source, dependencies, environment, expected artifact schema, timeouts, nondeterminism controls,
and known-good/negative-control outcomes are hashed before the first frozen-harness run. A verifier fix
after execution invalidates that task for confirmatory use and remains a disclosed negative result; it
cannot be silently patched and rerun under the same protocol.

## Contamination checks

Before acceptance, a separate reviewer:

- searches exact task phrases, distinctive code, repository commits, and verifier outputs against mine,
  gate, prior final, prior-art example, and candidate evidence corpora;
- checks public-source timestamps and prior availability;
- records whether any source was public enough for possible model pretraining;
- runs local near-duplicate matching against all project benchmark tasks;
- confirms authors had no project-result mount/message access.

Original post-freeze tasks with no public release before freeze receive the strongest contamination tier.
Tasks derived from public sources are labelled possible-prior-exposure and analyzed separately. No check
claims certainty about provider training data.

## Execution and disclosure

All frozen methods run in one committed order/randomization batch with the same no-retry Track B contract.
Task-level traces remain evaluator-only. The preregistered analysis includes all accepted tasks and
failures. Aggregate results, exclusions (which must predate execution), task hashes, authorship roles,
contamination tiers, and negative verifier findings are published after finalization.
