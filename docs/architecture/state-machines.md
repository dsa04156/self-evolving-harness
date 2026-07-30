# Session, Harness Qualification, and Deployment State

Status: Gate 1RR design contract

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

`terminating → terminated` is valid only when the supervisor has revoked all descendant leases and
capabilities, stopped and reaped backend jobs/process groups, sealed provider/tool/feedback accounting,
and appended a final evidence receipt. If the initiating process crashes, the operations owner resumes
the termination transaction; it may not return the session to another state.

Session invariants:

- harness, runtime-state snapshot, protocol, model, split permission, and budget are pinned at
  initialization and inherited by every descendant;
- retry is `validating → running` or an inner-loop iteration, never a new harness;
- a `retired` or `terminated` session cannot resume;
- retry after abnormal termination creates a new session with a new session ID and explicit causal link;
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
`DeploymentPointerRecord`; no manifest or lifecycle projection stores deployment state.

| Operation | CAS precondition | Result |
|---|---|---|
| `initialize` | generation `-1`, null target/hash | generation `0` points to an approved target and records a distinct approved rollback anchor |
| `deploy` | exact current generation, target, and pointer-record hash | next generation points to an approved exact manifest; prior target remains approved and becomes rollback target |
| `rollback` | exact current generation, target, and pointer-record hash | next generation points to the recorded approved rollback target; displaced target remains approved |
| `decommission` | exact current generation, target, and pointer-record hash | next generation has a null target; no harness lifecycle transition is implied |

Every operation requires a signed `DeploymentDecision`, exact target and rollback-target manifest
hashes, protocol match, separate approved qualification-decision references for both retained targets,
and complete audit linkage. Rollback is a channel-scoped CAS event, not a global state. Replacing or
rolling back a pointer never retires either harness.

Initialization uses two separately identified, composition-equivalent manifests: an approved bootstrap
target and an approved rollback anchor. Both follow the qualification path; initialization has no
state-skipping exception.

Concurrent operations serialize at the deployment registry. A stale generation, prior hash, target,
qualification decision, or protocol fails closed. There is no implicit rebase and no per-component
activation.

## Cross-lifecycle prohibitions

- retry, reflection, recovery, memory update, session restart, termination, and resume emit no harness
  qualification or deployment record;
- approval emits no deployment record;
- deployment or rollback emits no harness qualification record;
- a new channel target does not change already initialized sessions or descendants;
- final-role results cannot approve, deploy, roll back, retire, or alter decision policy;
- rejected/retired versions and every deployment event remain retained.
