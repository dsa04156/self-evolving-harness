# Calibration plan assembly and freeze-admission readiness

Status: public-development, offline, zero-execution readiness only. This artifact is not a
`CalibrationPlanManifest`, calibration envelope, protocol freeze, budget freeze, or source of numeric
values.

## Purpose

The assembly layer closes the gap between deterministic derivation programs and any future atomic
protocol freeze. It specifies which future signed evidence may populate each pending field, and it
rejects incomplete, contaminated, unverified, role-collapsed, or premature inputs before node `O` can
even be proposed.

The layer never reads a task, provider response, benchmark, evaluator vault, real price, or protected
data. It has no execution authority and contains no actual candidate grid or calibration value.

## Complete mapping

`buildCalibrationFieldEvidenceMap()` produces exactly 26 value-free rows:

- all 25 pending sentinel paths from the approved numeric-freeze entry;
- the separate `statisticalMargins` group.

Every row fixes the direct derivation class, dependency node, future protocol-author proposal type,
required independent receipt, admissible direct source class, prohibited source classes, and effective
phase expansion. The 25 paths expand to 135 future outputs; statistical margins add one, for 136 total.
Every row has `valueSupplied=false` and `futureEvidenceReferenceSupplied=false`.

## Freeze-admission firewall

The pure firewall evaluates metadata only. It rejects:

- missing, duplicate, partial, or conflicting field mappings;
- unresolved B–N dependencies or unverified E1/E2/E4 stages;
- the wrong producer, record, receipt, graph node, or source class;
- synthetic conformance or public-development output as calibration evidence;
- provider-smoke, public-fixture, benchmark/vault, protected-direct, or evaluator-raw ancestry;
- direct evaluator/scorer values, sentinel interpretation, or hidden defaults;
- inserted candidate-grid values;
- premature final protocol, budget, plan, envelope, or selected-value identities;
- nonzero execution authority; and
- requests to create or activate `O`.

A clean metadata probe can establish only that future `O` proposal preconditions are complete. The
firewall always returns `oProposalCreated=false`, `oActivationPerformed=false`, and
`authorityGranted=false`.

## Future grid schemas

The record defines value-free shapes for F, G, K, and M. They constrain cardinality, ordering, units,
required fields, rounding metadata, and commitment domains. They contain no `candidates` property and
declare both `actualCandidateValuesPresent=false` and `actualGridInstancePresent=false`. J and L bind
to outputs of G and K respectively and therefore do not introduce additional candidate grids.

## Arithmetic portability

The contract fixes:

- nonnegative I-JSON input/output integers and unbounded integer intermediates;
- overflow rejection before serialization;
- positive-denominator rational ceil division;
- the exact binary64 Wilson operation order and upward probability-micro rounding;
- integer comparison only after declared rounding;
- componentwise token-price rounding before cost summation;
- UTF-8 seed preimages with NUL separators and unpadded base-10 counters;
- canonical JSON serialization and newline-excluded hashing.

Eight manually authored synthetic golden vectors are produced independently by TypeScript and a
Python 3 standard-library reference. Their canonical arrays must be byte-identical. These vectors are
public-development conformance checks only; they are not research evidence or numeric-freeze inputs.

## Identity and evidence boundary

The signed readiness record binds the numeric-freeze entry, calibration contract, derivation-program
readiness record, six F/G/J/K/L/M program identities, the authorizing Architect packet/ruling, and all
behavior-bearing source bytes. Protocol author, independent verifier, and audit store are pairwise
distinct by principal, instance, key, public-key digest, and process identity. The audit record embeds
one independently signed verification statement and remains reference-only.

## Non-claims

This implementation does not establish estimator adequacy, a feasible future grid, a provider/model/
environment/price identity, a calibration plan, a numeric freeze, fair matched budgets, benchmark
performance, attribution quality, generalization, security certification, evolution, or
self-improvement. All seven trust-plane obligations remain unresolved until separately authorized,
executed, and verified.
