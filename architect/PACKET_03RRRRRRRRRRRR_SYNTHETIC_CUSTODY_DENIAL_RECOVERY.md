# Architect Packet 03RRRRRRRRRRRR — Durable denial audit and denial-to-cleanup recovery

Date: 2026-07-31  
Requested decision: `APPROVE`, `REVISE`, or `BLOCK` for this correction only

## Review boundary

Review only the three blocking findings from the Round 03RRRRRRRRRRR `REVISE`:

1. a first-seen, correctly signed request reusing a consumed capability was rejected without a
   vault-signed denial record;
2. restart was undefined after durable `deny_release` but before `cleanup_started`; and
3. restart was undefined after durable `deny_materialization` but before `cleanup_started`.

The correction adds one state-preserving authoritative denial for each first-seen fresh reuse
request, makes an exact retry of that request idempotent, adds both denial-to-cleanup recovery paths,
and tests both new crash windows with actual SIGKILL.

The payload remains one fixed 64-byte inert sequence with no task or research semantics. This packet
does not contain or authorize a real task body, verifier, label, expected answer, benchmark path,
gate/final/temporal/withheld-public data, provider credential, model call, B0–B6 run, research
evaluation, attribution experiment, candidate selection, promotion, deployment, publication, Git
push, or empirical confidentiality/security/performance/generalization/evolution/self-improvement
claim.

## Source identity and publication state

| Item | Identity |
|---|---|
| Prior correction commit | `e7df5d229760c75bd2bd44ca1679889db152c0d4` |
| Prior Architect response | `.codex/gpt-pro-architect/responses/response-3rrrrrrrrrrr.md` |
| Prior response SHA-256 | `248c180aff8e617300b95d03b9fd0b19cb74e2d334a8af134994c17ea95d495e` |
| This correction commit | `4e0125bc5ccbe6e3e340d05166d0718c0bc0ce99` |
| This correction tree | `83b512a6cb2a9499a047f8a6592fb042fb36d7cb` |
| Remote-tracking `origin/main` | `8b5f14400a7723c821bc54420e55da58dfa7601b` |

The complete deterministic suite and the post-suite static/audit checks were run from the clean local
correction commit. The worktree was clean afterward. No push occurred.

## 1. First-seen consumed-capability denial

### Durable transition shape

Every custody transition now includes two schema-required, hash-bound, vault-signed fields:

```text
requestActor: PrincipalIdentity | null
denialReason:
  release_request_rejection
  | consumed_capability_reuse
  | cryptographic_rejection
  | null
```

For a correctly signed first-seen request whose capability already has an allowed
`reserve_release`, the journal appends:

```text
deny_release(
  requestCommitment = SHA-256(canonical complete request),
  requestActor = frozen evaluator identity,
  capabilityCommitment = consumed capability hash,
  stateBefore = current custody state,
  stateAfter = current custody state,
  stateSuccessor = false,
  decision = denied,
  reasonCode = REPLAY_DETECTED,
  denialReason = consumed_capability_reuse,
  priorTransitionHash = current signed transition head,
  priorJournalHead = current append-only journal head,
  recordedBy = frozen vault identity
)
```

The record has no `releaseId`, reservation successor, or materialization successor. Transition
verification requires a request commitment and request actor to appear together, requires that actor
to be the frozen evaluator identity, and restricts each denial action to its allowed stable denial
reason.

The full signed request commitment binds request ID, request hash, sequence, nonce, requested time,
actor, evaluator public principal and attestation, and the complete signed consumed capability. The
transition additionally exposes and signs the request actor and capability commitment so the
authority record does not rely on an implicit lookup to identify them.

### Exact retry versus a different fresh request

The journal first looks up the complete request commitment:

- if that exact request already has a disposition, it returns the original denial and appends
  nothing;
- if the request is new and structurally/authentically valid but reuses the consumed capability, it
  appends one new state-preserving `deny_release`;
- another fresh request has a different request commitment and therefore receives its own one-time
  denial record.

This preserves the required invariant:

```text
no second reservation
no second materialization
one denial per first-seen fresh request
zero additional transitions for an exact retry of that denied request
```

### Executed evidence

Four correctly signed fresh requests were executed after:

1. normal completion;
2. cleanup completion;
3. vault restart; and
4. response loss.

Each changed request ID, sequence, nonce, request hash, and evaluator signature while retaining the
consumed capability. For every condition:

| Invariant | Observed |
|---|---|
| first attempt result | `REPLAY_DETECTED` |
| first attempt append delta | exactly `+1` transition |
| denial action/reason | `deny_release` / `consumed_capability_reuse` |
| state change | none; `stateBefore == stateAfter` |
| reservation count | exactly `1` |
| materialization count | exactly `1` |
| exact retry append delta | `0` |
| exact retry transition hash | identical to first denial hash |
| second reservation/materialization | none |

The request-signing receipt, first denial receipt, and exact-retry receipt are separate signed role
receipts. The exact retry receipt commits to the same denial transition and journal head but has its
own observation time.

## 2. Deterministic denial-to-cleanup recovery

`beginCleanup` now requires the latest durable decision to match the frozen recovery reason and
request commitment:

```text
deny_release(
  denialReason=release_request_rejection
)
→ begin_cleanup(reason=capability_rejection)
→ cleaned
```

and:

```text
deny_materialization(
  denialReason=cryptographic_rejection
)
→ begin_cleanup(reason=cryptographic_rejection)
→ cleaned
```

The second recovery starts directly in the cleanup worker. It does not call materialization,
decryption, or evaluator consumption again. Cleanup start is durably synchronized before deletion;
file removal is idempotent; the terminal cleanup is appended only after plaintext, key, and envelope
paths are absent.

## 3. Actual SIGKILL injection

Two crash flags were added to the vault worker:

```text
crashAfterDenialCommit
crashAfterMaterializationDenialCommit
```

They call `SIGKILL` only after the journal append has synchronized and recovery has reread that
transition as the durable head, but before an operation result, role receipt, or `cleanup_started`
record is produced.

### After durable `deny_release`

An expired signed capability causes the live reserve path to append a request-bound
`deny_release(release_request_rejection)`. The worker is then killed. A fresh recovery process
produces:

```text
seal
deny_release
begin_cleanup(capability_rejection)
cleanup
```

Observed counts before versus after recovery:

```text
reservations:     0 → 0
materializations: 0 → 0
denials:              1
cleanup starts:       1
terminal cleanups:    1
```

### After durable `deny_materialization`

The live vault path reserves once, begins materialization once, mutates the private envelope
authentication tag, reaches authenticated decryption rejection, appends
`deny_materialization(cryptographic_rejection)`, and is killed before cleanup starts. A fresh
recovery process produces:

```text
seal
reserve_release
begin_materialization
deny_materialization
begin_cleanup(cryptographic_rejection)
cleanup
```

Observed counts before versus after recovery:

```text
reservations:     1 → 1
materializations: 1 → 1
denials:              1
cleanup starts:       1
terminal cleanups:    1
```

Neither case creates an evaluator plaintext mount or evaluator receipt. Both terminate with no key,
envelope, or plaintext file. Recovery does not retry decryption.

## 4. Complete crash matrix

The persisted evidence now contains seven actual SIGKILL cases:

| Crash boundary | Terminal cleanup reason | Reservations before/after | Materializations before/after | Denials |
|---|---|---:|---:|---:|
| after reservation commit | `reservation_abandoned` | 1 / 1 | 0 / 0 | 0 |
| after `deny_release` | `capability_rejection` | 0 / 0 | 0 / 0 | 1 |
| after materialization start | `materialization_prewrite_abandoned` | 1 / 1 | 1 / 1 | 0 |
| after `deny_materialization` | `cryptographic_rejection` | 1 / 1 | 1 / 1 | 1 |
| after plaintext deletion | `cleanup_interrupted_after_plaintext_delete` | 1 / 1 | 1 / 1 | 0 |
| after private deletion | `cleanup_interrupted_after_private_delete` | 1 / 1 | 1 / 1 | 0 |
| after cleanup commit | `cleanup_acknowledgement_loss` | 1 / 1 | 1 / 1 | 0 |

Every case has one cleanup start, one terminal cleanup, zero duplicate materializations, no evaluator
mount or receipt, zero declared leakage-scan matches, and no residual private file.

## 5. Independent verifier and final audit

The independent verifier now reconstructs and checks:

- each fresh request's evaluator signature and complete request hash;
- the denial transition referenced by `denialTransitionHash`;
- request commitment, request actor, capability commitment, stable denial reason, and unchanged
  state;
- first-attempt transition delta `+1`;
- exact-retry transition delta `0`;
- exact-retry denial hash equality;
- one reservation and at most one materialization;
- both new crash action sequences and denial reasons;
- reservation and materialization counts before and after recovery;
- exactly one cleanup start and terminal cleanup;
- no evaluator mount/receipt and no residual private file;
- all nested transition and role-receipt signatures;
- all descriptor, transition, receipt, leakage-scan, projection, and final-audit set equalities.

The final audit includes every new denial and denial-crash transition through exact transition-hash
set equality. It includes all exact-retry role receipts through exact role-receipt-hash set equality.

Fourteen rehashed nested-tamper cases now cover the previous nine cases plus:

1. fresh-denial lineage;
2. exact-retry transition disposition;
3. exact-retry transition-count accounting;
4. `deny_release` recovery reservation-count accounting; and
5. `deny_materialization` recovery materialization-count accounting.

Recomputing the outer evidence hash repairs none of them.

## 6. Evidence summary

Evidence path:

```text
architect/evidence/synthetic-custody-os-boundary/evidence.json
```

| Item | Value |
|---|---:|
| scenarios | 6 |
| first-seen fresh consumed-capability denials | 4 |
| exact retries of those denials | 4 |
| SIGKILL crash cases | 7 |
| live cryptographic/binding attacks | 21 |
| signed custody descriptors | 34 |
| signed custody transitions | 183 |
| top-level signed role receipts | 197 |
| role receipts committed by final audit | 196, excluding the finalizer's own receipt |
| signed leakage scans | 34 |
| evidence internal hash | `sha256:40f656c2df99f68b18b49dfc5bd9f39a5aee154a24038dfe94b7ab4cf0e4f4cd` |
| evidence file SHA-256 | `665a5e76a2aa1f839f48d0bcbc7ada404a4ca9d5ecc8e2429e8a63372c0bb892` |

The existing twenty-one live attacks and eight-principal OS boundary remain unchanged in scope.

## 7. Validation from the clean correction commit

Pinned runtime: Node `24.18.1`.

| Check | Result |
|---|---|
| clean-commit `rtk npm test` | PASS: 135/135, fail 0, skip 0 |
| `rtk npm run test:coverage` | PASS: 135/135, fail 0, skip 0 |
| total coverage | lines 96.03%, branches 90.42%, functions 93.48% |
| `src/trust/synthetic-custody.ts` | lines 94.72%, branches 81.17%, functions 95.92% |
| independent custody verifier | lines 99.93%, branches 98.96%, functions 100% |
| `rtk npm run build` | PASS |
| `rtk npm run check` | PASS |
| Python `py_compile` for both OS gates | PASS |
| independent evidence verifier | PASS, `verified=true` |
| rehashed nested-tamper suite | PASS: all 14 rejected |
| evidence leakage scans | PASS: 34 signed scans, all declared counts zero |
| clean worktree check | PASS |
| actual private-key PEM files | zero |
| GitHub/AWS key patterns | zero actual matches |
| `.env` / `.env.*` files | zero |
| OpenAI-like strings | existing frozen test sentinels only |
| provider/model calls | zero |
| remote-tracking ref | unchanged at `8b5f14400a7723c821bc54420e55da58dfa7601b` |

The complete suite uses only existing public development fixtures and synthetic metadata. It does
not access gate, final, temporal, withheld-public, multi-cause, Terminal-Bench, or any real task body.

## 8. Exact artifact hashes

| Artifact | SHA-256 |
|---|---|
| `src/trust/synthetic-custody.ts` | `2a55901246d0dc6ca42f0421cd9f5624e15e1103d84b9eefdc228fbe40dc0bfb` |
| `evaluator/synthetic_custody_os_gate.py` | `7d0d76bb5350bfa0d4f635acfd7d96bf1369ea768cec2424b998bdded399570d` |
| `scripts/synthetic-custody-os-worker.ts` | `da4798f8ad89c8ebeed70bfbe35a17c75f3ea3bace86f95a5ac17145919b87b4` |
| `scripts/verify-synthetic-custody-os-boundary.ts` | `846b63ee6f0a5b4dceb3907f1e2b61ddf22c554835228a5403d446831a8e3acf` |
| transition schema | `b0498a9be929534c58b5d07adc24453fb2f58811483bccf9cf98d70283209e88` |
| OS evidence schema | `9dd2870bdbd10fc38a4c0598317c89c70542f82904c9143fd280a7d84ab7e200` |
| core custody test | `8957e7da1a17e2794dd4afe24b42c2f9ec520e26212383a3a039b60a0744b356` |
| OS custody test | `438e42ea3f02cf6c6786c97a6ca2cf9e411bcb3f6ec6d48362778385654edb89` |
| nested-tamper test | `24d71126bc3cc2d62a4638ad228f368bd99403b6d17786de06ef0be255d860fb` |

## 9. TCB and claim limits

The accepted local TCB remains the host kernel/bootstrap administrator, RootlessKit and subordinate
ID mapping, bubblewrap/setpriv, filesystem/tmpfs semantics, Node/Python/OpenSSL/schema validator,
role-key custody, and immutable trust-plane authorities.

This remains a local deterministic synthetic-custody result. File deletion is not physical-media
sanitization. Finite scans are not a general confidentiality proof. A compromised host, kernel,
vault key, trusted worker, or unobserved sink is outside the demonstrated boundary. The fixed inert
payload does not establish real benchmark confidentiality, provider interoperability, performance,
generalization, evolution, or self-improvement.

## Requested ruling

Please issue exactly one primary decision:

```text
APPROVE
REVISE
BLOCK
```

Please assess separately:

1. Does one vault-signed, state-preserving denial per first-seen consumed-capability request, followed
   by exact-retry reuse without append, satisfy the preserved authoritative access-history contract?
2. Do the two actual post-denial SIGKILL cases close recovery before `cleanup_started` without
   retrying decryption or changing reservation/materialization counts?
3. Do the independent verifier, final-audit set equalities, and fourteen nested-tamper cases bind the
   new denial, retry, and recovery evidence sufficiently?
4. Are any blocking contradictions left within this narrow synthetic-custody correction?
5. If approved, what is the next smallest authorized local deterministic scope?

