DECISION: REVISE

NOVELTY:

Relative to the inspected revisions and paths in this packet, the proposed systems gap is distinct enough to justify a bounded prototype. The defensible contribution is the integration and machine enforcement of:

* a standalone coding-agent runtime;
* immutable per-session `HarnessVersion` pinning;
* typed, content-addressed component evolution;
* explicit separation of observed evidence from inferred cause;
* independent evaluation, promotion, rollback, and audit authorities.

The novelty claim must remain architectural. Weakness mining, failure clustering, bounded proposals, candidate lineage, worktrees, held-out evaluation, and rejected-edit memory are already identified as prior art. The packet does not yet support a “first self-improving harness” or “first versioned evolution system” claim.

The current source-level review is sufficient for prototype justification, but not yet for publication-level novelty. Broader related work outside the inspected coding-agent repositories must eventually cover self-adaptive systems, autonomic control loops, configuration evolution, software product-line versioning, and experiment-control systems.

CORRECTNESS:

The task-execution versus harness-evolution distinction is conceptually clear. Retry, reflection, recovery, memory writes, and session resume correctly preserve the pinned version, while evolution creates a new version and requires independent evaluation.

The contract is not yet machine-enforceable in three important places.

First, component type names do not themselves bound behavior. `Skill`, `WorkflowPolicy`, `ContextPolicy`, `RoutingPolicy`, and `ToolDescription` can still hide arbitrary shell commands, executable templates, external references, path traversal, or indirect code loading unless each type has a closed schema and semantic validator. An 8 KiB diff limit restricts quantity, not capability.

Second, persistent memory, resumed sessions, subagents, and background jobs can change observed behavior without changing the `HarnessVersion`. That is acceptable during normal execution, but evaluation requires exact state-isolation rules. Otherwise a candidate can appear improved because it carries train or gate information in memory rather than because its versioned components improved.

Third, the rollback invariant has no genesis rule. “Every active version has a resolvable rollback target” is undefined for the first active version. Activation and rollback also require an atomic two-version transition, not merely state changes on the candidate.

EVALUATION FAIRNESS:

The proposed accounting is unusually comprehensive. Charging solver, proposer, summarizer, attribution, judge, reflection, subagent, and background calls is correct. Matching model identity, call limits, tokens, tools, wall time, processes, memory, and CPU is also the right direction.

The current evaluation contract is not yet fair enough for confirmatory use.

There is a direct split contradiction: the multi-cause cases are declared sealed-test-only, and `D_test` is explicitly not a promotion gate, but sealed multi-cause recall@2 appears under candidate gates. A candidate cannot legally satisfy that gate without consuming final test information.

Repeated aggregate access to `D_gate` is also an adaptive optimization channel. Ten hidden tasks do not remain meaningfully held out if many candidate accept/reject outcomes are fed back into the evolution process. Restricting feedback to aggregates reduces leakage; it does not eliminate it.

The B5 size-matched control is currently optional. It must be mandatory for H1. Otherwise lower regression could be explained by changing fewer components or fewer bytes rather than by attribution-guided mutation.

H3 lacks a fully specified raw-trace comparison condition. It names raw traces as the control but does not define its model, input information, candidate budget, proposal count, evaluation access, or candidate-quality metric.

The comparison between corpus-level evolution and per-task test-time scaling also needs separate accounting. Final sealed-test inference budgets can be matched directly, but the up-front evolution cost cannot be made to disappear merely because B0 chose not to spend it. Evolution cost must be reported separately and, where relevant, amortized over an explicitly stated number of tasks.

GENERALIZATION:

The packet appropriately treats cross-model transfer as a stretch claim and states that transfer failure does not invalidate the architecture. That is sound.

Generalization evidence remains limited by the proposed sample structure:

* the single-fault sealed test has only 14 cases;
* the multi-cause challenge has 14 cases;
* selection validation has 10 Terminal-Bench tasks;
* only two seeds are currently named as a minimum;
* executable `HarnessFaultBench-v0` fixtures do not yet exist.

The phrase “two or more faults” also conflicts with a two-component mutation ceiling and recall@2 interpretation. For a case with more than two true causes, perfect attribution cannot achieve full recall@2. The MVP must either use exactly two faults per multi-cause case or define a cardinality-aware metric and explain what a two-component mutation is expected to accomplish.

Temporal holdout is useful, but its collection and authorship rules are unspecified. Tasks written by the same developers after observing system behavior can still encode selection bias even when written after protocol freeze.

Synthetic attribution results must be reported as synthetic mechanism tests. They cannot establish real-task causal attribution without separate evidence.

REPRODUCIBILITY:

Content-addressed artifacts, exact revisions, append-only events, frozen task IDs, protocol tags, and rebuildable projections are strong foundations.

The remaining `PILOT_PENDING` fields create a post-hoc risk unless the pilot procedure itself is fixed. Exact model identity, token cap, call cap, tool cap, wall-clock cap, environment digest, full seed list, randomization schedule, and analysis code must be frozen before any confirmatory result is observed.

The final proposal to bootstrap pooled task-by-seed observations is not accepted as written. Seeds from the same task are not independent experimental units. The analysis must preserve task-level clustering, for example through a paired cluster bootstrap over tasks or a preregistered hierarchical analysis.

The 10-task `D_gate` cannot support a meaningful two-percentage-point non-inferiority margin without an explicit discrete decision rule or a substantially different sample design. With such a small gate, the stated numerical precision is decorative mathematics.

Infrastructure failures, provider failures, malformed tool results, timeouts, and budget exhaustion also need a preregistered rerun policy. Seeds or runs must not be added after inspecting outcomes.

SECURITY:

The proposed principal separation is a defensible target architecture. The packet correctly states that a Git worktree is not a sandbox and calls for separate identities, mounts, network controls, secrets, and resource enforcement.

The ADR statement that a Node/Python language split “prevents evaluator impersonation” is incorrect. Language separation reduces accidental import coupling; it is not an authentication or authorization boundary. Evaluator identity must come from process credentials, container or UID isolation, authenticated IPC, capability-scoped mounts, and verification of signed or content-addressed inputs.

The runtime principal must not have writable access to:

* the active harness registry;
* immutable trust-plane manifests;
* evaluator code or benchmark mounts;
* promotion policy;
* audit storage;
* other candidate worktrees.

Persistent memory and session storage require split-specific namespaces. Gate and test traces, memory, checkpoints, receipts, and subagent artifacts must never become proposer-visible state.

A local chained append log is tamper-evident under a trusted-host assumption. It is not immutable against a host administrator or any principal that can rewrite the storage. The threat model and resulting claim must say so.

CLAIM DISCIPLINE:

The packet shows strong discipline in distinguishing recovery from evolution, limiting the Gate 1 claim, retaining negative results, and refusing to treat one successful retry as self-improvement.

The following language must be tightened:

* “immutable trust plane” should mean machine-enforced immutable inputs and authorities within the stated threat model, not absolute immutability;
* the language split does not prevent impersonation;
* finite evaluation can establish “no observed safety violation under the specified tests,” not general safety;
* a higher score on `D_gate` is candidate-selection evidence, not held-out scientific evidence;
* synthetic attribution accuracy is not evidence of real-task mechanism identification;
* no general self-improvement claim is authorized, even if H1 through H3 pass.

BLOCKING FINDINGS:

1. The candidate-gate requirement for sealed multi-cause recall@2 contradicts the rule that multi-cause cases are test-only and that `D_test` is unlocked once for final confirmation.

2. Adaptive reuse of `D_gate` is unspecified. Aggregate accept/reject or score feedback can still be used as an iterative optimization oracle.

3. The mutable component boundary is not actually closed. Typed labels and an 8 KiB limit do not prevent executable or externally referenced behavior inside skills, workflows, routing, context, or tool descriptions.

4. Evaluation-state isolation is missing. Persistent memory, resumed sessions, subagents, checkpoints, and background jobs could leak information across tasks, candidates, `D_mine`, `D_gate`, and `D_test`.

5. H3 has no explicit raw-trace baseline contract and no precise definition of candidate quality, paired units, token denominator, or non-inferiority analysis.

6. H1 remains confounded because B5 size matching is only proposed. Even with byte matching, the design does not isolate attribution from typed boundedness unless H1 is narrowed or a bounded no-attribution control is added.

7. The statistical plan is not confirmatory as written. The 10-task gate cannot operationalize a two-point margin, task-by-seed pooled bootstrap risks pseudo-replication, and the exact number of seeds is not frozen.

8. Multi-cause cardinality is undefined. Cases with more than two faults do not align cleanly with recall@2 or the two-component mutation limit.

9. The trust boundary is still descriptive rather than contractual. Process language is incorrectly treated as a security boundary, and no exact principal-capability, IPC, mount, or evaluation-state matrix is provided.

10. Pilot filling, seed selection, rerun handling, benchmark fixture construction, and hypothesis hierarchy remain flexible enough to permit post-hoc choices.

11. The initial active-version rollback target and atomic rollback transition are undefined.

12. `HarnessFaultBench-v0` IDs are frozen before executable fixtures or an independent fixture-construction protocol exist. Ground-truth categories alone do not prevent benchmark authoring bias.

REQUIRED REVISIONS:

1. Remove sealed multi-cause evaluation from candidate promotion. Either:

   * reserve all 14 multi-cause cases for the single final test; or
   * create a separately frozen multi-cause validation set that is not part of `D_test`.

   The final test must remain one-time, non-adaptive, and unavailable to proposal, selection, canary, and promotion.

2. Define a non-adaptive `D_gate` protocol. At minimum:

   * candidate proposals must be generated from `D_mine` before any gate result is released;
   * the maximum number of gate-evaluated candidates and gate queries must be frozen;
   * no task-level outputs, traces, paths, verifier details, or per-task scores may leave the evaluator;
   * gate results must not be fed into another proposal round in the same confirmatory run;
   * the candidate-selection and tie-breaking rule must be fixed before evaluation.

3. Add closed schemas and semantic validators for every mutable component type. They must specify:

   * allowed fields and value grammars;
   * whether shell, code, templates, expressions, URLs, file references, and includes are forbidden or allowlisted;
   * dependency and tool-reference allowlists;
   * path normalization;
   * maximum payload and collection sizes;
   * canonical serialization;
   * forbidden capability escalation;
   * rejection of indirect references to immutable components or external mutable files.

4. Treat the 8 KiB limit as an absolute ceiling, not the complete mutation boundary. Add per-component-type size limits and a relative canonical-payload bound before `protocol-v1`. The one-component single-fault and two-component explicit multi-cause limits are accepted for the MVP.

5. Make B5 size matching mandatory. Match at least:

   * changed component count;
   * allowed mutable surface;
   * canonical payload delta;
   * proposal/model-call budget;
   * evidence and feedback access;
   * candidate count;
   * static and behavioral evaluation budget.

   If the project wants an attribution-specific causal claim, add a bounded no-attribution or random/heuristic-attribution control. Otherwise rename H1 as a comparison of the complete bounded pipeline against free-form rewrite.

6. Add an explicit H3 paired control:

   * layered evidence versus raw trace;
   * same failure clusters and proposer model;
   * same proposal count and output budget;
   * same candidate gate and static checks;
   * exact definition of proposer-token cost;
   * exact attribution metric;
   * exact candidate-quality metric;
   * exact non-inferiority procedure.

   The proposed 20% token margin may remain only as a preregistered practical-effect threshold after its unit and analysis are defined. It is not approved in its current underspecified form.

7. Replace the current statistical language with a preregistered analysis plan:

   * identify one primary confirmatory hypothesis, preferably H2;
   * classify H1 and H3 as secondary unless multiplicity handling is defined;
   * keep H4 exploratory/stretch;
   * use task-clustered or hierarchical paired uncertainty estimates;
   * perform a power or precision analysis before freezing the exact seed count;
   * freeze all seeds before confirmatory execution;
   * define one-sided versus two-sided intervals;
   * define treatment of failures, missing results, and infrastructure-invalid runs;
   * prohibit adding seeds or tasks after observing comparative outcomes.

8. Replace the two-percentage-point `D_gate` rule. Before protocol freeze, either enlarge the gate or define an exact decision rule compatible with its discrete sample size. Do not report precision the design cannot resolve.

9. Define multi-cause cases as exactly two mutable faults for the MVP, or revise recall@2 and mutation expectations to account for larger ground-truth sets. Freeze the fault-cardinality distribution and scoring rule before fixture implementation.

10. Define evaluation-state isolation:

    * every task and candidate starts from a declared base memory/session snapshot;
    * no gate or test memory, trace, checkpoint, reflection, or background output reaches the proposer;
    * background jobs are terminated and accounted for at evaluation end;
    * candidate sandboxes are fresh;
    * cross-task persistent memory is disabled for the primary experiment unless it is explicitly versioned and tested as a separate treatment;
    * test execution begins from the same state contract for every baseline.

11. Add a baseline budget table separating:

    * evolution or optimization budget;
    * candidate-selection feedback budget;
    * per-task sealed-test inference budget;
    * total model and tool usage;
    * wall-clock and host-resource usage;
    * amortized evolution cost, where claimed.

    Define the exact meaning of `K=5` for each baseline. B0 may remain a zero-evolution reference, but that fact must be reported rather than described as equal total compute.

12. Freeze the pilot procedure. Pilot tasks and runs must be disjoint from confirmatory evidence. Gate 3 may fill the listed `PILOT_PENDING` fields only through a predefined rule, after which the complete protocol, seed list, manifests, environment digest, analysis code hash, and provider metadata are tagged. Pilot outcomes must not be used as confirmatory observations.

13. Add a principal-capability matrix covering runtime, operations owner, proposer, evaluator, promoter, and audit store. For each principal, specify:

    * executable identity;
    * readable and writable mounts;
    * IPC endpoints and authentication;
    * network policy;
    * available secrets;
    * benchmark access;
    * artifact write authority;
    * process and resource limits;
    * allowed state transitions.

14. Revise ADR-0001. The Node.js and Python choices are provisionally acceptable, but the ADR is not approved as written. Replace the evaluator-impersonation claim with a non-security rationale such as implementation independence and reduced shared-library coupling. Define the JSON Lines envelope, schema version, message identity, maximum size, timeouts, exit behavior, malformed-output behavior, replay handling, and authenticated process boundary.

15. Define audit claims as tamper-evident under an explicit host-trust assumption. Hash-chain verification does not establish immutability against a compromised host or storage administrator.

16. Define genesis and rollback:

    * designate an immutable genesis version with an explicit rollback exception or bootstrap target;
    * make activation and rollback compare-and-swap operations;
    * atomically retire or mark the former active version while activating the exact evaluated target;
    * reject rollback when hashes, parent identity, or active-head expectations differ.

17. Freeze a fixture-construction protocol for `HarnessFaultBench-v0` before implementing fixtures. Include:

    * deterministic fixture templates or generation rules;
    * ground-truth encoding;
    * task-author independence or review;
    * split-specific hash manifests;
    * checks that prompts and artifacts do not reveal fault categories;
    * acceptance tests;
    * a rule forbidding fixture edits in response to model outcomes without a protocol-version change.

18. Quarantine the existing Python spike immediately under an explicit `spikes/` boundary or delete it. It must:

    * have no import path into production packages;
    * be excluded from confirmatory evidence and test claims;
    * not define canonical schemas or behavior;
    * be deleted before the implementation baseline, or retained only as clearly labeled non-shipping archaeology with provenance.

NON-BLOCKING RECOMMENDATIONS:

1. Add a compact claim-to-evidence matrix mapping each intended paper claim to its dataset, baseline, endpoint, statistical test, and falsification condition.

2. Broaden related-work coverage before publication claims, while retaining the current revision-specific source ledger. The inspected repository comparison is good evidence about those repositories, not proof of universal absence.

3. Report exact counts and uncertainty for synthetic attribution rather than only threshold pass/fail. With small test sets, a threshold can conceal substantial uncertainty.

4. Add an ablation that disables attribution but retains the same typed mutation grammar. This would separate the benefit of attribution from the benefit of simply preventing large arbitrary rewrites.

5. Record both attempted and accepted mutations, including static rejection reasons. Otherwise mutation efficiency can look better merely because failed proposals disappeared before accounting.

6. Record provider request metadata, returned model identifier, usage fields, service tier, date window, and all unavailable identity fields. Do not imply weight-level reproducibility when the provider does not expose it.

7. Use “no observed violation in the specified adversarial suite” rather than “safe” in all reports.

8. Preserve the negative-result posture. A sound architecture with no held-out performance gain remains a useful systems result; the world already has enough benchmarks converted into marketing departments.

AUTHORIZED NEXT SCOPE:

Prepare a revised Architect Packet 02 containing only the corrected research and enforcement contracts.

Authorized work:

* revise the hypotheses, baselines, split usage, gate-query protocol, and statistical analysis plan;
* define typed mutable-component schemas and semantic restrictions;
* define memory, session, subagent, and candidate-evaluation isolation;
* define the budget ledger and protocol-freeze procedure;
* define the principal-capability and authenticated process-boundary matrix;
* revise ADR-0001;
* define genesis activation and rollback invariants;
* define the `HarnessFaultBench-v0` fixture-construction protocol;
* quarantine or delete the frozen Python spike.

Not authorized:

* implementation of the task-execution loop;
* implementation of the evolution loop;
* candidate mutation code;
* provider integration or paid model calls;
* benchmark execution;
* `D_gate` or `D_test` access;
* external code or data upload;
* performance, security, novelty, or self-improvement claims.
