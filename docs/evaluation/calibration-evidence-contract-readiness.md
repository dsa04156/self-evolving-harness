# Body-free calibration evidence contract readiness

Status: public-development, synthetic, offline, zero-execution contract readiness only.

This package defines closed formats for a possible future calibration evidence chain. It does not
create a calibration plan, issue a dataset capability, execute a model or tool, admit evidence, fill
a protocol value, or create `O`.

## Evidence stages and exclusive owners

The record graph is strictly one-way:

```text
E0 executor receipts
  -> E1 evaluator commitments
  -> E2 scorer commitments
  -> E3 independent verification
  -> E4 protocol-author value commitment
```

The 13 closed record types are exclusively owned as follows:

- `calibration_executor`: `CalibrationExecutionReceipt`, `CalibrationUsageReceipt`,
  `CalibrationIncidentRecord`;
- `calibration_evaluator`: `CalibrationMeasurementCommitment`,
  `CalibrationEvaluatorFailureRecord`, `CalibrationEvaluatorIncidentRecord`;
- `calibration_scorer`: `AggregateCalibrationCommitment`,
  `RejectedDerivationCandidateCommitment`, `CalibrationWithdrawalRecord`,
  `CalibrationScorerFailureRecord`, `CalibrationScorerIncidentRecord`;
- `independent_verifier`: `CalibrationVerificationReceipt`;
- `protocol_author`: `ProtocolAuthorDerivedValueProposal`.

Each record has exactly one direct owner signature. Delegation, proxy creation, wrappers, aliases,
co-signing, shared keys, and combined record types are rejected. Executor, evaluator, scorer,
verifier, protocol author, and audit store are pairwise distinct across principal ID, instance ID,
key ID, public-key digest, and process identity.

## Disclosure boundary

Every payload is body-free and commitment-oriented. E0 contains only opaque execution, accounting,
and incident commitments. E1 contains normalized measurement commitments plus explicit missingness,
failure, and incident state. E2 contains ordered E1 references, expected and observed stratum
commitments, a precommitted grid identifier, rejected-candidate commitments, rule branch, precision
commitment, and withdrawal state. E3 is reference-only. E4 contains only an independently verified
aggregate reference and a derived-value commitment.

No schema has a field for a real task body, raw model output, verifier implementation, label,
expected answer, provider credential, protected path, promotion state, or deployment state.
Additional properties are rejected.

## Graph and completeness checks

The semantic verifier requires every dependency to bind the exact ID, hash, stage, and type of a
record in the immediately preceding stage. It rejects missing or reordered stages, `E0->E2`,
`E1->E4`, evaluator-raw input to E2, and every route to `O`.

The synthetic conformance chain contains two opaque expected-stratum commitments. The aggregate must
cover each exactly once, preserve the ordered E1 list, disclose evaluator failure and incident
records, retain the pre-result grid commitment, and be covered by E3 before E4 can reference it.
These are structural conformance checks, not measurements.

## One-time capability descriptor

The capability object is a descriptor, not a handle. It contains only synthetic opaque commitments
and has this immutable current lifecycle:

```text
issued=false
consumed=false
handle=null
executionAuthorized=false
observedConsumptionCount=0
```

All provider, model, token, tool, time, process, CPU, memory, output, cost, and protected-access
budgets remain zero. No issuance or consumption receipt exists.

## Sealing and audit

The protocol author signs one readiness record over the schema inventory, ownership and disclosure
matrices, graph contract, unissued capability descriptor, source snapshot, and prior assembly
readiness. A distinct independent verifier signs a byte-level verification statement. A distinct
audit store signs a reference-only receipt. The two generated files are added only after the clean
implementation source commit, preventing self-reference.

## Non-claims

This package establishes only that the body-free contract shapes and a synthetic semantic verifier
were locally implemented. It is not calibration evidence and does not establish estimator adequacy,
sample sufficiency, provider/model/environment identity, pricing, matched-budget fairness,
performance, attribution, generalization, confidentiality, containment, security certification,
evolution, or self-improvement. The seven trust-plane obligations remain unresolved.
