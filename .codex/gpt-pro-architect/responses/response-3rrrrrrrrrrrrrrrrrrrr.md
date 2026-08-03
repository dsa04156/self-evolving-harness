DECISION: APPROVE

SOURCE_AND_SEALING:
The non-self-referential two-commit construction is correct.

The clean implementation commit:

83ac355b2505ad601ddf4eb9631aa9a3d1c67be6
tree 92d27052490f0197e8e6876e1312fd07a190665b

contains the behavior-bearing programs, schemas, synthetic vectors, model, generator, independent verifier, tests, CLI, exports, commands, and documentation. It does not contain the generated readiness record or audit receipt.

The sealing commit:

41534f69c4816169219e89bb922e8846a2aa3e61
tree 1b262f85676ca41ad0ad201b1e374dc3905b561b

adds exactly those two generated records. All 19 source references in the signed readiness record point to the earlier clean implementation snapshot.

The create-exclusive write behavior is appropriate. A repeated generation attempt fails with EEXIST, while the sealed records remain byte-identical and the worktree remains clean. This prevents a supposedly append-only governance artifact from quietly becoming an editable configuration file, one of software engineering’s more popular magic tricks.

No Git push occurred, and the remote-tracking state remains unchanged.

PROGRAM_AND_STATISTICAL_SEMANTICS:
The six pure derivation programs faithfully implement the previously approved generic rule families without selecting research-protocol values.

For F, the implementation freezes:

1 to 8 explicit candidates
no implicit candidate
closed required strata
one-sided 95% Wilson upper bound
zMicros = 1644854
1% upper-bound threshold
upward probability rounding
smallest feasible cap wins
missing usage charged at reservation
missing strata or incidents withdraw

For G, the same finite-grid and fail-closed principles apply per phase and resource. The chosen raw cap is the smallest feasible candidate and is rounded upward to the declared integer quantum. Unknown resources, duplicate candidates, partial-stratum success, and incident exclusion remain invalid.

For J, cost arithmetic is deterministic and conservative. It consumes only structurally valid synthetic G results and a schedule explicitly classified as synthetic. Input and output token-price components are rounded upward to integer micros before summation. Missing required request or token caps cause withdrawal rather than an improvised estimate.

For K, the count grid is exactly:

{2, 3, 5, 8}

The smallest count satisfying the fixed MCSE and seed-variance limits wins. If none qualifies, the program emits a synthetic-only precision_limited disposition at eight rather than pretending the precision target was met.

For L, the SHA-256 seed stream has a fixed domain, full-digest output, ascending zero-based counters, and exact-count enforcement. Domain or ordering changes are rejected.

For M, candidates are finite and strictly ordered by allowed loss. The strictest feasible margin wins, power and retention must each reach 80%, safety loss remains zero, and no feasible candidate produces withdrawal.

These implementations demonstrate deterministic rule behavior. They do not establish that Wilson intervals, the future candidate grids, the future sample size, or any estimator will be adequate for real calibration data. That remains a later plan and evidence obligation.

SYNTHETIC_INPUT_AND_OUTPUT_BOUNDARY:
The synthetic-only boundary is sufficient.

The eleven conformance vectors cover successful selection, conservative rounding, missingness, infrastructure incidents, post-result grid modification, precision limitation, domain-separated seed generation, and withdrawal behavior.

Every vector and generated result is marked:

publicDevelopment = true
authorizedForResearchEvidence = false
admissibleAsNumericFreezeValue = false
confirmatory = false

The input headers deny ancestry from:

provider-smoke artifacts
public benchmark fixtures
real provider prices
provider/model identities
benchmark bodies
evaluator-vault material
protected capabilities

The programs have no filesystem-write, shell, Git, network, provider, benchmark, or protected-data authority.

The verifier independently reruns every program and checks the input, output, result identity, disposition, and markings. No result is connected to a pending sentinel, statistical margin, ProtocolManifest, BudgetFreezeManifest, calibration envelope, or claim record.

The manually authored vectors are accepted as public-development conformance tests. They are not pilot measurements, estimator-validation evidence, or numeric-freeze inputs.

IDENTITY_SIGNATURE_AND_AUDIT_BOUNDARY:
The identity and audit boundary is adequate for this local readiness artifact.

The following roles are pairwise distinct across principal ID, instance ID, key ID, public-key digest, and process identity:

protocol_author
independent_verifier
audit_store

The protocol author signs the readiness record. The independent verifier signs a nested verification statement binding the exact readiness record ID, internal hash, raw bytes, and result. The audit store signs the outer reference-only receipt.

The outer receipt does not duplicate the readiness body. It binds the referenced record, verifier statement, source snapshot, hashes, size, identities, and zero-authority disposition.

Current capability handles, delegations, and aliases remain empty. Only public identities and signatures are serialized; no private key, API credential, provider token, browser material, or reusable capability appears in the records.

This provides local role attribution and tamper evidence under the project’s existing trust assumptions. It is not external certification, nor is it trying to cosplay as one.

ADVERSARIAL_AND_VERIFICATION_EVIDENCE:
The adversarial and verification evidence is sufficient for the authorized scope.

The 35 modified readiness records are rehashed and validly re-signed before verification. Rejection therefore depends on semantic violations rather than stale signatures.

The attacks cover:

enlargement of finite candidate grids;

insertion of actual protocol candidates or hidden defaults;

estimator and confidence-bound drift;

downward rounding and reversed tie rules;

acceptance of missing strata or undercharged usage;

exclusion of incidents;

post-result grid or commitment changes;

seed-domain and ordering drift;

MCSE, variance, power, and retention threshold widening;

active or no-longer-forbidden O → D;

synthetic-result-to-sentinel binding;

provider-smoke or public-fixture ancestry;

role, key, or process collapse;

aliasing or delegated authority;

nonzero provider or wall-clock budgets;

final protocol or envelope identity allocation;

calibration, research, or numeric-admissibility escalation;

wrong-role record creation; and

source-program hash substitution.

The separate audit-receipt substitution test confirms that swapping referenced readiness bytes invalidates both the nested verifier statement and the outer receipt relationship.

Pure-program tests additionally reject oversized grids, unknown fields, missing strata, real-provider identity in cost inputs, count-grid expansion, margin ties, forbidden ancestry, and seed-domain changes.

The reported validation is adequate:

full deterministic suite:       179/179 pass
new focused tests:               24/24 pass
TypeScript check:                pass
build:                           pass
sealed readiness verifier:       pass
calibration-contract verifier:   pass
numeric-freeze entry verifier:   pass
trust-plane verifier:            pass
create-exclusive replay:         rejected with EEXIST
unresolved obligations:          7
authorities granted:             0
worktree:                         clean

The independent verifier’s reuse of generic types, canonicalization, schema, and signature helpers does not make it dependent on the record generator. It independently checks the expected program identities, rules, artifacts, outputs, signatures, boundaries, and zero-authority state.

ZERO_AUTHORITY_AND_CLAIM_BOUNDARY:
The readiness record remains strictly synthetic, public-development-only, non-evidentiary, and non-admissible.

All research and operational budgets remain zero. All authority and protected-eligibility flags remain false. The following identities remain null:

finalProtocolId
budgetFreezeId
calibrationPlanManifestId
calibrationEnvelopeId
selectedProtocolValueSetId

The readiness artifact cannot write to the approved numeric-freeze entry, calibration contract, pending sentinels, statistical margins, final manifests, or active protocol state.

All seven trust-plane obligations remain unresolved. The record establishes only that deterministic synthetic derivation programs and their conformance checks exist.

It does not establish:

a valid calibration plan;

an executable calibration envelope;

provider, model, environment, or real-price identity;

estimator adequacy on future observations;

sufficient pilot sample size;

feasibility of any actual candidate grid;

admissibility of a numeric value;

research-protocol fairness;

performance, attribution, generalization, confidentiality, containment, security, evolution, or self-improvement.

BLOCKING_FINDINGS:
None for the authorized synthetic calibration-derivation readiness implementation.

AUTHORIZED_NEXT_SCOPE:
The next authorized scope is limited to an offline calibration-plan assembly and freeze-admission readiness contract. It must remain zero-execution and must not instantiate an actual CalibrationPlanManifest or calibration envelope.

Authorized work:

Define a closed public-development record type such as:

calibration_plan_assembly_readiness

It must bind the approved:

numeric-freeze entry ID
calibration-contract ID
derivation-program readiness ID
program identities F, G, J, K, L, M

Add a complete field-to-evidence map covering all 25 pending sentinel paths plus the separate statistical-margin group. Each field must identify:

its direct derivation class;

its dependency-graph node;

its required future record type;

its required producer role;

its required verifier receipt;

its admissible source class; and

its prohibited source classes.

No value may be supplied.

Define a freeze-admission firewall that rejects:

synthetic conformance outputs as protocol values;

public-development results as calibration evidence;

missing or unresolved dependencies;

unverified E1, E2, or E4 records;

direct evaluator or scorer input to the final freeze;

provider-smoke ancestry;

protected-data or public-fixture ancestry;

partial field sets;

sentinel interpretation;

hidden defaults;

premature protocol or budget identities; and

any nonzero execution authority.

Define exact future candidate-grid schemas, not candidate values. The schemas may constrain cardinality, ordering, units, rounding, and required commitments, but every actual grid instance must remain absent.

Define the future assembly completeness rule:

all B through N dependencies resolved
all 25 fields plus statistical margins present
all producer and verifier authorities valid
all evidence uncontaminated
all derivation receipts accepted
then, and only then, O may be proposed

The readiness implementation must still prohibit creating O.

Add an exact arithmetic and portability contract for the pure programs, including:

integer and rational domains;

overflow behavior;

Wilson-bound rounding order;

comparison precision;

seed-stream encoding;

deterministic serialization; and

cross-implementation golden vectors.

This may use a second independent reference implementation over synthetic inputs only. It must not use provider, benchmark, or pilot data.

Add validly re-signed adversarial tests for:

incomplete field-to-evidence mapping;

duplicate or conflicting mapping;

wrong producer or verifier authority;

synthetic result admitted as a freeze value;

public-development ancestry laundering;

missing dependency or verification receipt;

candidate-grid values inserted prematurely;

arithmetic or serialization drift;

partial freeze proposal;

final-ID allocation;

nonzero execution budgets;

protected-data capability;

authority escalation; and

O creation or activation.

Create one protocol-author-signed public-development readiness record and one reference-only audit-store receipt under the established two-commit layout.

Keep:

zeroExecution = true
admissibleAsCalibrationPlan = false
admissibleAsNumericFreezeValue = false
finalProtocolId = null
budgetFreezeId = null
calibrationPlanManifestId = null
calibrationEnvelopeId = null
authoritiesGranted = 0

Submit a narrow implementation-evidence packet with source and sealing commits, schema and program hashes, mapping completeness, arithmetic golden-vector results, verifier output, validly re-signed attacks, receipt identity, unchanged obligations, and proof that no execution or protected data was introduced.

STILL_PROHIBITED:
The following remain unauthorized:

an actual CalibrationPlanManifest;

an executable calibration envelope;

any nonzero provider, model, task, tool, process, token, time, CPU, memory, output, or cost budget;

provider, model, service-tier, environment, or real-price selection;

API credential request, storage, or use;

provider/model calls or Codex CLI use as a provider backend;

benchmark or evaluator-vault unlock;

mine, dedicated-pilot, gate, final, temporal, sealed, withheld-public, multi-cause, or Terminal-Bench execution;

protected task bodies, verifier logic, labels, expected answers, task handles, paths, traces, or outcomes;

filling any sentinel or statistical margin;

allocating final protocol, budget-freeze, plan, envelope, or selected-value identities;

research scheduler or B0–B6 execution;

attribution, mutation, or candidate creation;

candidate selection, qualification, promotion, canary, deployment, or production-pointer modification;

Git push, release, package, announcement, or publication; and

performance, fairness, attribution, generalization, confidentiality, containment, security-certification, evolution, or self-improvement claims.
