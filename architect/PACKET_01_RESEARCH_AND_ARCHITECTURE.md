# Architect Packet 01 — Research Contract and Architecture

Packet status: **READY FOR REVIEW; NOT TRANSMITTED**  
Protocol: `draft-0`  
Prepared: 2026-07-30, Asia/Seoul  
Requested decision: `APPROVE | REVISE | BLOCK`

## 1. Review mandate

Review whether this project has a defensible systems contribution and a falsifiable evaluation plan
before runtime implementation proceeds.

The project proposes a standalone coding-agent harness that owns its model-provider abstraction, context
construction, agent loop, tool registry/execution, filesystem and shell tools, persistent memory,
skills, workflows, subagents/backend jobs, sessions, permissions, events/evidence, verification, and
recovery. It must not wrap Codex, Gajae-Code, OpenCode, NexAU, DeepAgent, or another agent runtime.

Gate 1 asks only whether a first-class but separate evolution lifecycle, typed components, evidence
discipline, and immutable trust boundary justify a bounded prototype. It does not approve performance,
security, or a general “self-improving system” claim.

## 2. Non-negotiable terminology

### Task Execution Loop

```text
context → model → tool call → tool result → verification → completion or retry
```

A task session is pinned to one immutable `HarnessVersion`. Retry, reflection, recovery, memory writes,
runtime adaptation, prompt reinjection, and session resume preserve that version.

### Harness Evolution Loop

```text
multiple completed traces
→ weakness mining
→ failure clustering
→ component attribution
→ bounded mutation
→ new candidate HarnessVersion
→ independent static and behavioral evaluation
→ canary
→ promote, reject, or rollback
```

Evolution must create a content-addressed `HarnessVersion`, record component/evidence/attribution/
provenance, evaluate independently from its parent, append a promote/reject/rollback decision, and
preserve the parent plus an exact rollback target.

A higher score from one retry or prompt rewrite is not evolution and is not evidence of general
self-improvement.

### Out-of-scope concepts

Meta-evolution changes the optimizer, evaluator, mutation algorithm, or promotion logic. Model training
changes model weights or learned provider state. Both are excluded from the MVP.

## 3. Source-level prior-art findings

Research cut-off: 2026-07-30. README claims were accepted only when an execution path was located.

| Source and exact revision | Code-path observation | Consequence |
|---|---|---|
| Gajae-Code `main@8778760cf924246ab86e4c6c3fda26da8a572cd8`, MIT | CLI reaches `createAgentSession`; `agent-loop.ts` owns streamed model/tool iteration; control-plane files implement deterministic state, recovery, receipts, storage, and owner. No version/evaluation/promotion lifecycle was found in the inspected path. | Strong runtime/operations prior art; recovery is not evolution. |
| Oh My OpenAgent `dev@258fab04159c0d628d7cc4c811e2907aee1cd0a1`, Sustainable Use License 1.0 | Roadmap layers Pure Core → MCP/Skills → runtime adapter → platform. The OpenCode path wires host plugin tools/hooks rather than a solver loop. | Reuse capability-specific seams, not its host runtime or source. |
| OpenAI Codex `main@6219b7c40fc9c702c0aef9964e72b492558f60e4`, Apache-2.0 | App-server exposes Thread/Turn/Item; `core/src/session/turn.rs`, tool router, and thread-store own loop, dispatch, events, and persistence. | Mature runtime comparison; no inspected versioned evolution plane. |
| AHE `main@faf44bc4aea57413c520bc5711c6ebf628e0da1e`, MIT | `evolve.py` runs Harbor, trace analysis, evolve agent, Git commits/tags, and worktrees; target agent depends on NexAU and Agent Debugger is partially open. | Observability, edit contracts, and worktrees are prior art; prompt/filesystem restrictions are not an immutable principal boundary. |
| Meta-Harness `main@44b9942127847f7421db70d8c7e48407f09a3c70`, MIT | External Claude Code writes candidate Python; validation frontier and explicit final test are implemented; Terminal-Bench generates a whole subclass. | Candidate lineage/split separation are prior art; runtime is external and mutation is free-form code. |
| Self-Harness arXiv:2606.09498v1, paper CC BY 4.0 | No public method repository was located. The paper specifies weakness mining, bounded/diverse proposals, passing-case preservation, held-out checks, and rejected-edit memory. | Those algorithms are not novel here; isolation remains documented-only. |
| Evaluation critique arXiv:2607.12227v1; code `ffd1ba1c2c3e31099264f630b9ed44aec63a86a7` | Defines parallel, sequential, task-specific scaling, and evolution under `K`; configs publish the exact 45/10/34 IDs. Code checkout has no detected source license. | Match all compute/feedback, not iterations; use factual IDs but copy no code. |
| DGM `main@a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2`, Apache-2.0 | Docker/patch archive evolves agent/optimizer-adjacent code; an inspected prompt can include official test patch material. | Broader mutable surface and incompatible sealed-data assumptions. |
| Lilian Weng, 2026-07-04 | Describes filesystem memory, explicit subagents/jobs, prompt→context→workflow→harness→optimizer, negative results, and evaluator/permissions outside evolution. | These are design requirements, not novelty claims. |

Absence findings are scoped to inspected paths and revisions. The complete ledger records file/section,
observed fact, separate inference, implementation status, license, and clean-room reuse decision.

### Claimed remaining gap

The defensible question is not whether trace-driven mutation works. It is:

> Can a standalone coding-agent runtime make harness evolution a first-class, typed lifecycle while
> machine-enforcing separation among session retry/recovery, versioned component mutation, observed
> evidence versus inferred cause, and immutable evaluation/data/permission/budget/model/promotion/audit
> authority?

The contribution collapses if execution is delegated to an existing harness, if versions are free-form
directories, if evaluator separation is only a prompt, if attribution is not measured against known
faults, or if held-out improvement is explained by extra compute.

## 4. Preregistered hypotheses and falsification

### H1 — regression control

Attribution-guided bounded mutation has a lower pass→fail regression rate than free-form whole-harness
rewrite.

Falsified if regression does not fall, if the difference is explained by mutation size or extra
compute, or if held-out performance worsens.

### H2 — reusable held-out improvement

Under equal feedback and inference budgets, a frozen evolved harness improves sealed held-out pass@1
over static and prompt-only harnesses.

Falsified if no held-out gain exists, gain appears only on train/validation, the paired confidence
interval includes zero, or retry/test-time compute explains the result.

### H3 — evidence efficiency

Layered evidence uses fewer proposer tokens than raw traces while preserving attribution and candidate
quality.

Falsified if token savings are absent or attribution/candidate quality materially degrades. Proposed
operational margins—requiring Architect approval—are at least 20% median proposer-token reduction,
top-1 attribution non-inferiority within −5 percentage points, candidate gate delta within −2 points,
and zero new safety violations.

### H4 — cross-model transfer, stretch

A harness evolved on one model transfers positively to a second unseen model without re-evolution.

Falsified if performance declines or model-specific retuning is required. Failure removes the transfer
claim; it does not invalidate the architecture.

## 5. Frozen data roles and splits

### HarnessFaultBench-v0

Purpose: deterministic evaluation of component-fault attribution, not proof of real-LLM capability.

Seven mutable fault categories:

1. SystemPrompt
2. ContextPolicy
3. MemoryRetrievalPolicy
4. Skill
5. WorkflowPolicy
6. RoutingPolicy/SubagentPrompt
7. ToolDescription

Single-fault tasks: eight per category, 56 total:

- `D_mine`: four/category, 28;
- `D_gate`: two/category, 14;
- sealed single-fault test: two/category, 14.

Multi-cause challenge: 14 sealed-test-only cases containing two or more faults.

The IDs and split memberships are frozen and mechanically verified as disjoint. Executable fixtures do
not yet exist and must be implemented only after Gate 1 without changing IDs or ground-truth categories.

### Terminal-Bench 2.1 replication

Exact public IDs from commit `ffd1ba1...` are frozen:

- evolution train: 45;
- selection validation: 10;
- sealed test: 34.

The proposer may read `D_mine`, but not `D_gate` details. `D_test` task content, paths, verifier details,
and traces are absent from the proposer mount. The external evaluator receives opaque task handles.

### Temporal holdout

Tasks are written or collected after `protocol-v1` freeze, remain unavailable during evolution, and are
used only for final replication.

### Data-role interpretation

`D_gate` is held out from proposal generation and selects candidates through restricted aggregate
results. `D_test` is not a promotion gate: it is unlocked once after protocol freeze for confirmatory
evaluation of the final frozen artifact.

## 6. Baselines and matched-budget contract

- B0: static harness, direct pass@1.
- B1: parallel sampling.
- B2: sequential refinement.
- B3: task-specific harness scaling.
- B4: prompt-only evolution.
- B5: free-form whole-harness rewrite, with a proposed size-matched control.
- B6: attribution-guided bounded mutation.

Common conditions:

- same exact provider/model/revision/service tier and parameters;
- same initial harness, tools, environment image, verifier access, and task order/randomization;
- same model-call, input/output/reasoning/cached-token, tool-call, feedback-event, wall-clock, process,
  memory, and CPU caps;
- `K=5` and at least seeds `1729` and `271828`.

All roles are charged: solver, proposer, summarizer, attribution model, judge, reflection, subagent, and
background model work. The first exhausted cap ends the method and partial work is failure unless a valid
terminal result was already committed.

Track A measures where matched test-time compute is spent by comparing B0–B6 on the same tasks. Track B
evolves on mine, selects on gate, freezes the harness, and performs one no-retry pass on sealed test.

Exact model identity, rollout token cap `T`, call/tool caps, wall-clock `W`, and environment digest remain
`PILOT_PENDING`. Gate 3 may fill only those listed fields, then tag `protocol-v1`. Later changes increment
the protocol and exclude earlier runs from confirmatory evidence.

## 7. Six-layer architecture

1. **Agent Runtime Kernel:** provider interface, context builder, append-only loop, tool
   registry/executor, sessions, subagents, event bus.
2. **Harness Component Plane:** typed component families, content-addressed versions, dependency DAG,
   provenance, mutable class, activation projection.
3. **Operations Control Plane:** start, submit, observe, interrupt, resume, recover, validate, finalize,
   retire, events, artifacts, leases, checkpoints.
4. **Evidence Plane:** runtime facts, verifier outcomes, inferences, artifacts, failure reports,
   receipts, append-only audit linkage.
5. **Evolution Control Plane:** weakness mining, clustering, attribution, bounded proposal, candidate
   registry, worktree lineage, evaluation/canary coordination.
6. **Immutable Trust Plane:** evaluator, permission/safety, sealed data, budgets, model identity, trace
   collector, audit verifier, promotion policy.

Principals are runtime, operations owner, proposer, evaluator, promoter, and audit store. Process
emulation is not production isolation without separate UID/container, mounts, network, secrets, and
resource enforcement.

## 8. Component graph and mutation boundary

Every `HarnessComponent` has:

- componentId, componentType, semanticVersion, and canonical-payload contentHash;
- exact dependencies;
- mutableClass: mutable, conditionally-mutable, or immutable;
- provenance and evaluationHistory;
- activeVersion registry projection.

A `HarnessVersion` binds exact component versions/hashes plus parent, rollback target, immutable/budget/
model/split manifests, mutation/attribution/evaluation/decision references, and state history.

MVP mutable types are SystemPrompt, ContextPolicy, MemoryRetrievalPolicy, Skill, WorkflowPolicy,
RoutingPolicy, SubagentPrompt, and ToolDescription.

Immutable in MVP are evaluator, benchmark/splits, permission/safety, model identity, token/tool/time
budget, trace collector, audit/promotion policy, tool implementations, middleware, and optimizer code.
Recovery/verification and compound compatibility types are conditionally mutable with no enabled MVP
condition.

Proposed machine-enforced mutation limits are one component for a single-fault proposal, up to two only
for an explicit multi-cause proposal, and at most 8 KiB canonical payload delta. Every proposal records
predicted fix/regression, passing-behavior preservation, and rejected-edit comparison. These numeric
limits are Architect-review items, not hidden implementation decisions.

## 9. Evidence model

JSON Schema Draft 2020-12 contracts exist for:

- HarnessComponent and HarnessVersion;
- RuntimeEvent and EvidenceReceipt;
- FailurePattern and AttributionResult;
- MutationProposal;
- EvaluationResult and PromotionDecision;
- operations `{state,evidence,nextAllowedActions}` response.

Runtime records carry event/session/harness identity, ordering/time, producer, chained hashes, artifacts,
and redaction metadata.

Epistemic classes are physically explicit:

- `observed_fact`: deterministic runtime observation;
- `verifier_outcome`: fixed-evaluator result;
- `inference`: mechanism, attribution, reflection, or prediction.

Inference requires source event IDs, confidence, alternative explanations, and producer identity.
Inference cannot satisfy completion or promotion gates.

Schemas passed JSON parsing and Draft 2020-12 meta-schema checks. Instance conformance, DAG/cycle checks,
hash recomputation, state-transition validation, and cross-field equality still require deterministic
validators after Gate 1.

## 10. Separate state machines

Session states:

```text
created → initialized → running
running → waiting | validating | blocked | recovering | retired
waiting → running | blocked | recovering | retired
blocked → recovering | retired
recovering → initialized | running | blocked | retired
validating → completed | running | blocked | retired
completed → retired
```

The harness ID is pinned during initialization and never changes.

HarnessVersion states:

```text
draft → candidate → statically_validated → evaluating → canary → active → retired
          ↘ rejected        ↘ rejected       ↘ rejected
active → rolled_back → retired
```

No candidate can skip independent evaluation. Activation uses compare-and-swap against the evaluated
parent. Every active version has a resolvable rollback target. A stale candidate must be re-evaluated or
rejected, not implicitly rebased.

## 11. Candidate gates

Deterministic:

- schemas: 100% pass;
- immutable file/component diff: zero;
- safety/permission violations: zero;
- audit chain valid;
- rollback returns exact baseline hashes;
- deterministic previously passing pass→fail: zero.

Attribution:

- single-fault top-1 accuracy ≥70%;
- single-fault top-3 accuracy ≥90%;
- sealed multi-cause recall@2 ≥70%.

Candidate performance:

- at least one targeted mine failure improves;
- gate point estimate is no worse than parent;
- paired 95% CI lower bound ≥−2 percentage points;
- cost >10% requires success/cost Pareto improvement;
- zero safety/permission violations.

Final performance claims require a sealed-test improvement over static with pooled task×seed paired
bootstrap 95% CI above zero, improvement over prompt-only, and at least 25% relative pass→fail regression
reduction versus free-form rewrite. Superiority over test-time scaling additionally requires beating the
strongest matched B1/B2/B3 with CI above zero.

## 12. Trust boundary and threats

The proposer can read redacted mine evidence and write only its proposal/worktree. It has no gate/test
mount. The evaluator reads candidate and authorized benchmark material read-only and emits a narrow
schema-valid result. The promoter applies an immutable policy but cannot propose or solve tasks. The
audit store is the sole append authority.

A worktree is not a sandbox. The target requires separate identities/containers, read-only evaluator and
benchmark mounts, no proposer benchmark mount, a fresh candidate sandbox, denied-by-default network,
principal-scoped secrets, host-enforced resource/inference caps, and schema/identity/hash verification.
Adversarial tests cover immutable laundering, leakage, injection, path/shell escape, secrets, forged
results, audit/usage tampering, gate overfitting, memory/subagent escalation, promotion races, and
rollback failure.

Any immutable-boundary violation, leakage, unfair compute, or irreproducibility is a final `BLOCK`
regardless of score.

## 13. Proposed stack ADR

Proposed, not yet accepted:

- Node.js 22 LTS + strict TypeScript for runtime, CLI, registries, and control/evidence/evolution planes;
- Python 3.13 external evaluator/statistics process;
- JSON Lines process protocol and JSON Schema contracts;
- filesystem append logs/content-addressed artifacts, with optional rebuildable SQLite projections;
- local Git and detached worktrees for candidate lineage.

The process/language split prevents evaluator impersonation through shared imports. The pre-contract
Python `src/evoharness/` spike is frozen, is not evidence, and must be deleted after contract-porting or
moved under an explicit `spikes/` label.

## 14. Known limitations and negative-result posture

- Self-Harness process behavior is not code-verified; AHE analysis is only partly reproducible.
- Synthetic attribution may not transfer to Terminal-Bench, and aggregate gate feedback may leak.
- Providers may lack a weight digest; local process separation is not production sandbox evidence.
- No held-out gain is plausible. One accepted candidate is never reported as general self-improvement.

All rejected mutations, regressions, cost effects, and negative results must be retained and reported.

## 15. Gate 1 questions

The reviewer must answer each:

1. Is the proposed systems gap distinct enough from the inspected Gajae-Code, AHE, Self-Harness,
   Meta-Harness, and DGM evidence to justify implementation?
2. Is the split between task execution and harness evolution explicit and enforceable?
3. Does the component model bound mutation without disguising free-form executable changes?
4. Is `D_gate` versus `D_test` usage sufficiently leakage-resistant and scientifically defensible?
5. Does matched-budget accounting charge all relevant inference and feedback?
6. Are the hypotheses and rejection rules falsifiable without post-hoc threshold adjustment?
7. Is the proposer/evaluator/promoter/audit separation strong enough as a target architecture?
8. Should the proposed 20% H3 margin, 8 KiB mutation cap, one/two-component limit, and B5 size-matched
   control be accepted, revised, or removed?
9. Should ADR-0001 be approved, and what must happen to the frozen Python spike?
10. What minimum corrections are required before deterministic runtime implementation begins?

## 16. Required response format

Return:

```text
DECISION: APPROVE | REVISE | BLOCK

NOVELTY:
CORRECTNESS:
EVALUATION FAIRNESS:
GENERALIZATION:
REPRODUCIBILITY:
SECURITY:
CLAIM DISCIPLINE:

BLOCKING FINDINGS:
1. ...

REQUIRED REVISIONS:
1. ...

NON-BLOCKING RECOMMENDATIONS:
1. ...

AUTHORIZED NEXT SCOPE:
...
```

An `APPROVE` authorizes only deterministic implementation under the accepted ADR. It does not authorize
external code upload, paid-provider calls, sealed-test access, performance claims, or publication.
