# Architect Packet 1RRR — Narrow Deployment and Termination Corrections

## Metadata

- Repo: `self-evolving-harness`
- Branch: `main`
- Protocol candidate: `draft-1`
- Correction commit: `7dd9484aaf18e3d5e2691f5a1e48e2bb7f799be1`
- Packet date: 2026-07-30
- Previous packet SHA-256:
  `eee5ab4dad190fd6eb220c69895932de89935c59abfd6ae11c0ad8cebd48b500`
- Previous response SHA-256:
  `d8bec7862e50db073710691ca6464078a34686ea046729ebd420b864df3b7303`
- Previous decision: `REVISE`
- Current question: do the three authorized corrections close Gate 1?

## Approval and transmission scope

- Destination: the existing project-specific ChatGPT.com Architect conversation.
- Transport: Oracle CLI 0.16.1 attached through direct CDP to the recorded exact tab.
- Data: this bounded architecture packet, schema field names, static precheck output, and hashes.
- Excluded: credentials, `.env`, personal data, raw traces, benchmark contents, sealed data, source
  archive, screenshots, provider calls, and repository writes.
- User approval: the user authorized the planned Architect loop and implementation sequence.

This packet changes only the three items authorized by the Gate 1RR response. It is a design-contract
submission, not implementation or empirical evidence.

## Prior decision disposition

| Authorized correction | Selected rule | Status |
|---|---|---|
| Complete post-rollback pointer tuple | deterministic target/rollback-target swap | specified and statically checked |
| Executable initialization-anchor predicate | null anchor until first successful deploy | specified and statically checked |
| Cross-record termination continuity | immutable five-field transaction descriptor | specified and statically checked |

The accepted H3/B6-RAW control, one-shot gate governance, candidate-cost formula, fourteen-edge graph,
H4 disposition, qualification/deployment separation, and claim discipline are unchanged and not
reopened.

## Correction 1 — Complete pointer state and deterministic rollback

The sole protocol-v1 channel is `production`. Its authoritative state is the latest valid append-only
pointer record:

```text
P_g = (
  generation = g,
  target = (harnessVersionId, manifestHash, qualificationDecisionId) | null,
  rollbackTarget = (harnessVersionId, manifestHash, qualificationDecisionId) | null,
  pointerRecordHash
)
```

Every `expectedBefore` commits all eight scalar fields:

```text
generation
harnessVersionId
manifestHash
targetQualificationDecisionId
rollbackTargetHarnessVersionId
rollbackTargetManifestHash
rollbackTargetQualificationDecisionId
pointerRecordHash
```

The signed decision and appended pointer record must be identical in protocol, channel, action,
complete `expectedBefore`, resulting generation, target tuple, and rollback-target tuple. The trusted
cross-object validator recomputes the action result before append.

The complete transition function is:

```text
initialize(A):
  pre  = (-1, null, null, null-record-hash)
  post = (0, A, null)

deploy(C), from (g, A, R):
  post = (g + 1, C, A)

rollback, from (g, A, B):
  require B != null
  post = (g + 1, B, A)

decommission, from (g, A, R):
  post = (g + 1, null, null)
```

Thus rollback has one rule:

```text
new.target = prior.rollbackTarget
new.rollbackTarget = prior.target
```

Repeated rollback deterministically toggles the pair:

```text
(target=C, rollback=A)
→ rollback → (target=A, rollback=C)
→ rollback → (target=C, rollback=A)
```

There is no anchor fallback, history search, implicit rebase, or silent null coercion. Both non-null
tuples must resolve to exact approved protocol-compatible whole-harness manifests and qualification
decisions.

Schema changes:

- `DeploymentDecision.schemaVersion = 2`;
- `DeploymentPointerRecord.schemaVersion = 3`;
- both require the complete prior target/rollback tuple;
- initialize/decommission require a null resulting rollback tuple;
- deploy/rollback require a non-null resulting rollback tuple;
- rollback additionally requires a non-null prior rollback tuple; and
- tuple IDs, hashes, and qualification references are all-null or all-non-null as applicable.

JSON Schema fixes record shape. The separately specified cross-object validator fixes equality,
generation arithmetic, exact deploy-copy, and exact rollback-swap semantics.

## Correction 2 — Exact null initialization anchor

Protocol v1 now has one executable initialization predicate:

```text
expected generation           = -1
expected target tuple         = null
expected rollback tuple       = null
expected pointer record hash  = null
result generation             = 0
result target tuple           = one exact approved harness A
result rollback tuple         = null
```

Rollback is prohibited while the rollback tuple is null. The first successful `deploy(C)` creates the
first rollback target by copying the exact prior target `A`.

This removes the prior “composition-equivalent anchor” entirely. There is no second bootstrap
manifest, no behavioral-equivalence predicate, and no possibility of separate qualifications for an
undefined equivalent anchor.

## Correction 3 — One immutable abnormal-termination transaction

Every `toState=terminating` record creates:

```text
D = (
  terminationTransactionId,
  initiatingRecordId,
  preTerminationState,
  initiatingPrincipal,
  reason
)
```

For the initiating record:

```text
D.initiatingRecordId   == recordId
D.preTerminationState == fromState
D.initiatingPrincipal  == transitionedBy
D.reason               == terminationReason
```

The sole `terminating → terminated` record:

- directly references the initiating record through `D.initiatingRecordId`;
- repeats `D` byte-for-byte;
- requires `terminationReason == D.reason`;
- preserves protocol, session, harness, runtime-state snapshot, original pre-termination state,
  initiating principal, reason, and initiating evidence;
- may add only completion state/evidence: revocation and process/job-reap status, sealed accounting,
  final receipt references, final record identity/actor/time, audit link, and attestation; and
- cannot return the session to another state.

The audit validator permits exactly one initiator and at most one final record per
`(sessionId, terminationTransactionId)`. Missing/non-direct initiator reference, descriptor drift,
reason/origin/principal drift, removed initiating evidence, or duplicate/conflicting finals fails.
An operations owner may finish a transaction after the initiating process crashes, but cannot alter the
descriptor's initiating principal or cause.

`SessionLifecycleRecord.schemaVersion = 2` requires `terminationTransaction`; it is null on ordinary
records and the five-field object on both `terminating` and `terminated` records. JSON Schema fixes the
record shape; the cross-record validator fixes direct-reference, equality, allowed-addition, and
uniqueness rules.

## Static precheck evidence

Command:

```text
python3 scripts/validate_gate1r_contracts.py
```

Result:

```text
PASS schemas=33 type_registry=valid splits=28/14/14/14+45/10/34 multicause_graph=14_edges_degree4 lifecycle=qualified_deployed_terminated deployment=null_anchor_swap termination=transaction_bound gate=one_shot h3=B6_vs_B6-RAW spike=quarantined markdown_links=10
```

New executable static cases cover:

- initialize to `(0, A, null)`;
- rollback-before-deploy rejection;
- deploy to `(1, C, A)`;
- rollback to `(2, A, C)`;
- repeated rollback to `(3, C, A)`;
- decision/pointer-record full-field equality;
- record-only and decision-plus-record non-swapping attacks;
- valid initiating/final termination pair;
- changed top-level reason;
- changed descriptor reason;
- changed original state;
- changed initiating principal; and
- duplicate final record.

All 33 schemas pass Draft 2020-12 meta-schema and local-reference checks. `git diff --check` passes.
No runtime, evaluator, deployment service, provider, benchmark, gate, final, or canary was executed.

## Replacement hashes

| Primary artifact | SHA-256 |
|---|---|
| `schemas/deployment-decision.schema.json` | `4b0b69874c59871bfef421f008b07da21116bd8da059703be8e120d4af264eb3` |
| `schemas/deployment-pointer-record.schema.json` | `1e5687cd2c81ed39186c31b4c5b4c98971e89c91d96ecb4bfe6361b8263c7f2f` |
| `schemas/session-lifecycle-record.schema.json` | `dcec2fc00aec806671d69e31fee0032ef92f42f0e51b176b28667d27f4ab6662` |
| `docs/architecture/state-machines.md` | `7492b6c55e133b8dd0f394bb07b5c11c5bd384487621bdfc551929497f6e65b1` |
| `docs/architecture/validator-and-adversarial-acceptance.md` | `ba3ae1b02aec884cb5573e7f3f2e0d94c4a06b2b8a3bc40ea27395a88a9f2902` |
| `scripts/validate_gate1r_contracts.py` | `c068b7f5864b91889b034b6d181f74ad745df676affff8ef50da87cc0ab5d0af` |

Consistency-only architecture restatements:

| Artifact | SHA-256 |
|---|---|
| `docs/architecture/component-model.md` | `f00c3f4a21a098ab924ee4dfa9d993346c575da37bffaca327530511959615c8` |
| `docs/architecture/evolution-loop.md` | `94fd717f5e9fc520d1d96be54ddffe89a8105a3255cb43191e03b3ca12718673` |
| `docs/architecture/execution-loop.md` | `e4a62bedf191a5e97b59e52adf3604045a4914a8bd763d21422fca5a8a8cae7b` |
| `docs/architecture/system-context.md` | `7757c7b6e0793da4465ccc0255175e476d919a6d35077f9f221f32ab6438a662` |
| `docs/architecture/threat-model.md` | `9031db64096594296924eb69c8f91f3647382dbd6968d89033856741e7e3af86` |
| `docs/architecture/trust-boundary.md` | `5e41119bccd56fa0655ffdd50715d135a1dd59e07c48d341825f88d9b9a3da55` |

## Claim boundary

The precheck proves internal contract consistency only. It does not prove runtime correctness,
containment, crash recovery, authenticated separation, evaluator independence, empirical improvement,
generalization, security, deployment readiness, or self-evolution. Those remain Gate 2/3/final
evidence obligations.

## Decision requested

Return `APPROVE` only if the full rollback tuple, null initialization anchor, and immutable termination
transaction resolve all remaining Gate 1 blockers. If not, return `REVISE` or `BLOCK` with a concrete
counterexample limited to these three contracts.

An `APPROVE` authorizes only the planned Gate 2 local implementation and deterministic verification.
It does not authorize a paid provider call, benchmark/gate/final access, deployment, push, release, or
performance/security claim.

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK

CORRECTNESS:
EVALUATION FAIRNESS:
GENERALIZATION:
REPRODUCIBILITY:
SECURITY:
CLAIM DISCIPLINE:

BLOCKING FINDINGS:
AUTHORIZED NEXT SCOPE:
```
