# Zero-execution calibration-contract preregistration

This artifact is a public-development governance contract. It does not run calibration, select a
provider or model, open a benchmark vault, fill a numeric sentinel, allocate a nonzero budget, create a
final protocol identity, or authorize research evidence.

## Bound state

- Numeric-freeze entry:
  `nfe-sha256:7517cce6f2878429161bd73154d1ef71f5bb8fe27ca3a77e08b4b55b43df268f`
- Pending inventory: exactly 25 sentinels, eight groups, and the existing 12 phase IDs.
- Derivation contract: six closed classes, 26 assignments including the `statisticalMargins` group,
  five deterministic rule families, the accepted acyclic numeric DAG, and atomic joint-freeze rules.
- Runtime state: all provider, token, tool, process, time, memory, output, cost, task, calibration,
  mutation, evaluation, selection, promotion, deployment, and push budgets are zero.
- Final state: `finalProtocolId = null`, `budgetFreezeId = null`, all authority and protected-eligibility
  flags are false.

## Evaluator/scorer boundary

The future `calibration_evaluator` and `calibration_scorer` have separate public identities, keys,
process identities, reserved writable roots, canonical mount sources, and backing-object identities.
The reserved mounts are not active and no capability handle is issued by this record.

The evaluator may later produce only measurement, evaluator-failure, and evaluator-incident records.
The scorer may later consume only signed reference-level commitments and produce aggregate,
rejected-grid, withdrawal, scorer-failure, and scorer-incident records. It cannot read task bodies, raw
outputs, verifier source, credentials, provider capability, or evaluator raw storage.

The evidence flow is one-way:

```text
D -> E0 -> E1 -> E2 -> E3 -> E4 -> F/G/K/M -> O
```

Direct `E1 -> E4`, `E0 -> E2`, raw evaluator data into `E2`, unverified `E1/E2 -> O`, and `O -> D`
edges are forbidden.

## Admission and sealing

JSON Schema closes every record shape and fixes all zero/false/null fields. A separate semantic verifier
checks cross-object inequalities, public-key digests, underlying mount-source separation, exact
inventory and graphs, exclusive record ownership, source-commit bytes, the unresolved-obligation
matrix, and the signed Architect decision chain.

The implementation uses two commits. The first contains schema, source, verifier, generator, tests, and
this documentation. The second contains exactly one signed contract and one reference-only audit-store
receipt. Neither generated record is part of its own source snapshot.

## Non-claims

Passing these checks demonstrates only deterministic local contract admission. It is not calibration
evidence, research evidence, a security certification, a performance result, harness evolution, or
self-improvement.
