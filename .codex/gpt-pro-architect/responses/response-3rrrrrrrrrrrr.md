DECISION: APPROVE

AUTHORITATIVE_DENIAL_HISTORY:
The first-seen consumed-capability denial now satisfies the preserved authoritative access-history contract.

Each new, correctly signed request that reuses an already consumed capability appends exactly one vault-signed, state-preserving deny_release transition. That transition binds:

complete request commitment
canonical frozen evaluator identity
consumed capability commitment
current custody state
prior transition and journal heads
REPLAY_DETECTED
consumed_capability_reuse
vault identity and signature

It creates no release ID, reservation successor, or materialization successor. The custody state remains unchanged.

An exact retry of that same signed request returns the previously committed denial without appending another transition. A different fresh request has a different complete request commitment and receives its own one-time denial record. The resulting invariant is correct:

one denial per first-seen fresh request
zero additional transitions for its exact retry
one reservation total
at most one materialization total

The new requestActor field does not recreate the earlier denial-log identifier channel on the evidence presented. It is constrained to the canonical frozen evaluator identity after authentication rather than copying an attacker-selected principal string. Request IDs, sequences, and nonces remain bound through the request commitment.

DENIAL_TO_CLEANUP_RECOVERY:
Both previously undefined denial-to-cleanup paths are now deterministic and crash-recoverable.

For release rejection:

deny_release(release_request_rejection)
→ cleanup_started(capability_rejection)
→ cleaned

For authenticated decryption rejection:

deny_materialization(cryptographic_rejection)
→ cleanup_started(cryptographic_rejection)
→ cleaned

The actual SIGKILL evidence closes the missing window between durable denial and cleanup start. In both cases, a new vault process reconstructs the denial from the authoritative journal, begins cleanup once, deletes private material idempotently, and appends one terminal cleanup.

The reported counts remain invariant across recovery:

deny_release crash:
reservations       0 → 0
materializations   0 → 0

deny_materialization crash:
reservations       1 → 1
materializations   1 → 1

Neither recovery path retries decryption, mounts plaintext into the evaluator, creates an evaluator receipt, or duplicates a reservation or materialization. Both terminate without a key, encrypted envelope, or plaintext file.

The complete seven-case crash matrix now covers reservation abandonment, both denial boundaries, prewrite abandonment, interrupted deletion, post-deletion cleanup recovery, and acknowledgement loss.

EVIDENCE_AND_AUDIT:
The independent evidence reconstruction is sufficient for the correction.

The verifier checks each fresh request’s schema, hash, evaluator signature, nested capability, request actor, denial reason, prior journal linkage, unchanged task state, and transition-count delta. It separately confirms that an exact retry references the same denial and appends nothing.

For both new crash cases it verifies:

one durable denial
one cleanup_started
one cleaned
unchanged reservation/materialization counts
no evaluator materialization
no evaluator receipt
no residual private file

The final audit binds the complete set of 183 custody transitions and 196 pre-finalization role receipts. Excluding the finalizer’s own receipt from the set it signs avoids circular self-inclusion and is coherent.

The fourteen nested-tamper cases cover the new denial lineage, exact-retry disposition and accounting, and both recovery count invariants. Recomputing the outer evidence hash does not repair an invalid nested signature, transition, receipt, or set relation.

VALIDATION:
The correction is supported by one clean local commit and the reported validation:

deterministic tests:             135/135 pass
coverage tests:                  135/135 pass
build:                           pass
static/type checks:              pass
Python compilation:              pass
independent evidence verifier:   pass
nested tamper cases:              14/14 rejected
signed leakage scans:             34, all declared counts zero
provider/model calls:             zero
remote push:                      none

The implementation and evidence identities are pinned, the worktree is reported clean, and origin/main remains unchanged.

The accepted live cryptographic attacks, eight-principal OS boundary, at-most-once delivery rule, two-phase cleanup, authorship boundary, contamination policy, and commitment-only scorer/promoter projections are not contradicted.

CLAIM_DISCIPLINE:
The packet maintains the required limits.

Approval establishes only that the synthetic custody implementation now has:

an authoritative denial for every first-seen consumed-capability probe;

idempotent exact-denial retry;

deterministic recovery from both durable denial states;

no duplicate reservation or materialization; and

independently verifiable cleanup and audit evidence.

It does not establish confidentiality for real benchmark data, physical-media sanitization, hostile-host resistance, distributed exactly-once delivery, provider interoperability, benchmark validity, performance, generalization, evolution, or self-improvement.

The fixed inert payload and finite leakage scans remain development tests under the stated host, filesystem, crypto-library, bootstrap, and key-custody TCB.

BLOCKING_FINDINGS:
None for the narrow durable-denial and denial-to-cleanup correction.

AUTHORIZED_NEXT_SCOPE:
No further synthetic-custody implementation is required at this gate.

The next authorized scope is limited to a local trust-plane closure and readiness consolidation:

Create one protocol-author-signed local conformance manifest that references, without copying or rewriting, the accepted source commits, evidence hashes, Architect rulings, and claim boundaries for:

standalone runtime and Gate 2R trust enforcement;

development process separation;

publication and historical-exposure governance;

independent authorship and evaluator-vault admission;

durable globally serialized vault state;

eight-principal vault OS integration; and

synthetic one-time custody and recovery.

Implement an independent aggregate verifier that checks:

every referenced source, tree, evidence, ruling, and contract hash;

append-only governance relationships;

public-development and non-research eligibility;

provider, promotion, deployment, research-evidence, and claim authority remaining false;

no contradictory protocol or component identities across the accepted packets; and

explicit distinction between implemented controls, locally tested controls, deferred controls, and unclaimed properties.

Produce an outstanding-obligations matrix that leaves at least these items visibly unresolved:

no real-provider receipt;

no real benchmark-body custody or evaluator-vault use;

no research protocol or numeric pilot freeze;

no B0–B6 research execution;

no held-out or confirmatory attribution evidence;

no research candidate selection or promotion; and

no performance, generalization, security-certification, evolution, or self-improvement result.

Update local architecture, reproducibility, security, limitation, and negative-result documentation only as needed to reflect the accepted evidence and unresolved obligations.

Prepare a narrow integrated runtime-and-trust closure packet. It may summarize existing evidence and verifier results but may not generate another attribution score, mutation candidate, runtime comparison, custody payload, or benchmark artifact.

No Git push, API credential request, provider call, real task body, verifier logic, label, expected answer, benchmark path, D_gate, final, temporal, withheld-public, multi-cause, Terminal-Bench material, research scheduler, B0–B6 execution, pilot, attribution experiment, candidate selection, qualification, promotion, canary, deployment, production-pointer modification, performance claim, confidentiality claim, generalization claim, containment claim, security certification, evolution claim, self-improvement claim, release, or publication action is authorized.
