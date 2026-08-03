DECISION: APPROVE

RATIONALE:
The prior blocker is closed.

The corrected contract now derives exactly one mutually exclusive terminal branch from the signed E2 record set:

aggregate_succeeded
calibration_withdrawn
calibration_failed

The branch rules are coherent and fail closed:

aggregate_succeeded:
  exactly 1 aggregate
  0 withdrawals
  0 terminal scorer failures
  exactly 1 verified-aggregate E3
  exactly 1 E4 proposal

calibration_withdrawn:
  0 aggregates
  exactly 1 withdrawal
  0 terminal scorer failures
  verified-withdrawal E3
  0 E4 proposals

calibration_failed:
  0 aggregates
  0 withdrawals
  at least 1 terminal scorer failure
  verified-failure E3
  0 E4 proposals

The verifier computes the branch from the actual signed E2 records instead of trusting a conveniently asserted outcome label. E3 must bind the exact aggregate, withdrawal, or failure set for that branch. E4 is admitted only after verified_aggregate, must depend exclusively on that E3 receipt, and must reference the same sole aggregate. Withdrawal and failure attempts cannot contain E4.

The aggregate-success requirements now correctly prohibit success when any required stratum is missing, an evaluator failure exists, an executor/evaluator/scorer incident remains, accounting is incomplete, the grid changed, or an E1 record is unmatched. The contract has therefore progressed from “records appear in chronological order” to “the records cannot simultaneously announce success, withdrawal, and catastrophe,” which is a surprisingly meaningful upgrade.

The E0-to-E1 accounting blocker is also closed. For every expected stratum, the verifier requires exactly one execution receipt, one usage receipt tied to that execution, and one measurement commitment tied to both. It reconstructs exact stratum sets, execution IDs, accounting heads, dependency coverage, incident lineage, and single consumption. Orphaned, duplicated, cross-stratum, missing-usage, or unmatched-incident evidence fails.

The three replacement fixtures correctly separate:

successful aggregate → verified aggregate → E4
declared missingness → verified withdrawal → no E4
terminal scorer failure → verified failure → no E4

The twelve requested validly re-signed attacks cover the previously missing contradictions and accounting failures. The earlier role, disclosure, bypass, capability, authority, identity, and substitution attacks remain retained.

The v2 source and sealing history is append-only and non-self-referential. The rejected readiness, its receipt, and the exact REVISE ruling remain unchanged and are explicitly bound into the correction. The later source commit contains the correction but not its generated records; the sealing commit adds only the new readiness and reference-only receipt.

REQUIRED CHANGES:
None for this correction.

The following invariants must remain unchanged:

prior rejected readiness remains preserved
prior receipt remains preserved
prior REVISE ruling remains preserved
v2 readiness remains public-development-only
synthetic fixtures remain in-memory and non-evidentiary
actualEvidenceRecords remains empty
actualCapabilities remains empty
all execution budgets remain zero
all authority flags remain false
all future identities remain null

RISKS / MISSING EVIDENCE:
This approval closes only the body-free terminal-state and evidence-completeness contract.

The packet still provides no evidence of:

an actual calibration plan or executable envelope;

capability issuance or consumption;

real E0, E1, E2, E3, or E4 records;

protected task custody or execution;

provider, model, service-tier, environment, or price identity;

nonzero token, cost, process, time, memory, or tool budgets;

estimator adequacy on real measurements;

sufficient calibration sample size;

feasibility of any real candidate grid;

numeric admissibility;

filled sentinels or statistical margins;

a final protocol or budget-freeze identity;

B0–B6 evaluation fairness or outcomes;

attribution accuracy;

candidate selection or promotion;

performance, generalization, confidentiality, containment, security certification, evolution, or self-improvement.

The three terminal scenarios remain deterministic synthetic fixtures constructed in memory and discarded. They validate the contract’s semantics, not the scientific quality of future calibration evidence.

NEXT AUTHORIZED SCOPE:
The next authorized scope is limited to preparing one no-execution CalibrationPlanManifest construction preregistration packet. No schema implementation, signed plan, capability issuance, or execution is authorized yet.

That packet may define, without supplying values:

The complete future CalibrationPlanManifest field inventory, including:

numeric-freeze entry identity;

calibration-contract identity;

derivation-program readiness identity;

assembly-readiness identity;

corrected v2 E0–E4 evidence-contract identity;

source commit and tree;

provider/model/environment/price prerequisites;

dedicated-pilot data-role requirements;

candidate-grid commitments;

estimator identities;

abort and withdrawal rules; and

expected future evidence and audit records.

Exact plan-admission prerequisites. The future plan must be impossible to instantiate while any required identity, grid, estimator, role, budget, capability policy, or data-role commitment is absent.

The future role matrix for:

calibration_executor
calibration_evaluator
calibration_scorer
independent_verifier
protocol_author
audit_store
provider_proxy

All roles must remain distinct, and the packet must preserve the accepted E0-to-E4 creator and disclosure boundaries.

The future plan’s terminal semantics, incorporating exactly the approved v2 rules:

aggregate_succeeded
calibration_withdrawn
calibration_failed

and the exact E0-to-E1 accounting requirements.

A future one-time calibration-capability contract described only through opaque commitments. The capability must remain:

issued = false
consumed = false
handle = null
executionAuthorized = false

A proposed future calibration-envelope budget structure, but with every quantity absent or zero. The packet may define required fields and derivation dependencies; it may not allocate a nonzero value.

Explicit admission failures for:

missing provider/model/environment/price identities;

incomplete task-role or stratum commitments;

missing candidate grids or estimator identities;

evaluator/scorer collapse;

incomplete E0-to-E4 evidence policy;

missing terminal-branch semantics;

missing E0-to-E1 accounting;

provider-smoke or public-fixture ancestry;

protected-data leakage;

nonzero budget;

capability issuance;

final-ID allocation;

sentinel interpretation;

O creation or activation; and

authority escalation.

The packet must continue to state:

calibrationPlanManifestId = null
calibrationEnvelopeId = null
finalProtocolId = null
budgetFreezeId = null

providerExecutionAuthorized = false
calibrationExecutionAuthorized = false
protectedDataAccessAuthorized = false
researchEvidenceAuthorized = false
candidateSelectionAuthorized = false
promotionAuthorized = false
deploymentAuthorized = false
claimAuthorityGranted = false

The packet must request a separate Architect ruling before any CalibrationPlanManifest schema, signed plan record, nonzero envelope, capability, provider identity, protected-data access, or execution path is implemented.

STILL PROHIBITED:
The following remain unauthorized:

implementation or creation of an actual CalibrationPlanManifest;

creation of an executable calibration envelope;

issuance or consumption of any calibration capability;

any nonzero provider, model, token, tool, process, wall-clock, CPU, memory, output, or cost budget;

provider, model, service-tier, environment, or real-price selection;

API credential request, storage, or use;

provider calls or Codex CLI use as a provider backend;

benchmark or evaluator-vault unlock;

mine, dedicated-pilot, gate, final, temporal, sealed, withheld-public, multi-cause, or Terminal-Bench access;

real task bodies, verifier logic, labels, expected answers, task handles, paths, traces, outcomes, usage measurements, or raw calibration records;

filling any sentinel or statistical margin;

allocating final protocol, budget-freeze, calibration-plan, envelope, value-set, freeze-transaction, or O identities;

creating or activating O;

research scheduler or B0–B6 execution;

attribution, mutation, or candidate construction;

candidate selection, qualification, promotion, canary, deployment, or production-pointer changes;

Git push, release, package, announcement, or publication; and

performance, fairness, attribution, generalization, confidentiality, containment, security-certification, evolution, or self-improvement claims.
