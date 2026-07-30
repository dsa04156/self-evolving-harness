# Session, Harness Qualification, and Deployment State

Status: Gate 1RRR correction candidate

The session lifecycle, harness qualification lifecycle, and channel deployment history are independent.
A transition in one never implies a transition in another.

## Session lifecycle

Normal path:

```text
created → initialized → running ↔ waiting
                         ↓
                     validating → completed → retired
```

Recoverable interruption:

```text
initialized/running/waiting/validating → blocked or recovering
blocked → recovering → initialized/running/blocked
```

Fail-closed abnormal path:

```text
any nonterminal state → terminating → terminated
```

| From | Allowed to | Required evidence |
|---|---|---|
| `created` | `initialized`, `retired`, `terminating` | resolved pins, unused-session retirement, or abnormal reason |
| `initialized` | `running`, `blocked`, `terminating` | owner lease + task, missing authority/input, or abnormal reason |
| `running` | `waiting`, `validating`, `blocked`, `recovering`, `terminating` | job wait, terminal candidate, block, recoverable fault, or abnormal reason |
| `waiting` | `running`, `blocked`, `recovering`, `terminating` | child/job event, recoverable timeout, or abnormal reason |
| `blocked` | `recovering`, `terminating` | recovery authorization/input or unrecoverable reason |
| `recovering` | `initialized`, `running`, `blocked`, `terminating` | replay/checkpoint result or unrecoverable reason |
| `validating` | `completed`, `running`, `blocked`, `terminating` | verifier outcome, bounded retry, recoverable block, or abnormal reason |
| `completed` | `retired`, `terminating` | normal retention decision or a post-completion invalidating incident |
| `terminating` | `terminated` | completed mandatory termination transaction |
| `retired` | none | normal terminal state |
| `terminated` | none | abnormal terminal state |

The mandatory termination reason is exactly one of:

- `initialization_failure`;
- `user_cancellation`;
- `budget_exhaustion`;
- `deadline_expiry`;
- `verifier_failure`;
- `security_violation`;
- `process_crash`;
- `unrecoverable_recovery`; or
- `host_enforced_shutdown`.

The initiating `toState=terminating` record creates one immutable termination descriptor:

```text
D = (
  terminationTransactionId,
  initiatingRecordId,
  preTerminationState,
  initiatingPrincipal,
  reason
)
```

For the initiating record, `initiatingRecordId == recordId`,
`preTerminationState == fromState`, `initiatingPrincipal == transitionedBy`, and
`reason == terminationReason`. Every non-termination record has a null descriptor.

The sole `terminating → terminated` record directly references the initiating record through
`D.initiatingRecordId` and repeats `D` byte-for-byte. It must preserve protocol, session, harness,
runtime-state snapshot, original pre-termination state, initiating principal, and reason. Its top-level
`terminationReason` equals `D.reason`. It may add only termination-completion evidence: revocation and
process/job-reap status, sealed accounting evidence, final receipt references, the new record/transition
actor and time, audit link, and attestation. Existing initiating evidence cannot be removed or changed.

The audit validator permits exactly one initiating and at most one final record for each
`(sessionId, terminationTransactionId)`. A missing initiator, non-direct reference, descriptor mismatch,
reason change, duplicate/conflicting final, or any other field drift fails validation. If the initiating
process crashes, the operations owner may be the final record's transition actor, but the descriptor's
initiating principal remains unchanged. The transaction may not return the session to another state.

Session invariants:

- harness, runtime-state snapshot, protocol, model, split permission, and budget are pinned at
  initialization and inherited by every descendant;
- retry is `validating → running` or an inner-loop iteration, never a new harness;
- a `retired` or `terminated` session cannot resume;
- retry after abnormal termination creates a new session with a new session ID and explicit causal link;
- one termination transaction has one immutable cause and at most one terminal completion;
- identical inputs, fake provider/tool outputs, seed, and snapshot yield the same event-chain head;
- an out-of-band container kill without a matching termination record invalidates the session result.

## Harness qualification lifecycle

`HarnessVersionManifest` contains no state. Qualification is projected from signed append-only
`HarnessLifecycleRecord` objects:

```text
draft → candidate → statically_validated → evaluating → canary → approved
  ↘ rejected    ↘ rejected              ↘ rejected   ↘ rejected

approved → retired
rejected → retired
```

| From | Allowed to | Required evidence |
|---|---|---|
| `draft` | `candidate`, `rejected` | complete manifest/proposal or construction rejection |
| `candidate` | `statically_validated`, `rejected` | static-validation receipt or reason |
| `statically_validated` | `evaluating`, `rejected` | evaluator admission or pre-evaluation failure |
| `evaluating` | `canary`, `rejected` | matched gate result for the exact manifest/snapshot or rejection |
| `canary` | `approved`, `rejected` | offline/synthetic canary and signed qualification decision |
| `approved` | `retired` | retirement eligibility scan and signed retirement decision |
| `rejected` | `retired` | archival eligibility scan |
| `retired` | none | qualification-terminal; content/evidence retained |

`active` and `rolled_back` are not harness states. `approved` means eligible for a new session or
deployment subject to policy; it does not mean deployed anywhere.

A version can enter `retired` only when it is:

- not the production channel target;
- not the registered rollback target;
- not pinned by any live session or descendant;
- not part of a pending evaluation, decision, or deployment transaction; and
- not under an audit/legal retention hold that requires deployment eligibility.

Retirement means ineligible for new sessions and deployments, not deletion. Content, evidence, and
historical records remain resolvable for audit. Historical records about the version do not by
themselves keep it deployable.

## Protocol-v1 deployment state

Protocol v1 permits exactly one channel named `production`. Its state is only the latest valid
`DeploymentPointerRecord`; no manifest or lifecycle projection stores deployment state. The complete
pointer state is:

```text
P_g = (
  generation = g,
  target = (harnessVersionId, manifestHash, qualificationDecisionId) | null,
  rollbackTarget = (harnessVersionId, manifestHash, qualificationDecisionId) | null,
  pointerRecordHash
)
```

`expectedBefore` repeats the complete prior tuple, including both target and rollback target. The
decision and applied record repeat the complete next tuple. The validator resolves every tuple member
under the same protocol and recomputes both manifest hashes and approval references.

| Operation | CAS precondition | Result |
|---|---|---|
| `initialize` | `P_-1`: generation `-1`; target, rollback target, and record hash all null | `P_0`: approved target `A`; rollback target null |
| `deploy(C)` | exact `P_g` with non-null target `A` | `P_g+1`: target `C`; rollback target exactly prior target `A` |
| `rollback` | exact `P_g` with target `A` and non-null rollback target `B` | `P_g+1`: target exactly `B`; rollback target exactly `A` |
| `decommission` | exact `P_g` with non-null target | `P_g+1`: target and rollback target null; no qualification transition |

Protocol v1 therefore uses a **null initialization anchor**. Rollback is prohibited after initialize
until one successful deploy has created a non-null rollback target. There is no separate
composition-equivalent bootstrap anchor and no equivalence predicate.

`deploy` and `rollback` require approved, protocol-compatible exact tuples. The rollback rule is a
deterministic swap:

```text
new.target = prior.rollbackTarget
new.rollbackTarget = prior.target
```

Repeated rollback therefore toggles the two most recent deployed targets; older targets remain in
append-only history but are not silently selected. `initialize` records
`priorTargetDisposition=none`; every later operation records
`priorTargetDisposition=retained_approved`. Replacing, rolling back, or decommissioning never retires a
prior target.

Concurrent operations serialize at the deployment registry. A stale generation, prior hash, target,
rollback target, qualification decision, or protocol fails closed. Every successful operation has
`new.generation = prior.generation + 1`. There is no implicit rebase, null-to-rollback coercion, or
per-component activation. The applied pointer record must equal its signed `DeploymentDecision` in
protocol, channel, action, complete `expectedBefore`, generation, target tuple, and rollback-target
tuple; any mismatch fails before append.

## Cross-lifecycle prohibitions

- retry, reflection, recovery, memory update, session restart, termination, and resume emit no harness
  qualification or deployment record;
- approval emits no deployment record;
- deployment or rollback emits no harness qualification record;
- a new channel target does not change already initialized sessions or descendants;
- final-role results cannot approve, deploy, roll back, retire, or alter decision policy;
- rejected/retired versions and every deployment event remain retained.
