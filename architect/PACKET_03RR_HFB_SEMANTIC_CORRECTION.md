# Architect Packet 3RR — Semantic D_mine Correction

Status: **CORRECTION-ONLY RESUBMISSION; DEVELOPMENT EVIDENCE; NO ATTRIBUTION OR EVOLUTION CLAIM**

## Metadata

- Repo: `self-evolving-harness`
- Branch: `main`
- Implementation/evidence HEAD:
  `93da95cd24c6e47082e87e0b74763ac3cf75c212`
- Implementation/evidence tree:
  `8e410fc5f38bf3589760f1181d0208d59523f9b1`
- Semantic evidence source commit:
  `829dd1943954ba64e6e0c08bae35710b3db348e4`
- Packet date: 2026-07-31
- Responds to: Architect Round 3R `REVISE`
- Prior response SHA-256:
  `29aff8598f70bd5453c1cb7c46b529229c6c07df1ec4427228cae00f101c161d`
- Existing conversation:
  `https://chatgpt.com/c/6a6b1847-22c8-83e8-9558-8297a43979e0`

## Disclosure and approval scope

- Destination: the same project-specific ChatGPT.com Pro architect conversation.
- Transport: exact existing Chrome endpoint and tab; no new tab/window.
- Data: this bounded correction summary, local paths, source/evidence hashes, aggregate deterministic
  validation counts, tests, coverage, and limitations.
- Excluded: source upload, full evidence bodies, raw traces, `.env`, credentials, provider tokens,
  private keys, personal/customer data, and every gate/final/temporal/withheld-public task body.
- No provider API request, paid action, repository push, release, deployment, or publication occurs.

## Requested decision

Judge only whether the ordered Round 3R corrections are now satisfied enough to close the semantic
development-fixture blocker.

If they are satisfied, authorize at most the next local deterministic step: implementation and
development-only evaluation of a label-blind attribution prototype against these visible semantic
`D_mine` fixtures, plus bounded-mutation/evaluator dry-run plumbing that cannot access any gate/final
body and cannot promote a research claim.

This packet does **not** request authorization for a research scheduler, B0–B6, candidate selection for
research, promotion, real-provider use, gate/final/temporal data, or an attribution-accuracy claim.

## 1. Governance disposition and old-artifact quarantine

The old manifest-ID suite was preserved and explicitly renamed structural/label-oracle plumbing. It is
covered by:

```text
governance/deviations/hfb-structural-oracle-2026-07-31.json
record hash:
  sha256:c750a9bb2e00c2e5d15d73fab039d950c3df0e910274c006647b2ae9cc798e00
```

The signed record binds the prior decisions, implementation/evidence commits, 28 IDs, 115 affected
artifacts, actors, operations, timestamps, old evidence hash, old suite commitment, and old
ground-truth-fed scorer result.

Its machine-enforced quarantine is:

- `developmentOnly = true`
- `confirmatory = false`
- `authorizedForResearchEvidence = false`
- allowed only for structural validation, scorer self-test, governance audit, and semantic correction;
- prohibited from research protocol manifests, candidate inputs, attribution evaluation, method
  scheduling, promotion, claim tables, and research evidence.

`npm run verify:hfb-governance` passes and reports 28 fixtures, 115 quarantined artifacts, four allowed
use classes, and seven prohibited use classes. The remediation record remains `in_progress` because
Architect acceptance of this replacement is the final outstanding remediation action; the signed
record was not rewritten retroactively.

## 2. New execution/oracle boundary

The replacement is a new semantic artifact graph, not a relabeling of the old commitment.

```text
benchmark-author/oracle domain
  ├─ fixture ID and mechanism
  ├─ target component and known-good/fault pair
  ├─ declared patch and expected intervention
  └─ canonical request rows authored from a known-good run
                         │
                         ▼
label-free execution package
  ├─ task protocol and environment
  ├─ canonical provider rows
  └─ observable outcome contract

selected HarnessVersion ID ───────► standalone runtime execution
                                     │
                                     ▼
                              observable-only verifier
                                     │
                                     ▼
                              raw runtime events
                                     │
                                     ▼
                         label-blind allowlist adapter
```

The executor must receive one selected harness ID so the registry can instantiate a harness, but it
receives no pair, no role for that ID, and no mapping that says good or faulty.

`src/evaluation/hfb-semantic-execution.ts` has no fixture ID, mechanism, target component,
known-good/fault label, patch, expected outcome, or oracle object in its input contract. It imports no
benchmark-author/oracle module. The label-blind adapter also imports no oracle module. Source-boundary
tests reject those imports.

The persisted execution-package schema has no oracle fields. The evidence verifier checks every
package and fails if oracle or label fields appear. The oracle records are separate authoring
artifacts and never enter runtime, provider, tool, verifier, attribution-adapter, or proposer inputs.

This is a schema/module/API authority separation for deterministic development. It is not claimed to
be a separate benchmark-author OS UID or a sealed evaluator vault; those remain required for future
confirmatory data.

## 3. Input-driven provider, actual tools, and outcome verifier

`CanonicalRequestTableProvider` keys behavior only on the canonical projection of the actual
`ModelRequest`:

- model identity;
- instructions;
- selected input items;
- model-visible tool names, descriptions, and schemas;
- output-token cap;
- reasoning effort.

It excludes request ID and abort signal. It has no fixture/component/manifest/label/call-index branch.
An unknown canonical request receives one fixed rejection response.

The known-good authoring recorder is confined to `hfb-semantic-authoring.ts`. It authors finite rows
from actual known-good requests; the final executor receives only those request/response rows. This
construction intentionally validates runtime wiring, not realistic model intelligence or fixture
difficulty.

Tool calls go through the standalone registry and immutable builtin implementations. The semantic
cases exercise actual `filesystem.read` and `filesystem.edit`; mutable `ToolDescription` prose remains
bound to immutable implementation and input-schema hashes. Tools consume only validated tool IDs and
arguments.

`ObservableOutcomeVerifier` consumes only final text plus declared workspace file hashes. It receives
no harness/component identity, oracle record, target diff, expected harness ID, or fixture label.

## 4. Eight exact mutable component semantics

The 28 visible development cases cover seven preregistered families and eight exact component types:

- `SystemPrompt`: selected sections become model instructions.
- `ContextPolicy`: controls included transcript sources and the model-visible tool catalog.
- `MemoryRetrievalPolicy`: controls filesystem-memory namespaces, scoring, limits, and ordering.
- `Skill`: selected finite steps, completion checks, and bound tool IDs enter instructions.
- `WorkflowPolicy`: a closed transition is selected and destination actions are dispatched; the
  observable receipt enters task context.
- `RoutingPolicy`: priority and stable tie-breaking select primary or child execution.
- `SubagentPrompt`: a selected child is launched through `DescendantManager`, and the prompt enters the
  child model context.
- `ToolDescription`: mutable prose changes the model-visible catalog while implementation/schema stay
  immutable.

Routing and subagent prompts retain the preregistered combined family count: two cases target routing
and two target subagent prompts.

Good/fault divergence therefore occurs through a changed canonical request, route, child context,
workflow receipt/action, memory selection, tool visibility, or task artifact before the verifier. The
runner never selects pass/fail by manifest identity.

## 5. Label-blind attribution boundary

`src/evaluation/hfb-label-blind-adapter.ts` exports an allowlist, not a denylist. It retains only:

- runtime state and transition classes;
- context source/reason counts;
- model output kinds;
- known tool name and status;
- verifier booleans;
- closed workflow transition/action classes;
- routing target kind;
- canonical request-table match booleans.

It removes raw task text and output, filenames and paths, evidence/error detail, hashes, fixture,
component, harness, route, and rule IDs, provider metadata, verifier summaries, oracle labels,
mutation data, and expected values.

Adversarial tests:

- inject fixture/component/harness labels into IDs, paths, hashes, raw output, error detail, metadata,
  and verifier text, then prove none survive;
- rename all opaque IDs and prove the projected input is unchanged;
- reverse corpus input order and prove content-sorted/deduplicated corpus identity is unchanged;
- scan execution and adapter sources for prohibited oracle imports.

The persisted evidence reports zero forbidden-value leaks across 28 projected traces,
opaque-ID-renaming invariance, and input-order invariance.

## 6. Per-fixture causal and replay validation

All 28 visible `D_mine` cases satisfy:

- known-good passes and faulty fails;
- exactly one enabled mutable component changes;
- immutable pin diff count is zero;
- behavior diverges before verification;
- declared target restoration passes;
- preregistered non-target restoration does not repair the fault;
- three known-good replays have one event-chain hash;
- three faulty replays have one event-chain hash;
- execution-visible packages contain no oracle labels.

Aggregate counts:

```text
validated fixtures:                    28
known-good pass:                       28
faulty fail:                           28
single changed component:              28
immutable diff count:                   0
pre-verifier behavioral divergence:   28
target restoration pass:              28
non-target restoration remains fail:  28
known-good three-replay stability:     28
faulty three-replay stability:         28
label-blind projected traces:          28
forbidden-value leaks:                  0
```

There are 28 oracle records, 28 validation reports, and 18 unique content-addressed label-free
execution packages. The package count is lower because identical environments are intentionally
deduplicated; fixture-oracle records and commitment entries remain one per case.

## 7. Fresh commitments and persisted evidence

```text
semantic evidence source commit:
  829dd1943954ba64e6e0c08bae35710b3db348e4

new semantic suite commitment:
  sha256:61c5f01ecb135436df55a76d169a26dac48379d18f31eb8e7d78e04a4e9c40be

new label-blind corpus commitment:
  sha256:49f7dcbfaabdc122294b41f30d56f15d5eca6088d7941f07483968bdd58e1a01

development evidence:
  architect/evidence/harness-fault-bench-semantic/evidence.json

development evidence file SHA-256:
  3083ce265e91292582dfbff6320ab8a1f536e9afc50280e18230dcfe434cb876
```

`npm run verify:hfb-semantic-evidence` validates schemas, file inventory, all content hashes,
commitment joins, oracle exclusion, and the clean source commit without re-executing fixtures.

During the first full coverage run, concurrent authoring exposed a race in append-only component
registry writes. Immutable component creation was serialized, the targeted semantic coverage test
then passed, and all evidence was regenerated from the new clean source commit above. The stale
pre-fix evidence was not retained as current.

## 8. Local validation

```text
npm run check:                         pass
npm run build:                         pass
npm test:                              90/90 pass; 0 fail/skip/todo
npm run test:coverage:                 90/90 pass
all-files line coverage:               94.03%
all-files branch coverage:             88.69%
all-files function coverage:           92.00%
semantic execution line coverage:     100.00%
semantic authoring line coverage:      99.25%
label-blind adapter line coverage:     98.48%
npm run verify:hfb-governance:         pass
npm run verify:hfb-semantic-evidence:  pass
```

The repository was clean when semantic evidence was generated and is clean at packet preparation.

## 9. Explicit non-claims and untouched boundaries

Not performed:

- attribution-model execution or attribution-accuracy measurement;
- mutation proposal, candidate HarnessVersion, candidate evaluation, promotion, canary, or rollback;
- B0–B6, matched-budget research comparison, pilot, or threshold calibration;
- real-provider call or use of an API key;
- `D_gate`, final, temporal, withheld-public, multi-cause body, or Terminal-Bench body creation/access;
- performance, generalization, security, self-improvement, or self-evolution claim;
- external repository write, deployment, release, or publication.

The canonical request-table construction can make a semantic wiring fault detectable by producing an
unknown request. It does not prove that a future attributor can diagnose the correct component from
the allowlisted trace, nor that these fixtures have research validity. Those questions remain blocked
behind this review and later preregistration.

## Decision questions

1. Are the signed deviation and mechanical old-suite quarantine sufficient?
2. Does the new semantic path satisfy the required execution/oracle separation for visible
   deterministic development fixtures?
3. Are all eight exact mutable component types now causally wired through actual runtime decision
   points, with provider/tool/verifier behavior sufficiently label-independent?
4. Is the allowlist adapter plus adversarial testing sufficient to permit label-blind attribution
   **development**, without calling any result research attribution accuracy?
5. What exact next bounded local scope is authorized, if any?

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK
GOVERNANCE_CLOSURE:
SEMANTIC_EXECUTION:
AUTHORITY_AND_LEAKAGE_BOUNDARY:
EVIDENCE_AND_CLAIMS:
BLOCKING_FINDINGS:
AUTHORIZED_NEXT_SCOPE:
NEXT_PACKET_REQUEST:
```
