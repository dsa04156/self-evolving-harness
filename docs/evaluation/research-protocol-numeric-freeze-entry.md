# Research protocol numeric-freeze entry

Status: approved local public-development contract; numeric freeze remains unresolved

## Purpose

This entry records that the project is ready to describe a future numeric-freeze transaction without
performing one. It is deliberately not a `ProtocolManifest`, `BudgetFreezeManifest`, calibration,
pilot, or research result.

The selected obligation remains:

```text
research_protocol_numeric_freeze
status = unresolved
evidencePresent = false
```

## Two-commit layout

The implementation-source commit contains the closed schema, record constructor, independent verifier,
generator, verifier CLI, adversarial tests, and this document. Generation is permitted only from that
clean commit. The signed entry and reference-only audit receipt are written in a later sealing commit and
name the earlier source commit and tree.

This prevents a stored record from pretending to be part of the source tree whose exact bytes it claims
to verify.

## Entry invariants

- The entry ID uses the `nfe-sha256:` namespace, never `protocol-sha256:` or `bf-sha256:`.
- Final protocol, budget-freeze, provider, model, service-tier, and research-budget identities are null.
- Every provider, token, cost, tool, data-access, feedback, scheduler, task, candidate, evaluation,
  decision, deployment, and push count is zero.
- All authority and protected eligibility flags are false; only `publicDevelopment` is true.
- The signed outstanding-obligations matrix remains unchanged.
- All eight declared pending-field groups and the 25-entry effective sentinel inventory remain present.
- The old provider-smoke budget fixture is bound only as an excluded development artifact. It cannot be
  a dependency, provenance ancestor, value source, wrapper, alias, or supersession target.
- The entry contains only a whitelist of public-development source, policy, schema, governance, and
  implementation artifacts from one declared Git commit.

## Independent verification

The verifier separately checks Git commit/tree identity, every artifact path/hash/size/media type,
protocol-author and audit-store signatures, record IDs and hashes, conformance and obligation state,
zero budgets, sentinel completeness, protected-data absence, synthetic-fixture exclusion, null future
identities, and the absence of pooling or inherited authority.

The audit receipt is created only after entry verification succeeds. It references the entry ID, entry
hash, exact serialized-entry hash and size, source snapshot, and verifier artifact. It duplicates no
entry policy body and grants zero authority.

## Claim boundary

Passing this contract establishes only that the no-execution entry boundary is signed and locally
verified. It does not establish a completed numeric freeze, frozen research protocol, provider readiness,
benchmark validity, performance, attribution accuracy, generalization, security certification,
evolution, or self-improvement.
