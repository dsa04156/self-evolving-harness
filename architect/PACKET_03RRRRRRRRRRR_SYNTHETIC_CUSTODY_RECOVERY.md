# Architect Packet 03RRRRRRRRRRR — Synthetic custody recovery and live adversarial closure

Date: 2026-07-31  
Requested decision: `APPROVE`, `REVISE`, or `BLOCK` for this correction only

## Review boundary

Review only the local deterministic correction authorized by the Round 03RRRRRRRRRR `REVISE`.
The implementation closes the reservation-only recovery gap, freezes an at-most-once delivery
contract, makes cleanup two-phase and crash-recoverable, rejects live encrypted-object and capability
substitutions, and independently verifies the resulting evidence.

The payload remains one fixed 64-byte inert sequence with no task or research semantics. This packet
does not contain or authorize a real task body, verifier, label, expected answer, benchmark path,
gate/final/temporal/withheld-public data, provider/API credential, model call, B0–B6 run, research
evaluation, attribution experiment, candidate selection, promotion, deployment, publication, Git
push, or empirical confidentiality/security/performance/generalization/evolution/self-improvement
claim.

## Approval scope and redaction

- Destination: the existing dedicated ChatGPT Pro Architect conversation only.
- Transport: exact reuse of its existing Chrome CDP target; no new tab or conversation.
- Included: architecture facts, exact local Git/file hashes, aggregate deterministic evidence,
  validation results, limitations, and decision questions.
- Excluded: environment values, credentials, private keys, tokens, raw AES keys/nonces/ciphertext/tag,
  raw inert payload bytes, personal data, unrelated repository content, and real benchmark material.
- Secret review: zero actual private-key PEMs, GitHub tokens, AWS access keys, or `.env` files were
  found. OpenAI-like strings are frozen negative-test sentinels only.

## Source identity

| Item | Identity |
|---|---|
| Prior custody implementation | `b30c8ae60e41e4c2d3853f8d13fdc1b93f993adf` |
| Prior Architect decision record | local docs commit `43dbdbf` |
| Corrected implementation commit | `e7df5d229760c75bd2bd44ca1679889db152c0d4` |
| Corrected implementation tree | `cfe60bbd5476b3956b321e816e6ad6f04a96d8b0` |
| Remote-tracking `origin/main` | `8b5f14400a7723c821bc54420e55da58dfa7601b` |

The implementation worktree was clean after commit. No push occurred.

## 1. Frozen at-most-once delivery contract

The exact constant

```text
at_most_once_abort_on_uncertain_delivery
```

is now schema-fixed and hash/signature-bound in:

- AES-GCM authenticated additional data;
- the public custody descriptor;
- the one-time evaluator capability; and
- every durable custody transition.

It means that a durable release reservation is a consumed authorization, not permission to retry
plaintext delivery after an uncertain boundary. If a `release_reserved` record exists without
`materialization_started`, recovery can only destroy private material and finish with
`reservation_abandoned`. It cannot begin or resume materialization.

The capability-to-descriptor binding now also includes `authorCommitmentHash`. The transition binds it
as well. This closes the prior asymmetry where authorship was bound by AAD and descriptor but omitted
from capability and journal-transition identity.

An exact byte-identical retry still returns the original durable reservation disposition. A fresh
correctly signed request with a new request ID, sequence, and nonce but the same consumed capability
returns `REPLAY_DETECTED`, appends no transition, and cannot begin materialization.

## 2. Two-phase cleanup state machine

The corrected successful path is:

```text
null
→ sealed
→ release_reserved
→ materialization_started
→ cleanup_started
→ cleaned
```

Reservation-only abort is:

```text
null
→ sealed
→ release_reserved
→ cleanup_started(reason=reservation_abandoned)
→ cleaned
```

Capability rejection is:

```text
null
→ sealed
→ deny_release(state remains sealed)
→ cleanup_started(reason=capability_rejection)
→ cleaned
```

Cryptographic rejection after one authorized start is:

```text
null
→ sealed
→ release_reserved
→ materialization_started
→ deny_materialization(state remains materialization_started)
→ cleanup_started(reason=cryptographic_rejection)
→ cleaned
```

`begin_cleanup` is synchronized before deletion. The final `cleanup` transition is synchronized only
after plaintext, key, and envelope files are absent. Recovery reconstructs the cleanup start and
reason, repeats file deletion idempotently, and appends or reuses exactly one terminal cleanup.
Changing the cleanup reason after start is a conflict.

`deny_materialization` is a signed non-successor transition. It records the stable schema/hash/GCM
authentication failure without exposing ciphertext, key, tag, nonce, or error detail.

## 3. Fresh consumed-capability replay evidence

Four separate evaluator workers create new correctly signed requests with distinct request IDs,
sender sequences, nonces, request hashes, and attestations while reusing the original one-time
capability:

| Condition | State at replay | Observed result |
|---|---|---|
| normal completion | evaluator completed; plaintext had been consumed | `REPLAY_DETECTED`; no append |
| response loss | evaluator response state discarded | `REPLAY_DETECTED`; no append |
| vault restart | a new vault process starts after the prior vault process died | `REPLAY_DETECTED`; no append |
| cleanup completion | state is durably `cleaned`; all private files absent | `REPLAY_DETECTED`; no append |

For every case, evidence records:

```text
correctlySignedFreshRequest=true
transitionCountBefore=transitionCountAfter
reservationCount=1
materializationCount<=1
secondReservationAppended=false
secondMaterializationBegan=false
```

The full body-free signed request is retained. The independent verifier recomputes its hash, validates
its schema, verifies the evaluator attestation and nested vault capability, and checks the unchanged
journal counts. The boolean is not trusted by itself.

## 4. Five actual process-crash boundaries

Every injection uses actual `SIGKILL` after the stated durable or filesystem operation. Recovery runs
in a new vault process.

| Crash boundary | Durable state seen by recovery | Terminal reason | Materializations |
|---|---|---|---:|
| reservation append synchronized, before materialization start | `release_reserved` | `reservation_abandoned` | 0 |
| materialization start synchronized, before key read/decrypt/plaintext write | `materialization_started` | `materialization_prewrite_abandoned` | 1 start, 0 plaintext |
| plaintext deleted, before key/envelope deletion | `cleanup_started` | `cleanup_interrupted_after_plaintext_delete` | 1 |
| key/envelope/plaintext deleted, before final cleanup append | `cleanup_started` | `cleanup_interrupted_after_private_delete` | 1 |
| final cleanup append synchronized, before acknowledgement | `cleaned` | `cleanup_acknowledgement_loss` | 1 |

All five evidence objects require and show:

```text
crashObserved=true
crashReturnCode!=0
beginCleanupCount=1
cleanupCount=1
duplicateMaterializationCount=0
evaluatorPlaintextMounted=false
evaluatorReceiptProduced=false
keyFilePresent=false
ciphertextFilePresent=false
plaintextFilePresent=false
```

The first crash history has four successor records:

```text
seal, reserve_release, begin_cleanup, cleanup
```

Each other crash history has:

```text
seal, reserve_release, begin_materialization, begin_cleanup, cleanup
```

The acknowledgement-loss recovery reuses the already durable terminal transition and does not append
a second cleanup.

## 5. Twenty-one live adversarial cases

Every case creates an independent key, envelope, descriptor, capability, request, materialization
root, and custody journal. The mutation occurs inside a fresh vault-UID worker with the live private
envelope mount. The subsequent vault worker executes the normal materialization path. No case calls a
model or mounts plaintext into an evaluator.

### Cipher/envelope mutation

1. ciphertext byte/string mutation;
2. GCM authentication-tag mutation;
3. nonce mutation; and
4. descriptor/envelope swap using a second independently encrypted scenario created inside the vault
   worker.

### Every AAD-bound material class

5. custody ID;
6. protocol ID;
7. contract ID;
8. contract hash;
9. opaque task-handle commitment;
10. benchmark-author commitment hash;
11. included-authorship transition hash;
12. admitted durable vault-state head;
13. evaluator unlock-capability hash;
14. plaintext commitment;
15. payload length; and
16. delivery-guarantee value.

These cases finish with one durable `deny_materialization`, one cleanup start, one cleanup completion,
no plaintext file, no evaluator receipt, and no private-file residual. Depending on the earliest
failing invariant, the durable denial is `SCHEMA_INVALID`, `HASH_MISMATCH`, or
`AUTHENTICATION_FAILED`.

### Correctly signed capability/request substitution

For each case, a vault worker starts from the real target capability, changes exactly one tested field,
recomputes the capability hash, and signs the substituted capability with the frozen vault key. A
separate evaluator worker embeds it in a new request, recomputes the request hash, and signs with the
frozen evaluator key:

17. custody/cross-object capability substitution;
18. admitted vault-state substitution;
19. authorship-commitment substitution;
20. task-handle-commitment substitution; and
21. unlock-capability substitution.

The independent verifier first verifies both signatures and hashes without trusting binding equality.
It then invokes the complete request verifier and requires exactly `AUTHORIZATION_DENIED`. Each journal
contains:

```text
seal, deny_release, begin_cleanup, cleanup
```

No case appends `reserve_release` or `begin_materialization`.

## 6. Leakage, residual, and downstream evidence

The 6 ordinary scenarios, 5 crash cases, and 21 adversarial cases each end with a vault-signed leakage
scan: 32 scans total. Every scan reports zero matches for payload and key material over the declared
repository, retained state, command/stdout/stderr logs, and visible process arguments, plus false for
key, envelope, and plaintext residual files.

When recovery still has the key buffer, the scan uses exact bytes. When a prior crashed process
already deleted the key file, recovery uses the descriptor commitment against exact key-sized files
and decoded base64url/hex candidates. This is a finite negative test over the declared artifact forms,
not proof against an arbitrary malicious binary encoder or an unmounted sink. The trusted worker code
never accepts key material through arguments and never writes it to an output record.

Scorer and promoter continue to receive commitments only. The final audit now binds:

- 32 descriptor hashes;
- 169 transition hashes;
- 184 pre-audit role-receipt hashes;
- 32 leakage-scan hashes;
- one scorer-projection hash; and
- one promoter-projection hash.

The top-level evidence contains 185 signed role receipts including the audit-finalization receipt.

## 7. Evidence and independent verification

Artifact:

```text
architect/evidence/synthetic-custody-os-boundary/evidence.json
```

| Property | Value |
|---|---|
| file size | 1,883,840 bytes |
| file SHA-256 | `ef4ac5419ebcf0143152658002aaa411e05f798e2250023d7e0ac0318f542cba` |
| internal evidence hash | `sha256:07fdd58f387a2826fd355b320bae1d8d2b9168816dae8653a4396de012753996` |
| ordinary scenarios | 6 |
| fresh signed replay conditions | 4 |
| crash cases | 5 |
| adversarial cases | 21 |
| descriptors | 32 |
| signed transitions | 169 |
| top-level signed role receipts | 185 |
| leakage scans | 32 |
| scorer projection | `sha256:af228d67cdb16bbf5bcc4c2eb5ce04358d6df6112138bb655e6e8844bf60a666` |
| promoter projection | `sha256:34dc56d93afa6e5ff6d600e5cfe62a9c923f769293b1dd1be64594d3ce398fbc` |
| final audit | `sha256:128f40b4a7c69f50fc42c30e9638d85aa1a06c9b7e841f9357ca5bd21b53ff01` |

The standalone verifier validates all closed schemas, identities, hashes, nested signatures, complete
transition ordering/state continuity, exact action sequences, fresh request attestations, stable
replay counts, crash terminal reasons, adversarial denials, 32 zero leakage scans, role process
UID/GID, projection lineage, and exact final-audit set equality.

It reports:

```json
{"adversarialCaseCount":21,"crashCaseCount":5,"evidenceHash":"sha256:07fdd58f387a2826fd355b320bae1d8d2b9168816dae8653a4396de012753996","promotionAuthorized":false,"providerUsed":false,"repositoryPushPerformed":false,"researchEvidenceAuthorized":false,"roleReceiptCount":185,"scenarioCount":6,"transitionCount":169,"verified":true}
```

The outer evidence hash is recomputed after each tamper in the negative suite. The verifier still
rejects all nine nested mutations:

1. descriptor binding;
2. transition disposition;
3. role-receipt process UID;
4. scorer source lineage;
5. final-audit transition lineage;
6. fresh replay request body/signature binding;
7. crash terminal-transition hash;
8. adversarial denial-transition hash; and
9. adversarial request attestation.

## 8. Validation

Pinned runtime: Node `24.18.1`.

| Check | Result |
|---|---|
| `rtk npm test` | PASS: 135/135, fail 0, skip 0 |
| `rtk npm run test:coverage` | PASS: 135/135, fail 0, skip 0 |
| total coverage | lines 96.01%, branches 90.39%, functions 93.47% |
| `src/trust/synthetic-custody.ts` coverage | lines 94.66%, branches 81.38%, functions 96.00% |
| standalone custody verifier coverage | lines 99.92%, branches 98.80%, functions 100% |
| `rtk npm run build` | PASS |
| `rtk npm run check` | PASS |
| Python `py_compile` for both OS gates | PASS |
| standalone evidence verifier | PASS, `verified=true` |
| rehashed nested-tamper suite | PASS: all 9 rejected |
| `rtk git diff --check` before implementation commit | PASS |
| actual private-key material | zero files; source contains only negative-search literals |
| GitHub token and AWS access-key patterns | zero matches |
| actual `.env` / `.env.*` files | zero files |
| provider/model calls | zero |
| remote-tracking ref | unchanged at `8b5f14400a7723c821bc54420e55da58dfa7601b` |

The full suite uses existing public development-only fixtures and synthetic metadata. It does not
access gate, final, temporal, withheld-public, multi-cause, Terminal-Bench, or any real task body.

## 9. Exact artifact hashes

| Artifact | SHA-256 |
|---|---|
| `src/trust/synthetic-custody.ts` | `ed1d765aebc0cd1cebb01f033cd50a4fd1cbed676ef8b22d4f1785166b9ff481` |
| `evaluator/synthetic_custody_os_gate.py` | `e9e3f7715af697d8fa08a83d757d92ac7368c8d2747957f162b35085d0099e47` |
| `scripts/synthetic-custody-os-worker.ts` | `16abb4b03cfd28c485467b5da7f01ffbaa43dde5efbca6b423d5c05e8b55081e` |
| `scripts/verify-synthetic-custody-os-boundary.ts` | `ed9c5daee2dd434a3b5219732c83afa8d5aa84e08405b28393305490a7d12d7e` |
| custody evidence schema | `906058116ed176a91c24c3cfae38aedc45253274b8355c8dd738e7791d3938e6` |
| encrypted-envelope schema | `cf5b2a288ce8fb791f3b108d3f72b8c849f7877185e6f15db8ee9423bbf0f255` |
| one-time capability schema | `50c8757c137ac26eb151d9497a7e097d6f3b7a0dded3acd4c4ed3e0186f9ab85` |
| custody-transition schema | `55f016189540066d3341ab063bc81d9febc5b84433fbc83e0f7fc346c5577861` |
| OS custody test | `b4b28b6497172d624e4b0c976be269d6fbf9ec02a149fed2dd7d585399bf5ab6` |
| standalone-verifier tamper test | `f2d23eb9fc4fada45dba6856d43680c0e977a0d560647d7ef5f5f08687433ed5` |

## 10. TCB and claim limits

The accepted earlier Linux/rootless TCB remains: host kernel and bootstrap administrator,
RootlessKit/subordinate-ID mapping, bubblewrap/setpriv, filesystem/tmpfs semantics, Node/Python/
OpenSSL/schema validator, role-key custody, and immutable trust-plane authorities.

Residual limitations:

- at-most-once abort intentionally trades availability for non-rematerialization after uncertainty;
- this is not distributed exactly-once delivery or distributed consensus;
- cleanup is crypto-erasure plus file removal, not physical-media sanitization;
- leakage scans cover declared mounted surfaces and encoded artifact forms, not malicious host root,
  kernel, hardware, arbitrary covert encoding, swap/storage forensics, or an unobserved sink;
- a compromised vault key or trusted worker can fabricate signed custody evidence;
- fixed inert bytes do not test real benchmark confidentiality or operational blinding;
- random keys/nonces make evidence hashes run-specific; structural and cryptographic invariants are
  reproducible, not byte-identical artifacts;
- no result establishes provider interoperability, performance, generalization, evolution, or
  self-improvement.

## Requested ruling

Please issue exactly one primary decision:

```text
DECISION: APPROVE | REVISE | BLOCK
```

Please separately rule on:

1. whether the frozen at-most-once rule closes durable `release_reserved` recovery;
2. whether `cleanup_started → cleaned` plus the five crash injections closes the required deletion
   and acknowledgement windows;
3. whether fresh correctly signed consumed-capability requests are stably rejected without another
   reservation or materialization;
4. whether the 21 live vault attacks adequately cover ciphertext/tag/nonce, every AAD material
   binding, descriptor/envelope swap, cross-object capability, and individually signed
   admitted-state/authorship/task-handle/unlock substitutions;
5. whether durable `deny_release` / `deny_materialization` plus cleanup provides a stable denial
   history with no evaluator plaintext or receipt;
6. whether schemas, independent signature verification, leakage/residual evidence, and final-audit
   set binding are complete;
7. whether the finite-scan and local-TCB limitations are stated narrowly enough; and
8. the next smallest local deterministic scope, if any.

If a property is unsupported, return `REVISE` or `BLOCK` with the exact missing invariant, attack,
schema field, evidence relation, or test. Do not infer authorization for Git push, provider/API use,
real benchmark data, research scheduling/B0–B6, attribution, candidate selection, promotion,
deployment, release, publication, or any empirical claim unless the ruling explicitly states it.
