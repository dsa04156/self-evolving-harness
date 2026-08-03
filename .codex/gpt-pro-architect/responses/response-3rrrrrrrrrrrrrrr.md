DECISION: APPROVE

ONE_OBJECTIVE_SELECTION:
The packet selects exactly one unresolved obligation:

research_protocol_numeric_freeze

It does not modify the signed outstanding-obligations matrix, mark the obligation partially complete, or set evidencePresent=true. The other six obligations remain untouched.

The distinction among the following is sufficiently explicit:

Gate 3 entry preregistration
≠ numeric-freeze entry record
≠ completed numeric freeze
≠ frozen research protocol
≠ authorization to execute research

A future completion still requires fully populated protocol and budget manifests, pilot-derived numeric values under a separately approved calibration contract, removal of every PILOT_PENDING sentinel, independent verification, append-only audit, and another Architect ruling.

This approval therefore accepts only the zero-execution entry boundary. It does not complete or partially satisfy research_protocol_numeric_freeze.

SOURCE_AND_POLICY_BINDINGS:
The entry inputs are sufficiently bound for an offline governance record.

The packet identifies:

the current local source commit and tree;

the approved conformance-manifest source and hashes;

the unchanged outstanding-obligations artifact;

the draft budget and feedback policy;

the component registry;

the statistical and data-access plans;

the protocol, budget-freeze, and phase-record schemas;

the principal-capability matrix;

the trust-boundary contract; and

the threat model.

Their treatment is correctly limited to:

structural draft
candidate policy
candidate schema
candidate authority boundary

None is represented as a frozen research-protocol identity.

The rule prohibiting allocation of protocolId or budgetFreezeId before every required identity and numeric field exists is correct. The future entry record may have its own content-derived entry-record identity, but that identity must be in a distinct namespace and must never be accepted as a protocol or budget-freeze identity. Humans do enjoy naming a form after the thing it does not yet authorize, so the schema needs to be less gullible than they are.

The old provider-smoke budget artifact is sufficiently excluded at the preregistration level. It is identified by exact path and hash and classified as:

development/provider-smoke only
not pilot evidence
not research numeric freeze
not a predecessor
not confirmatory
not a source of caps

The authorized verifier must enforce that exclusion through direct reference, alias, dependency, wrapper, and provenance paths. Merely copying its values into a freshly named object must not improve their scientific pedigree.

ZERO_BUDGET_AND_DATA_BOUNDARY:
The no-execution boundary is sufficiently exact.

Every experimental or operational quantity is fixed at zero:

provider/model attempts:         0
provider tokens and cost:        0
tool attempts:                   0
vault unlocks:                   0
protected-data accesses:         0
feedback releases:               0
scheduler processes:             0
task executions:                 0
mutations and candidates:        0
evaluation results:              0
selection/promotion/deployment:  0
Git pushes:                      0

The participating roles are limited to governance planning and verification. Runtime, proposer, evaluator, scorer, promoter, provider proxy, benchmark-authoring, vault, and deployment authorities perform no selected-obligation action.

All authority flags remain false:

providerExecutionAuthorized   = false
researchEvidenceAuthorized    = false
candidateSelectionAuthorized  = false
promotionAuthorized           = false
deploymentAuthorized          = false
claimAuthorityGranted         = false

Permitted input is restricted to existing publicDevelopment metadata, policies, schemas, hashes, conformance state, and governance rulings. Protected task content, verifier details, labels, expected answers, per-task outcomes, task handles, provider material, pilot measurements, candidate evidence, and selection or deployment state remain prohibited.

This is a complete no-execution contract, not an unusually elaborate way of hiding a tiny pilot run.

SUCCESS_FAILURE_ABORT_EVIDENCE:
The success, failure, and abort rules are sufficiently deterministic.

Success in this round means only that the Architect authorizes construction of the offline entry artifact. It does not mean that the artifact already exists or that the numeric-freeze obligation has advanced.

The future entry artifact must preserve:

selected obligation = research_protocol_numeric_freeze
obligation status   = unresolved
evidencePresent     = false
final protocol ID   = absent
budget freeze ID    = absent
research authority  = false

The listed failures appropriately include hash drift, nonzero resource limits, premature identity allocation, sentinel interpretation, fixture laundering, authority escalation, and any assertion of partial completion.

The mandatory-abort conditions are also sufficient. Source or governance drift, redaction failure, protected-data appearance, credential requirements, provider requirements, target mismatch, or scope expansion must terminate the attempt without silently generating a different entry contract.

An abort record may document why construction stopped. It may not reserve an execution budget, create a protocol identity, or authorize an automatic retry.

CONTAMINATION_AND_ELIGIBILITY:
The contamination and eligibility contract is accepted.

The packet, this ruling, and any authorized offline entry artifacts remain:

publicDevelopment             = true
authorizedForResearchEvidence = false
confirmatory                  = false
eligibleForGate               = false
eligibleForFinal              = false
eligibleForHeldOut            = false
eligibleForSealed             = false
eligibleForTemporalHoldout    = false
authorizedForPromotion        = false

The entry may establish only that a governance boundary was specified, signed, and deterministically verified. It cannot become pilot evidence, performance evidence, attribution evidence, selection input, promotion evidence, or a security claim.

Cross-protocol pooling is correctly prohibited. Exposure to protected material, use of quarantined evidence, or drift in a bound policy must create a separate failed or superseding entry identity and permanently preserve that adverse history. It must not be repaired by changing a protocol label.

ROLLBACK_AND_ABANDONMENT:
The rollback and abandonment model is sufficient because no operational state changes in this phase.

There is no runtime, candidate, protocol pointer, deployment pointer, provider request, task execution, or resource account to reverse.

The packet and ruling become immutable governance history after transmission regardless of decision. Any future offline entry record must also remain append-only if superseded. A later full protocol must receive a separate content-derived identity and cannot overwrite the entry record or inherit authority from the excluded synthetic provider fixture.

A REVISE, BLOCK, local abort, or later abandonment leaves all seven obligations unresolved and every authority flag false.

BLOCKING_FINDINGS:
None for the no-execution Gate 3 numeric-freeze entry preregistration.

AUTHORIZED_NEXT_SCOPE:
The next scope is limited to one local, offline, public-development entry artifact and its deterministic verification.

Authorized work:

Create one closed JSON Schema for a record such as:

research_protocol_numeric_freeze_entry

The schema must require, at minimum:

record type and schema version
entry-record ID in a non-protocol namespace
selected obligation
obligation status = unresolved
evidencePresent = false
baseline source commit and tree
conformance-manifest hash
outstanding-obligations hash
all bound draft policy/schema references
exact zero-budget vector
permitted and prohibited data classes
all authority and eligibility flags
pilotPendingFields
final protocol ID = null
budget freeze ID = null
synthetic provider-fixture exclusion
packet and ruling references
protocol-author identity and attestation

Create exactly one protocol-author-signed entry record. It must be marked:

publicDevelopment=true
confirmatory=false
authorizedForResearchEvidence=false

It must not allocate, reserve, predict, or imply a final research protocol ID, budget-freeze ID, provider identity, model identity, service tier, pilot value, or research budget.

Use a non-self-referential source layout. The entry record must bind the clean implementation source commit and tree from which its schema and verifier were built. A later sealing commit may store the signed record and tests, but must not pretend to be the source snapshot named inside itself.

Create one deterministic independent verifier that:

reads referenced artifacts from their declared commits;

verifies path, size, media type, and hash;

verifies the protocol-author identity and signature;

confirms the selected obligation remains unresolved in the unchanged matrix;

confirms every resource limit is exactly zero;

confirms every authority and protected eligibility flag is false;

rejects any final protocol or budget-freeze identity;

requires the complete unresolved-sentinel list;

confirms no protected-data reference exists;

verifies the excluded provider-smoke artifact cannot satisfy or feed the entry; and

returns zero authorities granted.

Add adversarial tests for at least:

source, conformance, policy, schema, or obligation hash drift;

any nonzero resource or attempt budget;

any authority or eligibility escalation;

direct or indirect reuse of the synthetic provider-smoke fixture;

replacing PILOT_PENDING or another unresolved field with an uncalibrated number;

omitting a required pending field;

protected data-class admission;

premature protocolId allocation;

premature budgetFreezeId allocation;

changing the obligation to partially complete or evidencePresent=true;

using a non-protocol-author signing key;

cross-protocol pooling; and

validly re-signing a mutated record after any of the above changes.

Create one audit-store verification receipt only after the entry record and its signature pass. The receipt must grant no execution or research authority and must reference, rather than duplicate, the signed entry.

Update only directly relevant local documentation and prepare the next narrow review packet containing the clean source and sealing commits, record and schema hashes, verifier output, adversarial results, audit receipt, and proof that the outstanding-obligations matrix remained unchanged.

No calibration, numeric pilot, provider or model selection, API credential request, provider call, benchmark-body construction or access, vault unlock, task execution, research scheduler, B0–B6 execution, attribution run, candidate creation, selection, qualification, promotion, canary, deployment, production-pointer modification, Git push, release, publication, or empirical claim is authorized.
