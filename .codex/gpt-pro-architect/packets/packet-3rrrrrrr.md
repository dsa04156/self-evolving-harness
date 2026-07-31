# Architect Packet 03RRRRRRR — Body-free evaluator vault and independent authorship

## Requested decision

Review only the local deterministic, synthetic-metadata evaluator-vault and independent-authorship
contract authorized by Round 03RRRRRR. Return one decision: `APPROVE`, `REVISE`, or `BLOCK`.

Do not treat this packet as a request to run a provider, instantiate a real task body, execute a
research scheduler, select a candidate, promote a harness, deploy, push, or make an empirical claim.
If approved, state the exact next authorized scope. If revised, identify the smallest remaining
trust-contract defect.

## Governing decision and scope

- prior response:
  `.codex/gpt-pro-architect/responses/response-3rrrrrr.md`
- exact response SHA-256:
  `7070922e4ea18844d1ffb0dde9e9076085feff97b260eb3086acf6e4f3295074`
- prior decision: `APPROVE`
- authorized work: local deterministic, body-free evaluator-vault trust contract; independent
  authorship workflow using synthetic metadata; historical-publication contamination rejections;
  narrow resubmission
- prohibited work: push, provider/API use, real `D_gate`/final/temporal/withheld-public/multicause/
  Terminal-Bench body, research scheduler or B0–B6 execution, pilot, attribution evaluation,
  selection, promotion, deployment, release, or performance/self-improvement claim

No prohibited action was performed.

## Exact local identity and remote non-publication

- repository: `https://github.com/dsa04156/self-evolving-harness`
- implementation commit:
  `af70fd154dd2355891de0a475ce4d593a473b9b7`
- implementation tree:
  `d9c8dd0d7a8e54273a0404f6eb593987a97346e6`
- commit subject:
  `feat: add body-free evaluator vault contract`
- clean worktree immediately after implementation commit: yes
- observed remote after validation:
  `refs/heads/main = 8b5f14400a7723c821bc54420e55da58dfa7601b`
- local branch relation: three commits ahead of `origin/main`
- additional push: none

This packet is intentionally created after the implementation commit and is not part of that tree.
The implementation commit and packet remain local.

## Contract result

The implementation adds a body-free trust workflow with these distinct principals and keys:

1. benchmark author (`benchmark_author`);
2. blinded reviewer (`benchmark_reviewer`);
3. evaluator vault (`vault`);
4. evaluator (`evaluator`);
5. scorer (`scorer`);
6. promoter (`promoter`);
7. audit store (`audit_store`); and
8. protocol author (`protocol_author`).

Every frozen principal has a distinct principal ID, instance ID, identity digest, Ed25519 key ID, and
public key. The contract contains no private key. The exact role-specific mount declarations and
action authorities are content-bound into the protocol-author-signed contract. The new mount table is
a deterministic contract; this round does not claim a new eight-process OS isolation exercise.

## Independent-authorship lifecycle

```text
protocol assignment
→ author content/verifier commitments
→ vault identity-free review projection
→ reviewer-signed include/reject decision
→ vault-finalized included/rejected transition
→ append-only authorship chain
```

The important separation is explicit:

- assignment contains no content or verifier commitment;
- author commitment contains only SHA-256 commitments, inclusion-rule and collection-window hashes,
  and a historical-contamination declaration;
- `bodyPresent`, `verifierLogicPresent`, `labelsPresent`, and `pathsPresent` are schema-fixed `false`;
- the vault will not blind a detached author commit: it verifies the exact protocol assignment →
  commit chain;
- the reviewer receives a separate review packet containing a handle commitment, never the raw
  handle or author identity;
- the reviewer signs a standalone body-free decision, never the full transition;
- the vault verifies and embeds the reviewer decision before finalizing the full transition; and
- inclusion and rejection are both retained. Rejection requires a reason commitment.

The append-only transition embeds the review packet and reviewer decision so recovery verification
does not depend on an optional external object.

## Historical-publication contamination boundary

Every committed authorship metadata record binds the approved complete historical-publication ledger:

```text
sha256:52d22b10543d23fa0f7d268de029514c7ab8e62a3ab39277ade4d0c37da1e035
```

The policy applies every one of the ten restricted use classes independently:

- `held_out`
- `sealed`
- `temporal_holdout`
- `gate`
- `final`
- `confirmatory`
- `research_selection`
- `promotion`
- `research_evidence`
- `claim_table`

It traverses direct content hashes, Git object IDs, aliases, dependencies, wrappers, and provenance
references. Tests prove rejection through each laundering edge. The prior inventory, ledger,
deviation, premature closure, historical union, replacement ledger, and superseding closure remain
unchanged.

## Vault task and capability lifecycle

```text
reviewed admission
→ create
→ vault seal
→ evaluator one-time unlock
→ evaluator outcome commitment
→ scorer score commitment
→ promoter-visible commitment only
```

The `EvaluatorVault` constructor accepts the signed `included` transition plus its exact predecessor,
verifies the transition signature, protocol, review, reviewer decision, historical contamination,
chain link, and terminal inclusion state, then stores only:

```text
(sha256(opaque handle), included transition record hash)
```

`create` must match that admission pair. A rejected or invented record is denied.

The vault-issued capability is bound to:

- exact protocol, contract, opaque handle, and included authorship record hash;
- the one frozen evaluator identity/key;
- action `unlock`, single use, issue/expiry timestamps, and nonce; and
- `bodyAccess=none_in_body_free_contract_prototype`.

`evaluate` requires `unlocked`. `score` requires `evaluated` and the exact released evaluation
commitment. The score commitment binds the protocol, contract, handle commitment, evaluation
commitment, and signed scorer request.

## One-way release and access evidence

Every structurally valid allowed or denied request is recorded as a vault-signed payload inside the
filesystem append-only hash chain.

The access record contains:

- frozen and requested protocol/contract identities;
- claimed and independently recomputed request hashes;
- request-ID, actor-identity, actor-key, nonce, and opaque-handle commitments;
- claimed role and sender sequence;
- state before/after, allowed/denied decision, and stable reason code; and
- release class plus schema-fixed `false` flags for raw task handle, task body, author identity, and
  candidate identity.

Raw untrusted request IDs, principal IDs, or key IDs are not copied into the access record, preventing
an attacker from laundering a handle through a denied audit field.

Release matrix:

| Action | Recipient | Released value |
|---|---|---|
| create / seal | none | none |
| enumerate | vault | sorted opaque-handle commitments |
| unlock | evaluator | capability hash |
| evaluate | scorer | evaluation commitment |
| score | promoter | score commitment |
| audit | audit store | append-only chain head |

Denied attempts always have `releaseClass=none`, no field names, and identical before/after state.
One vault instance serializes requests. Accepted sequence and nonce commitments are reconstructed from
the durable ledger, so the same signed request is rejected after vault re-instantiation.

## Required adversarial cases

The focused suite proves:

1. wrong action role is denied and logged;
2. a valid signature from a non-frozen key of the correct role is denied and logged;
3. repeated request sequence/nonce is denied in-process;
4. simultaneous same-sequence requests are serialized; exactly one is accepted;
5. the same signed request is denied after a new vault object opens the same ledger;
6. a capability substituted onto another opaque task is denied;
7. evaluation before unlock and scoring before evaluation are denied;
8. a request for another protocol is denied;
9. capability issue before seal is denied;
10. an unreviewed/rejected authorship record cannot enter vault admission;
11. a non-reviewer key cannot create the blinded decision;
12. a changed signed access record is rejected;
13. a raw handle placed in a denied request ID is absent from the access ledger; and
14. every denial preserves state and releases zero fields.

## Schemas and exact implementation hashes

| File | SHA-256 |
|---|---|
| `src/trust/evaluator-vault-contract.ts` | `9753c51660b15efb986a5f98d78ea99dcab6d3011eddfd65f4a9252a36387486` |
| `src/trust/independent-authorship.ts` | `b92e003df25755fbf94a40a84ff50fbb7cc8cb18689264631f79b9efc54162d3` |
| `src/trust/evaluator-vault.ts` | `a96d356875402ae201838f055fc4ec1bce8d8384309de2975ffa1f0bc54c7b31` |
| `test/evaluator-vault-contract.test.ts` | `aae3c36c4fc7e60efe2c3d3336b95418081c3877bb5248207941502c60c08143` |
| `schemas/evaluator-vault-contract.schema.json` | `f8e1224fd7c6e7e67cbc2838c93e0ee303128e2e7ab8da2d784b6f4ae8071e1d` |
| `schemas/independent-authorship-transition.schema.json` | `917118ef4d38a0aba4a7d932b30e6f927a44e72db086119e64d043e12c850641` |
| `schemas/blinded-authorship-review.schema.json` | `9c972de48ecbc416f8e78ad0822bc1f0a11041fd51dd09124e29dcf0508ed4b7` |
| `schemas/blinded-authorship-decision.schema.json` | `178f8e1e837181be15c4e9091fd5a7649c71ac24e6221fca78b652d48fe33532` |
| `schemas/opaque-task-capability.schema.json` | `9dba1f524adccdcd3366156ec78632bbe9ed50369f962f3e8a97d40416fea808` |
| `schemas/vault-access-request.schema.json` | `580f2c72a114e3a3a72431674445e4d01fa8d877e00ce4b43f4c6afe3e77582c` |
| `schemas/vault-access-record.schema.json` | `17323dac2b15f2048dc4283eb2c252e6c7ed09e9636b870ba54d9331e538c623` |
| `docs/architecture/evaluator-vault-contract.md` | `0b0406a7c4a86e50a64f048a63c44f8c9ca61e79a5c30a41606ef594f409ede4` |

The common principal schema and TypeScript identity union add explicit `vault`, `scorer`, and
`benchmark_reviewer` roles. All existing schemas compile in the complete regression suite.

## Clean validation

Validation was performed without a provider, API key, real benchmark body, or research artifact.

```text
npm run build
PASS

exact Node 24.18.1 non-Unix suite
tests=120 pass=120 fail=0 cancelled=0 skipped=0 todo=0

exact Node 24.18.1 isolated Unix audit suite
tests=1 pass=1 fail=0 cancelled=0 skipped=0 todo=0

total deterministic suite
tests=121 pass=121 fail=0 cancelled=0 skipped=0 todo=0

npm run verify:publication-governance
PASS snapshot=a5d8256... paths=510 exposures=632 embedded=109 classes=13 restricted=10

npm run verify:historical-publication-governance
PASS roots=4 commits=64 trees=456 blobs=878 observations=19742 transitions=891
     historicalOnly=350 correctiveOnly=27 artifacts=2567 secrets=0

git diff --cached --check
PASS

live/private-key-pattern scan over every new trust/schema/test/document file
matches=0

git ls-remote --heads origin main
8b5f14400a7723c821bc54420e55da58dfa7601b refs/heads/main
```

Validation transparency: an earlier non-authoritative command directly invoked the host `node`
binary. It produced 119/120 pass and one exact environment assertion:

```text
actual v20.20.1
expected v24.18.1
```

No product code was changed for that result. The same complete suite was rerun with the repository's
frozen `npx node@24.18.1` command and passed 120/120. The existing Unix audit transport file was then
run separately and passed 1/1, preserving the previously disclosed full-suite close-event race.

## Security review findings fixed before submission

The pre-submission security pass found and corrected four defects:

1. reviewer originally signed a full final transition and could therefore observe the raw handle;
   replaced by a separate body-free reviewer decision and vault finalization;
2. vault blinding originally accepted a detached author commit; it now requires the exact signed
   assignment predecessor;
3. access records originally copied request/actor/key identifiers and could be used as a denial-log
   covert channel; they now store commitments and claimed role only; and
4. parallel requests could inspect the same sequence state; one vault instance now serializes request
   decisions and a concurrent same-sequence adversarial case proves fail-closed behavior.

## Preserved non-claims and residual limits

- no real task body, verifier logic, label, path, split, or executable benchmark content exists here;
- no new OS multi-principal mount evidence was generated;
- no provider, API, model, proposer, mutation, evaluator process, scorer process, scheduler, B0–B6,
  pilot, selection, promotion, canary, deployment, or release ran;
- no C-H1–C-H4, performance, generalization, containment, or self-improvement claim is made;
- access-ledger replay reconstruction is implemented, but private vault task-state crash recovery is
  not;
- one in-process vault serializes requests, but a cross-process singleton lease is not implemented;
- real encrypted task-body custody is not implemented;
- malicious host root/kernel, bootstrapping administrator, protocol-author key compromise, vault-key
  compromise, distributed deployment, timing leakage, and provider behavior remain outside this
  result; and
- OxyGent remains queued for a later exact-SHA prior-art source-path review. It is not a dependency,
  adapter, runtime, or source of copied code in this implementation.

## Decision questions

1. Are the eight distinct principals, keys, role mounts, and action authorities sufficiently frozen
   for a body-free trust contract?
2. Does the assignment → commit → blind → reviewer decision → vault finalization chain prevent the
   reviewer from receiving raw handle, author identity, task body, verifier logic, label, or path?
3. Does constructor-time verification of the signed included transition close arbitrary vault
   admission?
4. Does the historical-union policy reject every prohibited use class and laundering edge before
   admission?
5. Are the single-use capability, state guards, protocol/contract/task/authorship/evaluator bindings,
   and one-way release projections fail-closed?
6. Does the vault-signed access chain preserve enough evidence for wrong-role/key, replay,
   substitution, early-access, and protocol-mismatch attribution without becoming an identifier
   leakage channel?
7. Are the documented cross-process lease, private-state recovery, real-body custody, OS-isolation,
   and side-channel gaps correctly retained as limitations rather than claimed controls?
8. Is the project authorized to proceed to a next narrow scope without exposing any real held-out or
   temporal task body?

Requested terminal form:

```text
DECISION: APPROVE | REVISE | BLOCK
PRINCIPAL_AND_KEY_SEPARATION:
INDEPENDENT_AUTHORSHIP:
CONTAMINATION_BOUNDARY:
VAULT_ADMISSION:
CAPABILITY_AND_STATE_MACHINE:
ONE_WAY_RELEASE:
ACCESS_LEDGER_AND_REPLAY:
VALIDATION:
CLAIM_DISCIPLINE:
BLOCKING_FINDINGS:
AUTHORIZED_NEXT_SCOPE:
```
