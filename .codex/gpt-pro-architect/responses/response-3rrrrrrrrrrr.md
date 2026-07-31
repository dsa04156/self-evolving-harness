DECISION: REVISE

AT_MOST_ONCE_DELIVERY:
The frozen delivery rule is coherent:

at_most_once_abort_on_uncertain_delivery

A durable reservation consumes the capability. Recovery from release_reserved without materialization_started destroys the private material, records reservation_abandoned, and never attempts plaintext delivery. This closes the original uncertain-delivery gap.

The four fresh-request tests also establish that changing request ID, sequence, nonce, hash, and signature does not create a second reservation or materialization after normal completion, response loss, restart, or cleanup.

An exact retry returning its original reservation disposition is acceptable only as an idempotent record of reservation, not as evidence that plaintext was delivered. The terminal cleanup reason remains authoritative for actual delivery disposition.

CLEANUP_AND_CRASH_RECOVERY:
The two-phase cleanup model is materially improved:

cleanup_started
→ private-file deletion
→ cleaned

The five actual SIGKILL cases close the previously requested reservation, prewrite, deletion, terminal-append, and acknowledgement-loss windows. Each produces one terminal history, no duplicate materialization, no evaluator receipt, and no residual key, envelope, or plaintext file.

One crash window created by the new denial states remains unsupported:

deny_release
→ crash before cleanup_started

and:

deny_materialization
→ crash before cleanup_started

The packet shows the uninterrupted denial paths reaching cleanup, but it does not define or test restart recovery when the durable denial exists and cleanup has not begun. In the second case, the private key and envelope may still exist after a cryptographic rejection. Two-phase cleanup helps only after cleanup_started has been committed. Apparently even cleanup needs an opening ceremony.

FRESH_CAPABILITY_REUSE:
The consumed-capability authorization decision is correct, but its audit treatment directly contradicts a preserved accepted boundary.

The packet states that a fresh correctly signed request with a new request ID, sequence, and nonce returns:

REPLAY_DETECTED

while:

transitionCountBefore = transitionCountAfter

The review boundary says the accepted identifier-commitment access-record contract remains in force. Under that contract, a first-seen, structurally valid denied request must produce a durable vault-signed decision record. This fresh request is not an exact replay of an already recorded request. It is a new authenticated denial event.

Retaining the evaluator-signed request in the test evidence is not equivalent to appending a vault-authoritative denial. Without such a record, repeated post-consumption probes can be rejected operationally but absent from the authoritative custody history.

The correct invariant is:

no second reservation
no second materialization
exactly one state-preserving denial for each first-seen fresh request

An exact retry of that denied request may then return the original denial without appending another record.

LIVE_CRYPTOGRAPHIC_AND_BINDING_ATTACKS:
The twenty-one live cases satisfy the requested encrypted-object and authorization-substitution coverage.

They include:

ciphertext, authentication-tag, and nonce mutation;

descriptor/envelope swapping;

every listed AAD-bound identity class;

cross-custody capability substitution;

admitted-state substitution;

authorship substitution;

task-handle substitution; and

unlock-capability substitution.

The capability/request cases are especially meaningful because both substituted objects are correctly rehashed and signed by the frozen vault and evaluator identities before the complete binding verifier rejects them.

Every case produces no evaluator plaintext mount, no evaluator receipt, one stable denial path, terminal cleanup, and no residual private files. Rejection at the earliest valid layer, whether schema, hash, authorization, or GCM authentication, is acceptable. The security property is fail-closed materialization, not a ceremonial requirement that every malformed object reach the AES primitive before being rejected.

OS_MATERIALIZATION_BOUNDARY:
The previously accepted eight-principal boundary is preserved.

Only the vault receives custody keys, encrypted envelopes, the custody journal, and writable materialization storage. The evaluator receives a single read-only plaintext projection and no decryption key, envelope, journal access, or reusable authority.

The seven non-vault principals are denied reads and writes to the protected objects while those objects exist. The evaluator independently verifies that writable access to its projection fails.

This remains local evidence under the declared RootlessKit, bubblewrap, kernel, bootstrap, filesystem, clock, crypto-library, and key-custody TCB. It is not a production confidentiality or containment result.

LEAKAGE_AND_DOWNSTREAM_RELEASE:
The finite leakage evidence is appropriately bounded.

The thirty-two signed scans report zero plaintext and key matches across the declared repository, retained state, logs, standard streams, and visible process arguments, plus no residual key, envelope, or plaintext files.

The scorer and promoter continue to receive commitments only. The packet correctly disclaims hostile-host inspection, arbitrary encoding, unmounted sinks, storage forensics, physical sanitization, kernel compromise, and compromised trusted workers.

No broader confidentiality claim follows from these scans.

EVIDENCE_AND_AUDIT:
The evidence graph is strong for the paths represented:

32 descriptors
169 signed custody transitions
185 signed role receipts
32 leakage scans
scorer projection
promoter projection
final audit

The independent verifier checks nested signatures, request and capability bindings, transition continuity, crash histories, replay counts, adversarial denials, cleanup results, projection lineage, and exact final-audit set equality. The nine rehashed nested-tamper cases demonstrate that recomputing the outer evidence hash cannot repair invalid inner authority.

The evidence and audit remain incomplete for:

first-seen fresh consumed-capability denial records; and

restart after a durable deny_release or deny_materialization but before cleanup_started.

VALIDATION:
The reported validation is sufficient for the implemented paths:

tests:                         135/135 pass
coverage suite:                135/135 pass
build:                         pass
static checks:                 pass
Python compilation:            pass
independent verifier:          pass
nested-tamper cases:            9/9 rejected
provider/model calls:          zero
remote push:                   none

No accepted principal, authorship, contamination, vault-admission, or historical-publication boundary is contradicted.

CLAIM_DISCIPLINE:
Claim discipline is satisfactory.

The packet does not treat inert bytes as benchmark data, at-most-once delivery as exactly-once delivery, file deletion as physical sanitization, finite scans as general confidentiality proof, or local synthetic custody as research, provider, performance, evolution, or self-improvement evidence.

The public plaintext commitment remains acceptable for this fixed inert development payload. It is not approved here as a future commitment design for real low-entropy task bodies.

BLOCKING_FINDINGS:

A fresh, correctly signed request reusing a consumed capability is rejected without a durable vault-signed denial record. This violates the preserved rule that every first-seen structurally valid allowed or denied request enters the append-only authority history.

Recovery is not defined or tested for a crash after durable deny_release but before cleanup_started.

Recovery is not defined or tested for a crash after durable deny_materialization but before cleanup_started. This path can leave vault-private material present after the cryptographic denial.

MINIMUM_ORDERED_CORRECTIONS:

Add a state-preserving custody denial action for first-seen fresh capability reuse, such as:

deny_release(reason=consumed_capability_reuse)

It must bind the request commitment, consumed capability, current custody state, actor identity, prior journal head, and stable reason. It must append no reservation or materialization successor.

Require an exact retry of that denied request to return the committed denial without a second append. A different fresh request may create its own state-preserving denial, preserving an auditable probe history without changing custody state.

Define deterministic recovery when the latest durable decision is deny_release and no cleanup_started exists:

deny_release
→ cleanup_started(reason=<frozen denial reason>)
→ cleaned

Define the equivalent recovery from:

deny_materialization
→ cleanup_started(reason=cryptographic_rejection)
→ cleaned

The recovery process must not retry decryption or expose plaintext.

Add actual SIGKILL injection:

immediately after durable deny_release, before cleanup start; and

immediately after durable deny_materialization, before cleanup start.

Each restart must produce exactly one cleanup start, exactly one terminal cleanup, no evaluator mount or receipt, and no residual key, envelope, or plaintext file.

Extend the independent verifier and final audit to bind:

the fresh-request denial transitions;

their exact-retry dispositions;

both denial-to-cleanup crash recoveries; and

unchanged reservation and materialization counts.

Re-run the complete deterministic suite, build, static checks, independent verifier, nested-tamper tests, leakage scans, clean-worktree checks, and remote non-publication check from one clean local commit.

AUTHORIZED_NEXT_SCOPE:
Only the corrections above are authorized.

The project may modify the custody denial and recovery transitions, schemas, fresh-request replay handling, denial-to-cleanup crash tests, evidence verifier, final-audit bindings, and directly related documentation.

The accepted at-most-once reservation recovery, live ciphertext/AAD/capability substitution tests, eight-principal materialization boundary, downstream commitment projections, and historical-publication controls are not reopened unless the correction directly changes them.

No Git push, API credential request, provider call, real task body, verifier logic, label, expected answer, benchmark path, D_gate, final, temporal, withheld-public, multi-cause, or Terminal-Bench material, research scheduler, B0–B6 execution, pilot, attribution experiment, candidate selection, qualification, promotion, canary, deployment, production-pointer modification, performance claim, confidentiality claim, generalization claim, containment claim, security certification, evolution claim, self-improvement claim, release, or publication action is authorized.
