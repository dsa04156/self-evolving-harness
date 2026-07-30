# Architect Packet 2R — Runtime and Trust Corrections

Status: **DRAFT — DO NOT TRANSMIT UNTIL EVERY `PENDING` FIELD IS REPLACED**

## Metadata

- Repo: `self-evolving-harness`
- Branch: `main`
- Source commit under review: `PENDING_CLEAN_EVIDENCE_COMMIT`
- Packet date: 2026-07-30
- Gate 1RRR response: `APPROVE`
- Gate 2 response: `REVISE`
- Gate 2 response SHA-256:
  `e12a59450b967bfde4a81f7b30aee2c50c037537af45c96f8944e5981ddc5cd1`
- Existing Architect conversation target:
  `https://chatgpt.com/c/6a6b1847-22c8-83e8-9558-8297a43979e0`
- Required decision: whether the ordered Gate 2 corrections satisfy the frozen runtime-and-trust
  boundary and authorize only the next bounded scope.

## Scope and exclusions

This is a correction-only resubmission. It does not introduce a new novelty claim and does not ask the
Architect to revisit the accepted standalone-runtime contribution boundary.

No real provider, benchmark evolution, `D_gate`, final, temporal, or withheld-public data was accessed.
No paid work, live deployment, push, release, performance result, containment/security claim,
generalization claim, or empirical self-improvement claim is included.

The same conceptual boundary remains frozen:

```text
task retry/recovery:
  same HarnessVersion and one SessionLifecycle

harness evolution:
  multiple traces → weakness mining → attribution
  → bounded declarative mutation → new HarnessVersion
  → independent evaluation → recorded qualification/deployment decision
```

## Ordered correction summary

| Gate 2 blocker | Corrected path | Evidence |
|---|---|---|
| component hash fixed point | named `ComponentIntrinsicIdentity` and `ComponentManifestIdentity` hash domains with exact preimages and recomputation | deterministic registry/schema tests |
| unresolved capability preimage | canonical sorted `capabilityIds` are embedded in the immutable manifest and digest-recomputed; absent/duplicate/unsorted/excess sets fail | deterministic valid/invalid manifests |
| cross-language canonical mismatch | protocol narrowed to `seh-c14n-int-v1`: I-JSON Unicode, safe integers only, no fractions/negative zero; TypeScript, evaluator Python, and audit Python consume one corpus | byte/digest equality plus frozen-category negatives |
| same-principal evaluator | operations, runtime, evaluator, promoter, and audit use distinct mapped subordinate UID/GID pairs, role-owned keys, fresh sandboxes, no network, zero capabilities, and role-specific mounts | `PENDING_OS_EVIDENCE` |
| unauthenticated production path | operations reaches separate audit/evaluator services only over framed Unix sockets; both directions check `SO_PEERCRED`, pinned key/role, signature, schema, correlation, sequence/nonce, deadline, and protocol | `PENDING_OS_EVIDENCE` |
| result/audit key substitution | evaluator/audit derive public-key digests from their private/public key files and compare them to protocol-pinned principal identities before binding a socket | emulated integration plus `PENDING_OS_EVIDENCE` |
| incomplete tool cancellation | abort authority reaches tool executor, filesystem commit points, shell process groups, descendants, and budget seal; TERM/KILL and reap precede terminal authority | non-cooperative delayed-write test |
| missing retirement holds | six signed hold kinds cover production, rollback, live sessions, live descendants, pending evaluations, and pending deployments | all-kind retirement test plus deployment reconciliation |
| non-durable termination/evaluation | three-stage termination and eight-stage evaluator journals recover idempotently across every injected durable crash boundary | crash matrix tests |
| Git tree omitted extra bytes | dirty/ignored/link/special inputs fail; committed blobs are materialized separately; evaluator rechecks descriptor hash, exact paths/directories, blob IDs, bytes, modes, links, and request/result pin | worktree/substitution/mode tests plus `PENDING_OS_EVIDENCE` |

## Principal and transport correction

The actual Gate 2R evidence path is not the same-UID unit transport. It uses:

```text
rootless subordinate-ID namespace
├── operations  uid/gid 1101
├── runtime     uid/gid 1102
├── evaluator   uid/gid 1103
├── promoter    uid/gid 1104
└── audit       uid/gid 1105
```

Each role gets:

- a separate private key owned by that UID with mode 0600;
- only its own key mounted in normal operation;
- a new mount/PID/IPC/UTS/network namespace, zero effective capabilities, and `NoNewPrivs`;
- no direct network and one role-specific writable state directory;
- role-specific read-only executable/config mounts rather than the repository root.

Normal audit/evaluator sockets are mode 0660 and group-scoped to operations. A separate adversarial run
temporarily permits a wrong UID to connect so server-side `SO_PEERCRED` rejection is also exercised.
Client-side peer credential rejection is exercised against an impostor server UID.

The adversarial matrix includes unauthorized key read/write, signal, ptrace, direct network, socket
permission, wrong client UID, wrong server UID, partial/oversized/extra frames, peer crash, replay,
protocol downgrade, wrong role, wrong key, invalid signature, independently signed schema-invalid
payload, and snapshot-pin mismatch. No case may produce `evaluation_final`.

OS evidence result:

```text
PENDING_OS_TEST_COMMAND
PENDING_OS_TEST_RESULT
PENDING_OS_EVIDENCE_HASH
```

## Exact evaluator input

The evaluator does not mount the candidate worktree or its Git metadata. The launch path:

1. requires a detached exact clean commit and rejects untracked, ignored, symlink, submodule, special,
   and hard-linked objects;
2. reads each committed blob from Git, verifies size/hash, and writes it once into a new mode-0400/0500
   tree;
3. records a canonical descriptor over commit, tree, path, Git mode, Git object ID, size, content hash,
   and the complete filesystem snapshot hash;
4. mounts only that tree read-only in the evaluator namespace;
5. has the evaluator independently verify canonical descriptor bytes, the complete object set, every
   blob ID/content/mode/link count, and the request/result snapshot hash before evaluation.

The complete descriptor used by the OS run is retained at:
`architect/evidence/gate2r/candidate-filesystem-snapshot.json`.

## Cancellation and recovery

Cancellation no longer merely ignores a late result. A shared abort signal:

- blocks tool dispatch and artifact persistence;
- reaches read/write/edit/bash;
- is rechecked immediately before atomic workspace rename/link;
- terminates the complete detached process group and reaps it;
- seals model/tool accounting and prevents a terminal session from being resurrected.

The adversarial tool ignores cancellation and attempts a delayed workspace write. The process group is
gone, active-process count is zero, and the marker never exists.

Evaluator transactions persist:

```text
started → proposed → audit_linked → result_created
→ signature_verified → result_appended → accounting_sealed → completed
```

Termination transactions persist:

```text
initiated → final_receipt → completed
```

Every durable boundary is crash-injected. Restart requires the same request/core/result/receipt hashes,
reuses idempotent audit subjects, produces one terminal record, and releases the last pending hold.
Contradictory or duplicate completion fails.

## Fresh evidence from one clean commit

Environment:

```text
PENDING_ENVIRONMENT
```

Commands:

```text
PENDING_BUILD_RESULT
PENDING_SCHEMA_RESULT
PENDING_DEMO_RESULT
PENDING_COVERAGE_RESULT
PENDING_ZERO_SKIP_TEST_RESULT
```

Selected artifact hashes:

```text
PENDING_ARTIFACT_HASHES
```

The unit-emulation transport result is reported separately and is not offered as OS-containment
evidence.

## Deferred findings remain deferred

- Complete session-definition signature/field-coverage proof remains mandatory before Gate 3.
- The matched-budget B0–B6 scheduler and pilot numeric freeze remain mandatory before any empirical
  evolution work.

Neither item is silently treated as complete in this resubmission.

## Decision requested

Apply the already frozen Gate 2 standard. Do not lower it.

- `APPROVE` only if every blocking correction and the actual OS-boundary evidence is sufficient.
- `REVISE` with the minimum remaining correction if a non-waivable contract still fails.
- `BLOCK` if the implementation cannot meet the accepted separation or reproducibility boundary.

If approved, authorize only the next preregistered scope. Do not authorize benchmark/gate/final access,
performance claims, live deployment, push, or release.

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK

NOVELTY:
CORRECTNESS:
REPRODUCIBILITY:
SECURITY:
CLAIM DISCIPLINE:

BLOCKING FINDINGS:
DEFERRABLE FINDINGS:
MINIMUM ORDERED CORRECTIONS:
AUTHORIZED NEXT SCOPE:
```
