# Runtime-State Reproducibility and Inheritance

Status: Gate 1R design contract

A `HarnessVersion` identifies harness behavior-bearing composition, but it is not sufficient to replay a
run. Each session and evaluation also pins an immutable `RuntimeStateSnapshot`.

## Snapshot contents

The snapshot identity covers:

- protocol and harness IDs;
- filesystem memory mode and exact manifest;
- base filesystem artifact, repository tree, and fresh copy-on-write overlay;
- container image, locked toolchain, OS/architecture, locale, timezone, clock mode, random seed, and
  allowed environment variables;
- checkpoint mode and content hash;
- provider/runtime cache modes and any fixed cache manifest;
- permission, safety, model, budget, and network-policy hashes;
- mandatory descendant inheritance fields.

Provider service behavior that cannot be content-addressed is recorded as a reproducibility limitation,
including provider model alias, dated snapshot/version when exposed, service tier, parameters, region,
and request/response IDs. It never receives a fictitious model-weight hash.

## Evaluation reset

Every paired candidate/baseline task starts from independently materialized but byte-identical
snapshots:

1. verify the snapshot and all artifact hashes;
2. create a fresh sandbox and copy-on-write workspace;
3. materialize the declared memory and cache modes;
4. clear undeclared environment variables, processes, sockets, caches, and temporary files;
5. start no resumable job or checkpoint unless explicitly fixed in the snapshot;
6. bind the exact harness, model, policies, split permissions, and budget account;
7. emit a trusted initialization receipt before the first model call.

Writes during a run are captured in that run's overlay and memory journal. They are evidence artifacts,
not inputs to another paired run unless a later protocol explicitly pins them.

## Session recovery

Recovery may use a checkpoint only when:

- the checkpoint is linked to the same session, harness, protocol, principal, budget account, and base
  snapshot;
- the event chain through checkpoint creation verifies;
- workspace and memory overlay hashes match;
- no task, harness, model, permission, split, or budget field changes.

Otherwise recovery blocks or creates a new session. A session restart with a different snapshot is not a
replay and never counts as harness evolution.

## Subagents and backend jobs

A child receives a signed delegation envelope containing:

- parent session and item IDs;
- child principal identity and strictly reduced capability set;
- the same `harnessVersionId`, `protocolId`, `runtimeStateSnapshotId`, model identity, split permissions,
  and shared budget account;
- a bounded child token/tool/time allocation debited from the parent;
- read/write artifact capabilities scoped to its task.

The child cannot consult the deployment channel, select the newly active harness, widen data access,
change provider/model, create a new budget, or spawn an unbounded descendant. Backend jobs obey the same
rules. Results with missing or mismatched inheritance fields are rejected before entering parent context.

## Active-version changes

Deployment activation affects only sessions initialized afterward. Existing sessions, descendants, jobs,
recovery attempts, and evaluator pairs remain pinned even if the active channel changes. This invariant
prevents behavior changes under an unchanged session trace and prevents candidate evaluation from
silently rebinding to itself or a newer version.

## Required tests before Gate 2

- a memory, workspace, checkpoint, cache, locale, clock, or environment difference changes snapshot ID;
- a child rebinding harness/model/split/budget is rejected;
- activation during a long session does not change its harness;
- paired runs have distinct writable overlays and identical starting hashes;
- undeclared files, environment variables, background processes, and cache entries cause initialization
  failure;
- recovery with a foreign or modified checkpoint fails;
- provider-opacity fields appear in the reproducibility receipt and limitation report.
