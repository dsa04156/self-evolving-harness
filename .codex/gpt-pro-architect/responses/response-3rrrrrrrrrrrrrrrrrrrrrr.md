DECISION: REVISE

RECORD_INVENTORY_AND_OWNERSHIP:
The closed 14-way schema inventory is acceptable in structure:

13 signed E0–E4 evidence records
+ 1 synthetic capability descriptor

The exclusive creator assignments are also coherent:

calibration_executor  → E0
calibration_evaluator → E1
calibration_scorer    → E2
independent_verifier  → E3
protocol_author       → E4

The packet reports closed payloads, role-bound ID domains, direct signatures, pairwise-disjoint principals, and rejection of delegation, proxying, wrapping, aliasing, co-signing, and combined record types. Those controls sufficiently preserve evaluator/scorer separation for this body-free contract.

The disclosure matrix is also adequate. No schema field admits a raw task body, model output, verifier source, label, expected answer, credential, protected path, promotion state, or deployment state. Commitment fields remain constrained to canonical SHA-256 identities.

EVIDENCE_GRAPH_AND_TERMINAL_SEMANTICS:
The immediate-stage graph is directionally correct:

E0 → E1 → E2 → E3 → E4

and the packet correctly rejects stage-skipping edges.

The terminal outcome semantics are not correct or sufficiently constrained.

The single accepted synthetic fixture contains all five E2 record types:

AggregateCalibrationCommitment
RejectedDerivationCandidateCommitment
CalibrationWithdrawalRecord
CalibrationScorerFailureRecord
CalibrationScorerIncidentRecord

and then continues through:

CalibrationVerificationReceipt
→ ProtocolAuthorDerivedValueProposal

That permits one evidence graph to contain, simultaneously:

an aggregate suitable for a derived-value proposal;

a withdrawal;

a scorer failure; and

an E4 proposal.

No rule in the packet makes those terminal outcomes mutually exclusive. E3 is merely required to cover every E2 record and reference the one aggregate. E4 may then reference that aggregate even though the same graph also says the attempt withdrew or failed.

A concrete accepted-by-description counterexample is:

expected stratum missing
→ evaluator failure record
→ scorer withdrawal record
→ scorer failure record
→ aggregate commitment
→ verification receipt
→ derived-value proposal

That contradicts the already accepted fail-closed derivation rules, under which missing required strata, incomplete evidence, or scorer failure blocks value derivation. The graph has faithfully ordered its records while allowing them to disagree about whether the calibration succeeded. Bureaucracy has achieved type safety without meaning, a familiar milestone.

The contract needs explicit branch semantics:

success
withdrawal
failure

Only the success branch may produce an aggregate accepted for E4.

STAGE_COMPLETENESS:
The packet establishes exact E1 coverage by E2 and exact E2 coverage by E3, but it does not establish equivalent completeness from E0 to E1.

The reported rules require each E1 record to have at least one E0 predecessor. They do not require that:

every execution receipt is consumed by exactly one appropriate E1 result;

every usage receipt is consumed and accounting-bound;

each expected stratum has the required execution and usage evidence;

no E0 record is orphaned;

no E0 record is reused across incompatible E1 measurements;

E0 and E1 stratum commitments agree; or

an absent execution or usage receipt forces a failure or withdrawal disposition.

As stated, an E1 measurement could satisfy the immediate-predecessor rule while omitting a relevant usage receipt, leaving the eventual aggregate apparently complete but incompletely accounted.

The existing incident matching is useful but does not replace complete execution-and-usage lineage.

DISCLOSURE_AND_CAPABILITY:
The body-free disclosure boundary is accepted.

The synthetic capability descriptor remains:

issued = false
consumed = false
handle = null
executionAuthorized = false

and carries zero observed consumption. Mutation of issuance, consumption, handle, execution authority, or replay state is rejected.

No real capability, task handle, dataset role, protected input, execution budget, or model identity is introduced. The descriptor is therefore correctly limited to readiness testing.

The scorer receives normalized commitments rather than evaluator raw material, and the protocol author receives only independently verified aggregate references. The remaining defect is not protected-data leakage; it is that the contract does not determine when an aggregate is semantically eligible to travel down that path.

SOURCE_SEALING_AND_AUDIT:
The non-self-referential two-commit construction is accepted.

The implementation commit contains the schemas, model, verifier, tests, and documentation but no generated readiness records. The later sealing commit adds exactly the readiness record and reference-only audit receipt. All source references point to the earlier implementation snapshot.

Create-exclusive replay correctly fails with EEXIST, leaves the record hashes unchanged, and preserves a clean worktree.

The protocol-author signature, nested independent-verifier statement, and separate audit-store signature provide an appropriate local integrity chain. Readiness-byte substitution invalidates both verification layers.

No source, sealing, or audit blocker remains.

ADVERSARIAL_AND_VERIFICATION_EVIDENCE:
The reported attacks provide substantial evidence for:

wrong-role creation;

evaluator/scorer collapse;

wrapper and delegation attacks;

stage bypass;

missing or duplicate strata;

incident and missingness coverage;

grid substitution;

protected-data access;

unverified aggregate use;

capability escalation;

nonzero budgets;

premature identities;

O allocation;

source-artifact drift; and

receipt substitution.

They do not test the material contradictions above.

Missing adversarial cases include:

aggregate and withdrawal in one E2 graph;

aggregate and scorer failure in one E2 graph;

E4 after a verified withdrawal;

E4 after a verified scorer failure;

successful aggregate with an expected stratum marked missing_declared;

successful aggregate with an evaluator failure record;

orphaned E0 execution receipt;

orphaned E0 usage receipt;

one E0 receipt reused by multiple incompatible E1 records;

E1 measurement with execution evidence but no matching usage receipt;

E0/E1 stratum-commitment mismatch; and

E3 success disposition that does not match the terminal E2 branch.

The 198 passing tests demonstrate that the implemented contract behaves as written. They do not establish that the written terminal semantics are scientifically coherent.

CLAIM_DISCIPLINE:
The packet remains appropriately non-empirical and zero-authority.

It reports:

actual evidence records = 0
issued capabilities = 0
consumed capabilities = 0
provider/model attempts = 0
protected-data accesses = 0
final identities = 0
O proposals/activations = 0/0
authorities granted = 0

Nothing here supports calibration validity, numeric admissibility, provider readiness, estimator adequacy, performance, fairness, attribution, generalization, security, evolution, or self-improvement.

The claim boundary is accepted. The evidence-branch contradiction must still be corrected before this readiness package can be approved.

BLOCKING_FINDINGS:

Mutually contradictory E2 outcomes are accepted in one evidence graph. The synthetic fixture contains an aggregate, withdrawal, and scorer failure together.

E4 is not gated on an exclusive successful terminal disposition. A derived-value proposal can follow an E3 receipt that also verifies withdrawal or failure evidence.

Missingness and evaluator failure are not shown to prohibit successful aggregation. This contradicts the accepted complete-stratum and fail-closed derivation rules.

E0-to-E1 evidence coverage is not exact. The contract does not establish that every execution and usage receipt is consumed exactly once, matched to the correct stratum, and accounted for before E2 aggregation.

These are one underlying contract defect:

The package defines stage ordering but not a coherent, exhaustive, and mutually exclusive calibration outcome state machine.

MINIMUM_ORDERED_CORRECTIONS:

Add an explicit terminal-disposition contract with exactly one of:

aggregate_succeeded
calibration_withdrawn
calibration_failed

per calibration attempt.

Define the permitted E2 combinations.

For aggregate_succeeded:

exactly 1 AggregateCalibrationCommitment
0 CalibrationWithdrawalRecord
0 terminal CalibrationScorerFailureRecord
0 unresolved evaluator failures
0 missing required strata
0 unmatched incidents
0 incomplete accounting records

RejectedDerivationCandidateCommitment and non-terminal incident records may coexist only under explicitly frozen conditions.

For calibration_withdrawn:

exactly 1 CalibrationWithdrawalRecord
0 AggregateCalibrationCommitment
0 E4 derived-value proposal

For calibration_failed:

at least 1 terminal failure record
0 AggregateCalibrationCommitment
0 E4 derived-value proposal

The contract must state whether withdrawal and terminal scorer failure may coexist. If allowed, one must be the canonical terminal disposition and the other supporting evidence, not a competing outcome.

Give CalibrationVerificationReceipt a required disposition matching the exclusive E2 branch:

verified_aggregate
verified_withdrawal
verified_failure

Permit ProtocolAuthorDerivedValueProposal only when:

E3.disposition = verified_aggregate

and the referenced E2 set contains exactly one admissible aggregate with no terminal withdrawal or failure.

Enforce missingness and incident consequences. Under the already approved derivation rules, any missing required stratum, evaluator failure, unaccounted incident, or incomplete accounting set must prohibit aggregate_succeeded and route to withdrawal or failure.

Add exact E0-to-E1 coverage rules:

every expected stratum has the required execution and usage disposition;

every E0 execution and usage receipt is referenced exactly once;

E0 and E1 stratum commitments match;

usage/accounting heads match the corresponding execution;

no orphaned or multiply consumed E0 record exists;

executor incidents have exact evaluator incident/failure coverage; and

absent required E0 evidence blocks aggregate success.

Replace the single contradictory 14-record fixture with separate body-free synthetic scenarios, at minimum:

successful aggregate → verified aggregate → E4 proposal
declared missingness → withdrawal → verified withdrawal → no E4
terminal scorer failure → verified failure → no E4

The schema inventory may still cover all 13 record types, but one attempt must not pretend to succeed, withdraw, and fail simultaneously.

Add validly re-signed attacks for all twelve missing cases listed under ADVERSARIAL_AND_VERIFICATION_EVIDENCE.

Extend the independent verifier, nested verification statement, and audit receipt to bind terminal disposition, E0 coverage, branch exclusivity, and E4 eligibility.

Regenerate only the readiness record and reference-only receipt under the established two-commit pattern, then rerun the complete deterministic suite, focused coverage, independent file verifier, receipt-substitution tests, secret scans, clean-worktree checks, and remote non-publication check.

AUTHORIZED_NEXT_SCOPE:
Only the body-free terminal-state and evidence-completeness correction above is authorized.

No actual calibration evidence, capability issuance, task execution, numeric measurement, provider identity, model identity, protected data, nonzero budget, sentinel value, final identity, freeze transaction, or O record may be introduced.

STILL_PROHIBITED:
The following remain unauthorized:

an actual CalibrationPlanManifest or executable calibration envelope;

issuance or consumption of a real calibration capability;

any nonzero provider, model, token, tool, process, time, CPU, memory, output, or cost budget;

provider/model/service-tier/environment/real-price selection;

API credential request, storage, or use;

provider calls or Codex CLI use as a provider backend;

benchmark, evaluator-vault, mine, dedicated-pilot, gate, final, temporal, sealed, withheld-public, multi-cause, or Terminal-Bench access;

real task bodies, verifier logic, labels, expected answers, task handles, paths, traces, outcomes, or raw measurements;

filling any sentinel or statistical margin;

allocating final protocol, budget-freeze, plan, envelope, value-set, freeze-transaction, or O identities;

research scheduler or B0–B6 execution;

attribution, mutation, or candidate construction;

candidate selection, qualification, promotion, canary, deployment, or production-pointer modification;

Git push, release, package, announcement, or publication; and

performance, fairness, attribution, generalization, confidentiality, containment, security-certification, evolution, or self-improvement claims.
