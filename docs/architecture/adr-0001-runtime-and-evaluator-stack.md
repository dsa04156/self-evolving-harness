# ADR-0001: Runtime, Evaluator, and Isolation Stack

Status: **revised; pending Architect Gate 1R approval**  
Date: 2026-07-30

## Context

The system must own its model/tool loop, durable sessions, subagents/jobs, control/evidence planes, typed
component manifests, and evolution lifecycle. The evaluator must execute independently and must not be
impersonable by candidate or proposer code. Cross-boundary contracts need deterministic
canonicalization, authentication, bounded framing, and inspectable schemas.

The earlier Python package is quarantined under `spikes/python-contract-spike/`. It is non-authoritative,
not importable from the repository root, and cannot be copied into an implementation without an approved
contract mapping.

## Decision

- Runtime, CLI, component registry, operations, evidence, and evolution orchestration: strict TypeScript
  ESM on protocol-pinned Node.js 24.x.
- External evaluator, benchmark adapters, and statistical analysis: Python 3.13.x in a separately locked
  environment.
- Exact patch versions, container/base-image digests, lockfiles, build flags, canonicalizer, schema
  validator, and executable hashes: frozen before implementation evidence is accepted and pinned by the
  protocol manifest.
- Persisted contracts: JSON Schema Draft 2020-12 and RFC 8785 JCS.
- Inter-principal protocol: authenticated 4-byte length-prefixed canonical JSON frames over Unix sockets,
  following `wire-envelope.schema.json`; no unauthenticated JSON Lines or mixed stdout protocol.
- Large values: immutable content-addressed artifacts by hash/size/media type, never host paths or mutable
  URLs.
- Persistent MVP storage: append-only filesystem logs with fsync/atomic-directory-entry rules and
  content-addressed blobs. SQLite is an optional rebuildable query projection, never the audit or
  manifest authority.
- Candidate lineage: a new local Git repository, signed/recorded commit IDs, and detached worktrees.
  Git provides lineage and candidate filesystem isolation only; OS sandboxing is separate.
- Enforcement: distinct UIDs and fresh containers/namespaces, read-only mounts, seccomp/capability
  reduction, cgroup/resource limits, scoped signing keys, and deny-by-default egress.

## Security interpretation

The language split does **not** prevent evaluator impersonation. It reduces accidental module sharing and
lets the evaluator/statistics stack use appropriate tooling. Security comes from:

- distinct principal identities and OS isolation;
- peer-credential plus Ed25519 message authentication;
- schema, protocol, correlation, sequence, nonce, expiry, and payload-hash checks;
- principal-specific mounts, secrets, message types, and record authority;
- host-enforced budgets and provider-only network egress;
- immutable evaluator/policy/environment digests and fresh sandboxes;
- independent result and audit verification.

A same-UID local-process mode is useful only for deterministic development tests and is marked
`isolation_emulated`. It cannot support the security claim or pass Gate 2 isolation acceptance.

## Protocol behavior

- Maximum inline frame: 1 MiB; larger content uses artifact references.
- Every request has correlation/causation IDs, hard expiry, sender sequence, and unique nonce.
- Invalid auth, protocol/schema/hash mismatch, oversized/partial frames, replay, deadline, budget
  exhaustion, artifact failure, or peer crash fail closed with a closed error code.
- A crashed evaluator cannot emit a synthetic pass. Partial results are `incomplete` and never satisfy a
  gate.
- A retry is a new signed, budget-charged request linked to the failed request.
- Payload and artifact bytes are rehashed at both broker and recipient.

The full contract is in `tcb-and-authenticated-protocol.md`.

## Rationale

TypeScript gives the asynchronous kernel/control APIs one strict type surface. Python supports benchmark
adapters and hierarchical statistical analysis without importing runtime code. JSON Schema and a narrow
authenticated process boundary keep shared contracts language-neutral. Append logs and rebuildable
projections make recovery/audit behavior testable. Git worktrees satisfy candidate lineage requirements
without pretending that Git enforces permissions.

## Alternatives

### All Python

It reduces toolchain count but does not improve or weaken isolation by itself. Rejected because the
runtime/control implementation benefits from the selected TypeScript event model and because the
pre-contract spike must not become an accidental design constraint.

### All TypeScript

It simplifies packaging, but would move benchmark/statistics concerns into the runtime toolchain or
require reimplementation. Rejected for the MVP research split, not for security.

### Rust runtime

It offers strong local implementation primitives but increases the pre-experiment implementation scope.
Deferred.

### Existing agent SDK/runtime

Rejected because it violates the independent-kernel requirement and makes core loop/context/tool/session
behavior an opaque backend.

### JSON Lines on stdin/stdout

Rejected for the trusted boundary because log contamination, ambiguous process stdout ownership, weak
peer identity, and incomplete-frame handling add avoidable ambiguity. Length-prefixed authenticated
frames on a dedicated socket are used instead.

## Consequences

- Two locked language environments and independent parsers/validators are required.
- OS/container configuration and principal keys are implementation deliverables, not deployment notes.
- Cross-language golden vectors must produce byte-identical JCS, hashes, signatures, and errors.
- Provider models without immutable weight identity receive a lower reproducibility tier and explicit
  drift disclosure.
- Any toolchain, evaluator, policy, schema, protocol, or environment change creates a new protocol ID;
  confirmatory evidence cannot be mixed across it.

## Gate 1R acceptance question

Does this decision define an implementable independence boundary without claiming that language choice
is a security control, and are its framing, authentication, failure, artifact, and environment contracts
sufficiently frozen to permit the runtime prototype?
