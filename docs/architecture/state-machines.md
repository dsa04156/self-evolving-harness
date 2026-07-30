# Session and Harness-Version State Machines

Status: Gate 1R design contract

The machines are deliberately separate. A transition in one never implies a transition in the other.

## Session lifecycle

States:

```text
created → initialized → running → waiting → blocked → recovering
                                      ↘ validating → completed → retired
```

The line above is mnemonic, not a claim that every state has only one outgoing edge. The complete
transition table is authoritative:

| From | Allowed to | Required evidence |
|---|---|---|
| `created` | `initialized`, `retired` | resolved harness/immutable manifests, or retirement reason |
| `initialized` | `running`, `blocked`, `retired` | owner lease + task, missing input/authority, or reason |
| `running` | `waiting`, `validating`, `blocked`, `recovering`, `retired` | job wait, terminal candidate, block, fault, or interrupt |
| `waiting` | `running`, `blocked`, `recovering`, `retired` | child/job event, timeout/authority, lost owner, or interrupt |
| `blocked` | `recovering`, `retired` | recovery authorization/input, or final block reason |
| `recovering` | `initialized`, `running`, `blocked`, `retired` | replay/checkpoint validation and deterministic classification |
| `validating` | `completed`, `running`, `blocked`, `retired` | verifier outcome, bounded retry, unavailable verifier, or interrupt |
| `completed` | `retired` | completion receipt and artifact retention decision |
| `retired` | none | terminal |

Invariants:

- `harnessVersionId` is assigned on `created → initialized` and never changes.
- `runtimeStateSnapshotId`, protocol ID, model identity, split permissions, and budget account are also
  pinned at initialization and inherited by every child/job.
- A retry is `validating → running` or an inner-loop iteration, not a new session/harness.
- Resume is a legal transition from `waiting` or recovery path, never direct mutation of state.
- Replay derives the same terminal state and event-chain head for the same inputs.
- A retired session cannot be reopened; continuation creates a new session.

## HarnessVersion lifecycle projection

`HarnessVersionManifest` contains no lifecycle field. The current state is a deterministic projection of
signed, append-only `HarnessLifecycleRecord` objects for one manifest ID and protocol. A missing,
duplicated, out-of-order, cross-protocol, or illegal transition invalidates the projection.

```text
draft → candidate → statically_validated → evaluating → canary → active → retired
                     ↘ rejected              ↘ rejected   ↘ rejected
                                                            active → rolled_back → retired
```

| From | Allowed to | Required evidence |
|---|---|---|
| `draft` | `candidate`, `rejected` | complete manifest + proposal, or construction rejection |
| `candidate` | `statically_validated`, `rejected` | static-validation receipt or reason |
| `statically_validated` | `evaluating`, `rejected` | evaluator admission or gate failure |
| `evaluating` | `canary`, `rejected` | matched-budget gate results for the exact manifest/snapshot + gate decision |
| `canary` | `active`, `rejected` | offline replay or isolated synthetic canary + promotion decision |
| `active` | `retired`, `rolled_back` | replacement/retirement or rollback decision |
| `rolled_back` | `retired` | exact target-hash restoration receipt |
| `rejected` | `retired` | archival receipt |
| `retired` | none | terminal |

Invariants:

- lifecycle records are append-only; state is a projection;
- no transition skips candidate evaluation;
- only one version is active per registry/channel;
- every active version has a resolvable rollback target in its external lineage/decision records;
- activation points to one evaluated whole-harness manifest, never independently selected components;
- promotion is a `DeploymentPointerRecord` compare-and-swap against the evaluated parent harness,
  channel generation, and prior pointer-record hash;
- rejected/rolled-back versions and their evidence are never deleted;
- prompt reinjection, session restart, memory update, retry, and recovery cannot emit a harness transition.
- sealed HFB final, temporal holdout, and withheld-public-test outcomes cannot cause a promotion,
  rollback-policy update, threshold change, or candidate selection.

## Concurrency

Promotion and rollback serialize on the registry activation lock. Candidate evaluation does not hold the
lock. If the channel generation, pointer-record hash, or active whole-harness ID differs from the
candidate's evaluated parent at promotion time, the candidate is stale and must be re-evaluated or
rejected; it cannot be rebased implicitly. The CAS appends one new pointer record; no component registry
row is updated.
