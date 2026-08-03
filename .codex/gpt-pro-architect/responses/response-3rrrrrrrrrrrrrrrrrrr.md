DECISION: APPROVE

SOURCE_AND_SEALING:
The two-commit construction satisfies the authorized non-self-referential layout.

The clean implementation commit:

f8e9df2053c958131fd47385e688f6560b3034c3
tree a60897009ddf04b0a4ffb09c5f948d4bcc08a721

contains the schema, model, generator, semantic verifier, verification CLI, tests, principal-role definitions, exports, commands, and documentation, but not the generated governance records.

The later sealing commit:

4c13b841a30413bc617999edd429829181acbce6
tree 108b91b442d6ee972354e5e225ee6f391ffb8a58

adds exactly the signed calibration contract and reference-only audit receipt. All 22 contract artifact references point to the earlier clean source snapshot. Neither generated record claims that its own bytes existed in the source commit from which it was produced.

Create-exclusive output behavior is also correct. Existing records cannot be silently overwritten and reintroduced as if append-only history were merely a strong suggestion.

No additional push occurred, and the remote-tracking state remains unchanged.

SCHEMA_AND_SEMANTIC_ADMISSION:
The closed schema and semantic verifier faithfully implement the accepted zero-execution calibration contract.

The contract preserves:

25 original sentinel paths
8 original pending groups
12 fixed phase expansions
6 closed derivation classes
26 path/group classifications
5 deterministic derivation-rule families
15-node acyclic dependency graph
7 unresolved trust obligations

It does not fill, reinterpret, remove, or rename a pending value. statisticalMargins remains the separately identified non-literal pending group rather than being retroactively inserted into the original 25 YAML sentinel paths.

The schema correctly fixes:

zeroExecution = true
status = preregistered_only
evidencePresent = false
finalProtocolId = null
budgetFreezeId = null

Structural schema validation is supplemented by a semantic verifier that checks the complete expected sets and cross-field rules. That is necessary for:

evaluator/scorer inequality;

mount-backing disjointness;

exclusive record ownership;

exact graph structure;

sentinel and classification preservation;

zero-budget enforcement;

synthetic-fixture exclusion; and

null final identities.

The semantic verifier does not execute a derivation rule or produce a numeric value. It verifies that the future rules and authority boundaries are represented as approved. A description of an estimator remains a description, despite software’s recurring urge to count paperwork as computation.

IDENTITY_MOUNT_DATA_CAPABILITY_BOUNDARY:
The evaluator/scorer separation is implemented sufficiently for this offline contract.

The record carries distinct future identities for:

calibration_evaluator
calibration_scorer

and the verifier enforces inequality across:

principalId
instanceId
keyId
publicKeyDigest
processIdentity
writableMountRoot

It additionally verifies:

disjoint principal and key namespaces;

correct public-key digests;

distinct canonical mount-source identities;

distinct underlying mount-backing identities;

empty delegation, alias, rotation, and active-handle arrays;

mounted=false for both reserved roots; and

no presently granted capability.

This prevents cosmetic separation through different path strings that resolve to the same writable object.

The data matrix preserves the intended one-way reduction:

the evaluator may eventually consume a bounded current pilot execution and produce task-measurement commitments;

the scorer may eventually consume only signed evaluator commitments, accounting records, opaque task/stratum commitments, and the frozen scoring program;

the scorer is denied task bodies, raw outputs, verifier source, provider authority, and evaluator raw storage;

the independent verifier cannot create measurements or aggregates; and

the protocol author cannot access task-level measurements or either private role store.

All seven described future capabilities remain:

granted = false
delegable = false
handle = null

The contract therefore defines possible future authority without granting any of it now.

MESSAGE_RECORD_AND_EVIDENCE_GRAPH:
The message, record-creation, and evidence-flow contracts are complete for this scope.

The contract assigns one exclusive creator to each of the ten record classes. A valid signature from a different role is insufficient. Proxying, wrapping, aliasing, delegation, co-signing, and record-type reuse remain forbidden.

The required flow is exact:

A + B + C → D
D → E0
E0 → E1
E1 + accounting + frozen scorer → E2
E2 + reference-only E1 roots → E3
E3 → E4
E4 → F, G, K, M
accepted prerequisites + F/G/H/J/K/L/M/N → O

The complete forbidden-edge set is also preserved:

E1 → E4
E0 → E2
evaluator_raw → E2
E1 → O
E2 → O
O → D

This prevents:

direct evaluator-to-protocol-author value release;

scorer bypass of evaluator commitments;

scorer access to evaluator raw material;

unverified measurement or aggregate input to the final freeze; and

use of the future research budget to justify its own calibration envelope.

The verifier compares complete node and edge sets rather than checking only a handful of expected edges while politely ignoring an unauthorized shortcut elsewhere.

ADVERSARIAL_AND_VERIFICATION_EVIDENCE:
The adversarial and verification evidence is sufficient for the authorized offline implementation.

The 31 semantic attacks are validly re-signed after mutation. Rejection therefore depends on contract semantics rather than a stale outer signature. They cover:

all evaluator/scorer identity inequalities;

shared canonical mount sources or backing objects hidden behind aliases;

inconsistent duplicate mount declarations;

delegated or active capability escalation;

protected-data access by the scorer, verifier, or protocol author;

wrong-role record creation;

combined evaluator/scorer record authority;

evaluator aggregate creation;

direct evaluator-to-author release;

scorer bypass of evaluator commitments;

forbidden graph insertion and required graph omission;

sentinel, group, and derivation-class drift;

nonzero provider and wall-clock resources;

premature final protocol identity;

research or protected-eligibility escalation; and

a correctly signed contract produced by the wrong creator role.

The separate receipt attack confirms that changing the referenced contract bytes invalidates the reference-only audit receipt.

The independent verifier does not call the generator and independently reconstructs:

the 22 source artifacts;

source commits and trees;

byte sizes and hashes;

unchanged conformance and obligation state;

numeric inventory and classifications;

identity and mount inequalities;

complete matrices and graph;

zero budgets;

false authorities;

null final identities; and

contract and receipt signatures.

The reported validation is adequate:

full deterministic suite:             155/155 pass
contract-focused tests:                 8/8 pass
TypeScript check:                       pass
build:                                  pass
independent calibration verifier:       pass
numeric-freeze entry verifier:          pass
aggregate conformance verifier:         pass
unresolved obligations:                 7
authorities granted:                    0
provider/model calls:                   0
benchmark/research execution:           0
repository push:                        0

The verifier’s use of shared generic types and canonical/signature helpers does not undermine its independence from the contract generator. This remains a local project verification boundary, not an external certification.

ZERO_AUTHORITY_AND_CLAIM_BOUNDARY:
The signed contract remains strictly zero-execution, public-development-only, non-evidentiary, and non-authorizing.

All execution quantities remain zero, including provider attempts, tokens, costs, tools, processes, time, protected accesses, calibration runs, mutations, candidates, evaluations, selection, promotion, deployment, and pushes.

All authority flags remain false:

providerExecutionAuthorized    = false
calibrationExecutionAuthorized = false
contractActivationAuthorized   = false
protectedDataAccessAuthorized  = false
researchEvidenceAuthorized     = false
candidateSelectionAuthorized   = false
promotionAuthorized            = false
deploymentAuthorized           = false
claimAuthorityGranted          = false

The final protocol and budget identities remain null. All seven outstanding obligations remain unresolved with evidencePresent=false.

The contract proves only that a zero-execution calibration governance contract was constructed, signed, and independently checked. It does not establish that:

any future estimator is statistically adequate;

any provider or model is available or reproducible;

any environment can support calibration;

any pilot dataset exists;

any candidate grid will be feasible;

any sentinel can ultimately be resolved;

any research comparison will be fair or successful; or

any performance, attribution, generalization, security, evolution, or self-improvement claim is valid.

BLOCKING_FINDINGS:
None for the authorized zero-execution calibration-contract implementation.

AUTHORIZED_NEXT_SCOPE:
The next scope is limited to an offline calibration-derivation program readiness implementation. It must remain synthetic, public-development-only, and incapable of producing admissible numeric-freeze values.

Authorized work:

Implement content-addressed, pure deterministic derivation programs for the already approved rule families:

F: per-request rollout-token cap
G: empirical phase resource caps
J: cost-cap arithmetic from G plus a supplied synthetic price schedule
K: final rollout-count selection
L: deterministic seed-stream expansion
M: statistical-margin selection

Implement only generic arithmetic and statistical behavior using synthetic public-development tables. No real provider identity, model identity, provider pricing, environment identity, pilot task, protected task handle, benchmark result, or production measurement may be supplied.

Freeze the exact future candidate-grid formats and bounds without choosing actual protocol values. The implementation may verify rules such as:

maximum 8 cap candidates
S ∈ {2,3,5,8}
maximum 8 margin candidates
smaller feasible cap/count wins
stricter feasible margin wins
upward resource rounding
upward integer-micro cost rounding

It may not write any selected synthetic result into the approved numeric-freeze entry, calibration contract, ProtocolManifest, or BudgetFreezeManifest.

Define a closed public-development record such as:

calibration_derivation_program_readiness

It must bind:

the approved numeric-freeze entry and calibration-contract IDs;

exact derivation-program source hashes;

finite grid schemas;

estimator and rounding-rule identities;

synthetic-input-only policy;

expected failure and withdrawal outcomes;

no protected-data capability;

zero execution budget;

null final protocol and budget identities; and

every authority flag fixed to false.

It must not be named or typed as CalibrationPlanManifest, calibration envelope, pilot receipt, protocol freeze, or budget freeze.

Add an independent verifier and validly re-signed adversarial tests for:

candidate-grid enlargement;

hidden or implicit default candidates;

estimator or confidence-bound drift;

rounding or tie-rule reversal;

missing-stratum acceptance;

missing-usage undercharging;

incident exclusion;

post-result grid modification;

seed-stream domain or ordering changes;

threshold widening;

cycle or forbidden O → D introduction;

use of synthetic outputs as sentinel values;

provider-smoke or public-fixture ancestry;

role collapse;

nonzero budgets;

final-ID allocation; and

authority or eligibility escalation.

Produce one protocol-author-signed readiness record and one reference-only audit-store receipt under the same non-self-referential two-commit pattern.

Ensure every generated synthetic result is marked:

publicDevelopment = true
authorizedForResearchEvidence = false
admissibleAsNumericFreezeValue = false
confirmatory = false

Submit a narrow implementation-evidence packet containing source and sealing commits, program and schema hashes, verifier results, synthetic failure cases, signed record and receipt hashes, unchanged outstanding obligations, and proof that no protected data or execution authority was introduced.

STILL_PROHIBITED:
The following remain unauthorized:

an actual CalibrationPlanManifest or executable calibration envelope;

any nonzero provider, model, token, tool, process, time, CPU, memory, output, or cost budget;

provider or model selection as a research identity;

real provider pricing selection;

API credential request, storage, or use;

provider/model calls or Codex CLI use as a provider backend;

benchmark or evaluator-vault unlock;

mine, dedicated-pilot, gate, final, temporal, sealed, withheld-public, multi-cause, or Terminal-Bench execution;

protected task bodies, verifier logic, labels, expected answers, task handles, paths, traces, or outcomes;

filling any sentinel or statistical margin;

allocating finalProtocolId or budgetFreezeId;

research scheduler or B0–B6 execution;

attribution, mutation, or candidate construction;

candidate selection, qualification, promotion, canary, deployment, or production-pointer modification;

Git push, release, package, announcement, or publication; and

performance, fairness, attribution, generalization, confidentiality, containment, security-certification, evolution, or self-improvement claims.
