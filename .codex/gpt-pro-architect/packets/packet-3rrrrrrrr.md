# Architect Packet 03RRRRRRRR — Durable globally serialized evaluator-vault state

Date: 2026-07-31  
Requested decision: `APPROVE`, `REVISE`, or `BLOCK` for this narrow correction only

## Review boundary

Review only the local deterministic, body-free correction authorized by the Round 03RRRRRRR
`REVISE`. The correction replaces in-memory task authority with one durable globally serialized
vault-state journal and adds writer leasing/fencing, commit-before-release, restart reconstruction,
and crash recovery.

No real task body, verifier logic, label, task path, gate/final/temporal/withheld-public split, model
call, provider credential, research scheduler, B0–B6 run, attribution experiment, candidate
selection, promotion, deployment, release, or empirical claim is present.

The accepted prior principal separation, independent authorship, historical contamination,
included-record admission, capability binding, one-way release projection, and identifier-commitment
access records remain in force.

## Prior decision and local checkpoint

- prior decision: `REVISE`
- prior response:
  `.codex/gpt-pro-architect/responses/response-3rrrrrrr.md`
- prior response SHA-256:
  `a54958e0e9888aff29f644c94f3b1e0cebb53442be4ec435cd02f4c0995eefcb`
- correction commit:
  `ed498251a2382e06a147152604ec52346029c6ed`
- correction tree:
  `2d453ec56c6454212ed5ed0d81e55ddf004d4e58`
- commit subject:
  `fix: make evaluator vault state durable`
- remote `origin/main`:
  `8b5f14400a7723c821bc54420e55da58dfa7601b`
- push performed in this round: no
- worktree immediately after the correction commit: clean

The packet and its transport copy are created after that clean code checkpoint and are not represented
as part of the implementation tree.

## Blocking-finding closure

| Round 03RRRRRRR finding | Correction |
|---|---|
| task state survives only in memory | one signed authoritative CAS journal reconstructs `created → sealed → unlocked → evaluated → scored` |
| access evidence and private state can diverge | every first-seen decision is embedded in the same `VaultStateTransitionRecord` that advances or preserves task state |
| two processes can act on one prior state | exclusive expected-head CAS plus durable lease epochs and in-journal writer fences |
| stale writer can resume | acquire/renew must be fenced in the authoritative journal; a transition must directly extend the exact current fence |
| release may race durability | file sync, exclusive publication, directory sync, committed-head reread, full journal verification, then lease release and response |
| restart can duplicate unlock/evaluate/score | full state, capability use, accepted sequence/nonce, evaluation commitment, score commitment, and exact-request disposition are reconstructed |
| response-loss retry is ambiguous | exact byte-identical authenticated retry returns the committed result or the same stable denial; it never appends a second transition |

## One authoritative state projection

The selected source of truth is the append-only `vault_state_cas_journal`.

It contains two signed payload types:

1. `VaultWriterFenceRecord`
   - coordination/fencing metadata only;
   - never changes task state;
   - binds the active lease owner commitment, epoch, lease record, lease-journal head, prior
     authoritative-journal head, and fence time.
2. `VaultStateTransitionRecord`
   - the only task-state and access-decision authority;
   - embeds the accepted `VaultAccessRecord`;
   - must directly extend the exact latest writer fence;
   - conditionally advances one task head.

The lease journal is not a second task-state projection. It coordinates owners and records
`acquire`, `renew`, and `release`; only a fence/transition in the authoritative state journal can
authorize or change task state.

```text
lease acquire (CAS, fsync, head verify)
→ authoritative-journal epoch fence (CAS, fsync, head verify)
→ recover and verify full state
→ exact-retry lookup or request validation/successor computation
→ lease renew and current-owner assertion
→ authoritative-journal renewed-lease fence
→ state/access transition at exact expected head
→ fsync record
→ fsync containing directory
→ reread exact committed head
→ reconstruct and verify full journal
→ release lease
→ return commitment-only result or stable denial
```

## Transition binding

Each `VaultStateTransitionRecord` binds all items required by the prior decision:

- protocol ID;
- contract ID and contract hash;
- request and request-ID commitments;
- opaque task-handle commitment;
- included authorship-transition hash;
- prior per-task state-record hash;
- prior authoritative vault-journal head;
- action;
- actor role, actor-identity commitment, and actor-key commitment;
- capability commitment where supplied;
- input commitment where supplied;
- released commitment set and its aggregate result commitment;
- state before and after;
- whether the record is a task-state successor;
- lease owner commitment, epoch, lease record, and lease-journal head;
- occurrence time, operational commit time, vault identity/key, record hash, and signature.

The frozen evaluator-vault contract now includes exact `stateAuthorityPolicy` and
`writerLeasePolicy` objects. Their closed schemas require:

- one authoritative CAS journal;
- embedded access decisions;
- per-task and global prior-head binding;
- writer fencing;
- direct fence-to-transition linkage;
- file and directory sync plus committed-head verification before release;
- exact committed retry disposition;
- owner commitment and monotonic lease epoch;
- acquire/renew/release;
- bounded TTL and next-epoch expiry recovery;
- renewal before transition; and
- fail-closed behavior without an exclusive fenced epoch.

## Atomic successor rule

`CasAppendOnlyLog.appendExpected`:

1. verifies the complete prior hash chain;
2. requires the observed head to equal the caller's expected head;
3. writes a canonical temporary record with exclusive create;
4. synchronizes the record;
5. publishes it with an exclusive hard link to the sequence path;
6. removes the staging name;
7. synchronizes the containing directory; and
8. rereads/verifies the head.

Competing writers targeting the same sequence cannot both create the final path. The loser receives
`CONFLICT`; there is no automatic rebase.

If a process dies after link publication but before staging-name removal, recovery accepts only one
same-directory temporary hard link with the exact final inode, removes that staging name, synchronizes
the directory, and then requires link count one. External or ambiguous hard links fail closed.

Per-task reconstruction separately requires every successor to name the exact prior task-state record
hash and state. Fences may advance the global journal head but never the task head.

## Durable lease and stale-writer fencing

Each lease record is vault-signed and binds:

- protocol/contract;
- owner commitment;
- monotonic epoch;
- action (`acquire`, `renew`, `release`);
- prior lease-record hash and prior lease-journal head;
- acquisition, validity, release, and record times; and
- vault principal/key.

Rules:

- an unexpired active epoch rejects acquisition;
- only the exact current owner/epoch/record/head may renew or release;
- renewal must extend validity;
- an expired or released epoch may be followed only by `epoch + 1`;
- an old handle is rejected after renewal, release, or next-epoch acquisition;
- restart reconstructs and verifies the complete lease chain;
- inability to establish current ownership is `CONFLICT`, not an implicit write.

The resource-side fencing token is the signed `VaultWriterFenceRecord` in the authoritative state
journal. Acquisition alone cannot mutate a task. A renewed lease is fenced again, and the transition
must immediately extend that exact fence with identical owner/epoch/lease commitments. Once a later
epoch fence commits, an older prepared transition has an obsolete expected head and cannot publish.

## Recovery contract

| Crash boundary | Authoritative state after restart | Retry disposition |
|---|---|---|
| before transition append | no new transition; fence may remain | after abandoned epoch recovery, execute once |
| during append before exclusive publish | staging record is non-authoritative | execute once |
| after hard-link publish before staging unlink | final inode is recovered only from one exact staging link | return committed result |
| after publish/unlink before directory sync | recovered final record is directory-synchronized | return committed result |
| after record/directory sync before head verification | committed record is fully reverified | return committed result |
| after durable append before lease release/response | transition remains authoritative; expired holder is superseded by next fenced epoch | return committed result |
| after lease release before client acknowledgment | transition and release remain durable | return committed result |
| while lease is held and process is killed | active epoch blocks until expiry; next owner acquires exactly `epoch + 1` and fences it | no duplicate successor |

All exact retries use `sha256(canonical full signed request)` to locate the prior disposition.
First-seen denials are durable; an exact denied retry returns its original failure code without a
second record. A fresh request uses normal sequence/state validation and is recorded as a new denial
when structurally recordable.

## Adversarial evidence

Focused test:

```text
rtk npx -y node@24.18.1 --import tsx --test test/evaluator-vault-contract.test.ts
```

Result: `11/11` pass.

The focused suite includes:

1. frozen principal, mount, action, state-authority, and lease policies;
2. accepted independent-authorship and contamination/admission behavior;
3. role/key/protocol/capability/state/release denial behavior;
4. deterministic stale/expired lease and next-epoch recovery;
5. obsolete expected-head and same-head CAS contention;
6. two actual Node processes contending for one writer lease;
7. a lease-holder process killed with `SIGKILL`, followed by exact next-epoch recovery;
8. two actual vault child processes racing different unlock requests from the same sealed state;
9. a third fresh vault process observing `unlocked` and rejecting a second unlock;
10. two independent in-process vault objects racing the same state;
11. restart reconstruction and rejection of fresh second unlock, evaluation, and score;
12. evaluation from sealed state and score from unlocked state;
13. exact retry after restart returning the committed score disposition;
14. crash injection before append, during hard-link publication, after publish before sync, after
    sync before verification, after durable commit before release, and after release before
    acknowledgment;
15. one unlock successor across every crash/retry case;
16. recovery of the published record's abandoned staging hard link; and
17. absence of the raw opaque task handle in the state journal.

The process tests use separate Node child processes under the same local development UID. They prove
cross-process file/CAS behavior, not fresh distinct-UID mount enforcement. Only ephemeral deterministic
fixture signing material is transferred through the private parent/child IPC channel; it is not written
to repository artifacts or logs.

## Full validation

Pinned runtime: Node `24.18.1`.

```text
rtk npx -y node@24.18.1 --import tsx --test test/**/*.test.ts
```

Result:

```text
tests 128
pass 128
fail 0
cancelled 0
skipped 0
todo 0
```

Additional checks:

| Check | Result |
|---|---|
| `rtk npm run build` | PASS |
| `rtk git diff --check` before commit | PASS |
| snapshot publication verifier | PASS: paths 510, exposures 632, embedded 109 |
| historical publication verifier | PASS: roots 4, commits 64, trees 456, blobs 878, secrets 0 |
| correction-file private-key/live-token pattern scan | zero matches (`rg` exit 1) |
| actual `.env` / `.env.*` search excluding samples | zero files (`rg` exit 1) |
| remote ref after validation | unchanged at `8b5f14400a7723c821bc54420e55da58dfa7601b` |

No provider/API action or benchmark-body access occurred.

## Replacement hashes

| Artifact | SHA-256 |
|---|---|
| `src/storage/cas-append-only-log.ts` | `7ce7732126fffec462c601810bdbd1fc3a889135c8d121c7aa539b239d0263fd` |
| `src/trust/evaluator-vault-contract.ts` | `a316b0ac7e78f4768ce3b07a51a51cd144d2ce15cdb8ca1c31a479b9b05a1296` |
| `src/trust/evaluator-vault.ts` | `2d1845c9781a4342e4375e6e7e9d279843d6cf02aacb2d4caa202036c6cc4048` |
| `src/trust/vault-writer-lease.ts` | `56f2155348d49780b1273ede024e6ae8c7c1e8c4c8f9b57e07a843684195ffee` |
| `schemas/evaluator-vault-contract.schema.json` | `8755f078eece284020ea9d2cd56763c4724165975dc067ae986d82493c124dcb` |
| `schemas/vault-state-transition.schema.json` | `4a165b317d21a1fefa4c76e5f9f651e3a61137653b965d3706415dcb76efffae` |
| `schemas/vault-writer-fence.schema.json` | `51598eeaf48fb550ea416a41b0ad8b4346d0acaf356e2ae2e084c527cf80ec89` |
| `schemas/vault-writer-lease.schema.json` | `931e8920364ec19bed389bc81f54e54921d8754213f725d8055e4c0972c1fad7` |
| `test/evaluator-vault-contract.test.ts` | `1c5510d2158f9f294ee3f114d82060256d53b907c0e141c00c1303cfe45cd180` |
| `test/fixtures/vault-lease-worker.ts` | `20d1d3f08d1ceb30e7b1fc72c271009abd16f7d75f77037e21230906d1fdacbe` |
| `test/fixtures/vault-transition-worker.ts` | `9af94eb4b1e1c50508d7b800bb0847840bb62223d36ce5ed4bb877ec0d40d98e` |
| `docs/architecture/evaluator-vault-contract.md` | `10ff66f0905c2274f674dd228ac58c1e9f2a6dd497d3790c4738b69d110078a1` |

## Preserved accepted boundaries

- benchmark reviewer still receives neither raw handle nor author identity;
- vault admission still requires the exact signed included transition and predecessor;
- historical public contamination still denies all ten restricted use classes through aliases,
  dependencies, wrappers, provenance, content hashes, and Git objects;
- unlock capability remains bound to protocol, contract, task, included authorship, frozen evaluator,
  single use, expiry, and nonce;
- releases remain commitment-only and one-way;
- denied decisions release zero fields and preserve task state;
- untrusted request IDs, raw key IDs, and raw task handles are absent from durable decision records;
- evaluator, permission/safety policy, benchmark data, budget, model identity, audit policy, tool
  implementation, middleware, optimizer, promotion policy, and provider path remain unchanged.

## Residual limits and claim discipline

- This is synthetic body-free contract evidence, not confidentiality evidence for real benchmark
  contents.
- The child-process tests share the local development UID. The frozen eight-role mount table was not
  newly exercised in this correction.
- The trusted host clock governs lease expiry. Clock rollback, a live-but-stalled owner, host root,
  kernel, filesystem loss, and vault-key compromise remain TCB/availability risks.
- The logs are tamper-evident under the trusted key/host assumptions, not tamper-proof.
- No distributed consensus or replicated durable store is claimed.
- No Gate 3, provider, benchmark, performance, generalization, containment, security certification,
  or self-improvement claim follows from this packet.

## Questions for the Architect

1. Does the single authoritative CAS journal, with embedded access decisions and per-task predecessor
   hashes, close complete task-state reconstruction across restart?
2. Do lease acquire/renew records plus resource-side epoch fences and direct fence-to-transition
   binding establish the required cross-process stale-writer rejection?
3. Does exclusive publication, file/directory synchronization, committed-head reread, and full
   reconstruction before lease release establish commit-before-release?
4. Do the actual child-process transition race, third-process successor observation, killed-holder
   recovery, fresh second unlock/evaluate/score denials, obsolete-head test, and six crash boundaries
   close the requested adversarial matrix?
5. Are the accepted authorship, contamination, admission, capability, release, and access-record
   contracts preserved without expanding the authorized scope?

Please return `APPROVE`, `REVISE`, or `BLOCK` for this narrow durable-state correction. Even an
`APPROVE` should not authorize provider/API use, real task bodies, research/B0–B6, selection,
promotion, deployment, publication, release, or empirical claims unless stated separately.
