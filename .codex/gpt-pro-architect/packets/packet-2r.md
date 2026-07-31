# Architect Packet 2R — Runtime and Trust Corrections

Status: **READY FOR GATE 2R REVIEW**

## Metadata

- Repo: `self-evolving-harness`
- Branch: `main`
- Runtime source commit under test: `14e373ee4cf245da8c221be9574aa7528d3202e8`
- Runtime source tree: `f30df800ece4424a1a1bbc0f7f61b2ca108020cd`
- Packet date: 2026-07-31
- Gate 1RRR response: `APPROVE`
- Gate 2 response: `REVISE`
- Gate 2 response SHA-256:
  `e12a59450b967bfde4a81f7b30aee2c50c037537af45c96f8944e5981ddc5cd1`
- Existing Architect conversation target:
  `https://chatgpt.com/c/6a6b1847-22c8-83e8-9558-8297a43979e0`
- Required decision: whether the ordered Gate 2 corrections satisfy the frozen runtime-and-trust
  boundary and authorize only the next bounded scope.

## External disclosure scope

- Destination: the existing project-specific ChatGPT.com Pro architect conversation only.
- Transport: exact-tab continuation at the recorded local Chrome CDP endpoint; no new tab/window.
- Data categories: architecture correction summary, aggregate test/coverage results, local toolchain
  versions, source/evidence hashes, synthetic role UIDs, and retained evidence paths.
- Excluded: source upload, repository bundle, `.env`, credentials, provider tokens, private-key bytes,
  raw traces, personal/customer data, and sealed benchmark content.
- Authorization: the user explicitly authorized the planned architect review and project actions.
- Redaction check: the packet contains no credential value, private key, provider request, benchmark
  task content, or unrelated repository data.

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
| same-principal evaluator | operations, runtime, evaluator, promoter, and audit use distinct mapped subordinate UID/GID pairs, role-owned keys, fresh sandboxes, no network, zero capabilities, and role-specific mounts | subordinate-UID OS test: pass |
| unauthenticated production path | operations reaches separate audit/evaluator services only over framed Unix sockets; both directions check `SO_PEERCRED`, pinned key/role, signature, schema, correlation, sequence/nonce, deadline, and protocol | normal transaction plus 11 malformed/adversarial modes: pass |
| result/audit key substitution | evaluator/audit derive public-key digests from their private/public key files and compare them to protocol-pinned principal identities before binding a socket | role-key challenge, wrong-key, wrong-UID, and impostor-server tests: pass |
| incomplete tool cancellation | abort authority reaches tool executor, filesystem commit points, shell process groups, descendants, and budget seal; TERM/KILL and reap precede terminal authority | non-cooperative delayed-write test |
| missing retirement holds | six signed hold kinds cover production, rollback, live sessions, live descendants, pending evaluations, and pending deployments | all-kind retirement test plus deployment reconciliation |
| non-durable termination/evaluation | three-stage termination and eight-stage evaluator journals recover idempotently across every injected durable crash boundary | crash matrix tests |
| Git tree omitted extra bytes | dirty/ignored/link/special inputs fail; committed blobs are materialized separately; evaluator rechecks descriptor hash, exact paths/directories, blob IDs, bytes, modes, links, and request/result pin | exact-snapshot tests plus OS-mounted snapshot transaction: pass |

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
clean source HEAD:
  14e373ee4cf245da8c221be9574aa7528d3202e8

command:
  SEH_REQUIRE_OS_BOUNDARY=1 \
  SEH_OS_EVIDENCE_OUTPUT=architect/evidence/gate2r/os-principal-evidence.json \
  npx -y node@24.18.1 --import tsx --test test/os-principal-boundary.test.ts

result:
  tests=1 pass=1 fail=0 cancelled=0 skipped=0 todo=0
  isolationClass=os_enforced_subordinate_uids
  host role UIDs=232172,232173,232174,232175,232176
  normal transaction isolationClass=os_enforced_external
  operations UID=1101; evaluator peer UID/GID=1103/1103
  audit peer UID/GID=1105/1105
  adversarial modes=11; rejected without final result=11
  wrong client UID rejected=true
  wrong server UID rejected=true
  unauthorized normal-socket connect denied=true
  pass→fail=0; fail→pass=1

retained evidence SHA-256:
  os-principal-evidence.json
    9b637be156719c67fd11a72fdf0bb000bca9c5d8dee2d72bf033b38d263d459e
  candidate-filesystem-snapshot.json
    2ab94a3f4cb86f9c67cc9caf6e787e593a8d5a57dc824945da477319e71e3e7a
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
Node.js:      v24.18.1
npm:          11.18.0
Python:       3.13.14
bubblewrap:   0.9.0
rootlesskit:  2.3.6
kernel:       Linux 7.0.0-28-generic x86_64 GNU/Linux
newuidmap:    /usr/bin/newuidmap mode=4755 owner=0:0
newgidmap:    /usr/bin/newgidmap mode=4755 owner=0:0
subuid/subgid jinuk:231072:65536
```

Commands:

```text
npm run check
  pass

npm run build
  pass

npm run cli -- check-schemas
  {"compiledSchemas":41}

npm run cli -- demo
  state=completed; verificationPassed=true
  modelCalls=2; toolCalls=1; eventCount=14
  eventHeadHash=sha256:40b62c69a361d61928a9e8319bb766505e8e5eeec249298aabea961421dacd45

SEH_REQUIRE_OS_BOUNDARY=1 npm run test:coverage
  tests=38 pass=38 fail=0 cancelled=0 skipped=0 todo=0
  line=92.06%; branch=85.89%; function=89.03%
```

Selected artifact hashes:

```text
package-lock.json
  6067e8a69a6adfbf2f0f5eb7f395b5afb6dd114b74c131e55cd3f3c8986d3ed2
configs/component-type-registry.json
  d93cb03973a6552db1d7e894bf65f492a4dc308225eaf9a965361c9f5db8dfb0
schemas/protocol-manifest.schema.json
  8be3e500b3e77b417f0259d052ed8af57e7172434c4b7d906f01b76a470404aa
schemas/wire-envelope.schema.json
  5e92560af7bdf7390f98080ce9f099b38d2c250f6ac271f03ba68addf70ff631
test/fixtures/canonical-profile-v1.json
  e9935cff3f39ea2693850c5dca553f0a73fcd7a9bddefd110a4e17c7e10b07f4
evaluator/external_audit.py
  73240f79d8d70ae338d5137d6ce425bccdf4f811f0d180b5e4563fefbe0908a2
evaluator/external_evaluator.py
  ae6bfc04a9795623f7abbf7c09121a6a036245084e3824f0992e462ea6f63706
evaluator/os_principal_gate.py
  1dd566b3c56f17fd7530c909e72a3b545b1a721556183f19bd6bc22d4132583b
src/harness/component-registry.ts
  dcdd488fbf8548dfa877dbc7dffc834e0f85fe39fa15d207cfc99497a0e42259
src/evolution/external-evaluator.ts
  db346f3cd3fd330e74952e8f4c4c2f940e7310f823612f8265526da8a86f9bdb
src/evolution/worktree-isolation.ts
  dc0ddb039963a08716387638ee4dacdfb6f88ebb9ef1699eab4de4ea28ccacaf
test/os-principal-boundary.test.ts
  fd605848cac7932b7a7829257d04a737111a227315dda9a978722f374f836753
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
