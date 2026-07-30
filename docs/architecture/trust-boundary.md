# Immutable Trust Plane

Status: Gate 1RR design contract

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
2. It starts a fresh evaluator container under the evaluator identity and read-only mounts.
3. The evaluator resolves the opaque task inside its private vault and launches paired runtime sandboxes.
4. Provider and tool use flows through metered brokers; neither candidate can modify starting state.
5. The fixed verifier produces a signed outcome.
6. Evaluator emits a bounded `EvaluationResult` and artifact hashes over the authenticated socket.
7. Supervisor independently checks auth, schema, hashes, usage completeness, split/phase permission,
   environment attestation, and audit continuity.

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

Until distinct UID/container/mount/network/secret adversarial tests pass at Gate 2, only architectural
feasibility is claimed.

## Fail-closed rules

The operation is invalid if any protocol ID, manifest/closure/artifact hash, signature, peer identity,
schema, sequence/nonce, dataset capability, runtime-state snapshot, environment attestation, budget
ledger, evaluator result, qualification decision, deployment decision, rollback target, termination
receipt, or audit link is missing or mismatched.
Defaults are not inferred and candidate-produced inference cannot satisfy a deterministic or promotion
gate.
