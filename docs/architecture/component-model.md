# Versioned Harness Component Model

Status: Gate 2R component-identity correction

## Authority split

A harness is a content-addressed directed acyclic graph plus external append-only control records. No
single mutable envelope is both identity and history.

| Object | Contents | Mutable after creation | Authoritative writer |
|---|---|---:|---|
| `ComponentManifest` | stable family ID, semantic version, type-registry reference, payload artifact, exact dependencies, closure digest | no | component registry after validation |
| `HarnessVersionManifest` | complete slot-to-component composition and expanded behavior closure | no | harness registry after validation |
| `ComponentTypeRegistry` | component type, mutable class, allowed payload grammar, dependency types, maximum capabilities | no within protocol | protocol author |
| `ComponentProvenanceRecord` | parent, source evidence, mutation proposal, trusted producer | append new records only | registry/control plane |
| `HarnessLineageRecord` | parent harness, mutation and attribution references | append new records only | evolution control plane |
| `HarnessLifecycleRecord` | one legal qualification transition and supporting receipts | append new records only | lifecycle controller |
| `EvaluationResult` | evaluator outcome for a manifest under one protocol and state snapshot | append new records only | evaluator |
| `PromotionDecision` | approve/reject qualification decision and gate evidence | append new records only | promoter |
| `DeploymentDecision` | authorize one production-channel initialize/deploy/rollback/decommission CAS | append new records only | promoter |
| `DeploymentPointerRecord` | atomic channel CAS from one whole harness to another | append new records only | trusted deployment registry |

Evaluation history, qualification state, and channel deployment are query projections over different
record streams. They are not manifest fields. Appending either history cannot change a component or
harness ID.

## Component identity and resolved view

The immutable `ComponentManifest` has:

- `componentIntrinsicId`: `ci-sha256:` digest of the canonical identity fields excluding
  `componentIntrinsicId` and `behaviorClosure`;
- `componentManifestId`: `cm-sha256:` digest of the complete final `identity`, including the intrinsic
  ID and closure;
- `componentId`: stable family identifier;
- `semanticVersion`: review label, included in identity;
- `typeRegistryRef`: exact registry and entry IDs;
- `payload`: allowed language, internal content-addressed artifact, canonical sorted `capabilityIds`
  preimage, and its recomputed capability digest;
- `dependencies`: exact component-manifest references;
- `behaviorClosure`: recomputed transitive digest over intrinsic component nodes, counts, and canonical
  byte total.

The closure contains the component's own `componentIntrinsicId` plus every dependency intrinsic ID; it
never contains the final ID of the component whose closure is being calculated. This makes the
two-stage identity acyclic and independently recomputable. The final manifest and its payload are
self-contained for capability validation; registry-side sidecars are not authoritative preimages.

It deliberately does not accept `componentType`, `mutableClass`, provenance, evaluation history, or a
deployment pointer from a proposer. A trusted resolved view joins the manifest to the pinned type
registry and may display those derived fields for users.

## Authoritative type registry

The protocol pins one immutable `ComponentTypeRegistry`. Only its entries determine whether a type is
mutable and which payload grammar, dependency types, and capabilities are legal.

| Type | Registry class | MVP mutation | Payload language |
|---|---|---:|---|
| `SystemPrompt` | mutable | yes | normalized prompt Markdown |
| `ContextPolicy` | mutable | yes | declarative context policy |
| `MemoryRetrievalPolicy` | mutable | yes | declarative retrieval policy |
| `Skill` | mutable | yes | declarative instruction/step document |
| `WorkflowPolicy` | mutable | yes | finite declarative workflow graph |
| `RoutingPolicy` | mutable | yes | finite declarative routing table |
| `SubagentPrompt` | mutable | yes | normalized prompt Markdown |
| `ToolDescription` | mutable | yes | declarative model-facing tool description |
| `MemoryPolicy`, `Workflow`, `SubagentConfiguration`, `RecoveryPolicy`, `VerificationPolicy` | conditionally-mutable | no enabled condition | declarative policy |
| `PermissionPolicy`, `SafetyPolicy`, `Evaluator`, `BenchmarkManifest`, `BudgetPolicy`, `ModelIdentity`, `TraceCollector`, `AuditPolicy`, `PromotionPolicy`, `ToolImplementation`, `Middleware`, `OptimizerCode` | immutable | no | protocol-authored policy or immutable artifact |

No candidate can add a registry entry, change an entry, select a second registry, or claim that an
immutable type is mutable. A reference to an entry whose registry digest differs from the protocol pin is
rejected before a candidate manifest is created.

## Whole-harness identity

`HarnessVersionManifest` contains only immutable composition and execution-policy inputs:

- a semantic version;
- the required runtime contract digest;
- the authoritative type-registry ID;
- unique, canonically ordered slot bindings to exact component manifests;
- the expanded behavior-closure hash, counts, and canonical bytes.

Parentage, mutation reason, attribution, evaluator results, qualification, rollback target, and deployment
are external records. The exact hashing and closure rules are in
`canonicalization-and-hashing.md`.

## Creation transaction

A candidate transaction is all-or-nothing:

1. pin the expected parent harness and current production-channel generation;
2. materialize candidate payload bytes into a no-network staging sandbox;
3. validate canonical bytes and the registry-authorized payload grammar;
4. resolve and recompute every artifact, component, and transitive dependency;
5. calculate the complete mutation-scope and capability deltas against the parent;
6. reject immutable, disabled, oversized, indirect, executable, or hidden transitive changes;
7. persist immutable component and harness manifests by digest;
8. append trusted provenance, lineage, and `draft → candidate` lifecycle records;
9. leave the deployment pointer and every existing session unchanged.

Unreferenced staging artifacts are discarded and have no identity or behavioral effect.

## Bounded mutation contract

Every proposal:

- cites a trusted `AttributionResult`, except the preregistered attribution-ablated control whose absence
  is explicit;
- targets one primary failure mechanism;
- identifies parent and candidate whole-harness manifests;
- lists every directly and transitively changed component family;
- changes at most one family for a single-fault proposal and at most two for an explicit multi-cause
  proposal;
- records expanded closure edit bytes, replacement surface bytes, normalized token edit distance,
  structural operations, and capability additions/removals;
- satisfies the 8 KiB expanded-edit ceiling;
- adds no capability outside the registry and proposal-specific allowance;
- names predicted fixes, regressions, and passing-behavior preservation checks;
- compares itself to retained rejected proposals;
- yields zero immutable or conditionally-disabled component diff.

Changing one manifest reference while replacing multiple dependency manifests counts as multiple
component changes. Replacing a small reference with a large artifact is charged over the expanded
closure. Git line counts and compressed patch sizes are non-authoritative.

## Qualification and deployment

Qualification ends at `approved`. A signed `PromotionDecision` may move the exact canary composition to
`approved` or `rejected`; it cannot alter a channel pointer.

Protocol v1 has exactly one channel, `production`. There is no per-component pointer and no global
`active` harness state. Deployment requires:

1. an `approved` exact target manifest and qualification decision for every non-decommission operation;
2. a signed `DeploymentDecision`;
3. current production generation, pointer hash, target tuple, and rollback-target tuple equal to the
   complete CAS expectation;
4. the action-specific null/deploy/swap rule for the next rollback-target tuple; and
5. recomputed hashes plus approved, protocol-compatible qualification references wherever a tuple is
   non-null.

The deployment registry appends one record and increments the generation. `initialize` sets an approved
target and a null rollback target. `deploy` retains the prior target as approved and records that exact
tuple as rollback target. `rollback` atomically swaps the prior target and rollback-target tuples and
does not change either version's qualification. Existing sessions and descendants remain pinned.

Protocol v1 uses a null initialization anchor. Rollback is rejected until a successful deploy has
created the first non-null rollback target; no second bootstrap manifest or behavioral-equivalence
predicate exists.

`retired` means ineligible for new sessions/deployments, not deleted. Retirement is rejected while a
version is the production target, rollback target, live-session pin, descendant pin, pending transaction,
or subject to a hold requiring deployment eligibility.

## State invariants

- A manifest byte never changes after its ID is assigned.
- Qualification and deployment are separate projections over signed append-only records.
- A session retry, recovery, resume, memory update, or prompt reinjection emits no harness lifecycle
  record.
- A candidate cannot become `approved` without evaluation of the exact whole composition.
- An approved candidate is not deployed until a separate production-channel CAS succeeds.
- A stale production generation causes deployment failure; implicit rebase is forbidden.
- A rollback post-state is exactly `target=prior.rollbackTarget` and
  `rollbackTarget=prior.target`; repeated rollback deterministically swaps the pair.
- Replacement and rollback do not retire or globally disable either manifest.
- Git commits and worktrees provide isolation and lineage convenience only. Manifest hashes and trusted
  records are authoritative.
