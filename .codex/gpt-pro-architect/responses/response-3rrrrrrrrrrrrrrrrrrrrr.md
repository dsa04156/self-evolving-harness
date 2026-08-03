DECISION: APPROVE

SOURCE_AND_SEALING:
The two-commit construction satisfies the authorized non-self-referential evidence pattern.

The clean implementation commit:

73753fc3967f0d533754ab89b1c0b4527e8de7cf
tree b93e968e8a49381e33ba67cea8dd6a969be11868

contains the schema, field-to-evidence model, firewall, portability contract, independent Python implementation, semantic verifier, generator, verification CLI, tests, documentation, exports, and commands. It does not contain either generated governance record.

The sealing commit:

1ccf571665b370c8604900cc0e0e94962e354d19
tree 2f0ceabd59370fc4dd308a4b460ce3b027e162bd

adds exactly:

calibration-plan-assembly-readiness.json
calibration-plan-assembly-readiness-audit-receipt.json

All 24 behavior and evidence references in the signed readiness record point to the earlier clean source commit. Neither generated record claims that its own bytes existed in the source snapshot used to construct it.

Create-exclusive generation is correctly enforced. A second invocation fails with EEXIST, leaves the sealed hashes unchanged, and does not dirty the worktree. No Git push occurred, and the public remote remains unchanged.

FIELD_TO_EVIDENCE_MAPPING:
The mapping is complete, value-free, and correctly tied to the previously approved contracts.

The reported cardinality is internally consistent:

25 original sentinel paths
10 phase-wildcard paths × 12 phase IDs
1 separate statisticalMargins group
136 effective future outputs

Each of the 26 map rows binds:

the exact path or group;

original sentinel status and token;

expansion count;

approved direct derivation class;

dependency node;

future producer role;

future protocol-author proposal record;

required independent verification receipt;

sole admissible source class; and

prohibited source classes.

Every row explicitly retains:

valueSupplied = false
futureEvidenceReferenceSupplied = false

The verifier reads the prior numeric-freeze entry and calibration contract directly from their declared Git snapshots and reconstructs the paths, phase expansion, classes, and graph nodes. It does not trust a newly generated summary simply because that summary appears confident and has a long hash attached.

The node assignments are coherent:

B = provider/model identity
C = environment identity
F = per-request token cap
G = empirical phase caps
H = normative process/feedback topology
J = provider cost caps
K = rollout count
L = rollout seed values
M = statistical margins
N = H4 identity or withdrawal

The future evidence-class labels remain descriptions of required evidence. They do not assert that any identity, price, pilot aggregate, verification receipt, or protocol-author proposal currently exists.

FREEZE_ADMISSION_FIREWALL:
The metadata-only freeze-admission firewall is accepted.

It fails closed on:

incomplete, duplicate, conflicting, or partial mappings;

wrong producer or verifier authority;

unresolved dependency nodes;

absent E1, E2, E3, or E4 verification lineage;

synthetic or public-development ancestry;

provider-smoke, public-fixture, protected, vault, or evaluator-raw ancestry;

direct evaluator or scorer value input;

hidden defaults or sentinel interpretation;

premature candidate values or grid instances;

premature protocol, budget, plan, envelope, or value-set identities;

nonzero execution authority; and

any attempt to create or activate O.

The accepted synthetic completeness probe may report:

futureOProposalPreconditionsMet = true

only as a test of the Boolean predicate against synthetic metadata. It is not an admission receipt, a completed dependency graph, or evidence that real B through N inputs exist. The decisive outputs remain:

oProposalCreated = false
oActivationPerformed = false
authorityGranted = false

That distinction must remain schema-enforced. A future executable admission path may not consume this public-development probe as evidence that the real freeze prerequisites were met.

GRID_AND_PORTABILITY_CONTRACT:
The future grid schemas correctly constrain shape without instantiating protocol values.

The F, G, K, and M schemas bind:

maximum cardinality;

ordering requirements;

units;

required commitment domains;

rounding and tie rules; and

absence of actual candidate values and actual grid instances.

The fixed K domain {2,3,5,8} is an already approved normative program constant, not a newly selected calibration grid. J and L correctly consume verified G and K results without inventing separate candidate grids.

The arithmetic and serialization contract is sufficiently exact for this synthetic readiness scope. It freezes:

safe nonnegative integer inputs and outputs;

unbounded integer intermediates with rejection before unsafe serialization;

exact rational ceiling division;

ordered binary64 Wilson operations;

fixed z;

no fused operation;

upward probability rounding;

integer comparison after rounding;

upward resource-quantum rounding;

componentwise upward cost rounding;

exact seed-preimage encoding;

zero-based seed counters;

full SHA-256 output;

canonical JSON ordering and encoding; and

newline exclusion from hash input.

The independent TypeScript and Python implementations produce byte-identical output for the eight bound vectors. That is adequate portability evidence for the represented operations and this non-admissible readiness artifact.

It is not a proof of equivalence over every possible future input or runtime. Before real calibration, the executable plan must pin the arithmetic-contract version, runtime identities, full candidate domains, and a broader boundary corpus appropriate to the actual numeric ranges. The current vectors remain conformance tests, not estimator-validity evidence.

IDENTITY_SIGNATURE_AND_AUDIT_BOUNDARY:
The identity, signature, and audit boundary is sufficient.

The following roles are pairwise distinct across principal ID, instance ID, key ID, public-key digest, and process identity:

protocol_author
independent_verifier
audit_store

The protocol author signs the readiness record. The independent verifier signs a nested statement binding the exact record ID, internal hash, raw bytes, source snapshot, semantic-verification result, and zero-authority state. The audit store signs a separate reference-only receipt over that statement and record reference.

The audit receipt does not duplicate the readiness body. It binds the exact path, size, source identity, raw hash, content identity, verifier statement, and authority disposition.

Every role has empty active handles, delegations, and aliases. Only public principals and Ed25519 attestations are serialized. No private key, credential, token, browser material, task handle, protected path, or reusable capability appears in the records.

This establishes local role attribution and tamper evidence under the project’s accepted trust assumptions. It is not external certification or proof that a compromised protocol author, verifier, audit key, or host could not fabricate a replacement history.

ADVERSARIAL_AND_VERIFICATION_EVIDENCE:
The adversarial and independent-verification evidence is sufficient for the authorized scope.

The 18 semantic record mutations are rehashed and validly signed before admission. Rejection therefore depends on the contract rather than on someone neglecting to repair the outer signature after vandalizing the payload.

The covered cases include:

incomplete mapping;

duplicate or conflicting mappings;

wrong producer authority;

synthetic output admitted as a numeric source;

removal of public-development ancestry restrictions;

missing or wrong verifier receipts;

actual candidate values or grid instances;

Wilson arithmetic drift;

serialization drift;

partial-freeze representation;

final protocol identity allocation;

nonzero provider/model budget;

protected-data authority;

research-evidence eligibility escalation;

O creation permission;

derivation-program identity substitution; and

protocol-author/verifier role collapse.

A separately valid wrong-role signature is rejected. Substitution of the referenced readiness bytes also invalidates both the nested verification statement and the outer audit receipt.

The firewall additionally exercises 14 denial families, including unresolved dependencies, missing E1/E2/E4 stages, contaminated ancestry, direct evaluator/scorer inputs, sentinel interpretation, hidden defaults, premature identities, nonzero authority, and O requests.

The reported clean validation is adequate:

full deterministic suite:          185/185 pass
focused tests:                       6/6 pass
cross-language vectors:              8/8 identical
validly re-signed attacks:          18/18 rejected
firewall denial families:           14/14 observed
assembly verifier:                  pass
derivation verifier:                pass
calibration-contract verifier:      pass
numeric-freeze entry verifier:      pass
trust-plane verifier:               pass
unresolved obligations:             7
authorities granted:                 0
worktree:                            clean
repository push:                     0

No existing evidence body, numeric-freeze entry, calibration contract, derivation-readiness record, governance history, or outstanding-obligations record was modified.

ZERO_AUTHORITY_AND_CLAIM_BOUNDARY:
The readiness record remains strictly zero-execution, public-development-only, non-admissible, and non-authorizing.

All resource and action budgets remain zero. All protected eligibility and authority flags remain false. The following remain null:

finalProtocolId
budgetFreezeId
calibrationPlanManifestId
calibrationEnvelopeId
selectedProtocolValueSetId

The implementation can represent and test the future completeness predicate. It cannot:

instantiate a calibration plan;

create a calibration envelope;

admit evidence into a freeze;

fill a sentinel or margin;

create or activate O;

allocate a protocol or budget identity;

unlock protected data;

execute a task;

or grant research authority.

The readiness evidence supports only this statement:

A value-free field-to-evidence mapping, metadata-only freeze-admission firewall, candidate-grid shape contract, and synthetic arithmetic-portability boundary were locally implemented and independently verified.

It does not establish estimator adequacy, sample sufficiency, provider identity, model identity, environment reproducibility, real pricing, pilot validity, numeric admissibility, research fairness, performance, attribution, generalization, confidentiality, containment, security certification, evolution, or self-improvement.

BLOCKING_FINDINGS:
None for the authorized calibration-plan assembly and freeze-admission readiness implementation.

AUTHORIZED_NEXT_SCOPE:
The next authorized scope is limited to an offline, body-free calibration evidence-record contract package. It may define future evidence formats and authority transitions, but it may not instantiate a calibration plan, issue a capability, allocate a nonzero budget, or process an actual measurement.

Authorized work:

Define closed schemas for the already approved future evidence stages:

E0:
  CalibrationExecutionReceipt
  CalibrationUsageReceipt
  CalibrationIncidentRecord

E1:
  CalibrationMeasurementCommitment
  CalibrationEvaluatorFailureRecord
  CalibrationEvaluatorIncidentRecord

E2:
  AggregateCalibrationCommitment
  RejectedDerivationCandidateCommitment
  CalibrationWithdrawalRecord
  CalibrationScorerFailureRecord
  CalibrationScorerIncidentRecord

E3:
  CalibrationVerificationReceipt

E4:
  ProtocolAuthorDerivedValueProposal

Define a closed, body-free one-time calibration-capability schema containing only synthetic opaque commitments. It must contain no task body, verifier logic, label, answer, path, real handle, provider credential, actual model identity, or active authority. Every instance used in tests must be synthetic and marked non-admissible.

Bind exclusive record ownership:

executor             → E0
calibration_evaluator → E1
calibration_scorer    → E2
independent_verifier  → E3
protocol_author       → E4

The schema and semantic verifier must reject wrong-role signatures, shared keys, delegated creation authority, proxying, wrappers, aliases, co-signing, and combined record types.

Enforce the one-way graph:

E0 → E1 → E2 → E3 → E4

and reject:

E0 → E2
E1 → E4
evaluator_raw → E2
E1 → O
E2 → O
E4 → O without a later accepted freeze transaction

Define field-level disclosure rules. In particular:

E0 may bind opaque execution and accounting commitments only;

E1 may bind normalized measurement commitments and incident/missingness state;

E2 may bind ordered E1 commitments, grids, rejected values, rule branch, precision checks, and withdrawal state;

E3 may bind reference-only verification results;

E4 may bind only independently verified aggregate proposals;

none may contain real task bodies, raw model output, verifier source, credentials, protected paths, promotion state, or deployment state.

Add a metadata-only lifecycle and replay contract for future one-time calibration capabilities. All current capabilities must remain:

issued = false
consumed = false
handle = null
executionAuthorized = false

No actual capability issuance or consumption is authorized.

Add deterministic semantic verification and validly re-signed attacks for:

wrong record creator;

evaluator/scorer identity collapse;

scorer access to raw or protected data;

evaluator direct release to the protocol author;

executor-to-scorer bypass;

missing or reordered evidence stages;

duplicate or omitted expected strata;

unreported missingness or incidents;

post-result grid substitution;

unverified aggregate use;

synthetic or public-development evidence marked admissible;

capability issuance or consumption;

nonzero budgets;

final identity allocation;

O creation or activation; and

authority or eligibility escalation.

Create one protocol-author-signed public-development readiness record and one reference-only audit-store receipt under the established two-commit layout. Both must grant zero authority and reference the current assembly-readiness record without modifying it.

Keep every test fixture and output marked:

publicDevelopment = true
authorizedForResearchEvidence = false
admissibleAsCalibrationEvidence = false
admissibleAsNumericFreezeValue = false
confirmatory = false

Submit a narrow evidence packet containing source and sealing commits, schema and verifier hashes, record-ownership and disclosure matrices, graph tests, validly re-signed attacks, receipt identities, unchanged obligations, and proof that no real data, capability, execution, or authority was introduced.

STILL_PROHIBITED:
The following remain unauthorized:

an actual CalibrationPlanManifest;

an executable calibration envelope;

issuance or consumption of a calibration dataset capability;

any nonzero provider, model, token, tool, process, time, CPU, memory, output, or cost budget;

provider, model, service-tier, environment, or real-price selection;

API credential request, storage, or use;

provider/model calls or Codex CLI use as a provider backend;

benchmark or evaluator-vault unlock;

mine, dedicated-pilot, gate, final, temporal, sealed, withheld-public, multi-cause, or Terminal-Bench execution;

real task bodies, verifier logic, labels, expected answers, task handles, paths, traces, outcomes, or raw measurements;

filling any sentinel or statistical margin;

allocating final protocol, budget-freeze, plan, envelope, or selected-value identities;

creating or activating O;

research scheduler or B0–B6 execution;

attribution, mutation, or candidate creation;

candidate selection, qualification, promotion, canary, deployment, or production-pointer modification;

Git push, release, package, announcement, or publication; and

performance, fairness, attribution, generalization, confidentiality, containment, security-certification, evolution, or self-improvement claims.
