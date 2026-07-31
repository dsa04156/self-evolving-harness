DECISION: APPROVE

PRINCIPAL_AND_KEY_SEPARATION:
The authorized eight-principal OS integration is complete for the body-free evaluator-vault workflow.

The packet reports distinct namespace and mapped host UID/GID identities for:

protocol_author
benchmark_author
benchmark_reviewer
vault
evaluator
scorer
promoter
audit_store

Each role has its own mode-0600 private signing key in a role-owned mode-0700 directory, a role-specific read-only input projection, a private writable state directory, no network, zero effective capabilities, and NoNewPrivs.

Only the vault principal can read or write the authoritative state and lease journals. The other seven principals are denied foreign key, input, and journal reads and writes, as well as signal and ptrace access to the live vault process. The reported mapped host UIDs are distinct, so this is actual subordinate-identity enforcement rather than the earlier same-UID process emulation.

The boundary remains dependent on RootlessKit, bubblewrap, subordinate-ID configuration, the host kernel, the bootstrap process, filesystem behavior, and role-key custody. Those are correctly retained as TCB assumptions.

BLINDED_AUTHORSHIP:
The BlindedReviewerContractProjection corrects the direct author-identity exposure discovered by the OS integration.

The reviewer receives only:

schema and record type
protocol ID
contract ID and hash
expected reviewer identity
assignment commitment
author-commitment hash

The full IndependentAuthorshipContract, benchmark-author principal, raw task handle, body, labels, paths, verifier logic, vault capability, and unrelated role keys are absent from the reviewer’s mounted input. The recorded reviewer-stage file inventory supports that claim.

Authorship binding is preserved because the reviewer decision remains tied to the exact protocol, contract, assignment commitment, author-commitment hash, and frozen reviewer identity. The vault still verifies the complete assignment-to-author-commitment chain when finalizing admission; the reviewer does not gain authority to invent or finalize that chain.

This establishes raw-field and mount-level blinding for the synthetic body-free workflow. It does not establish anonymity against timing correlation, external organizational knowledge, or future low-entropy commitment correlation. Those stronger privacy properties are not claimed and are not required for this narrow integration.

AUTHENTICATED_TRANSPORT:
The Unix transport boundary is accepted.

The client verifies that the server peer is the exact vault UID/GID. The server independently verifies the connecting UID/GID against the request’s claimed role, then verifies the role-specific key, signature, protocol, sequence, nonce, capability, task state, and release class.

The single sticky-directory socket does not grant authority merely because a process can reach it. All seven non-vault principals are reported as unable to unlink or replace the live socket, and a foreign process cannot impersonate the vault because the client checks SO_PEERCRED. Wrong role, wrong key, protocol mismatch, capability substitution, replay, and invalid state transitions are rejected.

Starting a fresh vault worker for every request is material evidence that successful behavior depends on reconstruction from the durable CAS journal rather than hidden process memory.

The transport returns no raw task handle, body, label, path, verifier logic, private key, or detailed error material. Commitment-only release remains intact.

VAULT_CONTENTION_AND_RECOVERY:
The OS-level contention and recovery evidence is sufficient for this scope.

Two actual vault worker processes race different unlock requests from the same sealed state. Exactly one succeeds, while the other receives CONFLICT. A fresh process then reconstructs the resulting unlocked state and rejects another unlock rather than accepting a fresh nonce as a convenient excuse to do the same thing twice.

The reported live path also completes evaluation and scoring from reconstructed state and returns an exact evaluation retry without appending a duplicate transition.

The two actual SIGKILL cases exercise distinct critical boundaries:

after_durable_commit_before_release
during_state_append

Following restart:

a durably committed transition is returned without duplication;

the abandoned same-directory staging hard link is verified, recovered, synchronized, and removed;

exactly one authoritative transition remains for each operation; and

the final journal head is independently checked.

Together with the already accepted deterministic crash matrix, the actual child-process race, third-process reconstruction, killed-worker recovery, duplicate denial, and exact-retry behavior close the requested OS integration. They do not establish availability under hostile clock manipulation, filesystem loss, indefinite owner stalls, or host compromise.

EVIDENCE_AND_TAMPER_RESISTANCE:
The evidence graph is sufficiently complete and independently verifiable.

The retained artifact binds:

role count:                    8
role receipts:                26
transport transactions:       20
signed vault access records:  16
promoter projection
final audit receipt
journal head
principal and host UID mappings
expected denials
contention and crash outcomes

The independent verifier checks closed schemas, principal identities, challenge signatures, peer mappings, access-record hashes and signatures, workflow stage coverage, contention outcomes, retries, crash-transition counts, promoter projection, final audit signature, and body absence.

The three nested tamper cases remain rejected even after recomputing the top-level evidence hash because the affected role, vault, promoter, or audit signatures no longer validate. That is the correct property: the evidence is not secured by one decorative checksum placed on top of a large JSON object.

The result is tamper-evident under the stated host and key assumptions. It is not tamper-proof and does not protect against malicious host root, kernel compromise, vault-key compromise, or evidence destruction.

VALIDATION:
The reported validation is sufficient:

deterministic tests:                    130/130 pass
line coverage:                          95.97%
branch coverage:                        90.59%
function coverage:                      93.28%
build:                                  pass
type and static checks:                 pass
independent OS-boundary verifier:       pass
Python compilation checks:              pass
private-key/live-token scan:            zero matches
actual environment/private-key files:   zero
remote push:                             none

The implementation evidence is tied to commit 864d211484f802ac0d82fe9d3c21382e0ad48e80 and tree afb3b172510cee31df04a78e55bdff71b16bb030. The later OxyGent documentation-only commit does not alter this integration, but its prior-art characterization is outside this ruling and is not accepted as source-ledger evidence here.

No accepted process-boundary, publication-governance, durable-state, contamination, or non-promotability control is contradicted.

CLAIM_DISCIPLINE:
The packet maintains the required boundary.

Approval establishes a local, synthetic, body-free evaluator-vault workflow running across eight OS-enforced principals with authenticated transport and durable state recovery.

It does not establish:

confidentiality or correctness for real benchmark bodies;

independent research authorship in an operational study;

provider interoperability;

production containment or security certification;

distributed consistency or replicated durability;

benchmark validity;

attribution performance;

harness improvement;

generalization; or

self-improvement.

The signed fields keeping provider, promotion, and research-evidence authority false are consistent with the actual scope.

BLOCKING_FINDINGS:
None for the narrow eight-principal, body-free evaluator-vault OS integration.

AUTHORIZED_NEXT_SCOPE:
The next authorized scope is limited to a local deterministic synthetic-custody rehearsal. It may test custody and one-time release of an inert encrypted payload, but it may not instantiate a real benchmark or research task.

Authorized work:

Define a closed synthetic-custody object containing fixed inert bytes or schema-only synthetic metadata. It must contain no task instruction, verifier logic, label, benchmark path, expected answer, model prompt, gate/final material, or research semantics.

Store that object encrypted at rest under vault-exclusive key authority. The encryption key must be unavailable to the protocol author, benchmark reviewer, evaluator before unlock, scorer, promoter, audit store, and all repository artifacts.

Bind the encrypted object and its plaintext commitment to the existing admitted opaque-handle commitment, included-authorship transition, protocol, contract, vault state, and one-time evaluator capability.

Extend the accepted eight-principal workflow so that, after a valid one-time unlock, only the evaluator receives an ephemeral read-only plaintext materialization. The evaluator must receive neither the vault encryption key nor reusable decryption authority.

Require plaintext materialization only in ephemeral storage, with deterministic cleanup after:

normal completion;

evaluator crash;

vault crash;

timeout;

capability rejection; and

response loss.

Prove through OS-level tests that:

the reviewer never receives ciphertext metadata capable of identifying the author beyond the accepted commitments;

the protocol author cannot read encrypted or plaintext custody state;

the scorer and promoter receive commitments only;

the audit store receives only the authorized access and custody receipts;

wrong principals cannot read the ciphertext, key, plaintext materialization, or cleanup state;

a consumed or expired capability cannot rematerialize the plaintext;

restart and exact retry do not produce a second authorized release; and

plaintext, key bytes, and inert payload bytes do not appear in logs, denial records, retained evidence, process arguments, or repository files.

Preserve the historical-publication contamination rules. The synthetic custody artifact and resulting evidence must remain development-only, non-confirmatory, non-promotable, and ineligible for held-out or research use.

Produce a narrow packet containing:

custody and encryption schemas;

key and mount authority matrix;

ciphertext and plaintext commitment rules;

one-time release and cleanup state machine;

crash and retry evidence;

OS denial results;

independent verifier results;

exact local commit and tree;

implementation and evidence hashes; and

an explicit statement that no real task body, provider, research split, candidate selection, promotion, deployment, or empirical result was introduced.

No Git push, API credential request, provider call, real benchmark task body, verifier logic, label, task path, D_gate, final, temporal, withheld-public, multi-cause, or Terminal-Bench material, research scheduler, B0–B6 execution, pilot, attribution evaluation, candidate selection, qualification, promotion, canary, deployment, production-pointer modification, performance claim, generalization claim, containment claim, security claim, self-improvement claim, release, or publication action is authorized.
