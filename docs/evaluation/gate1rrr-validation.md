# Gate 1RRR Local Contract Validation

Date: 2026-07-30
Scope: only the three corrections authorized by the Gate 1RR `REVISE` decision
External provider or benchmark execution: none
Gate/final/temporal/withheld-public access: none

## Result

`PASS_FOR_EXTERNAL_REVIEW`

```text
PASS schemas=33 type_registry=valid splits=28/14/14/14+45/10/34 multicause_graph=14_edges_degree4 lifecycle=qualified_deployed_terminated deployment=null_anchor_swap termination=transaction_bound gate=one_shot h3=B6_vs_B6-RAW spike=quarantined markdown_links=10
```

This is a static design-contract result. It is not runtime, isolation, evaluator, benchmark,
performance, security, deployment, or self-improvement evidence.

## Machine-checked corrections

- all 33 JSON Schemas still pass Draft 2020-12 meta-schema checks and repository-local `$ref`
  resolution;
- every pointer CAS expectation names generation, target ID/hash/qualification, rollback-target
  ID/hash/qualification, and the prior pointer-record hash;
- initialization requires generation `-1`, null prior target, null prior rollback target, and null
  prior record hash, then produces generation `0`, one approved target, and a null rollback target;
- rollback before the first successful deploy fails;
- deploy copies the exact prior target tuple into the new rollback slot;
- rollback swaps the exact target and rollback-target tuples, and a second rollback swaps them back;
- a signed deployment decision and appended pointer record must match in protocol, channel, operation,
  complete expected-before state, generation, target tuple, and rollback-target tuple;
- a non-swapping record fails even when the decision is changed to the same non-swapping value;
- every abnormal termination record contains the same five-field immutable descriptor;
- the final record directly references its initiator and preserves descriptor, reason, original state,
  initiating principal, protocol, session, harness, runtime snapshot, and initiating evidence;
- reason, descriptor, origin, or principal drift fails; duplicate terminal completion fails; and
- accepted Gate 1RR contracts are exercised only as unchanged regression checks.

## Replacement artifact hashes

### Primary corrected contracts

| Artifact | SHA-256 |
|---|---|
| `schemas/deployment-decision.schema.json` | `4b0b69874c59871bfef421f008b07da21116bd8da059703be8e120d4af264eb3` |
| `schemas/deployment-pointer-record.schema.json` | `1e5687cd2c81ed39186c31b4c5b4c98971e89c91d96ecb4bfe6361b8263c7f2f` |
| `schemas/session-lifecycle-record.schema.json` | `dcec2fc00aec806671d69e31fee0032ef92f42f0e51b176b28667d27f4ab6662` |
| `docs/architecture/state-machines.md` | `7492b6c55e133b8dd0f394bb07b5c11c5bd384487621bdfc551929497f6e65b1` |
| `docs/architecture/validator-and-adversarial-acceptance.md` | `ba3ae1b02aec884cb5573e7f3f2e0d94c4a06b2b8a3bc40ea27395a88a9f2902` |
| `scripts/validate_gate1r_contracts.py` | `c068b7f5864b91889b034b6d181f74ad745df676affff8ef50da87cc0ab5d0af` |

### Consistency-only architecture propagation

These files restate only the same three corrections; they add no new mechanism or reopened topic.

| Artifact | SHA-256 |
|---|---|
| `docs/architecture/component-model.md` | `f00c3f4a21a098ab924ee4dfa9d993346c575da37bffaca327530511959615c8` |
| `docs/architecture/evolution-loop.md` | `94fd717f5e9fc520d1d96be54ddffe89a8105a3255cb43191e03b3ca12718673` |
| `docs/architecture/execution-loop.md` | `e4a62bedf191a5e97b59e52adf3604045a4914a8bd763d21422fca5a8a8cae7b` |
| `docs/architecture/system-context.md` | `7757c7b6e0793da4465ccc0255175e476d919a6d35077f9f221f32ab6438a662` |
| `docs/architecture/threat-model.md` | `9031db64096594296924eb69c8f91f3647382dbd6968d89033856741e7e3af86` |
| `docs/architecture/trust-boundary.md` | `5e41119bccd56fa0655ffdd50715d135a1dd59e07c48d341825f88d9b9a3da55` |
| `docs/architecture/gate1-change-log.md` | `eb5c6f43bd7ba2206c12fc68680a433f46693c946e8277e7ed396453c4774a74` |

## Unchanged accepted areas

H3/B6-RAW, one-shot gate governance, the candidate-cost formula, the fourteen-edge multi-cause graph,
H4 disposition, qualification/deployment separation, and claim discipline were not modified. Their
existing hashes remain those recorded in the Gate 1RR packet.
