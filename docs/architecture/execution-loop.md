# Task Execution Loop

Status: Gate 1RR design contract

## Contract

```text
context → model → tool call → tool result → verification → completion or retry
```

The loop runs inside one session and one pinned `HarnessVersion`. Its goal is task completion, not harness
improvement.

## Sequence

1. **Start.** Operations creates a session in `created`, resolves the current whole-harness deployment
   pointer once, verifies its manifest, binds a `RuntimeStateSnapshot`, protocol, model, split permission,
   budget account and principal, then transitions to `initialized`.
2. **Submit.** The task is persisted as an input item. The owner acquires a lease and transitions to
   `running`.
3. **Construct context.** The kernel resolves system prompt, selected transcript items, retrieved memory,
   applicable skills, tool descriptions, workflow state, and budget status. It emits a context-manifest
   fact containing source IDs and hashes rather than secret/raw content.
4. **Invoke model.** The provider receives a typed request. Identity, parameters, request hash, usage, and
   stream/item boundaries are recorded. Provider secrets are never included.
5. **Dispatch tools.** Tool calls are schema-validated, permission-checked, budget-debited, and executed
   through the registry. Results become immutable artifacts or redacted inline values.
6. **Continue or wait.** Ordinary tool results return to context. Explicit subagents/backend jobs create
   child session/job records and move the owner to `waiting` until a legal resume condition exists.
7. **Verify.** A proposed terminal result moves the session to `validating`. The fixed verifier emits a
   verifier-outcome record that cannot be forged by the model or tool.
8. **Finish or retry.** Success moves to `completed`. A recoverable task failure may move back to
   `running` under the same harness and remaining retry budget. Operational corruption moves to
   `recovering`; missing authority/input moves to `blocked`.
9. **Retire.** Finalization verifies receipts/artifacts, releases the lease, and transitions the session
   to `retired`.

At any nonterminal state, initialization failure, cancellation, budget exhaustion, deadline expiry,
verifier failure, security violation, crash, unrecoverable recovery, or host shutdown instead enters
`terminating`. The operations owner revokes descendant leases/capabilities, stops process groups and
backend jobs, seals accounting/evidence, and enters terminal `terminated`. Resume is forbidden; a retry
requires a new session.

## Event and item discipline

The append-only stream distinguishes:

- recorded user/model/tool/session observations with explicit origin trust;
- permission and budget decisions;
- verifier outcomes;
- inferences such as reflection or diagnosis.

Each event has a sequence number, prior-event hash, canonical payload hash, producer principal, origin
trust, protocol/session/harness/snapshot IDs, monotonic time, and optional artifact references. A signed
receipt binds event ranges. The latest checkpoint is a cache; exact replay recomputes state from the
stream and verifies the chain.

## Tool protocol

The model sees `ToolDescription` components. The registry binds each description to an immutable
`ToolImplementation` by exact hash. Execution follows:

```text
parse → JSON Schema validate → resolve implementation → authorize
→ reserve budget → execute in sandbox → redact → persist artifact → emit result
```

The MVP tools are read, write, edit, bash, `git status`, and `git diff`. Git commands are separate
allowlisted operations; arbitrary shell commands do not inherit Git-specific trust.

Path handling resolves symlinks and canonical ancestry before access, rechecks after opening where the OS
permits, denies special files, and confines writes to explicit workspace roots. Bash receives a minimal
environment, bounded process tree, output cap, timeout, and deny-by-default network policy.

## Context and memory

Context construction is deterministic for the same event stream, component graph, memory snapshot,
budget, and seed. It records both selected and rejected source IDs with reason codes.

Filesystem memory is scoped (`session`, `project`, or approved long-term), content-addressed, provenance
labelled, and subject to retention. Retrieval is a read operation; writing memory is not evolution.
Candidate-generated or untrusted memory cannot override system, safety, permission, evaluator, or
benchmark instructions.

## Subagents and backend jobs

- Every child has its own ID, state, budget slice, event stream, and artifact directory.
- The parent’s harness, protocol, runtime-state snapshot, model, split permission, principal delegation,
  shared budget account, and permission ceiling are inherited.
- Delegation cannot increase authority.
- A child or job cannot read the production deployment channel or rebind after a later deployment.
- Background jobs require a durable owner, heartbeat/lease, bounded process identity, status artifact,
  cancellation path, orphan recovery, and mandatory reap during session termination.
- A parent may wait, resume, or fail based on explicit child terminal events; chat text is not a
  synchronization primitive.

## Retry, reflection, recovery, and adaptation

All four keep the same `harnessVersionId`:

- **retry:** another bounded attempt at the task/model step;
- **reflection:** an inference item added to the same trajectory;
- **recovery:** deterministic restoration after interruption or invalid operational state;
- **adaptation:** a runtime choice permitted by the fixed routing/context policy.

Only the Evolution Control Plane can create a candidate harness. A task score increase after any of these
operations is not recorded as harness evolution.
