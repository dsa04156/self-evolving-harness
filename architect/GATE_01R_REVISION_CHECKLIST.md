# Gate 1R Revision Checklist

Status: **READY FOR EXTERNAL RESUBMISSION**  
Source decision: `.codex/gpt-pro-architect/responses/response-1.md`  
Decision: `REVISE`  
Protocol under revision: `draft-0` → `draft-1`

This checklist is the authoritative trace from the external Architect's 26 required revisions to the
local contract artifacts and deterministic prechecks. A row is complete only when the named artifact
exists and its acceptance evidence passes. Completion does not authorize runtime implementation; only
an explicit Gate 1R `APPROVE` does.

| ID | Required contract change | Primary artifact(s) | Acceptance evidence | Status |
|---:|---|---|---|---|
| R1 | Split immutable content-addressed manifests from append-only lifecycle, evaluation, promotion, activation, and provenance records. | `component-model.md`; manifest and record schemas | A manifest hash is unchanged when external records append. | complete; static precheck passed |
| R2 | Activate one evaluated whole-harness manifest atomically; remove per-component active pointers. | `component-model.md`; deployment-pointer schema | CAS transition rejects unevaluated or mixed component compositions. | complete; static precheck passed |
| R3 | Freeze canonical serialization, UTF-8/text normalization, ordering, symlink rules, artifact handling, closure hashing, and recomputation. | `canonicalization-and-hashing.md` | Golden vectors and adversarial path/hash cases are specified. | complete; static precheck passed |
| R4 | Make component type and mutable class authoritative type-registry properties; trusted planes emit provenance and attribution. | `component-type-registry.json`; component model | Candidate payload cannot override type, mutability, or provenance. | complete; static precheck passed |
| R5 | Restrict every mutable payload to declarative data or a capability-limited DSL; prohibit executable and indirect behavior. | `mutable-payload-contract.md` | Validator rejection table covers imports, hooks, registration, downloads, encodings, indirection, and code generation. | complete; static precheck passed |
| R6 | Measure mutation size over expanded dependency closure; record semantic capability and normalized token/AST edits. | mutation proposal schema; mutation contract | One-byte manifest edits that replace large artifacts are charged by expanded closure. | complete; static precheck passed |
| R7 | Count transitively changed dependencies against one/two-component limits. | mutation contract; static validator plan | Hidden multi-component mutation is rejected. | complete; static precheck passed |
| R8 | Pin/reset memory, workspace, environment, checkpoints, caches, subagents, and jobs; forbid descendant rebinding. | `runtime-state-snapshot.md` | Inheritance and fresh-evaluation reset invariants are explicit. | complete; static precheck passed |
| R9 | Map every metric to mine/gate/final; prohibit test use in adaptation; move multicause recall to final. | `metric-split-matrix.md` | No candidate gate references sealed or final-test metrics. | complete; static precheck passed |
| R10 | Bound gate adaptation and released fields; count every release as feedback. | `gate-feedback-policy.yaml`; data-access policy | Candidate count, gate queries, visibility, and one-shot selection are finite and frozen. | complete; static precheck passed |
| R11 | Rename Terminal-Bench test to withheld public test and disclose contamination risk. | split manifest and evaluation docs | Repository-wide terminology check has no unqualified “sealed Terminal-Bench” claim. | complete; terminology precheck passed |
| R12 | Add independent/blinded temporal-holdout governance, preregistered inclusion rules, hashes, frozen verifiers, and contamination checks. | `temporal-holdout-governance.md` | Author and evaluator roles cannot see candidate outcomes. | complete; static precheck passed |
| R13 | Make B5 size matching mandatory and add bounded attribution-ablated B6 control. | `baseline-matrix.md`; baselines | Confound-control columns match scope, closure size, candidates, feedback, and compute. | complete; static precheck passed |
| R14 | Define `K` separately for Tracks A/B, feedback visibility, phase scope, unused resources, and claim mapping. | baseline and budget matrices | Each baseline has an executable resource/data contract. | complete; static precheck passed |
| R15 | Separate evolution cost, final test-time cost, amortization, and static-anchor interpretation. | budget contract; claim matrix | No text calls B0 development budget “equal.” | complete; static precheck passed |
| R16 | Freeze phase-specific budget ledger and accounting for failed/cancelled/cached/reasoning/subagent/judge/retry calls. | `phase-budget-ledger.md`; budget config | Every provider event maps to exactly one phase and charged category. | complete; static precheck passed |
| R17 | Make total charged inference/provider cost H3's primary efficiency measure; proposer tokens secondary. | hypotheses; statistical plan | Moving work to another model role cannot improve the primary metric. | complete; static precheck passed |
| R18 | Defer and justify non-inferiority margins on mine-only pilot data before gate/test access. | falsification contract; protocol freeze fields | Margins remain `PILOT_PENDING` with a one-way freeze rule. | complete; static precheck passed |
| R19 | Freeze estimands, comparison hierarchy, task-clustered resampling, nested seeds, precision rule, and multiplicity. | `statistical-analysis-plan.md` | No task×seed pseudo-replication; confirmatory seed count has a preregistered rule. | complete; static precheck passed |
| R20 | Define candidate cost scalar/vector, denominator, >10% formula, and minimum success improvement. | budget contract; promotion policy contract | Informal Pareto exceptions are impossible. | complete; static precheck passed |
| R21 | Freeze HarnessFaultBench fixture templates, fault mechanics, oracle, labels, ambiguity, balance, scorer, multicause rules, and independent review. | `FIXTURE_SPEC.md`; fixture schema | Fixture implementation cannot change semantics without a protocol bump. | complete; static precheck passed |
| R22 | Define principal-by-capability matrix for runtime, owner, proposer, evaluator, promoter, audit, provider proxy, and benchmark author. | `principal-capability-matrix.md` | UID/container, mounts, messages, secrets, network, caps, and record authority are complete. | complete; static precheck passed |
| R23 | Define immutability as protocol-scoped digest pinning and forbid mixed-protocol confirmatory evidence. | trust boundary; protocol manifest schema | Any trust-plane change forces a new protocol ID. | complete; static precheck passed |
| R24 | Revise ADR: language split is not security; require OS isolation, authenticated/schema messages, correlation, limits, timeouts/errors, artifact hashes, and locked environments. | revised ADR; wire envelope schema | Threat/transport acceptance table covers impersonation, replay, truncation, oversized payloads, and crash. | complete; static precheck passed |
| R25 | Quarantine the pre-contract Python spike as a hash-pinned, non-authoritative artifact outside all runtime/package/test/import/evidence paths. | `spikes/python-contract-spike/` | Root package discovery and import search cannot reach the spike. | complete; archived hashes passed |
| R26 | Resubmit revised manifests, invariants, matrices, plans, fixture spec, ADR, and validator/adversarial criteria. | `PACKET_01R_RESEARCH_AND_ARCHITECTURE.md` | Local precheck passes; exact packet hash is recorded; same external conversation returns a decision. | packet prepared; external decision pending |

## Dependency order

1. R25 removes the unapproved implementation path.
2. R1–R8 define immutable identity, mutation grammar, and reproducible runtime state.
3. R22–R24 define the trust and transport boundary that can enforce those contracts.
4. R9–R21 freeze data, baselines, accounting, statistics, and benchmark construction.
5. R26 packages only verified artifacts and requests the next decision.

## Scope lock while this checklist is open

Authorized:

- design and research contract edits;
- JSON Schema and protocol-manifest edits;
- fixture specification without fixture implementation;
- deterministic schema/meta-schema/static-document prechecks;
- spike archival and provenance recording;
- Gate 1R packet preparation and external review in the existing project conversation.

Forbidden until Gate 1R approval:

- runtime or evolution implementation;
- provider calls;
- benchmark execution;
- `D_gate`, sealed test, temporal holdout, or withheld public test execution;
- canary, activation, promotion, or rollback operation;
- performance, security, autonomous-improvement, or cross-model claims.
