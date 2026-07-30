# Validator and Adversarial Acceptance Criteria

Status: Gate 1RRR correction candidate; Gate 2 tests are specified but not implemented or executed

JSON Schema is necessary but insufficient. Gate 2 requires deterministic cross-object validators,
authenticated-process tests, and OS-boundary adversarial evidence.

## Validator pipeline

The trusted validator performs these stages in order and emits one signed receipt:

1. byte/UTF-8/JSON/I-JSON/JCS and payload-size validation;
2. JSON Schema validation against the protocol-pinned schema set;
3. claimed artifact, component, harness, registry, protocol, snapshot, and record hash recomputation;
4. canonical order, unique stable IDs/slots, DAG/cycle, reference type, and full closure validation;
5. authoritative type-registry lookup and mutable/conditional/immutable authorization;
6. mutable payload grammar, forbidden construct, finite graph, declared-ID, and capability derivation;
7. parent/candidate closure comparison, transitive component count, size vector, and immutable diff;
8. protocol/split/phase/principal/message/record-authority validation;
9. qualification, lineage, production-channel deployment CAS, rollback, retirement, session inheritance,
   and abnormal termination validation;
10. evidence sequence/hash/signature, epistemic class, source linkage, redaction, and budget completeness;
11. metric/split, gate-feedback, candidate-cost, and promotion-decision policy validation.

Failure at any stage prevents later state transitions. The validator never repairs candidate input,
chooses defaults, canonicalizes silently, or converts an inference into a trusted fact.

## Cross-field invariants not delegated to JSON Schema

- object ID prefix digest equals SHA-256 of the exact canonical identity object;
- `manifestHash` carries the same digest as its prefixed ID;
- type entry and registry hash resolve to the protocol's sole registry;
- component ref stable ID/version/type entry/hash match the resolved manifest;
- dependency/root lists are canonically ordered, unique, acyclic, and fully materialized;
- declared closure hash/count/bytes and capability digest equal recomputation;
- every transitively changed family appears in `MutationProposal.targetChanges`;
- `changedComponentCount == len(targetChanges)` and obeys single/multi-cause limit;
- mutation size metrics equal deterministic diff over expanded parent/candidate closures;
- candidate adds no capability and changes no immutable/disabled type;
- runtime state and child delegation pins equal the parent session;
- event/receipt/audit sequences have no gap, fork, duplicate, cross-session, or cross-protocol link;
- producer role/key is authorized for the event/record type;
- qualification transition follows the table and has no `active`/`rolled_back` state;
- approval inputs reference exact candidate/protocol/snapshot and only mine/gate/deterministic roles;
- deployment CAS expected generation/prior hash/target/rollback tuples equal the complete production
  pointer and every non-null tuple is one approved whole harness;
- the applied pointer record equals its signed decision in protocol, channel, action, complete
  `expectedBefore`, generation, target tuple, and rollback-target tuple;
- initialize produces an approved target with null rollback target; rollback is rejected while that
  target is null;
- deploy sets `new.rollbackTarget = prior.target`; rollback enforces the exact two-way target swap;
- replacing/rolling back a pointer leaves both manifests approved and retained;
- retirement fails while any production, rollback, live-session/descendant, pending-transaction, or
  deployment-eligibility hold exists;
- every abnormal session reaches `terminated` only after revocation, job/process reap, and sealed
  accounting/evidence, under a byte-identical termination descriptor that directly references its
  initiating record;
- termination reason/origin/principal drift, missing initiator, duplicate final, and conflicting final
  records are rejected;
- one-shot gate unlock, recipient, release-time, evidence/feedback distinction, and fresh-gate rules obey
  the frozen policy;
- provider/tool/feedback/phase totals equal event-level ledger sums, including failures/cancellations;
- candidate cost formula and high-cost exception are reproduced exactly;
- final roles never appear in candidate, promotion, tuning, or rollback-policy records.

## Deterministic test suites

### Canonicalization and storage

- JSON key order equivalence; duplicate-key/invalid-number rejection;
- BOM, invalid UTF-8, non-NFC, CRLF/lone-CR normalization mismatch, NUL/control rejection;
- set-order rejection and behavior-order preservation;
- path traversal, absolute/backslash/case-fold/NFC collision, symlink, hardlink, device, FIFO, socket,
  sparse file, ADS, archive/compression/base64/data-URL rejection;
- artifact size/hash mismatch, descriptor substitution, and post-materialization rehash.

### Manifest and mutation

- appending provenance/evaluation/lifecycle/decision/deployment records does not change manifest IDs;
- candidate-supplied type/mutability/provenance is rejected;
- registry swap and payload-contract hash mismatch are rejected;
- import, code, hook, tool registration, middleware, download, external include, encoded expansion,
  expression/regex, dynamic state, and unbounded workflow payloads are rejected;
- one reference replacing multiple dependencies counts every transitive family and full size vector;
- immutable, conditionally-disabled, executable, capability-expanding, >8 KiB, undeclared-artifact, and
  rejected-equivalent proposals fail before `statically_validated`;
- B6-ABL accepts null attribution only under its method/protocol arm; guided B6 requires a mine
  `AttributionResult`.

### Session/runtime state

- context, memory, tool, verification, retry, block, recovery, wait/job, completion, and retirement
  transitions;
- same fake provider/tool/seed/snapshot yields byte-identical event-chain hash;
- memory/workspace/checkpoint/cache/environment difference changes snapshot ID;
- child/job harness/protocol/model/split/principal/budget/snapshot rebind is rejected;
- production-pointer change during a session does not change parent/descendant harness;
- crash recovery succeeds only from a matching signed checkpoint and exact overlays.

### Lifecycle, promotion, and rollback

- every legal and illegal session/qualification transition;
- every abnormal reason from all nonterminal session states, crash during termination, complete
  descendant/capability revocation, process/job reap, sealed accounting, and resume rejection;
- initiating/final transaction-descriptor equality, direct initiating-record reference, immutable
  original state/principal/reason, authorized completion-only additions, and duplicate-final rejection;
- missing/skipped/duplicated/out-of-order/cross-protocol lifecycle records;
- mixed component deployment and per-component pointer rejection;
- stale/concurrent generation/prior-pointer/parent CAS rejection;
- approval does not change the production pointer; failed static/evaluation/gate/canary cannot approve;
- deploy/rollback/decommission use separate decisions and exact production CAS expectations;
- null-anchor rollback-before-first-deploy rejection;
- deploy copies the exact prior target tuple into rollback target;
- rollback swaps exact target/rollback tuples, repeated rollback toggles deterministically, and
  deletion/substitution/hash/qualification mismatch is rejected;
- rejected, invalid, exhausted, and deployment-rollback-involved candidate retention.

### Evidence and accounting

- forged producer/key/role/receipt/result/decision; modified payload/event/artifact hash;
- missing/reordered/forked sequence and modified trace detection;
- inference attempting to satisfy completion/promotion rejection;
- seeded secret redaction across events, errors, artifacts, logs, provider requests, and subprocess env;
- drill-down from aggregate pattern/proposal/evaluation to source receipt/event/artifact;
- completed, failed, cancelled, timed-out, cached, reasoning, retry, judge, subagent, and background
  provider accounting;
- tool denial/failure/timeout and gate release accounting;
- budget exhaustion in every phase and forbidden cross-phase/task/seed/method borrowing.

### Benchmark and statistics

- split counts/disjointness and exact Terminal-Bench public source commitment;
- all HFB single/multi-cause causal interventions, difficulty/type balance, scorer ties/unknown IDs;
- multi-cause/final result supplied to promoter is rejected;
- second gate unlock/query, replacement candidate, proposer access, and pre-final
  developer/protocol-author access rejected;
- post-final human release marks the gate exploratory and forces a fresh gate for later confirmatory work;
- task-clustered bootstrap golden vectors and no task×seed sample-size inflation;
- Holm comparison and candidate-cost formula golden vectors;
- cross-protocol pooling rejected.

## Authenticated-wire adversarial suite

Actual dedicated sockets and principal identities must reject:

- wrong UID, key, role, recipient, message type, protocol, payload schema, hash, artifact, or capability;
- reused message ID/sequence/nonce, expired request, correlation confusion, replay with changed payload;
- partial, empty, extra, concatenated, oversized, invalid UTF-8/JSON, and trailing-byte frames;
- peer exit before frame/result, timeout, stdout log injection, and concurrent response reordering;
- evaluator/promoter/provider/audit key use by runtime/proposer;
- artifact time-of-check/time-of-use substitution.

No successful result may be synthesized after an invalid frame or peer crash.

## OS-boundary adversarial suite

Gate 2 security evidence must use the conformant distinct UID/container mode, not
`isolation_emulated`:

- proposer probes all gate/final/verifier/audit/deployment/provider-key paths and receives no mount;
- evaluator attempts candidate/registry/policy writes;
- runtime/tool attempts workspace escape, host read/write, symlink race, special file, process survival,
  ptrace, privilege/capability gain, network/DNS/Unix-socket escape, and fork/resource exhaustion;
- child/job attempts a wider delegation, new budget, provider, harness, split, or unbounded descendant;
- promoter attempts provider/model call and direct registry filesystem write;
- provider proxy attempts non-allowlisted egress;
- all stores are scanned for seeded secrets after each attack.

If the host cannot provide the required isolation primitives, Gate 2 is `REVISE`; process emulation cannot
be substituted as passing evidence.

## Gate 2 pass rule

- 100% of deterministic contract/fake-provider/fake-tool tests pass; no skip, xfail, flaky retry, or
  test-order dependency;
- repeated identical runs have identical canonical event/result hashes;
- every adversarial case produces its exact frozen denial/error code and audit receipt;
- zero unauthorized read/write/network/secret/record/promotion/activation succeeds;
- crash recovery leaves no orphan process and no partial authoritative record;
- failed or merely approved candidate never changes the production deployment;
- rollback exactly restores baseline closure;
- schema, environment, toolchain, executable, protocol, and test-corpus hashes accompany the report;
- independent audit replay reconstructs the same final projections and head hashes.

Any immutable-boundary, data leakage, evaluator impersonation, protocol-mixing, accounting omission, or
non-atomic activation failure is a hard failure, regardless of overall coverage or task performance.
