# Gate 2 Runtime and Trust Validation

Status: pre-submission evidence report; Gate 2 has not been approved

Date: 2026-07-30  
Commit under test: `91dd84f555740fe2819f6d6e1436d7030c6ce596`

## Scope

This report covers the local, deterministic implementation authorized by the Gate 1RRR decision. It
does not cover a paid provider call, benchmark evolution, `D_gate`, final/temporal/withheld data,
external deployment, or a performance, security, generalization, or self-improvement claim.

## Reproduction

Environment:

- Node.js `v24.18.1`
- Python `3.13.14`
- bubblewrap `0.9.0`
- Linux `7.0.0-28-generic x86_64`

Commands and outcomes:

```text
npm run test:coverage
  20 tests, 20 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo
  line 91.53%, branch 86.72%, function 88.26%

npm run build
  pass

npm run cli -- check-schemas
  {"compiledSchemas":34}

npm run cli -- demo
  state=completed
  verificationPassed=true
  modelCalls=2
  toolCalls=1
  eventCount=14
```

The demo uses the deterministic fake provider and a fake verifier. The event-chain replay test uses a
test-only fixed Ed25519 seed and obtains the same terminal event hash from two independent roots.

## Implemented evidence

| Area | Local evidence | Status |
|---|---|---|
| Standalone runtime | provider interface, context, model/tool loop, verifier, budgets, events | implemented |
| Tools | read/write/edit/bash/git-status/git-diff; workspace guard and bwrap | implemented |
| Memory and skills | filesystem memory and declarative skill registry | implemented |
| Sessions | lifecycle log, operation response, interruption race, descendants and jobs | implemented |
| Component graph | content-addressed payloads, type registry, dependency/closure validation | partial contract conformance |
| Evidence | signed receipts, event classes, redaction, append-only hash chains | implemented locally |
| Evolution | weakness patterns, attribution, bounded patch, rejected-edit memory | implemented deterministically |
| Candidate isolation | separate Git worktree plus post-mutation validation | implemented; Git is non-authoritative |
| Evaluator | Python process under bwrap, no network, signed two-phase request/result | implemented in emulated isolation |
| Decision and deployment | qualification, cost gate, promotion/rejection, exact pointer CAS and rollback swap | implemented |
| Trust boundary | Ed25519 role checks, replay/deadline/hash checks, bwrap containment | partial |

## Passing deterministic and adversarial cases

- strict JSON/canonicalization and all 34 schemas;
- modified artifacts and append-only log entries;
- role, signature, deadline, replay, payload hash, and message authority;
- traversal, absolute escape, symlink, hardlink, special ancestor, and external hardlink attacks;
- bwrap network and host-path denial, cleared environment, time and output caps;
- immutable or disabled component change, mutation bounds, and recomputed before/after surface;
- candidate worktree separation from the active checkout;
- observed facts separated from attributed mechanisms;
- external evaluator request/result authentication and schema validation;
- stale deployment expectation, rollback-before-first-deploy, exact deploy copy, rollback swap, and
  repeated rollback;
- late successful executor result after interrupt cannot resurrect a session;
- child/subagent/job pin, permission, and budget widening denial;
- changed memory, workspace, environment, checkpoint, cache, or policy changes runtime snapshot ID.

## Evidence gaps and contract corrections

1. **OS principal separation:** runtime, controller, and evaluator currently execute under one host UID.
   bubblewrap supplies mount, process, and network namespaces, but there is no distinct
   principal-to-UID map. This is `isolation_emulated` and does not satisfy the Gate 2 security rule.
2. **Authenticated transport:** the wire envelope, authority, signature, replay, deadline, and framing
   functions exist, but the evaluator path does not yet use a dedicated Unix socket with verified peer
   credentials. Private evaluator key material is protected by a sandbox mount, not by a different host
   principal from the controller.
3. **Component closure identity:** the approved prose placed `behaviorClosure` inside the component
   identity while the closure description could include the final component manifest ID. That is a
   hash fixed-point cycle. The implementation computes closure nodes from
   `identity - behaviorClosure`, then hashes the full identity for the final manifest ID. The schema
   does not yet name this intrinsic-ID rule.
4. **Capability preimage:** `capabilityDigest` is in the manifest, while its sorted capability IDs are
   stored beside the manifest in the registry log. The schema does not yet provide a content-addressed
   preimage reference.
5. **Canonicalization breadth:** the TypeScript path rejects ambiguous JSON and uses a strict
   deterministic profile. The small Python evaluator canonicalizer is compatible with the constrained
   evaluation messages, not a general RFC 8785 implementation for every valid JSON number.
6. **Worktree authority:** the tree hash does not include untracked bytes; status records their
   presence. Registry content hashes and validators remain authoritative.
7. **Lifecycle completeness:** retirement reference holds and crash recovery during an in-progress
   termination/evaluator transaction are not implemented end-to-end.
8. **Session attestation:** session definition bytes are append-hash protected and lifecycle records
   carry signed pins, but the complete initial session definition is not independently signed as one
   object.
9. **Runtime cancellation:** model calls receive the abort signal. Tool execution does not yet receive a
   propagated abort signal in its execution context.
10. **Evaluation execution:** the B0-B6 contracts and phase-ledger schemas are documented, but there is
    no executable matched-budget experiment scheduler. Pilot-only numeric fields remain deliberately
    unfrozen.

## Artifact hashes

```text
package-lock.json                    6067e8a69a6adfbf2f0f5eb7f395b5afb6dd114b74c131e55cd3f3c8986d3ed2
package.json                         6878f39e4711332e42514b3de0336feca4e7f536fd521af3b2e96cc9ad212085
.python-version                      f8faecf2505680716c6279bf2cdec3d5a5ba2ba852f0d7df45d51ac1ce8d9ade
evaluator/external_evaluator.py      90c516a091bd39e72dd35f605d0d32c40098db48249e66cbec4bdb4e4d8bc434
src/runtime/agent-loop.ts            b2e5aa46474e3848499a42fecd5b2206de45091448775576304ddb2504b0bf88
src/runtime/standalone.ts            af0c1233389c0f6d7a15c40b7b32a2dd3ea062f4d51f22bdc8f5108ce131b69b
src/evolution/external-evaluator.ts  b4d6e7848d113e87429cc0025cb48562b59dccda103c47f702fa9a36ab590ac0
src/evolution/candidate-admission.ts 2f83f20aa29058ac1d82f6fa99d1aa934d65768bc1ae0a540f85bcf96e593b6b
src/evolution/promotion.ts           d513cf0baa1fc6850501c9fe861f8f499cb89c9eb69265fb8bf3cafadbc73261
src/evolution/deployment.ts          68bc483c69f9533e0e0febe6366deb934d5eb8af8231e84272f61014604d08a2
```

## Local conclusion

The runtime and governed evolution path are sufficient for deterministic development evidence. The
implementation does not yet satisfy its own strict Gate 2 security acceptance because the
principal/UID/socket boundary is emulated. Gate 2 should remain unapproved until an external architect
accepts a concrete correction plan and the resulting adversarial evidence.
