DECISION: REVISE

PRINCIPAL_AND_KEY_SEPARATION:
The eight-principal model is sufficiently frozen for a body-free trust contract.

Each principal has a distinct role, instance identity, key identity, public key, mount declaration, and action authority bound into the protocol-author-signed contract. The packet correctly avoids claiming that these declarations are fresh OS-isolation evidence.

No principal-separation regression is created. Actual multi-process OS enforcement remains a later evidence obligation before real held-out bodies exist.

INDEPENDENT_AUTHORSHIP:
The independent-authorship contract is accepted.

The required chain is explicit and signed:

protocol assignment
→ author commitment
→ identity-free review projection
→ reviewer decision
→ vault-finalized transition

The vault rejects detached author commitments by requiring the exact signed assignment predecessor. The reviewer receives a handle commitment rather than the raw handle or author identity, signs a separate body-free decision, and does not control the final transition object.

Embedding the review packet and reviewer decision inside the append-only transition makes the accepted or rejected authorship result independently reconstructable. Retaining rejected submissions with reason commitments is also correct.

CONTAMINATION_BOUNDARY:
The historical-publication contamination boundary is accepted.

Every authorship record binds the approved historical-publication ledger, and the policy independently covers all ten restricted use classes. Direct content, Git object, alias, dependency, wrapper, and provenance laundering paths are rejected before admission.

Nothing in this packet restores held-out, sealed, temporal, gate, final, confirmatory, research, promotion, or claim eligibility to published development material.

VAULT_ADMISSION:
Constructor-time admission is sufficiently constrained.

The vault accepts only an exact signed included transition with its exact predecessor chain. It verifies protocol identity, authorship linkage, reviewer decision, contamination status, signature, and terminal inclusion state before registering the pair:

opaque-handle commitment
included-transition record hash

Rejected, unreviewed, invented, detached, or historically contaminated records cannot enter vault admission on the evidence presented.

CAPABILITY_AND_STATE_MACHINE:
The logical transition guards are coherent, but the implementation does not yet establish the claimed single-use and ordered-state properties across the vault’s actual lifetime.

The packet explicitly states:

private vault task-state crash recovery is not implemented
cross-process singleton lease is not implemented

Current serialization covers one in-process vault object. Replay reconstruction covers accepted request sequence and nonce commitments, but it does not reconstruct the complete private task lifecycle after a crash.

A concrete unresolved case is:

1. Vault process V1 accepts unlock for task T.
2. The durable access record is written, but V1 exits before or during private-state completion.
3. Vault process V2 opens the same ledger.
4. V2 receives a new correctly signed unlock request for T with a fresh sequence and nonce.

The packet proves that replaying the original signed request is denied. It does not prove that the fresh request in step 4 is rejected because T is already unlocked or its capability already consumed.

Likewise, two vault processes can open the same ledger concurrently because no cross-process lease or atomic expected-head mechanism is reported. Both may evaluate the same pre-transition state before either observes the other’s append. An in-process mutex is not a global state machine wearing a convincing hat.

Therefore the following claims are not yet established across restart or multiple process instances:

unlock is globally single-use;

only one valid state successor can be committed;

evaluation cannot occur twice from the same unlocked state;

scoring cannot occur twice from the same evaluation;

a release always corresponds to one durably committed transition; and

recovery cannot regress or fork task state.

ONE_WAY_RELEASE:
The release projections themselves are accepted:

unlock   → evaluator receives capability commitment
evaluate → scorer receives evaluation commitment
score    → promoter receives score commitment
audit    → audit store receives chain head

Denied attempts release no fields and preserve the recorded state.

The remaining issue is transaction ordering. The packet does not yet establish that a capability, evaluation commitment, or score commitment can be released only after the corresponding state transition is durably and uniquely committed. Crash recovery and cross-process serialization must close that gap.

No real body or raw task handle needs to be introduced to make this correction.

ACCESS_LEDGER_AND_REPLAY:
The signed access records are sufficient for the tested wrong-role, wrong-key, replay, substitution, early-access, and protocol-mismatch cases.

The change from raw attacker-controlled identifiers to commitments is acceptable for this body-free, vault/audit-only development contract. Stable reason codes, before/after states, release classes, and schema-fixed absence flags provide useful attribution without copying raw task or author identifiers into denial records.

However, the ledger is currently authoritative only for request replay reconstruction. It is not yet authoritative for complete task-state recovery. The state-machine projection must be reconstructable from durable records, including:

created
sealed
unlocked / capability consumed
evaluated
scored

A process restart must derive exactly the same task state and permitted next actions as the process that wrote the records.

VALIDATION:
The reported validation is sufficient for the portions accepted above:

build:                         pass
Node 24.18.1 non-Unix tests:  120/120 pass
isolated Unix audit test:       1/1 pass
total deterministic tests:    121/121 pass
publication verifiers:         pass
historical verifier:           pass
remote unchanged:              confirmed

The earlier host-Node failure is correctly classified as an environment mismatch and was rerun under the pinned Node version without modifying product behavior.

The missing tests are narrowly identifiable:

two vault processes contending for the same ledger;

crash at every durable state-transition boundary;

restart after unlock, evaluation, and score;

fresh-request duplication after restart;

stale or abandoned writer lease;

transition append succeeding while response release fails;

response release attempted before durable transition commit; and

conflicting successor transitions from the same prior state.

CLAIM_DISCIPLINE:
Claim discipline is satisfactory.

The packet does not claim:

real task-body custody;

fresh OS-principal enforcement;

crash-safe vault operation;

cross-process serialization;

provider execution;

evaluator-vault secrecy for actual held-out data;

performance, generalization, containment, or self-improvement.

The body-free authorship, contamination, admission, release-shape, and access-ledger work may remain as development trust-contract evidence. It is not Gate 3 completion or authorization to instantiate research data.

BLOCKING_FINDINGS:

Vault task state is not durably reconstructable. Request nonces and sequences survive re-instantiation, but the packet reports no recovery of complete per-task lifecycle state. A fresh signed request after restart may therefore bypass a transition that was accepted before the crash.

There is no cross-process single-writer mechanism. In-process serialization does not prevent two vault processes from acting on the same prior ledger head and accepting conflicting or duplicate lifecycle transitions.

Release-after-commit ordering is not established across crashes. The contract does not yet prove that capability, evaluation, and score releases occur only after one unique state transition has been durably appended and synchronized.

These are one underlying trust-contract defect: the vault lacks a durable, globally serialized task-state authority.

AUTHORIZED_NEXT_SCOPE:
Only a local, deterministic, body-free correction of the durable vault-state boundary is authorized.

Define one authoritative durable projection for each admitted task. It may be reconstructed from the access ledger or use a separate append-only task-state journal, but the contract must select exactly one source of truth.

Bind every state transition to:

protocol ID
contract ID
opaque-handle commitment
authorship-transition hash
prior task-state record hash
prior vault ledger head
action
actor principal/key
capability commitment where applicable
result commitment where applicable
new state

Enforce an atomic expected-prior-state rule. Two transitions from the same prior task-state record or ledger head must not both become valid.

Add a cross-process single-writer mechanism, such as an exclusive durable lease or an atomic append/CAS protocol. The contract must define:

lease owner identity and epoch;

acquisition and renewal;

expiry or abandoned-owner recovery;

stale-writer rejection;

interaction with process restart; and

fail-closed behavior when exclusivity cannot be established.

Require transition durability before release:

validate request
→ compute successor
→ append successor exclusively
→ fsync record
→ fsync containing directory or durable store
→ verify committed head
→ release capability/result commitment

A release attempted before durable commit must fail.

Define deterministic recovery for crashes:

before append;

during append;

after append but before synchronization;

after durable append but before response release;

after response release but before client acknowledgment; and

while a lease is held.

Recovery must produce no duplicate unlock, evaluation, or score transition. A retry may either return the already committed result to the same authenticated request or return a stable already-committed disposition, but the contract must freeze one behavior.

Add two-process adversarial tests proving that only one conflicting transition succeeds and that the other process observes the committed successor rather than constructing a fork.

Add restart tests proving that a new vault process reconstructs the exact state of every task and rejects:

a second unlock with a fresh nonce;

a second evaluation with a fresh nonce;

a second score with a fresh nonce;

evaluation from merely sealed state;

scoring from merely unlocked state; and

any transition based on an obsolete task-state or ledger head.

Preserve the current authorship, contamination, admission, capability-binding, release-projection, and access-record contracts unless the durability correction requires a direct schema reference. No real task body, verifier logic, label, path, or split may be introduced.

Submit a narrow correction packet containing the durable-state schema, lease or CAS contract, recovery transition table, two-process tests, crash-injection matrix, clean local commit/tree, validation output, and replacement hashes.

No Git push, provider or API action, real benchmark-body construction or access, research scheduler, B0–B6 execution, pilot, attribution evaluation, candidate selection, promotion, canary, deployment, production-pointer change, performance claim, generalization claim, containment claim, security claim, self-improvement claim, release, or publication action is authorized.
