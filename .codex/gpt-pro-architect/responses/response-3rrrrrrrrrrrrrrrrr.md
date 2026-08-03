DECISION: REVISE

INVENTORY_AND_CLASSIFICATION:
The pending inventory is preserved correctly.

The packet retains exactly:

8 pending groups
25 sentinel paths
12 fixed phase expansions

No sentinel is filled, renamed, deleted, or silently expanded into a new numeric field. Treating statisticalMargins as an existing pending group rather than retroactively pretending it was one of the 25 literal YAML sentinel paths is also correct.

The six derivation classes form a closed set, and every listed path or group receives exactly one class. For this contract, the class should be understood as the field’s direct resolution method, while the dependency graph records transitive prerequisites. Under that interpretation:

rollout seed values can be normative while still depending on the pilot-derived rollout count;

provider cost caps can be provider-price-derived while still depending on pilot-derived token and call caps; and

H4 can resolve through a precommitted second identity or a signed withdrawal.

The future schema must preserve that interpretation explicitly. A derivation-class label must not be used to bypass a dependency appearing in the DAG.

DEPENDENCY_GRAPH:
The graph is acyclic and correctly separates the calibration envelope from the research budget it would derive.

In particular:

A, B, C
→ separately approved calibration envelope D
→ measurements E
→ derived caps, rollout count, and margins
→ atomic freeze O

There is no edge from O back into D, so the research budget cannot fund or justify its own derivation. The dedicated-pilot envelope remains an independently reviewed, non-confirmatory calibration object.

The final freeze depends transitively on:

immutable policies and schemas;

provider, model, and environment identities;

the calibration plan and measurements;

price identity;

resource caps;

rollout count and seed stream;

statistical margins; and

H4 identity or withdrawal.

Cycles, missing predecessors, implicit defaults, or unresolved nodes correctly block O.

DERIVATION_RULES:
The proposed derivation rules are sufficiently bounded for a no-execution preregistration, not for calibration execution.

The rules constrain future work through:

finite candidate sets;

content-addressed estimator code and grids before protected access;

fixed sampling units;

explicit units and rounding;

stricter-value tie breaking;

minimum evidence and precision requirements;

missing-usage penalties;

complete-stratum requirements;

fixed stopping and withdrawal behavior; and

prohibition on threshold widening after gate or final observation.

The token-cap and phase-cap rules appropriately select the smallest admissible cap satisfying the precommitted truncation or cap-failure criterion. The rollout-count rule retains the frozen candidate set:

S ∈ {2, 3, 5, 8}

and the statistical-margin rules retain strict task-resolution and power constraints.

Actual cap grids, the precise upper-confidence-bound implementation, reachability matrices, seed-stream domain separation and integer mapping, margin grids, estimator hashes, and simulation code must be explicit fields in the later calibration contract. They are not values authorized by this packet.

No current sentinel is resolved merely because a future derivation algorithm has been described.

ATOMIC_FREEZE:
The atomic-freeze contract is accepted.

A future ProtocolManifest and BudgetFreezeManifest must be constructed in one transaction only after every required identity, numeric value, withdrawal disposition, derivation receipt, and verification result exists.

The packet correctly prohibits:

partial freeze
per-field activation
sentinel interpretation
premature protocol ID allocation
premature budget-freeze ID allocation
inheritance from provider-smoke fixtures
protected-result-derived values
cross-protocol pooling after amendment

Even a complete atomic freeze grants no execution authority by itself. A later Architect ruling must accept the completed manifests before any research capability can exist.

The excluded provider-smoke fixture remains development history rather than an unusually ambitious ancestor of the research budget.

AUTHORITY_AND_DATA_BOUNDARY:
The proposed authority boundary has one material contradiction.

The table defines a single future role:

calibration evaluator/scorer

Yet the evidence contract later states that role-collapsed evidence permanently fails. Those statements cannot both govern the same protocol.

A slash between two authority names is punctuation, not principal separation.

The evaluator and scorer must remain distinct authorities:

calibration_evaluator
calibration_scorer

At minimum:

the evaluator may receive the current opaque pilot task, read-only verifier capability, execution environment, and bounded request authority;

the evaluator emits signed task-level measurement commitments and incident records;

the scorer receives only the signed evaluator outputs, opaque stratum/task commitments, frozen scoring program, and accounting records needed for calibration;

the scorer must not receive task bodies, verifier source, provider credentials, protocol mutation authority, proposer output, promotion authority, or deployment state;

the scorer emits the bounded aggregate calibration record;

the protocol author receives only the independently verified aggregate, rejected-value commitments, and failure or withdrawal disposition;

evaluator and scorer identities, keys, mounts, accepted message types, and record-creation authorities must be distinct and inequality-constrained by schema.

An independent verifier does not repair a collapsed authority after the fact. It may verify evidence, but it cannot retroactively make the producer independent from itself.

The remaining role and data restrictions are sound: protected pilot outcomes remain unavailable to the proposer, runtime developer, benchmark author, model selector, promoter, deployer, and reporter, while the provider proxy receives no benchmark split map or promotion state.

EVIDENCE_AND_FAILURE_CONTRACT:
The future evidence contract is otherwise appropriately strict.

It requires:

a signed calibration-plan manifest;

one-time opaque dataset-role capabilities;

exact identity, environment, and price receipts;

complete resource, usage, missingness, cancellation, timeout, and incident ledgers;

pre-result commitments for task ordering, strata, seeds, estimators, tables, and abort rules;

evaluator-side raw measurements;

a blinded aggregate record;

independent verification;

aggregate-only protocol-author input;

append-only accepted, rejected, failed, and aborted derivations; and

a new Architect ruling before final manifests or execution.

Its fail-closed treatment of contaminated, incomplete, unversioned, post-result-modified, partial, or role-collapsed evidence is correct.

The evaluator/scorer role collapse must be removed from both the authority table and the proposed evidence flow before this contract can be implemented consistently.

BLOCKING_FINDINGS:

The future authority table combines calibration evaluator/scorer into one role, directly contradicting the packet’s own rule that role-collapsed evidence permanently fails.

Because those authorities are combined, the contract does not define a one-way, signed evaluator-to-scorer release boundary. The same authority could consume protected task/verifier material and produce the aggregate later presented as independently scored.

These are one underlying trust-contract defect:

The calibration derivation workflow does not preserve evaluator/scorer independence.

AUTHORIZED_NEXT_SCOPE:
Only a narrow no-execution contract correction is authorized.

Replace calibration evaluator/scorer with two distinct roles:

calibration_evaluator
calibration_scorer

Define for each role:

unique principal and key identity;

readable and writable mount classes;

accepted and emitted record types;

permitted data classes;

prohibited authorities;

resource and capability boundaries; and

exclusive record-creation authority.

Freeze the one-way release:

calibration executor
→ evaluator execution/measurement commitment
→ scorer aggregate calibration commitment
→ independent verifier receipt
→ protocol-author derived-value proposal

Require the later schema to reject:

identical evaluator and scorer principal IDs;

identical key IDs or public-key digests;

scorer access to task bodies or verifier source;

evaluator authority to create the final calibration aggregate;

protocol-author access to raw task-level measurements;

direct evaluator-to-protocol-author value release;

role aliases, wrappers, or delegated capabilities that collapse the two authorities; and

a combined evaluator/scorer record type.

Add these authorities as distinct nodes in the dependency and evidence graphs. Preserve all existing pending fields, derivation classes, numeric rules, failure rules, and zero-authority state unchanged.

Resubmit the corrected no-execution preregistration. Do not implement or sign the calibration-contract artifact until that correction is approved.

STILL_PROHIBITED:
The following remain unauthorized:

calibration-contract implementation or execution;

nonzero provider, task, tool, process, token, time, or cost budgets;

provider or model selection;

API credential request, storage, or use;

provider/model calls or Codex CLI use as a provider backend;

benchmark or evaluator-vault unlock;

dedicated-pilot, mine, gate, final, temporal, sealed, withheld-public, multi-cause, or Terminal-Bench execution;

filling any of the 25 sentinel paths or statistical margins;

final protocolId or budgetFreezeId allocation;

research scheduler or B0–B6 execution;

attribution, mutation, or candidate creation;

candidate selection, qualification, promotion, canary, deployment, or production-pointer changes;

Git push, release, package, announcement, or publication; and

performance, fairness, attribution, generalization, confidentiality, containment, security-certification, evolution, or self-improvement claims.
