# Calibration Derivation Program Readiness

Status: public-development synthetic conformance only  
Research evidence: not authorized  
Numeric-freeze admissibility: none

## Purpose

This package implements deterministic arithmetic and selection behavior for the already preregistered
future derivation targets `F`, `G`, `J`, `K`, `L`, and `M`. It answers a narrow software-readiness
question: given an explicitly supplied, manually authored synthetic table, does the program apply the
frozen grid, estimator, ordering, tie, and rounding rules deterministically?

It is not any of the following:

- a `CalibrationPlanManifest`;
- a calibration envelope or pilot receipt;
- a protocol or budget freeze;
- a provider, model, environment, or price selection;
- evidence that an estimator is adequate on real tasks; or
- permission to run a provider, benchmark, calibration, B0–B6 comparison, mutation, selection,
  promotion, deployment, or claim workflow.

The prior numeric-freeze entry and calibration contract remain unchanged. All their pending sentinels
and all seven trust-plane obligations remain unresolved.

## Pure programs

| Target | Behavior frozen by this readiness package |
|---|---|
| F | At most eight explicit token-cap candidates; every required stratum must be present; one-sided 95% Wilson upper bounds are rounded upward to probability micros; the smallest cap with every bound at most 1% wins. |
| G | The same bound rule applies independently to each declared phase/resource grid; the smallest feasible raw cap wins and is rounded upward to its explicit positive integer quantum. |
| J | A selected synthetic G result supplies request/input/output caps; an explicitly synthetic schedule supplies integer-micro prices; each token component is rounded upward before summation. |
| K | The only permitted count grid is exactly `{2,3,5,8}`; the first count with MCSE at most 1 percentage point and seed-variance share at most 20% wins. No feasible count produces a synthetic `precision_limited` result at 8, never an admissible freeze value. |
| L | Seeds are full SHA-256 digests over a fixed domain, a synthetic root, and an ascending zero-based counter. The output length must equal a selected count in `{2,3,5,8}`. |
| M | At most eight candidates are ordered by increasing allowed loss; the smallest loss is the strictest; power and retention must each be at least 80%, and loss cannot exceed either the predeclared maximum or one-task resolution. Safety margin remains zero. |

The Wilson implementation pins `z = 1.644854` as integer micros. That is a deterministic program
identity, not a claim that a future sample size, dependency structure, or pilot design will be adequate.
Any later statistical change requires a new source hash, program identity, readiness record, and
protocol amendment; it cannot be hidden behind a compatible function name.

## Synthetic-only input boundary

Every accepted table must declare all of the following:

- `publicDevelopment = true`;
- `authorizedForResearchEvidence = false`;
- `admissibleAsNumericFreezeValue = false`;
- `confirmatory = false`;
- manually authored synthetic ancestry; and
- no protected-data, provider-smoke, public-fixture, benchmark, real-price, provider/model identity, or
  protected-capability ancestry.

The pure program source has no filesystem, shell, Git, child-process, network, environment-variable,
clock, or random-number dependency. Its inputs contain no implicit candidate defaults. Candidate grids
are content committed before their synthetic results; a mismatch withdraws rather than silently
recomputing the commitment.

Every synthetic result repeats the four eligibility markers above. The readiness record contains no
binding from a synthetic result to a pending sentinel, statistical margin, `ProtocolManifest`, or
`BudgetFreezeManifest`.

## Failure dispositions

Structural or governance drift is rejected:

- grid enlargement or an implicit candidate;
- estimator, confidence, threshold, tie, or rounding drift;
- seed-domain or seed-order drift;
- a dependency cycle or active `O → D` edge;
- synthetic output used as a sentinel or manifest value;
- forbidden ancestry;
- protocol-author, independent-verifier, or audit-store role collapse;
- nonzero research execution budget;
- final identity allocation; or
- authority/eligibility escalation.

Measurement-quality failures cause a synthetic withdrawal rather than selective exclusion:

- a missing required stratum;
- missing usage not charged at its reservation;
- an infrastructure incident;
- a grid changed after its commitment; or
- no feasible precommitted candidate.

## Signed record boundary

The generated record type is exactly `calibration_derivation_program_readiness`. It is signed by the
protocol author and binds:

- the exact numeric-freeze entry and calibration-contract identities and raw hashes;
- a clean Git source commit and tree;
- all source artifact byte hashes;
- six content-addressed program definitions;
- the finite grid and estimator contracts;
- eleven public synthetic conformance vectors;
- the closed failure/withdrawal contract;
- a pairwise-disjoint protocol author, independent verifier, and audit store;
- a zero research-execution budget;
- false authority and eligibility flags; and
- null final protocol, budget, plan, envelope, and selected-value identities.

The independent verifier recomputes every conformance result, checks fixed input/result hashes, verifies
the dependency DAG, checks source purity, validates all Git byte bindings, and confirms the seven
outstanding obligations are unchanged. It signs a verification statement embedded in one outer,
reference-only audit-store receipt. The audit-store signature records the statement; it does not acquire
the independent verifier’s role or grant authority.

## Non-self-referential sealing

The source commit must include code, schemas, tests, commands, and this document, but neither generated
record. From a clean source commit:

```bash
npm run create:calibration-derivation-readiness
```

The generator uses create-exclusive writes for exactly:

- `governance/gate3/calibration-derivation-program-readiness.json`
- `governance/gate3/calibration-derivation-program-readiness-audit-receipt.json`

Those two records are committed separately as the sealing commit. Re-running the generator cannot
overwrite them. Independent verification after sealing is:

```bash
npm run verify:calibration-derivation-readiness
```

Passing either command does not authorize calibration or resolve a pending numeric value.
