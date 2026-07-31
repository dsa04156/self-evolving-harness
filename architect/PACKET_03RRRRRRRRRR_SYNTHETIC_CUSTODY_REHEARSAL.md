# Architect Packet 03RRRRRRRRRR — One-time encrypted synthetic custody rehearsal

Date: 2026-07-31  
Requested decision: `APPROVE`, `REVISE`, or `BLOCK` for this narrow rehearsal only

## Review boundary

Review only the local deterministic synthetic-custody rehearsal authorized by the Round
03RRRRRRRRR `APPROVE`.

The implementation encrypts a fixed 64-byte inert payload under a new vault-exclusive AES-256-GCM
key for each of six isolated scenarios. It binds the encrypted object, one-time release capability,
signed evaluator request, durable release transitions, ephemeral read-only materialization, cleanup,
leakage scan, role receipts, scorer/promoter projections, and final audit to the already admitted
body-free authorship and evaluator-vault commitments.

This packet does **not** contain or authorize:

- a real task body, expected answer, verifier, label, benchmark path, gate/final/temporal data, or
  research semantics;
- an API credential, provider/model call, Codex wrapper, research scheduler, B0–B6 execution,
  attribution experiment, candidate selection, promotion, canary, deployment, release, publication,
  or Git push; or
- an empirical performance, confidentiality, production-containment, security-certification,
  generalization, evolution, or self-improvement claim.

The fixed bytes are intentionally meaningless test material. Their only purpose is to make byte-level
leakage and lifecycle assertions falsifiable without introducing research data.

## Approval scope and redaction

- Destination: the existing dedicated ChatGPT Pro Architect conversation only.
- Transport: exact reuse of the recorded Chrome CDP endpoint and existing conversation tab.
- Data categories: this bounded architecture summary, commit and file hashes, synthetic evidence
  commitments, aggregate test output, known limitations, and decision questions.
- Excluded: `.env` values, credentials, private keys, tokens, raw encrypted-object bytes, raw inert
  payload bytes, personal data, unrelated repository content, and real benchmark material.
- Redaction result: no secret or raw private-material field is present in this packet. Public keys
  are not included; only their already frozen role identities and aggregate verification results are
  described.

## Source identity and scope

| Item | Identity |
|---|---|
| Prior OS-boundary implementation | `864d211484f802ac0d82fe9d3c21382e0ad48e80` |
| Prior OS-boundary approval record | `3af82e3c276b8a499a3ff1fd357fc791140df9a2` |
| Custody implementation commit | `b30c8ae60e41e4c2d3853f8d13fdc1b93f993adf` |
| Custody implementation tree | `32846a1cf70d0ea5af682babffebbf87ace29e54` |
| Remote-tracking `origin/main` | `8b5f14400a7723c821bc54420e55da58dfa7601b` |

The worktree was clean after the implementation commit. No push occurred.

## Custody protocol

### Cryptographic object and binding

For every scenario, the vault creates:

- a fresh random 32-byte AES key;
- a fresh random 12-byte GCM nonce;
- an AES-256-GCM envelope;
- a vault-signed public descriptor; and
- a vault-signed, evaluator-bound, single-use materialization capability.

The authenticated additional data binds:

```text
custody ID
protocol ID
contract ID and contract hash
opaque task-handle commitment
benchmark-author commitment hash
included authorship transition hash
admitted durable vault-state head
pre-existing evaluator unlock-capability hash
plaintext commitment
payload length
```

The public descriptor exposes only commitments and metadata. It contains the plaintext, key, and
ciphertext commitments plus the envelope hash; it does not contain the encryption key, ciphertext,
authentication tag, or GCM nonce. The private envelope and key are written only under the
vault-owned custody mount.

The capability is bound to the exact descriptor, evaluator identity, protocol, contract, admitted
state, task-handle commitment, plaintext commitment, validity interval, and `materialize_once`
action. It explicitly records:

```text
singleUse=true
reusableDecryptionAuthority=false
```

The evaluator signs a release request containing that capability. The vault verifies both nested
signatures and all bindings before reserving release.

### Durable state machine

The custody lifecycle is a separate append-only CAS journal:

```text
null
  → sealed
  → release_reserved
  → materialization_started
  → cleaned
```

An expired capability follows:

```text
null
  → sealed
  → deny_release (state remains sealed)
  → cleaned
```

Every transition is vault-signed and binds:

- the exact previous custody transition;
- the exact prior custody journal head;
- protocol, contract, custody, descriptor, admitted-state, opaque-handle, authorship, unlock, and
  plaintext commitments;
- request and capability commitments where applicable;
- release ID, prior and successor state, decision, reason, and cleanup reason; and
- negative release facts for key, ciphertext, and retained plaintext.

`begin_materialization` is committed and synchronized before the vault decrypts or writes plaintext.
This makes a crash after plaintext write recoverable from a durable `materialization_started` state
instead of requiring an in-memory guess.

An exact retry of the already consumed normal request returns the original reservation transition
and refuses a second materialization with `REPLAY_DETECTED`. It does not append another
`begin_materialization` transition.

## OS principal and materialization boundary

The rehearsal reuses the accepted eight distinct subordinate UID/GID principals:

| Role | namespace UID/GID |
|---|---:|
| `protocol_author` | 1301 |
| `benchmark_author` | 1302 |
| `benchmark_reviewer` | 1303 |
| `vault` | 1304 |
| `evaluator` | 1305 |
| `scorer` | 1306 |
| `promoter` | 1307 |
| `audit_store` | 1308 |

The existing RootlessKit, bubblewrap, role-key, no-network, zero-capability, `NoNewPrivs`, blinded
reviewer, and `SO_PEERCRED` boundaries remain unchanged.

Only the vault receives:

- writable `/custody` containing the current key and encrypted envelope;
- writable `/custody-state` containing the authoritative CAS journal; and
- writable `/materialization` during creation and cleanup.

The evaluator receives exactly one read-only bind mount:

```text
/materialization/payload.bin
```

It receives neither `/custody` nor `/custody-state`, no key, no envelope, no ciphertext, no reusable
decryption authority, and no writable materialization directory. The evaluator opens the file
read-only and independently verifies that a read-write open fails before consuming it.

The materialization root is created under `/dev/shm`; the gate verifies its actual mount type from
`/proc/self/mountinfo` and records `filesystemType=tmpfs`. The root is removed in a `finally` block
on both success and failure.

Before the normal evaluator consumes the payload and while all private artifacts still exist, each
of the seven non-vault roles is run in a fresh negative-probe process. Every role is denied both read
and write access to all four protected targets:

1. the vault key;
2. the encrypted envelope;
3. the custody journal; and
4. the plaintext materialization.

Each probe reports four denied reads and four denied writes, zero effective capabilities,
`NoNewPrivs=1`, no network, and a role-key challenge signature.

## Six deterministic failure and recovery scenarios

Each scenario creates an independent encrypted object with a distinct key, nonce, ciphertext,
descriptor, capability, request, and journal. All six use the same fixed inert plaintext
commitment.

| Scenario | Observed path | Cleanup |
|---|---|---|
| normal | evaluator returns signed receipt | `normal_completion` |
| evaluator crash | evaluator reads, then receives actual `SIGKILL`; exit 137, no receipt | `evaluator_crash` |
| vault crash | vault durably starts materialization, writes plaintext, then receives actual `SIGKILL`; no operation response | `vault_crash_recovery` |
| timeout | evaluator reads, blocks, exceeds 750 ms cap, and is killed; no receipt | `timeout` |
| capability rejection | request is validly signed but capability is expired; no materialization transition | `capability_rejection` |
| response loss | evaluator successfully creates a response, but the gate discards its response state before vault cleanup | `response_loss` |

The normal, evaluator-crash, vault-crash, timeout, and response-loss journals each contain exactly:

```text
seal
reserve_release
begin_materialization
cleanup
```

The rejected-capability journal contains exactly:

```text
seal
deny_release
cleanup
```

Across all six cases there are 23 signed custody transitions. Every scenario ends in `cleaned`, and
the retained evidence records:

```text
keyFilePresent=false
ciphertextFilePresent=false
plaintextFilePresent=false
```

## Cleanup and byte-level leakage evidence

Cleanup first removes the tmpfs plaintext and the vault-private key/envelope object, then appends the
signed `cleaned` transition. The cleanup worker keeps the plaintext and key only in local buffers
long enough to scan explicitly mounted evidence surfaces; both buffers are zeroed before exit.

For every scenario, a vault-signed leakage record reports zero exact byte matches in:

- repository source, scripts, evaluator code, schemas, and tests;
- retained role-state projections;
- process stdout, stderr, and command logs; and
- every visible `/proc/<pid>/cmdline`.

It also reports absence of the key file, envelope file, and plaintext file after cleanup. The result
is 48 zero-valued byte-match counters across the six scenarios, plus 18 false residual-file flags.

This scan is a finite negative test over the explicitly mounted surfaces. It is not a proof against
host root, kernel compromise, swap outside the declared tmpfs assumption, storage forensics,
malicious hardware, or an unmounted/unobserved sink.

The fixed inert byte sequence is generated algorithmically inside the worker and is not embedded as
a raw byte literal in the repository. Repository evidence contains its SHA-256 commitment, not the
64 raw bytes. Keys and nonces are generated per run and are never accepted in command-line
arguments.

## Commitment-only downstream evidence

Only the normal scenario produces an evaluator receipt. It binds the exact descriptor, release ID,
observed plaintext commitment and length, evaluator identity, read-only mount, and absence of key,
ciphertext, reusable authority, task body, verifier logic, and model prompt.

The scorer receives only descriptor and receipt commitments and emits a signed
`scorer_commitments_only` projection. The promoter receives only the scorer projection and cleanup
commitments and emits a signed `promoter_commitments_only` projection. Both explicitly record:

```text
taskBodyPresent=false
ciphertextPresent=false
keyPresent=false
plaintextPresent=false
rawTaskHandlePresent=false
```

The final audit is signed by `audit_store` and binds the exact set of:

- six descriptor hashes;
- 23 transition hashes;
- pre-audit role-receipt hashes;
- six leakage-scan hashes;
- scorer projection hash; and
- promoter projection hash.

The top-level evidence contains 34 signed role receipts. Each receipt binds its producer identity,
actual process UID/GID, action, input/output commitments, timestamp, and explicit absence of task,
key, ciphertext, reusable decryption authority, and embedded private material.

## Evidence and independent verification

Evidence artifact:

```text
architect/evidence/synthetic-custody-os-boundary/evidence.json
```

| Property | Value |
|---|---|
| file size | 409,412 bytes |
| file SHA-256 | `0915b1a164eb14406b4d6d7a5287d17637e234e1225e9161a7dd6647aadacd0f` |
| internal evidence hash | `sha256:e60805faf56357ac85409f6f92613e823d9f3c81ceeabedc219ffd3c909e955d` |
| scenarios | 6 |
| signed custody transitions | 23 |
| signed role receipts | 34 |
| scorer projection | `sha256:06ae49f24ceed10867e2925b48528c2baa7cc6d9740b5ec0995e87747e689387` |
| promoter projection | `sha256:ba4b0f26804381abb5005b819e23f2c2b20837a50120b2132398d73da9b2feea` |
| final audit | `sha256:b30453cca9d5ddcb70ab5e02bf588c9d038226db729f650532327d7877abbb79` |

`scripts/verify-synthetic-custody-os-boundary.ts` is a standalone verifier. It:

- validates the closed evidence and nested record schemas;
- verifies the frozen evaluator-vault contract and all eight public principals;
- verifies every descriptor, nested capability, evaluator request, transition, evaluator receipt,
  role receipt, leakage scan, scorer/promoter projection, and final-audit hash and signature;
- reconstructs transition ordering and state continuity;
- verifies exact scenario action sequences and cleanup outcomes;
- checks descriptor/binding equality, unique per-scenario keys and ciphertexts, common fixed-plaintext
  commitment, process UID/GID mappings, role-denial challenge signatures, exact-retry stability, and
  final-audit set equality; and
- rejects raw opaque handle, private-key PEM, ciphertext, and authentication-tag fields in retained
  evidence.

It reports:

```json
{"evidenceHash":"sha256:e60805faf56357ac85409f6f92613e823d9f3c81ceeabedc219ffd3c909e955d","promotionAuthorized":false,"providerUsed":false,"repositoryPushPerformed":false,"researchEvidenceAuthorized":false,"roleReceiptCount":34,"scenarioCount":6,"transitionCount":23,"verified":true}
```

The tamper suite changes and then recomputes the top-level evidence hash for five nested objects:

1. descriptor plaintext binding;
2. custody-transition disposition;
3. role-receipt process UID;
4. scorer source-receipt lineage; and
5. final-audit transition lineage.

All five are rejected because a nested signature, hash, principal/process binding, or set-equality
check fails.

## Validation

Pinned runtime: Node `24.18.1`.

| Check | Result |
|---|---|
| `rtk npm test` | PASS: 134/134, fail 0, skip 0 |
| `rtk npm run test:coverage` | PASS: 134/134, fail 0, skip 0 |
| total coverage | lines 96.16%, branches 90.48%, functions 93.47% |
| `src/trust/synthetic-custody.ts` coverage | lines 98.70%, branches 83.90%, functions 97.78% |
| standalone custody verifier coverage | lines 99.64%, branches 98.04%, functions 100% |
| `rtk npm run build` | PASS |
| `rtk npm run check` | PASS |
| Python `py_compile` for both OS gate files | PASS |
| custody evidence verifier | PASS, `verified=true` |
| rehashed nested-tamper suite | PASS: all five rejected |
| `rtk git diff --check` before commit | PASS |
| actual private-key PEM search | zero matches |
| GitHub token and AWS access-key patterns | zero matches |
| actual `.env` / `.env.*` files | zero files |
| OpenAI-style pattern | only the frozen `sk-validation-mode-must-ignore-this` negative-test sentinel |
| remote-tracking ref | unchanged at `8b5f14400a7723c821bc54420e55da58dfa7601b` |

The full test suite includes only the already public development-only D_mine fixtures and synthetic
metadata. It does not access gate, final, temporal, withheld-public, multi-cause, Terminal-Bench, or
other real benchmark bodies. It performs no provider call.

## Exact implementation hashes

| Artifact | SHA-256 |
|---|---|
| `src/trust/synthetic-custody.ts` | `12365058d55ecf4b11e7de3a00490dceca7c9ac231b43fad9ec75ee265089044` |
| `evaluator/synthetic_custody_os_gate.py` | `f7956d965c131012cc4d46803e1cabd915705d51db9501ef5af59dccf7320869` |
| `scripts/synthetic-custody-os-worker.ts` | `da9c4a26f03499ae0802d1b7ff4bc7c04b264ab216c015f1a0c5e581ac54c58c` |
| `scripts/verify-synthetic-custody-os-boundary.ts` | `a7665b961b26c0f0132415cf0b96f79e169d49018b73d5176c6baa6d0e48f37b` |
| custody evidence schema | `8fdd36b63dfd7d82276cee5be2431c14bd581013b87981fec9b41fb6ea7ca8a4` |
| encrypted-envelope schema | `c274562847931e7445f7bc7d07206f2e01456818e8554afe7b4cc0710a83b1f1` |
| custody-transition schema | `43d544fd2aa9e471024134b8f370a1dddc7b703ff192c0068f0122f0fc98a7f9` |
| leakage-scan schema | `813cac1ff4b156aa440e353099fcbd6fbb6d2a246fa127b720e976870f29910a` |
| OS custody test | `4de28afe142320fc28c3a19851f15ae9f12d543d6580611167fedb2f9b6947e3` |
| standalone-verifier tamper test | `52204ded89a3977772afcb5669338e5a8073cbd93cfd0c84cbb7fc42a3492851` |

## TCB and residual limitations

Accepted earlier TCB assumptions remain:

- RootlessKit and subordinate-ID mapping;
- bubblewrap and `setpriv`;
- Linux namespaces, `SO_PEERCRED`, `/proc`, signals, and permission enforcement;
- host kernel, bootstrap Python process, filesystem and tmpfs behavior;
- Node, Python, OpenSSL/crypto implementation, and JSON-schema validator;
- role private-key custody; and
- the immutable evaluator, permission, safety, budget, audit, promotion, and optimizer boundaries.

Additional narrow limitations:

- cleanup is crypto-erasure plus file removal, not proof of physical media sanitization;
- the scan covers declared mounted surfaces, not an adversarial host root or kernel;
- a malicious vault or compromised vault signing key can fabricate signed custody evidence;
- the fixed inert payload is not a benchmark confidentiality test;
- one local host does not establish distributed consistency or production availability;
- random key/nonce generation makes artifact hashes run-specific; the verifier checks structural,
  cryptographic, and lifecycle invariants rather than requiring byte-identical evidence; and
- no result here supports a harness-evolution or self-improvement claim.

## Requested ruling

Please issue exactly one primary decision:

```text
DECISION: APPROVE | REVISE | BLOCK
```

Please separately rule on:

1. cryptographic descriptor, AAD, capability, request, and commitment binding;
2. durable reserve/materialization/cleanup ordering and exact-retry non-rematerialization;
3. vault-only key/envelope/journal access and evaluator-only read-only plaintext projection;
4. normal, evaluator-crash, vault-crash, timeout, rejection, and response-loss cleanup;
5. wrong-principal denial and finite byte-leakage evidence;
6. nested signature/hash verification and final-audit completeness;
7. claim discipline and residual TCB limitations; and
8. the next smallest local deterministic scope, if any.

If any material property is unsupported, return `REVISE` or `BLOCK` with the exact missing invariant,
attack, evidence, or test. Do not infer authorization for a Git push, provider/API use, real
benchmark data, research evaluation, candidate selection, promotion, deployment, publication, or
empirical claim unless it is explicitly stated in the ruling.
