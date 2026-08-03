# A Standalone Coding-Agent Harness with a First-Class, Governed Evolution Lifecycle

Status: engineering manuscript draft; empirical sections are preregistered but unexecuted
Date: 2026-08-03

## Abstract

Coding-agent harnesses increasingly own model invocation, context construction, tool execution,
filesystem state, permissions, sessions, and multi-agent coordination. Harness optimization work adds
trace analysis and iterative changes, but runtime retry, prompt adaptation, and evaluated harness
evolution are often represented by different systems or weakly separated processes. This paper presents
a standalone coding-agent harness that treats task execution and harness evolution as independent
first-class lifecycles. The implementation combines a model/tool runtime, durable operations plane,
typed content-addressed component graph, fact/inference-separated evidence plane, bounded mutation and
candidate isolation, external evaluation, and an immutable trust plane. A candidate must create a new
`HarnessVersion`, identify its changed components and evidence, execute independently from its parent,
and receive an auditable qualification decision. Production deployment and rollback are separate
compare-and-swap decisions. The artifact includes deterministic fake-provider tests, an OpenAI provider
adapter, filesystem/shell/Git tools, persistent memory, skills, subagents and backend jobs, signed
session and descendant records, Git worktree isolation, and promotion/rejection/rollback histories. It
also preregisters a matched-budget B0–B6 evaluation that separates search tasks from final held-out
tasks. Current evidence supports implementation and local trust-boundary claims only. No live B0–B6 or
sealed held-out experiment has run, so the paper makes no self-improvement or performance claim.

Keywords: coding agents; agent harness; self-evolution; runtime systems; evaluation isolation;
provenance; reproducibility

## 1. Introduction

An agent harness is the software system that turns a model into an acting process. It selects context,
exposes tools, persists memory, applies permissions, executes workflows, records evidence, and decides
when a task is complete. Mature coding agents already implement much of this surface. The research
question is therefore not whether another model/tool loop can be built. It is whether a standalone
runtime can make changes to its own behavior-bearing harness a distinct, inspectable, and independently
evaluated lifecycle without allowing the evolving process to rewrite its evaluator, data, budget,
permissions, audit trail, or optimizer.

This distinction matters because task retry and harness evolution answer different questions. Retry asks
whether another trajectory under the same harness can solve the task. Evolution asks whether evidence
across trajectories justifies a new reusable harness artifact. Conflating them overstates improvement,
hides test-time compute, and makes rollback ambiguous.

The system in this paper implements two loops:

```text
Task Execution:
context → model → tool → result → verification → completion or bounded retry

Harness Evolution:
traces → weakness pattern → component attribution → bounded mutation
→ new HarnessVersion → isolated evaluation → qualification → deployment decision
```

The engineering contributions are:

1. an independently owned coding-agent kernel joined to a durable operations plane;
2. a versioned component DAG with closed mutable classes and immutable behavior closure;
3. evidence contracts that separate observations, verifier outcomes, and inferences;
4. bounded candidate mutation, Git isolation, authenticated external evaluation, and preserved negative
   proposals;
5. disjoint qualification, deployment, rollback, and retirement records; and
6. a preregistered evaluation comparing B0–B6 under matched model, token, tool, feedback, and time caps.

These are systems-composition contributions. Weakness mining, worktrees, rejected-edit memory, prompt
versions, multi-agent execution, and matched-budget criticism are prior art and are not claimed as new.

## 2. Related Work

Gajae-Code owns an agent loop and an operations control plane with sessions, recovery, evidence, and
next-action constraints [1]. OpenAI Codex owns Thread/Turn/Item execution, tool routing, sandbox policy,
and persistent thread state [2]. Oh My OpenAgent demonstrates capability-specific core, skill, adapter,
and platform seams [3]. OxyGent provides an owned multi-agent system, permitted nested calls, ReAct,
parallel and reflexion agents, trace persistence, and live prompt versioning [4]. These systems establish
that runtime ownership, modular agents, and prompt evolution are existing capabilities.

TencentDB-Agent-Memory implements layered persistent memory, bounded recall, skill versions, ACLs, and
proxy-based context injection [5]. This work overlaps at the memory-policy boundary but embeds memory in
a runtime that also owns the remaining task loop and versioned harness composition.

Agentic Harness Engineering implements evaluate–analyze–edit iteration, trace conversion, Git lineage,
and worktree variants while relying on external runtime/evaluation infrastructure [6]. Self-Harness
describes weakness mining, bounded proposals, passing-behavior preservation, and rejected-edit memory
[7]. Meta-Harness searches candidate programs stored on the filesystem through an external coding-agent
proposer [8]. The Darwin Gödel Machine explores much broader code self-modification and population
lineage [9]. This paper instead fixes a narrow mutable surface and moves evaluator and promotion
authority outside it.

The matched-budget protocol follows the warning that harness evolution must be compared with parallel
sampling, sequential refinement, and task-specific harness scaling under a shared compute account [10].
The system also follows the harness-engineering progression from prompt through context, workflow,
harness code, and optimizer code, but deliberately stops before optimizer-code or model-weight mutation
[11].

## 3. System Model

### 3.1 Six planes

The runtime is divided into six ownership planes.

1. **Agent Runtime Kernel:** provider interface, context builder, model/tool loop, verifier, memory,
   skills, routing, workflows, descendants, and process sandbox.
2. **Harness Component Model:** component manifests, payload artifacts, dependencies, mutable classes,
   provenance, harness composition, and content identity.
3. **Operations Control Plane:** session start, submission, observation, interruption, resume, recovery,
   validation, finalization, retirement, event projection, and artifact projection.
4. **Evidence Plane:** runtime events, signed receipts, artifacts, epistemic classification, and
   append-only audit chains.
5. **Evolution Control Plane:** weakness mining, attribution, bounded proposals, candidate bundles,
   worktree isolation, evaluation, and decisions.
6. **Immutable Trust Plane:** evaluator, benchmark split, permissions, safety, budget, model identity,
   audit, promotion policy, and sealed-data authority.

The managed runtime composes the first, third, and fourth planes into one usable entry point while
keeping distinct signers and stores. The evolution coordinator consumes their evidence but cannot mutate
the trust plane.

### 3.2 Component identity and mutation

A component manifest contains a stable component ID, semantic version, type-registry reference,
content-addressed payload, dependency references, capability digest, and transitive behavior closure.
Mutable class is defined by the frozen type registry. Provenance, evaluations, and deployment status are
external append-only records so they can change without changing the component’s behavior identity.

The MVP admits changes only to SystemPrompt, ContextPolicy, MemoryRetrievalPolicy, Skill,
WorkflowPolicy, RoutingPolicy, SubagentPrompt, and ToolDescription. Tool implementations, evaluator,
data, permission and safety policy, model identity, budgets, trace/audit machinery, promotion policy,
middleware, and optimizer are immutable. Admission checks the exact before/after closure and rejects an
undeclared or immutable diff.

### 3.3 Lifecycle separation

Session lifecycle records cover normal execution, blocking, recovery, validation, completion,
retirement, and fail-closed termination. Harness qualification records cover draft, candidate, static
validation, evaluation, offline canary, approval/rejection, and retirement. A separate deployment
ledger owns the production channel.

This refines a single `active/rolled_back` harness state machine. `approved` means eligible but not
deployed. `active` is derived from the exact production pointer. `rollback` is a signed operation that
swaps the current and rollback tuples. This prevents an evaluation decision from silently deploying a
candidate and permits exact replay of every production change.

### 3.4 Subagents and backend jobs

Each descendant has a signed schema-validated record chain, parent session, task hash, inherited
protocol/harness/snapshot/model/data/budget pins, reduced tool permissions, bounded local budget, result
artifact, cancellation controller, and terminal state. Hierarchical accounts charge model, token, tool,
retry, and nested-descendant use to both the child slice and the shared parent. Restart recovery marks
unowned created/running descendants as reaped instead of treating chat text as synchronization.

## 4. Execution and Evidence

The context builder selects system prompt sections, task input, transcript, memory, skills, verification
feedback, and tool descriptions under deterministic source priorities and token caps. A provider request
is charged before dispatch. Model outputs are normalized into assistant messages, provider state, or
tool calls. Tool requests are schema-validated, permission-checked, charged, and executed within a
workspace guard and no-network bubblewrap process boundary. Read, write, exact edit, bash, Git status,
and Git diff are implemented directly.

The verifier is external to the model trajectory. A retryable verifier failure may return to the model
under the same harness and retry account. A non-retryable failure blocks. Budget exhaustion, deadline,
cancellation, security failure, or crash enters an explicit termination transaction.

Runtime events contain origin trust, epistemic class, payload hash, previous-event hash, immutable pins,
redaction metadata, and optional inference metadata. Inference records must identify source events and
receipts, confidence, alternatives, method, and producer. Signed receipts bind event ranges and artifact
references into the audit ledger.

## 5. Evolution and Trust Boundary

The outer loop aggregates failures into patterns, produces ranked component attributions, and admits a
bounded proposal only when it names the target mechanism, predicted fix, predicted regression, and
passing-behavior preservation contract. A proposal creates a new immutable harness manifest before any
candidate evaluation.

The exact candidate closure is exported as a canonical bundle and committed to a detached Git snapshot.
The external evaluator receives a read-only materialization and verifies the candidate ID, manifest,
components, payloads, dependency closure, Git blobs, modes, and request binding. Evaluation results are
signed by a distinct evaluator and joined to promotion policy by a promoter. Rejection and accepted
qualification are both retained. Production deployment requires another signed decision and exact
compare-and-swap over the complete current and rollback tuples.

Git worktrees provide lineage and file isolation, not a security boundary. The local trust profile adds
distinct Linux principals, role-owned keys, authenticated Unix messages, scoped mounts, zero-release
denials, immutable files, and signed audit records. Host root, the kernel, and bootstrap code remain in
the trusted computing base.

## 6. Evaluation Protocol

### 6.1 Data separation

HarnessFaultBench assigns known component defects to mine, gate, sealed single-fault, and sealed
multi-cause partitions. Its public semantic-development fixtures validate plumbing only. Terminal-Bench
2.1 uses the published 45 train, 10 validation, and 34 withheld-public-test IDs from [10]. A temporal
holdout must be created after protocol freeze. The proposer cannot access final task bodies or verifier
details.

### 6.2 Baselines

The preregistered comparison contains static direct pass@1 (B0), parallel sampling (B1), sequential
refinement (B2), task-specific harness scaling (B3), prompt-only evolution (B4), free-form mutable-bundle
rewrite with a size-matched control (B5), and attribution-guided bounded mutation with an attribution
ablation (B6). Track A measures task-time utility under K=5 attempt slots. Track B evolves on mine,
selects once on gate, freezes the harness, and evaluates final tasks with one pass and no test-time retry.

All valid comparisons pin the same provider revision, model parameters, starting harness, tools,
environment, verifier access, feedback schema, model-call cap, token cap, tool-call cap, and wall-clock
cap. Failed, cancelled, cached, reasoning, proposer, summarizer, judge, subagent, and background work is
charged. Exploration and final evaluation are disjoint.

### 6.3 Hypotheses and falsification

H1 predicts lower pass-to-fail regression for attribution-guided bounded mutation than free-form
rewriting after controlling mutation size and compute. H2 predicts improved sealed pass@1 for a frozen
evolved harness over static and prompt-only harnesses. H3 predicts lower proposer-system inference cost
for layered evidence without material quality loss. H4 explores cross-model transfer without
re-evolution. Each hypothesis has a preregistered negative condition; lack of improvement, confidence
intervals crossing zero, train-only gains, extra compute, or leakage prevents the claim.

## 7. Engineering Validation

The repository contains deterministic tests for the kernel, tools, context, memory, skills, workflow,
routing, descendants, session and harness transitions, evidence tampering, component registry, bounded
mutation, candidate isolation, external evaluator, promotion, rejection, deployment, rollback, crash
recovery, budget matching, provider proxy, OS principals, evaluator vault, and publication governance.
The no-key CLI demonstrates the integrated path from session creation to retired completion. JSON
Schemas compile under the pinned toolchain.

These results validate implementation behavior under controlled inputs. Public synthetic attribution
scores and mutation dry runs are explicitly quarantined from research claims. They do not estimate H1–H4.

## 8. Discussion

The main architectural lesson is that “evolution” should describe an artifact and authority transition,
not a narrative about improvement. Content identity makes the candidate inspectable; separate
qualification and deployment prevent a good offline score from becoming an implicit production write;
and evidence classes prevent an LLM attribution from masquerading as an observed failure cause.

The cost is complexity. Immutable closures, signed transitions, external evaluators, custody, and
matched-budget accounts add operational burden beyond prompt optimization. Whether that burden buys
better reusable behavior is an empirical question. The protocol is designed to accept a negative answer.

## 9. Limitations

No live provider smoke, B0–B6 rollout, sealed final task, temporal holdout, or cross-model experiment is
reported. The OpenAI adapter is contract-tested but service behavior remains unverified in this result.
The local Linux isolation does not contain a malicious host root or kernel. Synthetic component faults
may not represent real coding-agent failure interactions. Terminal-Bench has public-test contamination
risk. The current implementation does not mutate tool code, middleware, optimizer code, or model
weights. Consequently, the correct research verdict is REVISE, not a claim of general self-improvement.

## 10. Conclusion

The artifact demonstrates that a coding-agent runtime and a governed harness-evolution lifecycle can be
implemented in one standalone system without using another coding harness as the executor. It provides
the version, evidence, isolation, and rollback machinery needed to test self-evolution claims without
equating them with retry. The remaining work is empirical: freeze a provider budget, admit independent
data, run B0–B6, and report negative or positive held-out results under the same contract.

## Data Availability

Source code, public development fixtures, schemas, split IDs, and deterministic evidence are stored in
this repository. Sealed and temporal task bodies are intentionally absent. Public diagnostic artifacts
are not authorized for confirmatory reuse.

## Ethics Declaration

No human participants, personal data, or live production systems were used. Future provider and
benchmark execution must follow the repository’s credential, data-custody, and access policies.

## Author Contributions

The repository owner defined the project objective and constraints. The coding assistant performed
source inspection, architecture, implementation, tests, and draft preparation under user direction.
Human authorship and venue-specific CRediT assignments must be finalized before submission.

## Conflict of Interest

No conflict is declared in this engineering draft. This statement requires human confirmation before
submission.

## Funding

No funding source was provided. This statement requires human confirmation before submission.

## AI Assistance Disclosure

OpenAI Codex assisted with research synthesis, software implementation, testing, and manuscript
drafting. All empirical self-improvement claims were withheld because the corresponding experiment was
not run. A human author must review source interpretations, code, and prose before external submission.

## References

1. Gajae-Code, source at commit `8778760cf924246ab86e4c6c3fda26da8a572cd8`.
   <https://github.com/Yeachan-Heo/gajae-code/tree/8778760cf924246ab86e4c6c3fda26da8a572cd8>
2. OpenAI Codex, source at commit `6219b7c40fc9c702c0aef9964e72b492558f60e4`.
   <https://github.com/openai/codex/tree/6219b7c40fc9c702c0aef9964e72b492558f60e4>
3. Oh My OpenAgent, `dev` at commit `258fab04159c0d628d7cc4c811e2907aee1cd0a1`.
   <https://github.com/code-yeongyu/oh-my-openagent/tree/258fab04159c0d628d7cc4c811e2907aee1cd0a1>
4. OxyGent, source at commit `cd96268de5814dfb4e0444cfd687f97508cf996a`.
   <https://github.com/jd-opensource/OxyGent/tree/cd96268de5814dfb4e0444cfd687f97508cf996a>
5. TencentDB-Agent-Memory, `feat/server_team` at commit
   `f3df79326dfd763f45199c441e2129d780467949`.
   <https://github.com/TencentCloud/TencentDB-Agent-Memory/tree/f3df79326dfd763f45199c441e2129d780467949>
6. Agentic Harness Engineering, source at commit `faf44bc4aea57413c520bc5711c6ebf628e0da1e`;
   paper arXiv:2604.25850. <https://arxiv.org/abs/2604.25850>
7. Self-Harness. arXiv:2606.09498. <https://arxiv.org/abs/2606.09498>
8. Meta-Harness, source at commit `44b9942127847f7421db70d8c7e48407f09a3c70`;
   paper arXiv:2603.28052. <https://arxiv.org/abs/2603.28052>
9. Darwin Gödel Machine, source at commit `a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2`;
   paper arXiv:2505.22954. <https://arxiv.org/abs/2505.22954>
10. Rethinking the Evaluation of Harness Evolution for Agents. arXiv:2607.12227; code at
    `ffd1ba1c2c3e31099264f630b9ed44aec63a86a7`. <https://arxiv.org/abs/2607.12227>
11. Lilian Weng. “Harness Engineering for Self-Improvement,” 2026-07-04.
    <https://lilianweng.github.io/posts/2026-07-04-harness/>
