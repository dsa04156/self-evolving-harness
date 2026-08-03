DECISION: APPROVE

IDENTITY_AND_KEY_SEPARATION:
The sole evaluator/scorer role-collapse defect is closed at the preregistration level.

The contract now defines two distinct authorities:

calibration_evaluator
calibration_scorer

with disjoint role, principal, key, and process namespaces. Admission requires inequality across:

principalId
instanceId
keyId
publicKeyDigest
processIdentity
writableMountRoot

Requiring a semantic admission verifier in addition to closed JSON Schema is correct. JSON Schema can constrain shapes and namespaces, but it cannot prove arbitrary sibling-field inequality through positive thinking.

The key-rotation rule is also sufficient: each role retains a separate lineage, inequality must remain true across rotation, and neither role may temporarily reuse the other’s key or identity.

The future implementation must enforce the semantic meaning of mount separation, not merely different path strings. Two roots backed by the same writable object, delegated capability, or alias must count as collapsed. The packet already requires that result through its anti-alias and delegation rules.

MOUNT_DATA_CAPABILITY_BOUNDARY:
The proposed mount and data boundary is sufficient.

The evaluator may receive only the current dedicated-pilot capability, current task material inside its sandbox, a read-only verifier capability, the frozen execution environment, and signed executor usage and incident streams. It may write only evaluator-owned raw measurements, task-measurement commitments, and evaluator incident or failure records.

The scorer receives:

signed evaluator commitments
opaque task and stratum commitments
signed accounting records
frozen scoring and estimator programs
precommitted grids and abort rules

It is explicitly denied:

task body
raw conversation or output
verifier source
provider credentials or request capability
evaluator raw-measurement mount
protocol mutation authority
proposer, promotion, or deployment state

The scorer has zero provider, model, and runtime-tool authority. The protocol author sees neither evaluator nor scorer private storage and receives only an independently verified aggregate, rejected-value commitments, and a failure or withdrawal disposition.

This is the required one-way authority reduction. The scorer may inspect normalized task-level measurement commitments because scoring requires measurements; it may not inspect the protected material from which those measurements were produced.

MESSAGE_AND_RECORD_OWNERSHIP:
The closed message flow and exclusive record-creation matrix are sufficient.

The evaluator accepts only signed execution, usage, and incident receipts and alone may create:

CalibrationMeasurementCommitment
CalibrationEvaluatorFailureRecord
CalibrationEvaluatorIncidentRecord

The scorer accepts only admitted evaluator commitments and alone may create:

AggregateCalibrationCommitment
RejectedDerivationCandidateCommitment
CalibrationWithdrawalRecord
CalibrationScorerFailureRecord
CalibrationScorerIncidentRecord

The independent verifier alone creates CalibrationVerificationReceipt, and the protocol author alone creates ProtocolAuthorDerivedValueProposal.

The receiver-side rules correctly reject a valid signature from the wrong role. They also prohibit proxying, wrapping, aliasing, delegating, co-signing, inheriting, or reusing another role’s record type or creation capability.

This prevents the two principal failures identified previously:

the scorer cannot obtain protected task or verifier material; and

the evaluator cannot release a derived value directly to the protocol author.

An independent verifier remains a verifier. It cannot manufacture separation after evaluator and scorer outputs have already been produced by the same authority.

DEPENDENCY_AND_EVIDENCE_GRAPH:
The corrected graph is coherent:

D  → E0 → E1 → E2 → E3 → E4
                     │
                     └─ verified derivation flow

where:

E0 = executor receipts
E1 = evaluator measurement commitments
E2 = scorer aggregate, rejected-value, or withdrawal commitment
E3 = independent verification receipt
E4 = protocol-author derived-value proposal

The forbidden edges are the correct ones:

E1 → E4
E0 → E2
evaluator raw data → E2
E1 or E2 → O
O → D

Thus:

the scorer cannot bypass evaluator normalization and commitment;

the protocol author cannot bypass scorer aggregation and independent verification;

raw evaluator material cannot enter the scorer;

unverified measurements or aggregates cannot enter the final freeze; and

the future research budget cannot finance or justify its own calibration.

The previously accepted numeric dependencies, estimator rules, candidate grids, atomic-freeze semantics, and withdrawal rules remain unchanged.

ANTI_COLLAPSE_TEST_CONTRACT:
The proposed anti-collapse attack set is sufficient for the later schema and verifier implementation.

It requires rejection of:

equal evaluator/scorer identities, keys, process identities, or writable roots;

role aliases and combined evaluator/scorer capability flags;

shared record-write authority;

scorer access to protected task, verifier, provider, or evaluator-raw material;

evaluator creation of aggregate records;

protocol-author access to task-level measurements;

direct evaluator-to-author derived-value release;

delegated, wrapped, proxied, inherited, temporary, or co-signed authority collapse;

scorer aggregation directly from executor receipts; and

measurement or aggregate creation by the verifier, author, proposer, or promoter.

The later tests must mutate and then validly re-sign otherwise conformant contract objects. Rejection must result from the authority semantics, not from the convenient fact that someone forgot to update an outer signature.

Splitting identities after outcomes exist remains invalid. A failed collapsed attempt must remain append-only adverse evidence and cannot be rehabilitated by assigning two new names to the same already-informed actor.

UNCHANGED_NUMERIC_AND_AUTHORITY_STATE:
The accepted numeric and zero-authority state remains unchanged.

The packet does not modify:

25 sentinel paths
8 pending groups
6 derivation classes
12-phase expansion
candidate-set limits
confidence and power criteria
rounding and tie rules
stopping and withdrawal rules
synthetic-fixture exclusion
atomic-freeze semantics
7 unresolved obligations

No sentinel is filled. No provider or model is selected. No calibration envelope, nonzero budget, final protocol identity, or budget-freeze identity is allocated.

The current state remains:

providerExecutionAuthorized   = false
researchEvidenceAuthorized    = false
candidateSelectionAuthorized  = false
promotionAuthorized           = false
deploymentAuthorized          = false
claimAuthorityGranted         = false

finalProtocolId = null
budgetFreezeId  = null

The correction therefore removes the role contradiction without advancing the numeric-freeze obligation or creating research authority.

BLOCKING_FINDINGS:
None for the calibration evaluator/scorer separation correction.

AUTHORIZED_NEXT_SCOPE:
The next local scope may implement only the zero-execution calibration-contract governance artifact described in this packet.

Authorized work is limited to:

Create one closed calibration-contract schema that binds:

the approved numeric-freeze entry ID;

the prior preregistration packet and ruling hashes;

the unchanged 25 sentinels and eight pending groups;

the accepted derivation classes, DAG, derivation rules, atomic-freeze rules, and failure conditions;

separate calibration_evaluator and calibration_scorer identity objects;

all mandatory cross-role inequalities;

mount, data, message, capability, and exclusive record-creation matrices;

the one-way E0 → E1 → E2 → E3 → E4 graph;

the forbidden edges and anti-collapse rules;

null final identities;

zero execution budgets; and

all authority and protected-eligibility flags fixed to false.

Add a deterministic semantic admission verifier. It must enforce inequalities, mount-source disjointness, key and process separation, creator ownership, forbidden data fields, one-way release, graph completeness, and zero-authority state. Structural schema validation alone is insufficient.

Create exactly one protocol-author-signed, public-development calibration-contract record. It must remain:

zeroExecution = true
status = preregistered_only
evidencePresent = false
authorizedForResearchEvidence = false
finalProtocolId = null
budgetFreezeId = null

Use a non-self-referential two-commit layout:

a clean implementation commit containing schemas, verifier, tests, and documentation;

a later sealing commit containing the generated signed contract and reference-only audit receipt.

Create one separate audit_store receipt referencing the contract by path, source snapshot, byte size, raw hash, and content identity. It must not duplicate the contract body or grant authority.

Add validly re-signed adversarial tests for every attack listed in Section 7, including:

equality of any evaluator/scorer identity field;

shared underlying writable mount under different path aliases;

key or capability delegation;

combined record authority;

scorer protected-data access;

direct evaluator-to-author release;

evaluator aggregate creation;

scorer bypass of evaluator commitments;

wrong-role record creation;

graph-edge insertion or omission;

any nonzero budget;

sentinel or pending-field modification;

premature final IDs; and

authority or eligibility escalation.

Run the complete deterministic suite, independent contract verifier, trust-plane conformance verifier, build, static checks, secret scans, clean-worktree checks, and remote non-publication check.

Submit a narrow implementation-evidence packet containing the clean source and sealing commits, contract and receipt hashes, verifier output, adversarial results, and confirmation that no calibration, provider, benchmark, research, selection, promotion, or deployment action occurred.

STILL_PROHIBITED:
The following remain unauthorized:

calibration, pilot, or task execution;

nonzero provider, model, token, tool, process, time, memory, output, or cost budgets;

provider or model selection as an active research identity;

API credential request, storage, or use;

provider/model calls or Codex CLI use as a provider backend;

benchmark or evaluator-vault unlock;

access to mine, dedicated-pilot, gate, final, temporal, sealed, withheld-public, multi-cause, or Terminal-Bench bodies;

filling any sentinel or statistical margin;

final protocolId or budgetFreezeId allocation;

research scheduler or B0–B6 execution;

attribution, mutation, or candidate construction;

candidate selection, qualification, promotion, canary, deployment, or production-pointer modification;

Git push, release, package, announcement, or publication; and

performance, fairness, attribution, generalization, confidentiality, containment, security-certification, evolution, or self-improvement claims.
