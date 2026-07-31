DECISION: REVISE

CRYPTOGRAPHIC_BINDING:
The cryptographic object model is coherent.

The AES-256-GCM authenticated data binds the custody object to the exact protocol, contract, opaque task-handle commitment, authorship transition, admitted vault-state head, evaluator unlock capability, plaintext commitment, and payload length. The signed descriptor separately binds the key, ciphertext, plaintext, and complete envelope commitments. The single-use materialization capability and signed evaluator request add evaluator identity, action, validity, and request authorization.

That is an adequate design. The packet does not yet provide active-path evidence for the most important substitution and authentication failures, however. The five reported tamper cases alter retained evidence and demonstrate signature or graph-integrity rejection. They do not demonstrate that the live vault refuses to decrypt or materialize when presented with:

modified ciphertext;

modified GCM tag;

modified nonce;

modified authenticated data;

a descriptor from one scenario paired with another scenario’s envelope;

a valid capability paired with a different descriptor, task commitment, authorship transition, admitted state, or unlock capability; or

a correctly signed request containing a substituted custody object.

A verifier rejecting edited JSON after execution is not evidence that the decryption path itself failed closed. Checksums, despite their admirable work ethic, cannot testify about branches that were never exercised.

DURABLE_RELEASE_AND_RETRY:
The tested release paths establish commit-before-materialization and prevent an exact retry from producing a second materialization.

The normal, evaluator-crash, vault-crash, timeout, capability-rejection, and response-loss scenarios all reach cleaned, and the durable materialization_started transition provides an authoritative recovery point after plaintext creation.

One material crash boundary remains undefined:

seal
→ release_reserved
→ process crash
→ no begin_materialization record

The packet states that an exact retry of the consumed request returns the original reservation and refuses another materialization. It does not state how the stranded release_reserved state reaches cleaned, whether the key and envelope are removed, or whether another process is ever permitted to continue the originally reserved materialization.

This is not merely an availability footnote. Without one frozen recovery rule, the system can retain vault-private material indefinitely or let future code improvise whether a reserved capability may still produce plaintext.

The contract must explicitly choose one behavior. The simplest defensible rule is at-most-once delivery:

durable reservation without durable materialization start
→ recovery performs cleanup only
→ no plaintext materialization
→ stable delivery-aborted disposition

Resuming materialization is acceptable only if the contract can prove that no prior process wrote or exposed plaintext. The packet currently provides no such proof.

OS_CUSTODY_BOUNDARY:
The reported OS boundary is sufficient for this narrow rehearsal.

Only the vault receives the key, encrypted envelope, custody journal, and writable materialization mount. The evaluator receives one read-only plaintext file and no key, ciphertext, journal, writable materialization directory, or reusable decryption authority.

The seven non-vault roles are reported as denied reads and writes to all protected targets while the private objects exist. Their processes also retain zero effective capabilities, NoNewPrivs, no network, and role-specific key ownership.

The evaluator’s successful read-only consumption does not weaken the negative probe because the normal evaluator receives a separately projected read-only file rather than access to the vault’s protected custody path.

This remains evidence under the accepted RootlessKit, bubblewrap, host-kernel, bootstrap, filesystem, and role-key TCB. It is not production-containment evidence.

FAILURE_AND_CLEANUP:
The six requested operational scenarios are implemented and materially useful:

normal completion;

evaluator crash;

vault crash after plaintext creation;

evaluator timeout;

expired-capability rejection; and

response loss.

The cleanup order is also directionally correct: plaintext and vault-private key/envelope material are removed before the signed cleaned transition is appended.

The crash matrix is not complete enough to establish durable cleanup. In addition to the reservation-only crash above, the packet does not report crash injection:

after begin_materialization commits but before decryption;

after plaintext creation but before evaluator launch;

during plaintext removal;

after plaintext removal but before key/envelope removal;

after all private files are removed but before the cleaned transition is appended;

during publication of the cleaned transition; or

after durable cleanup commit but before the operation response.

The accepted vault CAS machinery may be capable of handling several of these cases, but this packet is the sole evidence and does not demonstrate that it is applied correctly to the custody journal. At least the reservation-only and cleanup-interruption boundaries must be exercised before the rehearsal is closed.

LEAKAGE_EVIDENCE:
The finite leakage evidence is accepted for what it claims.

The scans cover the declared repository, retained role states, stdout, stderr, command logs, and visible process command lines. They report zero exact plaintext or key matches and no residual key, envelope, or plaintext files after each tested scenario.

The scorer, promoter, and audit artifacts remain commitment-only. The packet also correctly disclaims physical-media sanitization, hostile-host resistance, kernel inspection, storage forensics, unobserved sinks, and exhaustive memory-erasure guarantees.

No broader confidentiality claim follows from the 48 zero counters. Zero is a pleasant number, but it remains bounded by the surfaces actually examined.

EVIDENCE_AND_AUDIT:
The retained evidence graph is well structured.

It binds six descriptors, 23 custody transitions, 34 role receipts, six leakage reports, evaluator receipt lineage, scorer and promoter projections, and the final audit. The standalone verifier reconstructs state continuity, scenario action sequences, role identities, bindings, cleanup outcomes, and final-audit set equality.

The nested-tamper tests correctly demonstrate that recomputing the outer evidence hash cannot repair invalid inner signatures or lineage.

The evidence package must be extended to cover the missing live cryptographic and crash-recovery cases. Until then, it proves the six reported scenarios rather than the complete one-time custody invariant.

CLAIM_DISCIPLINE:
The packet’s claim discipline is satisfactory.

It does not portray the inert 64-byte payload as benchmark data, the finite scan as comprehensive confidentiality proof, the local host as distributed storage, or the rehearsal as provider, research, performance, generalization, evolution, or self-improvement evidence.

The use of a public plaintext commitment is acceptable for this fixed inert development payload. It must not silently become the commitment scheme for future low-entropy or real task bodies without a separate leakage analysis.

BLOCKING_FINDINGS:

No defined recovery from a durable release_reserved transition without materialization_started. An exact retry is denied, but the packet does not state how the object is cleaned, whether delivery is abandoned, or whether materialization may resume.

Live AEAD and cross-object substitution rejection is not evidenced. The tamper suite validates retained evidence integrity, not vault behavior under modified ciphertext, tag, nonce, authenticated data, descriptor, capability, or request bindings.

A fresh second request using an already consumed capability is not explicitly exercised. Exact byte-identical retry is covered, but single-use authority also requires rejection of a newly signed request with a fresh request ID, sequence, and nonce that reuses the consumed materialization capability.

Cleanup interruption is not demonstrated. The packet does not show deterministic recovery when the process dies during private-file removal or before the terminal cleaned record becomes durable.

MINIMUM_ORDERED_CORRECTIONS:

Freeze the custody delivery guarantee as explicitly at most once, exactly once, or another precisely named semantic. Define the authoritative recovery transition from release_reserved when no materialization_started record exists.

Add a durable cleanup disposition for reservation-only abandonment. It must remove the key, envelope, and any partial materialization, append one terminal cleaned transition with an unambiguous reason, and prohibit later materialization with that capability.

Add live vault adversarial cases for:

ciphertext-bit modification;

authentication-tag modification;

nonce modification;

alteration of each material AAD-bound identity class;

descriptor/envelope swap across scenarios;

capability substitution across custody objects;

admitted-state, authorship, task-handle, and unlock-capability substitution; and

a correctly signed request carrying any of those substitutions.

Every case must produce no evaluator plaintext mount, no downstream receipt, a stable denial or cleanup disposition, and no residual private files.

Execute a fresh, correctly signed second request that reuses a consumed capability but changes request ID, sequence, and nonce. Test it after:

normal completion;

response loss;

vault restart; and

cleanup completion.

It must never append a second reservation or begin_materialization transition.

Add crash injection at minimum:

after reservation durability but before materialization start;

after materialization start but before plaintext write;

after plaintext deletion but before key/envelope deletion;

after all file deletion but before cleanup append; and

after durable cleanup append but before acknowledgment.

Each recovery must yield one terminal custody history, no duplicate materialization, and no residual key, envelope, or plaintext file.

Extend the standalone verifier and final audit to bind the new denial, abandonment, cleanup, and recovery cases. Preserve explicit zero counts for missing receipts and materializations rather than omitting them.

Re-run the full deterministic suite, custody verifier, nested-tamper tests, secret scans, build, static checks, clean-worktree checks, and remote non-publication check from one clean local commit.

AUTHORIZED_NEXT_SCOPE:
Only the narrow corrections above are authorized.

The project may revise the synthetic-custody state machine, recovery rules, cleanup reasons, schemas, live cryptographic adversarial tests, fresh-request capability-reuse tests, crash-injection matrix, independent verifier, final-audit bindings, and related documentation.

The accepted eight-principal boundary, blinded authorship contract, historical-publication controls, vault admission rules, and body-free durable state machinery are not reopened unless one of these corrections directly changes them.

No Git push, API credential request, provider call, real task body, expected answer, verifier logic, label, benchmark path, D_gate, final, temporal, withheld-public, multi-cause, or Terminal-Bench material, research scheduler, B0–B6 execution, pilot, attribution experiment, candidate selection, qualification, promotion, canary, deployment, production-pointer modification, performance claim, confidentiality claim, generalization claim, containment claim, security certification, evolution claim, self-improvement claim, release, or publication action is authorized.
