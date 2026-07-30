# Gate 1 → Gate 1R → Gate 1RR → Gate 1RRR Change Log and Open Fields

Status: `draft-1`; external Gate 1, Gate 1R, and Gate 1RR decisions `REVISE`; Gate 1RRR pending
Architect responses: `.codex/gpt-pro-architect/responses/response-1.md`,
`.codex/gpt-pro-architect/responses/response-1r.md`,
`.codex/gpt-pro-architect/responses/response-1rr.md`

## Corrective changes

| Change | Architect issue resolved | Disposition |
|---|---|---|
| Split immutable `ComponentManifest`/`HarnessVersionManifest` from provenance, lineage, lifecycle, evaluation, decision and deployment records | content identity mixed with mutable history | contracted |
| Replaced per-component active projection with one whole-harness deployment CAS | independently assembled unevaluated composition | contracted |
| Defined RFC 8785/I-JSON/text/path/artifact/closure hashing and mutation size vector | ambiguous/reproducibility-vulnerable hashing | contracted |
| Added protocol-authored component type registry | candidate-controlled type/mutability/provenance | contracted |
| Restricted all MVP mutations to closed declarative JSON DSLs | executable Skill/Workflow and indirection laundering | contracted |
| Counted full transitive component/artifact closure and semantic/capability change | one-ref/8 KiB laundering | contracted |
| Added runtime-state snapshot and non-rebind descendant inheritance | hidden memory/workspace/cache/job behavior | contracted |
| Published metric/split matrix; moved multi-cause recall to final only | final data used as candidate gate | contracted |
| Froze five-candidate mine batch, one gate batch, fixed release packet, zero adaptive replacements | unbounded gate adaptivity | contracted |
| Renamed Terminal-Bench final role `withheldPublicTest` and disclosed contamination | public tasks overstated as sealed | contracted |
| Added temporal independent/blinded authorship and replication-only protocol | benchmark-author tailoring | contracted |
| Made B5-SM and B6-ABL mandatory | H1 mutation scope/size/attribution confound | contracted |
| Defined `K_A` solver slots and `K_B` candidate slots separately | ambiguous K/track budgets | contracted |
| Separated evolution/final/B0 cost and added amortization equations | equal-development and hidden-cost claim | contracted |
| Added phase ledger for all roles/statuses/caches/retries/jobs and separate deterministic compute | incomplete matched-budget accounting | contracted |
| Made H3 total charged system inference primary | proposer-token cost shifting | contracted |
| Withdrew ad hoc −5/−2 margins; added task-resolution/pilot power/freeze rules | unjustified margins | contracted |
| Added task-primary nested-seed estimands, hierarchical bootstrap, precision rule, Holm hierarchy | pseudo-replication/multiplicity | contracted |
| Defined exact >10% cost formula and mechanical high-cost exception | informal Pareto override | contracted |
| Froze all HFB fault mechanics, oracle, pair graph, scorer, ambiguity and independent review before fixtures | IDs/categories did not freeze benchmark semantics | contracted |
| Added full principal matrix including provider proxy/benchmark/protocol authors | directories/prompts were not authority boundaries | contracted |
| Defined protocol-scoped digest pinning and cross-protocol pooling ban | vague “immutable” claim | contracted |
| Revised ADR to make OS identity/authenticated protocol—not language—the boundary | evaluator impersonation/framing unspecified | contracted |
| Moved Python experiment to hash-pinned `spikes/python-contract-spike/` | pre-contract code contaminating implementation path | complete and hash-verified |
| Added cross-field validator and OS/wire adversarial acceptance criteria | diagrams/schemas lacked enforcement proof | contracted |

## Other corrections

- Evidence class `observed_fact` is renamed `recorded_observation` with origin trust. Only an authenticated
  evaluator produces `verifier_outcome`.
- Canary is offline replay or isolated synthetic only.
- Git/worktrees and SQLite projections are explicitly non-authoritative.
- Negative, rejected, invalid, budget-exhausted and rolled-back candidates remain retained.
- Deployment lineage and the null bootstrap pointer are external to content identity.
- The invalid external-architect topic collision remains archived and explicitly unusable as evidence.

## Gate 1R → Gate 1RR corrections

- Qualification now ends at `approved`; protocol-v1 deployment exists only as the single `production`
  channel pointer, and rollback is a channel-scoped CAS rather than a global harness state.
- Sessions now have a modeled `terminating → terminated` abnormal path with mandatory revocation, job
  shutdown, sealed accounting, and final evidence.
- H3 now has the named `B6-RAW` counterfactual differing from `B6` only by evidence representation.
- `D_gate` is one-shot for the protocol; arm, selector, report-template, and analysis hashes are frozen
  before access, and selection evidence remains promoter/audit-only until confirmatory finalization.
- Candidate cost uses exact signed-ledger integer inequalities, including full reservation for missing
  usage and zero pass credit for failures/timeouts.
- The fourteen multi-cause edges are enumerated as two seven-edge strata, with degree four per family
  overall and degree two per family within each stratum.
- H4 remains exploratory under a pre-outcome second-model freeze and forbids retuning, reselection, or
  second-model evolution.

## Gate 1RR → Gate 1RRR corrections

- Initialization now has one executable predicate: an approved target and a null rollback target;
  rollback is illegal until the first successful deploy.
- Each pointer state and CAS expectation includes the complete target and rollback-target tuples.
  Deploy copies the prior target into the rollback slot; rollback atomically swaps the two tuples, so
  repeated rollback is deterministic.
- Abnormal termination now uses one immutable transaction descriptor shared byte-for-byte by the
  initiating and final records. Direct initiator reference, original state/principal/reason continuity,
  completion-only additions, and duplicate/conflicting-final rejection are validator invariants.

## Fields intentionally unresolved until authorized pilot/implementation

These are not free-form decisions. Their fill rules are preregistered and one-way:

1. exact provider/model revision/service tier/parameters and reproducibility tier;
2. exact Node/Python patch, container/toolchain/environment digests;
3. numeric per-phase provider/token/tool/time/process/resource caps;
4. final rollout seed count/values selected by the mine/pilot precision rule;
5. gate non-inferiority margin selected by the frozen mine/pilot rule;
6. H3 confirmatory status, conditional on pilot power without widening task-resolution margins;
7. H4 second model identity, frozen before transfer outcomes;
8. concrete Linux container/UID mechanism, which must pass the Gate 2 matrix or remain
   `isolation_emulated`.

Changing a filled field after protocol freeze creates a new protocol ID.

## Gate discipline

No runtime/evolution implementation, provider call, benchmark execution, gate/final access, canary,
promotion, or performance/security claim occurs before an explicit Gate 1 approval. The only preserved
code is the non-authoritative spike archive.
