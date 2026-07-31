# Architect Packet 03RRRRRRRRR — Eight-principal evaluator-vault OS boundary

Date: 2026-07-31
Requested decision: `APPROVE`, `REVISE`, or `BLOCK` for this narrow integration only

## Review boundary

Review only the local deterministic, body-free OS-principal integration authorized by the Round
03RRRRRRRR `APPROVE`.

The implementation runs these eight frozen roles under distinct subordinate UID/GID principals:

1. `protocol_author`
2. `benchmark_author`
3. `benchmark_reviewer`
4. `vault`
5. `evaluator`
6. `scorer`
7. `promoter`
8. `audit_store`

It exercises the complete synthetic commitment-only authorship and evaluator-vault workflow,
authenticated Unix transport, durable vault state, two crash/recovery boundaries, contention, replay,
and wrong-principal denials.

No real task body, verifier logic, label, task path, gate/final/temporal/withheld-public split, model
call, provider credential, research scheduler, B0–B6 run, attribution experiment, candidate
selection, promotion, canary, deployment, release, publication, or empirical claim is present.

## Source identity and scope

| Item | Identity |
|---|---|
| Prior approved checkpoint | `43c8a1dee11dc3d655d68a662a91a3271e6277e2` |
| OS-boundary implementation commit | `864d211484f802ac0d82fe9d3c21382e0ad48e80` |
| OS-boundary implementation tree | `afb3b172510cee31df04a78e55bdff71b16bb030` |
| Current local head | `875e3325d319361019efa9ccf6e28f97a351dd29` |
| Current local tree | `d42bbd91f2909f6ea2971989fe2edad648b8ed21` |
| Remote-tracking `origin/main` | `8b5f14400a7723c821bc54420e55da58dfa7601b` |

The commit after the implementation is documentation-only: it records OxyGent at exact SHA
`cd96268de5814dfb4e0444cfd687f97508cf996a` as adjacent prior art. It does not alter this integration
or its evidence. No push occurred.

## Boundary defect found and corrected

The integration exposed a real projection defect in the previously accepted in-process authorship
path. The full `IndependentAuthorshipContract` contains the benchmark author's public principal.
Passing that full object to the reviewer therefore contradicted the intended blinded boundary even
though the raw handle and task body were absent.

The correction adds a signed/hash-bound `BlindedReviewerContractProjection` containing only:

- schema and record type;
- protocol ID;
- contract ID and hash;
- expected reviewer identity;
- assignment commitment;
- author-commitment hash.

It excludes author identity, raw task handle, body, labels, paths, verifier logic, vault capability,
and other role keys. The reviewer decision is now created and verified from that projection.
Contract tests prove:

- the projection is schema-valid and leak-free;
- the projected decision is identical to the legacy valid decision;
- a wrong reviewer is rejected; and
- the full contract is not present in the reviewer's OS-stage input.

The evidence records the exact reviewer input filenames:

```text
config.json
own-public.json
review.json
reviewer-projection.json
```

with `authorIdentityPresent=false`, `rawTaskHandlePresent=false`, and
`privateKeyPresent=false`.

## Principal, key, and mount enforcement

The gate uses RootlessKit subordinate IDs plus bubblewrap. The namespace and mapped host identities
observed in the evidence are:

| Role | namespace UID/GID | mapped host UID |
|---|---:|---:|
| protocol_author | 1301 | 232372 |
| benchmark_author | 1302 | 232373 |
| benchmark_reviewer | 1303 | 232374 |
| vault | 1304 | 232375 |
| evaluator | 1305 | 232376 |
| scorer | 1306 | 232377 |
| promoter | 1307 | 232378 |
| audit_store | 1308 | 232379 |

Each private role key directory is owned by exactly that role, mode `0700`; its `private.pem` is
mode `0600`. Private keys exist only in ephemeral test roots. Repository evidence contains public
keys and signatures, not private keys.

Normal workflow sandboxes receive:

- read-only runtime, schema, governance, Python, and Node inputs;
- read-only public principal records;
- read-only access to only the current role's key directory;
- read-only role-specific `/input`;
- writable role-specific `/state`;
- the shared Unix-socket IPC directory;
- empty tmpfs `/tmp`;
- no network namespace;
- no inherited environment except fixed deterministic variables; and
- no capabilities after `setpriv`, `no_new_privs=1`, empty bounding/inheritable/ambient sets.

Only `vault` receives writable `/vault-state`. The other seven roles cannot read or write that
journal. A whole-root `/protected` mount is added only to the negative probe process so denial can
be observed; it is not present in normal workflow stages.

The recorded role probes show:

- all eight roles can read only their own role key;
- every attempted foreign key/input/journal read and write is denied;
- all eight network probes fail with `Network is unreachable`;
- all roles run with effective capabilities `0000000000000000`; and
- each of the seven non-vault roles is denied signal and ptrace access to the live vault process.

The vault self-probe does not count self-signal/self-ptrace as a foreign-principal denial.

## Authenticated transport

The transport is one Unix socket owned by the vault UID in a sticky IPC directory.

- The client verifies server `SO_PEERCRED` is exactly vault UID/GID.
- The server verifies peer `SO_PEERCRED` UID/GID matches the claimed role.
- The vault verifies the signed request, role, key, protocol, sequence, nonce, capability, state, and
  release class.
- The server starts a fresh vault worker process for each request, forcing reconstruction from the
  authoritative CAS journal rather than process memory.
- All seven non-vault principals are denied socket unlink and replacement while the server is live.
- No error detail, private key, body, handle, label, path, or verifier logic is returned by the
  transport.

The evidence contains 20 authenticated transport transactions and 16 signed vault access records.
Expected logical denials include:

| Case | Result |
|---|---|
| evaluate before unlock | `INVALID_STATE_TRANSITION` |
| protocol mismatch | `PROTOCOL_MISMATCH` |
| capability substitution | `HASH_MISMATCH` |
| evaluator request signed by wrong key | `AUTHENTICATION_FAILED` |
| losing concurrent unlock | `CONFLICT` |
| fresh duplicate unlock | `INVALID_STATE_TRANSITION` |
| scorer attempts evaluate | `AUTHORIZATION_DENIED` |
| benchmark author attempts audit | `AUTHORIZATION_DENIED` |
| promoter attempts score | `AUTHORIZATION_DENIED` |

The valid path is:

```text
assignment
→ author commitment
→ blinded review
→ reviewer decision
→ included authorship transition
→ vault create
→ vault seal
→ one-time unlock
→ evaluator commitment
→ scorer commitment
→ promoter commitment projection
→ final audit receipt
```

`promotionAuthorized=false`, `providerUsed=false`, and
`researchEvidenceAuthorized=false` are signed into the final evidence.

## Contention, restart, and actual crash evidence

The authoritative journal is written only by namespace UID `1304`; evidence reports
`journalOwners=[1304]`.

Two concurrent vault worker processes race different unlock requests from the same sealed state.
Exactly one succeeds and one receives `CONFLICT`. A new process reconstructs `unlocked`, rejects a
fresh duplicate unlock, completes evaluation and score, and returns an exact evaluation retry
without a second transition.

Actual `SIGKILL` is injected at two distinct durability phases:

1. `after_durable_commit_before_release`
2. `during_state_append`

Both killed workers exit unacknowledged with code `137`. A new server and fresh vault process then
reconstruct the journal:

- the already durable transition is returned exactly once without a duplicate;
- the abandoned same-directory hard-link staging record is observed, recovered, synchronized, and
  removed;
- each recovery produces exactly one authoritative transition; and
- final state head is
  `sha256:87b00bd1083adc3c30b33e94a89d6d44694b94e832448b37680c1048ad6106b4`.

Kernel PIDs and mapped host UIDs are environmental observations, so the OS evidence is
replay-verifiable rather than claimed byte-identical across hosts. Protocol IDs, synthetic
commitments, role keys, timestamps, expected outcomes, and verification rules are deterministic.

## Evidence and independent verification

Evidence artifact:

```text
architect/evidence/evaluator-vault-os-boundary/evidence.json
```

| Property | Value |
|---|---|
| file SHA-256 | `628416d6b77203484d5709d10ed095026f14c4eb39f16f61caf968b7f590437b` |
| internal evidence hash | `sha256:727d4c0ed60d217e1d0781f0af4a74183f65319949156f149051722c7289baea` |
| promoter projection hash | `sha256:0e93221bf59993e19e7164117384eda6ea028f1c7f53becbcf6cf0252783569c` |
| final audit hash | `sha256:55058cf0261a22865abda2976e95de27cd9d3f7cd127afa759cd3085afdbea35` |
| role receipts | 26 |
| transport transactions | 20 |
| vault access records | 16 |
| role count | 8 |

`scripts/verify-evaluator-vault-os-boundary.ts` independently checks the closed JSON schemas,
top-level hash, public principals, challenge signatures, role/peer UID mappings, vault access-record
hashes and signatures, transaction stage set, expected denials, one-winner race, stable exact retry,
crash transition counts, promoter projection, final audit signature, and body absence.

The verifier reports:

```json
{"promotionAuthorized":false,"providerUsed":false,"researchEvidenceAuthorized":false,"roleCount":8,"transactionCount":20,"verified":true}
```

Tamper tests recompute the top-level evidence hash after changing each of:

1. promoter score commitment;
2. one role challenge; and
3. one nested vault access record.

All three remain rejected because the nested role, promoter, vault, and audit signatures no longer
verify.

## Validation

Pinned runtime: Node `24.18.1`.

| Check | Result |
|---|---|
| `rtk npm run test:coverage` | PASS: 130/130, fail 0, skip 0 |
| coverage | lines 95.97%, branches 90.59%, functions 93.28% |
| `rtk npm run build` | PASS |
| `rtk npm run check` | PASS |
| `rtk npm run verify:evaluator-vault-os-boundary` | PASS, `verified=true` |
| Python `py_compile` for the three OS gate files | PASS |
| `rtk git diff --check` before commit | PASS |
| new boundary/evidence private-key and live-token pattern scan | zero matches (`rg` exit 1) |
| actual `.env`, `.env.*`, private-key file search | zero files (`rg` exit 1) |
| remote-tracking ref | unchanged at `8b5f14400a7723c821bc54420e55da58dfa7601b` |

The full suite includes the 28 public development-only D_mine semantic fixtures. It does not access
gate, final, temporal, withheld-public, or real benchmark bodies.

## Exact implementation hashes

| Artifact | SHA-256 |
|---|---|
| `src/trust/evaluator-vault.ts` | `30aff5162bb5d17a23de742068384b9fc8989a03d36b6486156117b15f0cc02a` |
| `src/trust/independent-authorship.ts` | `164c27f15c63fc4c968ef15c66d50f6d8c52217fffcb940e9d71d4bfbbff0f9a` |
| `evaluator/evaluator_vault_os_gate.py` | `ea8b5fcb9b23c4467ce4d5baf3899f218002b528d78fd866402863e235568138` |
| `evaluator/evaluator_vault_socket_client.py` | `5d1c23110fd68b8c8b0c23d034151a9a14d999b1e474887ced027fab124fa789` |
| `evaluator/evaluator_vault_socket_gate.py` | `6c3e63bb2b61d448a1544472ecba7638fdab21b137a2e45753cd34d0949239b0` |
| `scripts/evaluator-vault-os-worker.ts` | `dede1cfef757fed014d4fe86b0965c9bd4232e241ab0f57d5e787ffee529bfb3` |
| `scripts/verify-evaluator-vault-os-boundary.ts` | `510965ee58f8562fec1d5f4292ac7b521ad064bcb39e728207a405baf96acdf7` |
| blinded reviewer projection schema | `28177bcac523ee5264053ae097311c19bc363bd0536cb37e43dc911493d53c12` |
| OS evidence schema | `12a059af05099167054240d2e0e1de7ddd779e5535de2bba3bede9543b436965` |
| final audit schema | `4e1d5bb5ec1e920c061dbc757e3610a42e3d743739fb0836a1c821d1dec84231` |
| role receipt schema | `2be772f6db48c7a1bf00dc7fa7eaffbd46d318a59af343e7b5af437850113b70` |
| vault result schema | `f91b4fa4b2fe8306055fc37f67fa539b039d6fe984f6ba77b93028ee27312841` |
| promoter projection schema | `f17015c6ce28071a151457ed1d028c2fc0fcbe545578dab2a85cf563a599c447` |
| contract tests | `b31ede71c6d5024a50996387c62eeca36a628f8428cb1b014fdf163ab10051fb` |
| OS integration test | `b37380a0c3a3e38275168f8de9f566b7ea331f07510a8ac9b09cfa455d68bc4a` |
| evidence tamper test | `e42605fb901aba67b4d1d808e2d675bb05e8206380f7416d069d1e4b86742c5a` |

## Residual limits and claim discipline

- This is synthetic body-free authorization and isolation evidence, not confidentiality evidence
  for real benchmark contents.
- RootlessKit, bubblewrap, the host kernel, subordinate-ID configuration, trusted bootstrap process,
  filesystem durability, host clock, and vault key remain TCB assumptions.
- The sticky `01777` IPC directory permits all roles to reach the socket; authorization depends on
  two-sided `SO_PEERCRED` checks plus signed vault requests. Socket replacement/unlink is tested
  against every non-vault role.
- Host root, kernel compromise, filesystem loss, key compromise, malicious bootstrap, and denial of
  service are not solved.
- The evidence is tamper-evident and independently verifiable, not tamper-proof.
- No distributed consensus, replicated storage, production containment, or security certification
  is claimed.
- No provider, benchmark, performance, generalization, self-improvement, or publication result
  follows from this packet.

## Questions for the Architect

1. Does the distinct UID/GID, own-key-only mount, vault-only journal mount, zero-capability sandbox,
   two-sided `SO_PEERCRED`, and signed request chain close the authorized OS-principal integration?
2. Does the new blinded reviewer contract projection correct the full-contract author-identity leak
   without weakening authorship binding?
3. Do the one-winner contention, fresh-process reconstruction, actual `SIGKILL` phases, exact retry,
   hard-link recovery, nested signature verification, and OS denials provide sufficient evidence for
   this narrow body-free boundary?
4. If approved, what is the next smallest local-only scope that advances Gate 2 without a provider
   credential, real benchmark body, research run, selection, promotion, deployment, or empirical
   claim?

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK

PRINCIPAL_AND_KEY_SEPARATION:
BLINDED_AUTHORSHIP:
AUTHENTICATED_TRANSPORT:
VAULT_CONTENTION_AND_RECOVERY:
EVIDENCE_AND_TAMPER_RESISTANCE:
VALIDATION:
CLAIM_DISCIPLINE:
BLOCKING_FINDINGS:
AUTHORIZED_NEXT_SCOPE:
```
