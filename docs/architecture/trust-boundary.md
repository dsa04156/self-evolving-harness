# Immutable Trust Plane

Status: Gate 1RRR and Gate 2R externally approved; Round 03RRR development-only process hardening
implemented and awaiting its narrow follow-up review

## Security objective

A candidate may affect task-solving behavior only through protocol-authorized declarative component
payloads. It cannot change the identities, authority, data, evidence, compute, evaluator, or decision
rules by which it is judged.

“Immutable” means protocol-scoped digest pinning and denied write authority, not physically immutable
storage. Hash chains and signatures are called tamper-evident under stated key/host assumptions, never
tamper-proof.

## Protocol-scoped immutability

The `ProtocolManifest` pins:

- schemas, canonicalization, payload contracts, and component type registry;
- runtime contract/kernel, evaluator/verifier, tool implementations, middleware, and optimizer;
- benchmark material, split, fixture specification, and data-access policy;
- permission, safety, network, budget, model, trace, audit, and promotion policies;
- principal/capability matrix, public keys, and authenticated wire protocol;
- environment image, toolchain, baseline matrix, gate-feedback policy, method-arm manifest set,
  candidate-selection rule, gate-report template set, analysis program, and statistical plan.

Changing any pinned byte produces a new protocol ID. A superseding protocol may rerun exploratory work,
but its records cannot be combined with prior confirmatory evidence.

## Machine-enforced separation

The complete principal table is in `principal-capability-matrix.md`. The minimum boundary is:

- proposer has redacted mine evidence and a candidate staging directory, but no evaluator, gate/test
  mount, deployment registry, provider key, or trusted record key;
- evaluator has fixed verifier/code, exact parent/candidate snapshots, and an opaque authorized task
  vault, but no candidate write, proposer channel, promotion authority, or protocol write;
- promoter has signed aggregate results and immutable policy, but no model/provider capability, task
  content, candidate write, or direct filesystem registry write;
- provider proxy alone has the provider API key and meters every model role against host-side ledgers;
- deployment registry alone applies whole-harness CAS requests;
- audit store alone assigns audit sequence and appends chain records;
- protocol author alone signs a new immutable protocol/type registry/split freeze.

All messages are schema-validated, hash-bound, correlated, deadline-limited, peer-credential checked, and
signed. Mounts, secrets, network, CPU/memory/process/time/output, tool calls, model calls/tokens/cost, and
feedback releases are principal scoped and host enforced.

The Gate 2R path assigns operations, runtime, evaluator, promoter, and audit to distinct subordinate
UID/GID pairs inside a rootless user namespace. Each process then receives its own PID, mount, IPC, UTS,
best-effort cgroup, and no-network sandbox, zero effective capabilities, `NoNewPrivs`, a role-owned mode-0600 key,
and only role-specific read-only code/config mounts. Normal audit/evaluator sockets are mode 0660 and
group-scoped to operations; both endpoints also verify `SO_PEERCRED` before parsing a frame. The local
same-UID transport suite remains explicitly labelled emulation.

## Development evolution process boundary

Round 03RRR authorized a narrower development-only hardening exercise. It is deliberately separate
from the research protocol, candidate qualification, promotion, and deployment paths. The exercised
roles are eight distinct subordinate UID/GID principals:

| Role | Namespace UID | Authority | Deliberately absent |
|---|---:|---|---|
| attributor | 1201 | read the committed label-blind corpus and emit predictions | oracle, score, candidate evaluation, promotion, network |
| prediction committer | 1202 | sign the complete prediction commitment and durable seal | oracle, score, mutation, promotion, network |
| scorer | 1203 | read the visible-fixture oracle only after seal release and emit a diagnostic score | proposer output directory, mutation, promotion, network |
| mutation proposer | 1204 | consume sealed predictions and create one bounded development proposal | oracle, scorer output, research manifest, promotion, network |
| candidate quarantine | 1205 | register the exact candidate and its aliases as non-promotable | oracle, proposer key, runtime authority, promotion, network |
| runtime | 1206 | execute synthetic parent and candidate through the standalone agent loop | oracle, scorer output, evaluator key, promotion, network |
| candidate evaluator | 1207 | derive a synthetic development result from runtime artifacts | oracle, proposer output, runtime write authority, promotion, network |
| audit | 1208 | verify receipts, taint closure, role probes, and claim boundary | oracle, mutation authority, deployment authority, network |

Each role has a distinct Ed25519 key owned by its UID. RootlessKit and bubblewrap create separate PID,
mount, IPC, UTS, and no-network environments with zero effective capabilities and `NoNewPrivs`.
Role probes demonstrate that forbidden key/file reads and writes fail. This is a local Linux boundary
under the trusted-host assumption, not a defense against host root or kernel compromise.

The scorer socket does not exist before release. The committer writes the prediction seal with
exclusive creation, synchronizes the file, then synchronizes its directory. Only an audit-verified seal
can authorize socket creation. The scorer additionally requires the expected peer UID through
`SO_PEERCRED`, a valid role key, a fresh nonce, and exact corpus, prototype, prediction, commitment, and
seal bindings. Wrong peer, wrong key, commitment substitution, prediction substitution, corpus
substitution, seal substitution, and replay are rejected before a score is released.

The proposer never receives the oracle or score report. The development candidate is materialized into
a separate read-only registry view, recursively tainted across exact hashes, copied content, aliases,
wrappers, indirect references, and alternate lifecycle names, and registered as permanently
non-promotable. Runtime and evaluator principals are distinct. The evaluator consumes actual
standalone-runtime artifacts produced with a deterministic fake provider and immutable tools; it does
not receive precomputed pass/fail pairs.

The complete evidence bundle is
`architect/evidence/development-process-boundary/os-boundary.json`. Its external verifier checks the
schema, signatures, role probes, seal chronology and durability, candidate registry and closure,
mutation, runtime execution, evaluation, taint graph, receipts, and claim boundary. The recorded
synthetic counts are transport/runtime diagnostics only: they are not research metrics, a promotion
signal, or evidence of self-improvement.

## Manifest and state boundaries

- component/harness identity contains immutable composition only;
- provenance, qualification, evaluation, deployment decisions, and channel pointers are external signed
  records;
- qualification ends at `approved`; protocol v1 deployment exists only as the one `production` channel
  pointer;
- runtime sessions additionally pin an exact runtime-state snapshot;
- descendants inherit harness, protocol, snapshot, model, split permission, principal delegation, and
  budget account and cannot rebind;
- Git and SQLite are non-authoritative conveniences.

## Evaluator transaction

1. Trust supervisor verifies protocol, parent/candidate manifests, state snapshot, phase budget, and
   task-handle authorization.
2. The evaluator launch path rejects dirty, ignored, linked, special, or uncommitted objects. It materializes
   committed Git blobs into a new read-only tree and records a canonical descriptor containing every
   path, mode, Git object ID, size, content hash, commit, tree hash, and complete snapshot hash.
3. It starts a fresh evaluator container under the evaluator identity and mounts that candidate tree
   read-only, without the source worktree or Git metadata.
4. Before accepting a request, the evaluator independently verifies the descriptor hash, exact
   directory/file set, blob IDs, bytes, modes, link counts, and the request/result snapshot pin.
5. The evaluator resolves the opaque task inside its private vault and launches paired runtime sandboxes.
6. Provider and tool use flows through metered brokers; neither candidate can modify starting state.
7. The fixed verifier produces a signed outcome.
8. Evaluator emits a bounded `EvaluationResult` and artifact hashes over the authenticated socket.
9. Supervisor independently checks auth, schema, hashes, usage completeness, split/phase permission,
   environment attestation, and audit continuity.

The operations side persists evaluator transactions at
`started → proposed → audit_linked → result_created → signature_verified → result_appended
→ accounting_sealed → completed`. Recovery recreates a proposal from the immutable request, requires
the same core/result hashes, reuses the idempotent remote-audit link, and emits exactly one final result.
Pending parent/candidate references remain retirement holds until completion or recorded failure.

Missing or conflicting evidence makes the run invalid, not a task failure and never a pass.

## Dataset boundary

- Mine details may reach the proposer under the frozen evidence policy.
- Gate details and aggregate selection evidence remain evaluator/promoter/audit-only until all
  confirmatory final work is irrevocably complete. Protocol v1 consumes the gate capability once.
- Any later human gate release makes that split exploratory for subsequent work and requires a fresh gate
  for another confirmatory protocol.
- Sealed HarnessFaultBench tests, temporal holdout, and withheld public Terminal-Bench test do not
  participate in proposal, selection, promotion, threshold tuning, rollback policy, or post hoc repair.
- Public Terminal-Bench is described as withheld during the experiment, not unknowable to model
  pretraining.

The metric/split and temporal authorship contracts are separate evaluation artifacts.

## Trust assumptions and residual limits

The Linux host/kernel/container runtime and bootstrapping administrator are trusted for isolation. A
fully compromised host is outside the containment claim. Provider telemetry/model identity, audit-store
availability, and benchmark-author blinding have explicit residual risks documented in
`tcb-and-authenticated-protocol.md` and `threat-model.md`.

The declared distinct-UID/mount/network/key and authenticated-socket Gate 2R tests pass. This is
evidence for the listed local attack cases under the stated Linux host assumptions, not a general
security, tamper-proof, or production-containment claim.

## Fail-closed rules

The operation is invalid if any protocol ID, manifest/closure/artifact hash, signature, peer identity,
schema, sequence/nonce, dataset capability, runtime-state snapshot, environment attestation, budget
ledger, evaluator result, qualification decision, deployment decision, action-required rollback target,
termination transaction/receipt, or audit link is missing or mismatched.
Defaults are not inferred and candidate-produced inference cannot satisfy a deterministic or promotion
gate.
