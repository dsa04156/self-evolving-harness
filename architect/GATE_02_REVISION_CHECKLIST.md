# Gate 2 Revision Checklist

Source decision:
`.codex/gpt-pro-architect/responses/response-2.md`  
Decision: `REVISE`  
Response SHA-256:
`e12a59450b967bfde4a81f7b30aee2c50c037537af45c96f8944e5981ddc5cd1`

This checklist is the only authorized Gate 2R implementation scope. Items are ordered by contract
dependency, not convenience.

## Current correction status

| Item | Status | Evidence state |
|---|---|---|
| component identity and capability preimage | implemented | deterministic registry tests pass |
| cross-language canonical domain | implemented | TypeScript, evaluator Python, and audit Python consume one corpus with frozen rejection category |
| OS principals, key custody, authenticated sockets | implemented and executed | subordinate-UID test passes with five distinct host UIDs, role keys, authenticated sockets, 11 wire attacks, wrong-peer tests, and zero skips; same-UID transport remains labelled emulation |
| enforced cancellation and descendant reaping | implemented | non-cooperative delayed-write/process-group test passes |
| retirement holds and restart-safe transactions | implemented | six hold kinds, deployment-pointer recovery, evaluator eight-stage recovery, and termination three-stage recovery pass |
| exact evaluator filesystem input | implemented and executed | dirty/ignored/link/substitution rejection, committed-object materialization, evaluator-side descriptor/blob/mode/exact-object verification, and the OS-mounted transaction pass |
| Gate 2R evidence and resubmission | evidence complete; ruling pending | clean source commit, 38/38 zero-skip suite, coverage, environment, replacement hashes, and packet are ready for the same-tab Architect ruling |

## 1. Version component identity and capability preimage

- Define `ComponentIntrinsicIdentity` and `ComponentManifestIdentity` as separate named hash domains.
- Specify whether and where the component's own intrinsic ID appears in behavior closure.
- Specify canonical dependency ordering and the exact final manifest preimage.
- Put sorted capability IDs in the immutable manifest or reference one content-addressed canonical
  capability-set artifact.
- Reject absent, duplicate, unsorted, digest-mismatched, and type-registry-exceeding sets.
- Version affected schemas and update registry, mutation, fixture, and hash tests.

Acceptance:

- independent recomputation needs no registry-side convention;
- no fixed-point hash input exists;
- golden valid/invalid manifests cover both hash domains and capability sets.

## 2. Freeze one cross-language canonical domain

- Select either complete RFC 8785 in TypeScript and Python or a new, mechanically restricted protocol
  profile.
- Make out-of-domain values fail before signing or hashing.
- Create one shared golden corpus consumed by both runtimes, including number and Unicode edge cases,
  and negative cases.

Acceptance:

- both implementations emit byte-identical canonical bytes and SHA-256 for every accepted vector;
- both reject every negative vector with a frozen error category.

## 3. Instantiate OS principals, key custody, and authenticated socket

- Run participating operations/controller, runtime, evaluator, promoter, and audit roles under distinct
  host UIDs or equivalently enforced identities.
- Give each role separately owned credentials and denied-by-default mounts/network.
- Move evaluator request/result traffic from stdio to one dedicated Unix socket.
- Verify kernel peer credentials against the protocol principal map before envelope processing.
- Retain framing, schema, signature, role, sequence/nonce/replay/deadline, correlation, and downgrade
  checks on the actual integration path.
- Prove the controller cannot read or substitute the evaluator private key.

Acceptance:

- unauthorized file read/write, signal, ptrace, socket, key, network, and role attempts fail at the OS
  boundary;
- partial/extra/oversized frames, peer crash, replay, mismatched UID/key/role, and protocol downgrade
  cannot synthesize a valid result;
- tests label actual OS-boundary evidence separately from unit emulation.

## 4. Enforce cancellation and descendant reaping

- Propagate abort through `ToolExecutor` and every tool implementation.
- Place shell tools, subagents, and backend jobs in revocable containment/process groups.
- On interrupt, deadline, budget exhaustion, or security termination: revoke authority, stop and reap
  descendants, block further authoritative workspace commits, seal accounting, and reject late output.
- Add a deliberately non-cooperative process that attempts a delayed side effect.

Acceptance:

- the delayed side effect never commits;
- no child/process survives;
- one terminal lifecycle/evidence outcome remains authoritative.

## 5. Complete retirement holds and restart-safe transactions

- Deny retirement while production, rollback, live-session/descendant, pending-evaluation, or
  pending-deployment references exist.
- Persist abnormal-termination and evaluator transaction stages.
- Recover idempotently from crashes before/after result creation, append, signature verification,
  accounting seal, and final transition.
- Reject duplicate or contradictory completion.

Acceptance:

- crash-injection tests cover each durable boundary;
- restart produces the same terminal projection/head hash and no orphan authority or process;
- removing the last valid hold is the only way retirement becomes legal.

## 6. Bind exact evaluator filesystem input

- Reject every untracked, ignored, out-of-closure, symlinked, or otherwise uncommitted object before
  evaluator launch, or replace Git identity with a content-addressed complete snapshot that includes
  every mounted byte.
- Mount only the verified committed snapshot/manifest closure into the evaluator.
- Keep Git status diagnostic only.

Acceptance:

- dirty, ignored, symlink, hardlink, and post-check substitution cases fail before evaluation;
- evaluator-visible bytes reproduce from the recorded snapshot hash alone.

## 7. Gate 2R evidence

- Run build and all schema tests from one clean commit.
- Run deterministic runtime/evolution replay.
- Run cross-language canonical corpus.
- Run actual Unix-socket and distinct-principal adversarial tests.
- Run non-cooperative cancellation/reaping tests.
- Run transaction crash/recovery and retirement-hold tests.
- Run exact filesystem-input tests.
- Report replacement environment, executable, schema, corpus, protocol, and source hashes.
- Produce `architect/PACKET_02R_RUNTIME_AND_TRUST.md` and continue the same pinned Architect tab.

## Deferred but bounded

- Before Gate 3: sign the complete session definition or mechanically prove signed coverage of every
  authority-bearing and result-interpreting field.
- Before any empirical B0-B6 work: implement the matched-budget scheduler and freeze pilot numeric
  fields.

## Still prohibited

- real-provider smoke before Gate 2R approval;
- benchmark evolution or access to gate/final/temporal/withheld-public tasks;
- paid-provider work, live deployment, push, or release;
- performance, containment/security, generalization, or empirical self-improvement claims.
